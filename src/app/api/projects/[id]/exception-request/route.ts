/**
 * POST /api/projects/[id]/exception-request
 *
 * Creates a deposit-exception request so a non-admin user can request
 * production access when deposit < 50%.
 *
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

  const reason = (sanitizeString(body?.reason ?? '', 1000) ?? '').trim();
  const note = (sanitizeString(body?.note ?? '', 500) ?? '').trim() || null;

  if (!reason) {
    return NextResponse.json({ error: 'Raison obligatoire' }, { status: 400 });
  }

  // Fetch project to compute deposit %
  const { data: project, error: fetchErr } = await ctx.supabase
    .from('projects')
    .select('id, total_amount, paid_amount')
    .eq('id', projectId)
    .single();

  if (fetchErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const depositPct = project.total_amount > 0
    ? Math.round((project.paid_amount / project.total_amount) * 10000) / 100
    : 0;

  // One pending request max per project+stage
  const { data: existing } = await ctx.supabase
    .from('project_exceptions')
    .select('id')
    .eq('project_id', projectId)
    .eq('requested_stage', 'in_production')
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'Une demande est déjà en attente pour ce projet.' },
      { status: 409 },
    );
  }

  // Insert exception request
  const { data: row, error: insertErr } = await ctx.supabase
    .from('project_exceptions')
    .insert({
      project_id: projectId,
      requested_by: ctx.userId,
      requested_stage: 'in_production',
      current_deposit_percent: depositPct,
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
    description: `Demande d'exception déposée (acompte: ${depositPct}%). Raison: ${reason}`,
  });

  return NextResponse.json({ ok: true, id: row.id });
}
