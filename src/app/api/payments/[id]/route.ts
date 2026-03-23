import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { roundMoney } from '@/lib/utils/money';

function makeSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

async function recalcProjectPaid(supabase: any, projectId: string) {
  const { data: allPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('project_id', projectId);

  const totalPaid = roundMoney((allPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0));

  const { data: project } = await supabase
    .from('projects')
    .select('total_amount')
    .eq('id', projectId)
    .single();

  const projectTotal = project?.total_amount || 0;
  const pct = projectTotal > 0 ? totalPaid / projectTotal : 0;

  await supabase.from('projects').update({
    paid_amount: Math.max(0, totalPaid),
    deposit_paid: pct >= 0.5,
    pre_install_paid: pct >= 0.9,
    final_paid: pct >= 1.0,
    updated_at: new Date().toISOString(),
  }).eq('id', projectId);

  return { totalPaid, pct };
}

/**
 * PATCH /api/payments/[id] — Update a payment.
 *
 * Body: { amount?, payment_type?, payment_method?, received_at?, reference_number?, notes?, project_id? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Fetch existing payment
  const { data: existing, error: fetchErr } = await supabase
    .from('payments')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  const updates: Record<string, any> = {};

  if (body.amount !== undefined) {
    const amt = sanitizeNumber(body.amount, { min: 0.01 });
    if (amt === null) {
      return NextResponse.json({ error: 'Valid amount > 0 is required' }, { status: 400 });
    }
    updates.amount = roundMoney(amt);
  }

  if (body.payment_type) {
    const pt = sanitizeString(body.payment_type, 30);
    if (pt && ['deposit', 'pre_installation', 'final', 'other'].includes(pt)) {
      updates.payment_type = pt;
    }
  }

  if (body.payment_method !== undefined) {
    updates.payment_method = sanitizeString(body.payment_method, 30) || null;
  }

  if (body.received_at) {
    updates.received_at = sanitizeString(body.received_at, 30);
  }

  if (body.reference_number !== undefined) {
    updates.reference_number = sanitizeString(body.reference_number, 100) || null;
  }

  if (body.notes !== undefined) {
    updates.notes = sanitizeString(body.notes, 2000) || null;
  }

  const newProjectId = body.project_id && isValidUUID(body.project_id) ? body.project_id : null;
  if (newProjectId && newProjectId !== existing.project_id) {
    updates.project_id = newProjectId;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update payment', detail: updateErr.message }, { status: 500 });
  }

  // Recalc project paid amounts (both old and new project if changed)
  await recalcProjectPaid(supabase, existing.project_id);
  if (newProjectId && newProjectId !== existing.project_id) {
    await recalcProjectPaid(supabase, newProjectId);
  }

  await writeAuditLog({
    user_id: auth.userId,
    action: 'update',
    entity_type: 'payment',
    entity_id: id,
    notes: `Payment updated: ${Object.keys(updates).join(', ')}`,
  });

  return NextResponse.json({ payment: updated });
}

/**
 * DELETE /api/payments/[id] — Delete a payment (CEO only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Fetch payment to get project_id for recalc
  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, project_id, amount, invoice_id')
    .eq('id', id)
    .single();

  if (fetchErr || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // If linked to invoice, block deletion — must refund instead
  if (payment.invoice_id) {
    return NextResponse.json({
      error: 'Cannot delete a payment linked to an invoice. Use refund instead.',
      invoice_id: payment.invoice_id,
    }, { status: 400 });
  }

  const { error: delErr } = await supabase.from('payments').delete().eq('id', id);
  if (delErr) {
    return NextResponse.json({ error: 'Failed to delete payment', detail: delErr.message }, { status: 500 });
  }

  // Recalc project
  await recalcProjectPaid(supabase, payment.project_id);

  // Remove associated ledger entries
  await supabase.from('ledger')
    .delete()
    .eq('source_module', 'payments')
    .eq('source_id', id);

  await writeAuditLog({
    user_id: auth.userId,
    action: 'delete',
    entity_type: 'payment',
    entity_id: id,
    notes: `Payment ${payment.amount} MAD deleted`,
  });

  return NextResponse.json({ deleted: true });
}
