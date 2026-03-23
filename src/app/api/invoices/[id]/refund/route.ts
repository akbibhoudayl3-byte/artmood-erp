import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { roundMoney } from '@/lib/utils/money';

/**
 * POST /api/invoices/[id]/refund — Record a refund against an invoice.
 *
 * - Creates negative payment record
 * - Reduces invoice.paid_amount
 * - Updates project.paid_amount
 * - Creates negative ledger entry
 * - Blocks refund exceeding paid amount
 *
 * Body: { amount, reason, payment_method? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo']);
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
    return NextResponse.json({ error: 'Valid refund amount > 0 is required' }, { status: 400 });
  }

  const reason = sanitizeString(body.reason, 2000);
  if (!reason) {
    return NextResponse.json({ error: 'Refund reason is required' }, { status: 400 });
  }

  const paymentMethod = sanitizeString(body.payment_method, 30);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // 1. Fetch invoice
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, project_id, total_amount, total_ttc, paid_amount, status')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot refund a cancelled invoice' }, { status: 400 });
  }

  // 2. Block over-refund
  if (amount > invoice.paid_amount + 0.01) {
    return NextResponse.json({
      error: 'Refund exceeds paid amount',
      max_refundable: invoice.paid_amount,
      attempted: amount,
    }, { status: 400 });
  }

  // 3. Create negative payment record
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      project_id: invoice.project_id,
      invoice_id: invoiceId,
      amount: -amount,
      payment_type: 'refund',
      payment_method: paymentMethod,
      notes: `Remboursement ${invoice.invoice_number}: ${reason}`,
      received_by: auth.userId,
      received_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: 'Failed to create refund record', detail: payErr?.message }, { status: 500 });
  }

  // 4. Update invoice paid_amount and status
  const newPaidAmount = roundMoney(invoice.paid_amount - amount);
  const invoiceTotal = invoice.total_ttc || invoice.total_amount;
  let newStatus: string;
  if (newPaidAmount <= 0) {
    newStatus = 'issued';
  } else if (newPaidAmount >= invoiceTotal) {
    newStatus = 'paid';
  } else {
    newStatus = 'partial';
  }

  await supabase
    .from('invoices')
    .update({
      paid_amount: Math.max(0, newPaidAmount),
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  // 5. Update project paid_amount
  const { data: allPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('project_id', invoice.project_id);

  const totalProjectPaid = roundMoney((allPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0));

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
      paid_amount: Math.max(0, totalProjectPaid),
      deposit_paid: paidRatio >= 0.5,
      pre_install_paid: paidRatio >= 0.9,
      final_paid: paidRatio >= 1.0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.project_id);

  // 6. Create negative ledger entry
  await supabase.from('ledger').insert({
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    category: 'refund',
    amount,
    description: `Remboursement ${invoice.invoice_number} — ${reason}`,
    project_id: invoice.project_id,
    source_module: 'invoices',
    source_id: payment.id,
    payment_method: paymentMethod,
    created_by: auth.userId,
  });

  // 7. Audit log
  await writeAuditLog({
    user_id: auth.userId,
    action: 'refund',
    entity_type: 'invoice',
    entity_id: invoiceId,
    notes: `Refund ${amount} MAD on ${invoice.invoice_number}: ${reason}`,
  });

  return NextResponse.json({
    refund: payment,
    invoice: {
      id: invoiceId,
      invoice_number: invoice.invoice_number,
      total_ttc: invoiceTotal,
      paid_before: invoice.paid_amount,
      paid_after: Math.max(0, newPaidAmount),
      refunded: amount,
      status: newStatus,
    },
  }, { status: 201 });
}
