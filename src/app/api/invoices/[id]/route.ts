import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString } from '@/lib/auth/server';

function makeSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

/**
 * GET /api/invoices/[id] — Get single invoice with lines and payments.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, invoice_lines(*), projects(id, reference_code, client_name, client_phone, client_email, client_address, client_city)')
    .eq('id', id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  // Get linked payments
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', id)
    .order('received_at');

  return NextResponse.json({ invoice, payments: payments || [] });
}

/**
 * PATCH /api/invoices/[id] — Update invoice status, dates, notes.
 *
 * Body: { status?, issue_date?, due_date?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Fetch current invoice
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, status, total_amount, paid_amount')
    .eq('id', id)
    .single();

  if (fetchErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body.status) {
    const newStatus = sanitizeString(body.status, 20);
    if (newStatus && ['draft', 'issued', 'partial', 'paid', 'cancelled'].includes(newStatus)) {
      updates.status = newStatus;
    }
  }

  if (body.issue_date) {
    updates.issue_date = sanitizeString(body.issue_date, 20);
  }
  if (body.due_date) {
    updates.due_date = sanitizeString(body.due_date, 20);
  }
  if (body.notes !== undefined) {
    updates.notes = sanitizeString(body.notes, 2000);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update invoice', detail: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ invoice: updated });
}
