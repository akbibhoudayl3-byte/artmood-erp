/**
 * PATCH /api/exception-requests/[id]
 *
 * CEO approves or rejects a deposit-exception request.
 * Body: { action: 'approve' | 'reject' }
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID } from '@/lib/auth/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  // Fetch request + project
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

  // Update exception status
  await ctx.supabase
    .from('project_exceptions')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_by: ctx.userId, reviewed_at: now })
    .eq('id', requestId);

  if (action === 'approve') {
    // Transition project to in_production
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
      description: `Exception approuvée — projet passe en production (bypass acompte)`,
    });

    // Notify requester
    await ctx.supabase.from('notifications').insert({
      user_id: exReq.requested_by,
      title: `Exception approuvée — ${project.reference_code}`,
      body: `${project.client_name} passe en production.`,
      type: 'exception_approved',
      severity: 'info',
      reference_type: 'project',
      reference_id: project.id,
    });
  } else {
    // Log rejection
    await ctx.supabase.from('project_events').insert({
      project_id: project.id,
      user_id: ctx.userId,
      event_type: 'exception_rejected',
      description: `Exception rejetée — acompte 50% requis`,
    });

    // Notify requester
    await ctx.supabase.from('notifications').insert({
      user_id: exReq.requested_by,
      title: `Exception rejetée — ${project.reference_code}`,
      body: `L'acompte de 50% reste requis pour ${project.client_name}.`,
      type: 'exception_rejected',
      severity: 'warning',
      reference_type: 'project',
      reference_id: project.id,
    });
  }

  return NextResponse.json({
    ok: true,
    action: action === 'approve' ? 'approved' : 'rejected',
    project_id: project.id,
  });
}
