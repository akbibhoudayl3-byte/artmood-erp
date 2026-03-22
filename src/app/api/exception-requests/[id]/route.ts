/**
 * PATCH /api/exception-requests/[id]
 *
 * CEO approves or rejects a deposit-exception request.
 * Body: { action: 'approve' | 'reject' }
 *
 * Approve → project transitions to in_production, logs exception_approved
 * Reject  → project stays blocked, logs exception_rejected
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID } from '@/lib/auth/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Only CEO (admin) can approve/reject
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: requestId } = await params;
  if (!isValidUUID(requestId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body: { action?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  // Fetch the exception request + its project
  const { data: exReq, error: fetchErr } = await ctx.supabase
    .from('project_exceptions')
    .select('*, project:projects(id, status, client_name, reference_code)')
    .eq('id', requestId)
    .single();

  if (fetchErr || !exReq) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (exReq.status !== 'pending') {
    return NextResponse.json({ error: 'Already processed' }, { status: 409 });
  }

  const project = exReq.project;
  const now = new Date().toISOString();
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Update exception record
  const { error: updateErr } = await ctx.supabase
    .from('project_exceptions')
    .update({ status: newStatus, reviewed_by: ctx.userId, reviewed_at: now })
    .eq('id', requestId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (action === 'approve') {
    // Transition project → in_production
    await ctx.supabase.from('projects').update({
      status: 'in_production',
      status_updated_at: now,
      production_started_at: now,
      updated_at: now,
    }).eq('id', project.id);

    // Log event
    await ctx.supabase.from('project_events').insert({
      project_id: project.id,
      user_id: ctx.userId,
      event_type: 'exception_approved',
      old_value: project.status,
      new_value: 'in_production',
      description: `Exception approuvée — bypass acompte. Projet passe en production.`,
    });
  } else {
    // Log rejection
    await ctx.supabase.from('project_events').insert({
      project_id: project.id,
      user_id: ctx.userId,
      event_type: 'exception_rejected',
      description: `Exception rejetée — acompte 50% toujours requis.`,
    });
  }

  return NextResponse.json({
    ok: true,
    action: newStatus,
    project_id: project.id,
  });
}
