import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

/**
 * POST /api/invoices/[id]/pay — Record a payment against an invoice.
 *
 * - Creates payment record linked to invoice
 * - Updates invoice.paid_amount and status
 * - Updates project.paid_amount and payment flags
 * - Creates ledger entry
 * - Blocks overpayment
 *
 * Body: { amount, payment_type, payment_method?, reference_number?, notes? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const { id: invoiceId } = await params;
  if (!isValidUUID(invoiceId)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const amount = sanitizeNumber(body.amount, { min: 0.01 });
  if (amount === null) {
    return NextResponse.json({ error: 'Valid amount > 0 is required' }, { status: 400 });
  }

  const paymentType = sanitizeString(body.payment_type, 30) || 'other';
  if (!['deposit', 'pre_installation', 'final', 'other'].includes(paymentType)) {
    return NextResponse.json({ error: 'Invalid payment_type' }, { status: 400 });
  }

  const paymentMethod = sanitizeString(body.payment_method, 30);
  const referenceNumber = sanitizeString(body.reference_number, 100);
  const notes = sanitizeString(body.notes, 2000);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // 1. Fetch invoice
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, project_id, total_amount, paid_amount, status')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot pay a cancelled invoice' }, { status: 400 });
  }

  // 2. Block overpayment
  const remaining = invoice.total_amount - invoice.paid_amount;
  if (amount > remaining + 0.01) { // small tolerance for rounding
    return NextResponse.json({
      error: 'Payment exceeds remaining balance',
      remaining,
      attempted: amount,
      invoice_total: invoice.total_amount,
      already_paid: invoice.paid_amount,
    }, { status: 400 });
  }

  // 3. Create payment linked to invoice
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      project_id: invoice.project_id,
      invoice_id: invoiceId,
      amount,
      payment_type: paymentType,
      payment_method: paymentMethod,
      reference_number: referenceNumber,
      notes: notes || `Paiement ${invoice.invoice_number}`,
      received_by: auth.userId,
      received_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: 'Failed to create payment', detail: payErr?.message }, { status: 500 });
  }

  // 4. Update invoice paid_amount and status
  const newPaidAmount = invoice.paid_amount + amount;
  let newStatus: string;
  if (newPaidAmount >= invoice.total_amount) {
    newStatus = 'paid';
  } else if (newPaidAmount > 0) {
    newStatus = 'partial';
  } else {
    newStatus = invoice.status;
  }

  await supabase
    .from('invoices')
    .update({
      paid_amount: newPaidAmount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  // 5. Update project paid_amount and payment flags
  const { data: allPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('project_id', invoice.project_id);

  const totalProjectPaid = (allPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  const { data: project } = await supabase
    .from('projects')
    .select('total_amount')
    .eq('id', invoice.project_id)
    .single();

  const projectTotal = project?.total_amount || 0;
  const paidRatio = projectTotal > 0 ? totalProjectPaid / projectTotal : 0;

  await supabase
    .from('projects')
    .update({
      paid_amount: totalProjectPaid,
      deposit_paid: paidRatio >= 0.5,
      pre_install_paid: paidRatio >= 0.9,
      final_paid: paidRatio >= 1.0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.project_id);

  // 6. Create ledger entry
  await supabase.from('ledger').insert({
    date: new Date().toISOString().split('T')[0],
    type: 'income',
    category: paymentType,
    amount,
    description: `${invoice.invoice_number} — ${paymentType}`,
    project_id: invoice.project_id,
    source_module: 'invoices',
    source_id: payment.id,
    payment_method: paymentMethod,
    created_by: auth.userId,
  });

  return NextResponse.json({
    payment,
    invoice: {
      id: invoiceId,
      invoice_number: invoice.invoice_number,
      total_amount: invoice.total_amount,
      paid_before: invoice.paid_amount,
      paid_after: newPaidAmount,
      remaining: invoice.total_amount - newPaidAmount,
      status: newStatus,
    },
    project: {
      project_id: invoice.project_id,
      total_paid: totalProjectPaid,
      deposit_paid: paidRatio >= 0.5,
      pre_install_paid: paidRatio >= 0.9,
      final_paid: paidRatio >= 1.0,
    },
  }, { status: 201 });
}
