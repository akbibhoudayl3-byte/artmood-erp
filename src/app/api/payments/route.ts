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
 * GET /api/payments — List payments with project info.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const projectId = request.nextUrl.searchParams.get('project_id');

  let query = supabase
    .from('payments')
    .select('*, project:projects(client_name, reference_code)')
    .order('received_at', { ascending: false })
    .limit(200);

  if (projectId && isValidUUID(projectId)) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch payments', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ payments: data || [] });
}

/**
 * POST /api/payments — Create a new payment.
 *
 * Body: { project_id, amount, payment_type, payment_method?, received_at?, reference_number?, notes? }
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

  const projectId = body.project_id;
  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const amount = sanitizeNumber(body.amount, { min: 0.01 });
  if (amount === null) {
    return NextResponse.json({ error: 'Valid amount > 0 is required' }, { status: 400 });
  }

  const paymentType = sanitizeString(body.payment_type, 30) || 'other';
  if (!['deposit', 'pre_installation', 'final', 'other'].includes(paymentType)) {
    return NextResponse.json({ error: 'Invalid payment_type' }, { status: 400 });
  }

  const paymentMethod = sanitizeString(body.payment_method, 30) || null;
  const referenceNumber = sanitizeString(body.reference_number, 100) || null;
  const notes = sanitizeString(body.notes, 2000) || null;
  const receivedAt = sanitizeString(body.received_at, 30) || new Date().toISOString();

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  // Verify project exists
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, reference_code, client_name')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Insert payment
  const { data: payment, error: payErr } = await supabase.from('payments').insert({
    project_id: projectId,
    amount: roundMoney(amount),
    payment_type: paymentType,
    payment_method: paymentMethod,
    received_at: receivedAt,
    reference_number: referenceNumber,
    notes,
    received_by: auth.userId,
  }).select().single();

  if (payErr || !payment) {
    return NextResponse.json({ error: 'Failed to create payment', detail: payErr?.message }, { status: 500 });
  }

  // Recalculate project totals
  const { totalPaid } = await recalcProjectPaid(supabase, projectId);

  // Create ledger entry
  await supabase.from('ledger').insert({
    date: new Date(receivedAt).toISOString().split('T')[0],
    type: 'income',
    category: paymentType,
    amount: roundMoney(amount),
    description: `Payment from ${project.client_name} — ${project.reference_code}`,
    project_id: projectId,
    source_module: 'payments',
    source_id: payment.id,
    payment_method: paymentMethod,
    created_by: auth.userId,
  });

  await writeAuditLog({
    user_id: auth.userId,
    action: 'create',
    entity_type: 'payment',
    entity_id: payment.id,
    notes: `Payment ${roundMoney(amount)} MAD for ${project.reference_code}`,
  });

  return NextResponse.json({ payment, project_paid: totalPaid }, { status: 201 });
}
