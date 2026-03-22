/**
 * POST /api/projects/[id]/exception-request
 *
 * Creates a deposit-exception request for a project.
 * Body: { reason: string, note?: string }
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

  let body: { reason?: string; note?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reason = sanitizeString(body?.reason ?? '', 1000).trim();
  const note = sanitizeString(body?.note ?? '', 500).trim() || null;

  if (!reason) {
    return NextResponse.json({ error: 'Raison obligatoire' }, { status: 400 });
  }

  // Block duplicate pending requests
  const { data: existing } = await ctx.supabase
    .from('project_exceptions')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'Une demande est déjà en attente pour ce projet.' },
      { status: 409 },
    );
  }

  // Insert
  const { data: row, error: insertErr } = await ctx.supabase
    .from('project_exceptions')
    .insert({
      project_id: projectId,
      requested_by: ctx.userId,
      reason,
      note,
    })
    .select('id')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Log event
  await ctx.supabase.from('project_events').insert({
    project_id: projectId,
    user_id: ctx.userId,
    event_type: 'exception_requested',
    description: `Demande d'exception: ${reason}`,
  });

  // Notify CEO users
  const { data: project } = await ctx.supabase
    .from('projects').select('reference_code, client_name').eq('id', projectId).single();

  const { data: ceos } = await ctx.supabase.from('profiles').select('id').eq('role', 'ceo');
  if (ceos?.length) {
    await ctx.supabase.from('notifications').insert(
      ceos.map(c => ({
        user_id: c.id,
        title: `Exception demandée — ${project?.reference_code || ''}`,
        body: `${project?.client_name}: ${reason}`,
        type: 'exception_request',
        severity: 'warning' as const,
        reference_type: 'project',
        reference_id: projectId,
      })),
    );
  }

  return NextResponse.json({ ok: true, id: row.id });
}
