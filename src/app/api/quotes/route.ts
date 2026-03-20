import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, sanitizeString, sanitizeNumber, isValidUUID } from '@/lib/auth/server';

/**
 * POST /api/quotes — Create a new quote with line items.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id, discount_percent, valid_until, notes, lines } = body;

  // ── Validate ────────────────────────────────────────────────────────────
  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
  }

  const discount = sanitizeNumber(discount_percent, { min: 0, max: 100 }) ?? 0;
  const sanitizedNotes = sanitizeString(notes, 2000);
  const sanitizedValidUntil = sanitizeString(valid_until, 20);

  // Validate each line
  const parsedLines: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
    sort_order: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const desc = sanitizeString(l.description, 500);
    if (!desc) {
      return NextResponse.json({ error: `Line ${i + 1}: description is required` }, { status: 400 });
    }
    const qty = sanitizeNumber(l.quantity, { min: 0.001 });
    if (qty === null) {
      return NextResponse.json({ error: `Line ${i + 1}: valid quantity is required` }, { status: 400 });
    }
    const unitPrice = sanitizeNumber(l.unit_price, { min: 0 });
    if (unitPrice === null) {
      return NextResponse.json({ error: `Line ${i + 1}: valid unit_price is required` }, { status: 400 });
    }
    const unit = sanitizeString(l.unit, 50) || 'unit';
    parsedLines.push({
      description: desc,
      quantity: qty,
      unit,
      unit_price: unitPrice,
      total_price: qty * unitPrice,
      sort_order: i,
    });
  }

  // ── Compute totals ──────────────────────────────────────────────────────
  const subtotal = parsedLines.reduce((sum, l) => sum + l.total_price, 0);
  const discountAmount = subtotal * (discount / 100);
  const totalAmount = subtotal - discountAmount;

  // ── Create (server-side Supabase) ───────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Verify project exists
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Get next version
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('project_id', project_id)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version || 0) + 1;

  // Insert quote
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .insert({
      project_id,
      version: nextVersion,
      status: 'draft',
      subtotal,
      discount_percent: discount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      notes: sanitizedNotes,
      valid_until: sanitizedValidUntil,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (quoteErr || !quote) {
    return NextResponse.json(
      { error: 'Failed to create quote', detail: quoteErr?.message },
      { status: 500 },
    );
  }

  // Insert lines
  const quoteLines = parsedLines.map(l => ({ ...l, quote_id: quote.id }));
  const { error: linesErr } = await supabase.from('quote_lines').insert(quoteLines);

  if (linesErr) {
    return NextResponse.json(
      { error: 'Quote created but lines failed', detail: linesErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ quote }, { status: 201 });
}
