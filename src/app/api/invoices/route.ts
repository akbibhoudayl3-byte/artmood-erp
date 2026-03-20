import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';
import { roundMoney, computeVAT, computeDiscount } from '@/lib/utils/money';
import { writeAuditLog } from '@/lib/security/audit';

function makeSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

/**
 * GET /api/invoices — List all invoices (optionally filter by project_id).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const projectId = request.nextUrl.searchParams.get('project_id');

  let query = supabase
    .from('invoices')
    .select('*, invoice_lines(*), projects(id, reference_code, client_name, client_phone, client_email)')
    .order('created_at', { ascending: false });

  if (projectId && isValidUUID(projectId)) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch invoices', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ invoices: data || [] });
}

/**
 * POST /api/invoices — Create invoice (from accepted quote OR manual).
 *
 * Body: { project_id, quote_id?, issue_date?, due_date?, notes?, lines? }
 *
 * If quote_id is provided: copies quote_lines into invoice_lines.
 * If lines[] is provided: uses those instead.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id, quote_id } = body;

  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const issueDate = sanitizeString(body.issue_date, 20) || new Date().toISOString().split('T')[0];
  const dueDateRaw = sanitizeString(body.due_date, 20);
  const notes = sanitizeString(body.notes, 2000);
  const vatRate = sanitizeNumber(body.vat_rate, { min: 0, max: 100 }) ?? 20; // Morocco standard 20%

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // 1. Verify project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, reference_code, client_name, total_amount')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // 2. Generate invoice number atomically via DB function (prevents race conditions)
  const { data: seqResult, error: seqErr } = await supabase.rpc('generate_invoice_number');

  if (seqErr || !seqResult) {
    return NextResponse.json({ error: 'Failed to generate invoice number', detail: seqErr?.message }, { status: 500 });
  }
  const invoiceNumber = seqResult as string;

  // 3. Get lines — from quote or manual
  let invoiceLines: Array<{
    description: string; quantity: number; unit: string;
    unit_price: number; total_price: number; sort_order: number;
  }> = [];

  let subtotal = 0;
  let discountPercent = 0;
  let discountAmount = 0;
  let totalAmount = 0;
  let linkedQuoteId: string | null = null;

  if (quote_id && isValidUUID(quote_id)) {
    // From accepted quote
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*, quote_lines(*)')
      .eq('id', quote_id)
      .eq('project_id', project_id)
      .single();

    if (qErr || !quote) {
      return NextResponse.json({ error: 'Quote not found or not linked to this project' }, { status: 404 });
    }

    linkedQuoteId = quote.id;
    subtotal = quote.subtotal || 0;
    discountPercent = quote.discount_percent || 0;
    discountAmount = quote.discount_amount || 0;
    totalAmount = quote.total_amount || 0;

    invoiceLines = ((quote.quote_lines || []) as any[])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((l: any) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit || 'unit',
        unit_price: l.unit_price,
        total_price: l.total_price,
        sort_order: l.sort_order,
      }));
  } else if (Array.isArray(body.lines) && body.lines.length > 0) {
    // Manual lines
    for (let i = 0; i < body.lines.length; i++) {
      const l = body.lines[i];
      const desc = sanitizeString(l.description, 500);
      if (!desc) {
        return NextResponse.json({ error: `Line ${i + 1}: description required` }, { status: 400 });
      }
      const qty = sanitizeNumber(l.quantity, { min: 0.001 }) ?? 1;
      const unitPrice = sanitizeNumber(l.unit_price, { min: 0 }) ?? 0;
      invoiceLines.push({
        description: desc,
        quantity: qty,
        unit: sanitizeString(l.unit, 50) || 'unit',
        unit_price: unitPrice,
        total_price: roundMoney(qty * unitPrice),
        sort_order: i,
      });
    }

    subtotal = roundMoney(invoiceLines.reduce((s, l) => s + l.total_price, 0));
    discountPercent = sanitizeNumber(body.discount_percent, { min: 0, max: 100 }) ?? 0;
    const disc = computeDiscount(subtotal, discountPercent);
    discountAmount = disc.discountAmount;
    totalAmount = disc.afterDiscount;
  } else {
    // Fallback: use project total_amount with no lines
    totalAmount = project.total_amount || 0;
    subtotal = totalAmount;
  }

  // Default due date: 30 days from issue
  let dueDate = dueDateRaw;
  if (!dueDate) {
    const d = new Date(issueDate);
    d.setDate(d.getDate() + 30);
    dueDate = d.toISOString().split('T')[0];
  }

  // 4. Check existing payments for this project
  const { data: existingPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('project_id', project_id)
    .is('invoice_id', null);

  const existingPaid = (existingPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  // Compute VAT: totalAmount is HT (before tax), total_ttc includes VAT
  const { vatAmount, totalTTC } = computeVAT(totalAmount, vatRate);

  // Determine initial status (compare against TTC)
  let status = 'draft';
  if (existingPaid >= totalTTC && totalTTC > 0) {
    status = 'paid';
  } else if (existingPaid > 0) {
    status = 'partial';
  }

  // 5. Insert invoice
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      project_id,
      quote_id: linkedQuoteId,
      status,
      subtotal,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_ttc: totalTTC,
      paid_amount: Math.min(existingPaid, totalTTC),
      issue_date: issueDate,
      due_date: dueDate,
      notes,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Failed to create invoice', detail: invErr?.message }, { status: 500 });
  }

  // 6. Insert lines
  if (invoiceLines.length > 0) {
    const rows = invoiceLines.map(l => ({ ...l, invoice_id: invoice.id }));
    const { error: lErr } = await supabase.from('invoice_lines').insert(rows);
    if (lErr) {
      return NextResponse.json({ error: 'Invoice created but lines failed', detail: lErr.message }, { status: 500 });
    }
  }

  // 7. Link existing unlinked payments to this invoice
  if (existingPayments && existingPayments.length > 0) {
    await supabase
      .from('payments')
      .update({ invoice_id: invoice.id })
      .eq('project_id', project_id)
      .is('invoice_id', null);
  }

  await writeAuditLog({
    user_id: auth.userId,
    action: 'create',
    entity_type: 'invoice',
    entity_id: invoice.id,
    notes: `Invoice ${invoiceNumber} created for project ${project_id}, total TTC: ${totalTTC}`,
  });

  return NextResponse.json({ invoice, lines_count: invoiceLines.length }, { status: 201 });
}
