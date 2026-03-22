/**
 * POST /api/projects/[id]/exception-request
 *
 * Creates a deposit-exception request for a project.
 * Non-admin users submit this when deposit < 50% but they need to move to production.
 *
 * Body: { reason: string, urgency?: 'normal' | 'urgent', note?: string }
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await guard(['ceo', 'commercial_manager', 'workshop_manager', 'designer', 'operations_manager']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;

  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  let body: { reason?: string; urgency?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reason = sanitizeString(body?.reason ?? '', 1000).trim();
  const urgency = body?.urgency === 'urgent' ? 'urgent' : 'normal';
  const note = sanitizeString(body?.note ?? '', 500).trim() || null;

  if (!reason) {
    return NextResponse.json(
      { error: 'Raison obligatoire', message: 'Veuillez fournir une raison pour la demande d\'exception.' },
      { status: 400 },
    );
  }

  // Fetch project to calculate deposit percentage
  const { data: project, error: fetchErr } = await ctx.supabase
    .from('projects')
    .select('id, status, total_amount, paid_amount, client_name, reference_code')
    .eq('id', projectId)
    .single();

  if (fetchErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const depositPct = project.total_amount > 0
    ? Math.round((project.paid_amount / project.total_amount) * 10000) / 100
    : 0;

  // Check for existing pending request
  const { data: existing } = await ctx.supabase
    .from('exception_requests')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'Demande existante', message: 'Une demande d\'exception est déjà en attente pour ce projet.' },
      { status: 409 },
    );
  }

  // Insert exception request
  const { data: exReq, error: insertErr } = await ctx.supabase
    .from('exception_requests')
    .insert({
      project_id: projectId,
      requester_id: ctx.userId,
      requested_status: 'in_production',
      current_deposit_pct: depositPct,
      reason,
      urgency,
      note,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[exception-request] Insert failed:', insertErr.message);
    return NextResponse.json(
      { error: 'Failed to create request', message: insertErr.message },
      { status: 500 },
    );
  }

  // Log project event
  await ctx.supabase.from('project_events').insert({
    project_id: projectId,
    user_id: ctx.userId,
    event_type: 'exception_requested',
    description: `Exception demandée: bypass acompte (${depositPct}% payé). Raison: ${reason}`,
    metadata: { exception_request_id: exReq.id, deposit_pct: depositPct, urgency },
  });

  // Notify all CEO users
  const { data: ceos } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('role', 'ceo');

  if (ceos && ceos.length > 0) {
    const notifications = ceos.map(ceo => ({
      user_id: ceo.id,
      title: `Exception demandée — ${project.reference_code}`,
      body: `${project.client_name}: demande bypass acompte (${depositPct}% payé). ${urgency === 'urgent' ? '⚠ URGENT' : ''}`,
      type: 'exception_request',
      severity: urgency === 'urgent' ? 'warning' : 'info',
      reference_type: 'project',
      reference_id: projectId,
    }));
    await ctx.supabase.from('notifications').insert(notifications);
  }

  // Audit
  await ctx.audit({
    action: 'status_change',
    entity_type: 'exception_request',
    entity_id: exReq.id,
    new_value: { project_id: projectId, deposit_pct: depositPct, urgency, reason },
    notes: `Exception request created for project ${project.reference_code}`,
  });

  return NextResponse.json({
    ok: true,
    exception_request_id: exReq.id,
    message: 'Demande d\'exception envoyée au CEO pour approbation.',
  });
}
