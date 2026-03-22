/**
 * PATCH /api/exception-requests/[id]
 *
 * CEO approves or rejects a deposit-exception request.
 *
 * Body: { action: 'approve' | 'reject', review_note?: string }
 *
 * On approve:
 *   - Marks request as approved
 *   - Transitions project to in_production (with admin override)
 *   - Logs full audit trail
 *
 * On reject:
 *   - Marks request as rejected
 *   - Project stays blocked
 *   - Logs rejection event
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Only CEO can approve/reject
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: requestId } = await params;

  if (!isValidUUID(requestId)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
  }

  let body: { action?: string; review_note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body?.action;
  const reviewNote = sanitizeString(body?.review_note ?? '', 500).trim() || null;

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { error: 'Action invalide', message: 'action doit être "approve" ou "reject"' },
      { status: 400 },
    );
  }

  // Fetch the exception request
  const { data: exReq, error: fetchErr } = await ctx.supabase
    .from('exception_requests')
    .select('*, project:projects(id, status, client_name, reference_code, deposit_paid, design_validated, total_amount, paid_amount, measurement_date, measured_by, lead_id)')
    .eq('id', requestId)
    .single();

  if (fetchErr || !exReq) {
    return NextResponse.json({ error: 'Exception request not found' }, { status: 404 });
  }

  if (exReq.status !== 'pending') {
    return NextResponse.json(
      { error: 'Déjà traitée', message: `Cette demande a déjà été ${exReq.status === 'approved' ? 'approuvée' : 'rejetée'}.` },
      { status: 409 },
    );
  }

  const project = exReq.project;
  const now = new Date().toISOString();
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Update the exception request
  const { error: updateErr } = await ctx.supabase
    .from('exception_requests')
    .update({
      status: newStatus,
      reviewed_by: ctx.userId,
      reviewed_at: now,
      review_note: reviewNote,
      updated_at: now,
    })
    .eq('id', requestId);

  if (updateErr) {
    return NextResponse.json(
      { error: 'Update failed', message: updateErr.message },
      { status: 500 },
    );
  }

  if (action === 'approve') {
    // Transition the project to in_production
    const { error: transErr } = await ctx.supabase
      .from('projects')
      .update({
        status: 'in_production',
        status_updated_at: now,
        production_started_at: now,
        estimated_production_start: now.split('T')[0],
        updated_at: now,
      })
      .eq('id', project.id);

    if (transErr) {
      return NextResponse.json(
        { error: 'Project transition failed', message: transErr.message },
        { status: 500 },
      );
    }

    // Log approval + transition events
    await ctx.supabase.from('project_events').insert([
      {
        project_id: project.id,
        user_id: ctx.userId,
        event_type: 'exception_approved',
        description: `Exception approuvée par CEO: bypass acompte (${exReq.current_deposit_pct}% payé).${reviewNote ? ` Note: ${reviewNote}` : ''}`,
        new_value: 'in_production',
        metadata: { exception_request_id: requestId, deposit_pct: exReq.current_deposit_pct },
      },
      {
        project_id: project.id,
        user_id: ctx.userId,
        event_type: 'admin_override',
        old_value: project.status,
        new_value: 'in_production',
        description: `Transition ${project.status} → in_production via exception approuvée (acompte: ${exReq.current_deposit_pct}%)`,
        metadata: { exception_request_id: requestId, override_type: 'deposit_bypass' },
      },
    ]);

    // Notify the requester
    await ctx.supabase.from('notifications').insert({
      user_id: exReq.requester_id,
      title: `Exception approuvée — ${project.reference_code}`,
      body: `Votre demande d'exception pour ${project.client_name} a été approuvée. Le projet passe en production.`,
      type: 'exception_approved',
      severity: 'info',
      reference_type: 'project',
      reference_id: project.id,
    });
  } else {
    // Log rejection event
    await ctx.supabase.from('project_events').insert({
      project_id: project.id,
      user_id: ctx.userId,
      event_type: 'exception_rejected',
      description: `Exception rejetée par CEO.${reviewNote ? ` Raison: ${reviewNote}` : ''} Acompte requis: 50%, actuel: ${exReq.current_deposit_pct}%`,
      metadata: { exception_request_id: requestId, deposit_pct: exReq.current_deposit_pct },
    });

    // Notify the requester
    await ctx.supabase.from('notifications').insert({
      user_id: exReq.requester_id,
      title: `Exception rejetée — ${project.reference_code}`,
      body: `Votre demande d'exception pour ${project.client_name} a été rejetée.${reviewNote ? ` Raison: ${reviewNote}` : ''} L'acompte de 50% reste requis.`,
      type: 'exception_rejected',
      severity: 'warning',
      reference_type: 'project',
      reference_id: project.id,
    });
  }

  // Audit trail
  await ctx.audit({
    action: 'status_change',
    entity_type: 'exception_request',
    entity_id: requestId,
    old_value: { status: 'pending' },
    new_value: { status: newStatus, review_note: reviewNote },
    notes: `Exception ${newStatus} for project ${project.reference_code} by CEO`,
  });

  return NextResponse.json({
    ok: true,
    action: newStatus,
    project_id: project.id,
    message: action === 'approve'
      ? `Exception approuvée. Projet "${project.client_name}" passe en production.`
      : `Exception rejetée. Le projet reste bloqué.`,
  });
}
