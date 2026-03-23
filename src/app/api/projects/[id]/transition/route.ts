/**
 * Data Integrity Engine — Project Status Transition Endpoint
 *
 * POST /api/projects/[id]/transition
 *
 * Validates and applies a project status transition through the FSM.
 * All pre-conditions must pass before the status is updated.
 *
 * Allowed roles: CEO, commercial_manager, workshop_manager, designer
 * (further restricted per-transition inside the handler)
 *
 * Request body:
 *   { status: ProjectStatus, notes?: string }
 *
 * Response (success):
 *   { ok: true, project: { id, status, ... }, from: oldStatus, to: newStatus }
 *
 * Response (validation failure):
 *   { error: 'Invalid project transition', reason: string, violations: string[] }
 */

import { NextResponse }                from 'next/server';
import { guard }                       from '@/lib/security/guardian';
import { guardProjectTransition }      from '@/lib/integrity/project-fsm';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';
import type { ProjectStatus, UserRole } from '@/types/database';

// ── Per-transition role restrictions ──────────────────────────────────────────
// Some transitions require specific roles beyond the base guard.
const TRANSITION_ROLES: Record<ProjectStatus, readonly UserRole[]> = {
  measurements:              ['ceo', 'commercial_manager', 'designer'],
  measurements_confirmed:    ['ceo', 'commercial_manager', 'designer'],
  design:                    ['ceo', 'commercial_manager', 'designer'],
  client_validation:         ['ceo', 'commercial_manager', 'designer'],
  production:                ['ceo', 'workshop_manager', 'commercial_manager'],
  installation:              ['ceo', 'workshop_manager'],
  delivered:                 ['ceo', 'commercial_manager'],
  cancelled:                 ['ceo', 'commercial_manager'],
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Guard: roles that can ever touch project transitions ─────────────────
  const ctx = await guard(['ceo', 'commercial_manager', 'workshop_manager', 'designer']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;

  // ── Validate project UUID ─────────────────────────────────────────────────
  if (!isValidUUID(projectId)) {
    return NextResponse.json(
      { error: 'Invalid project ID', message: 'Project ID must be a valid UUID' },
      { status: 400 },
    );
  }

  // ── Parse request body ────────────────────────────────────────────────────
  let body: { status?: string; notes?: string; override?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const toStatus = body?.status as ProjectStatus | undefined;
  const notes = sanitizeString(body?.notes ?? '', 500);
  const override = body?.override === true;

  if (!toStatus) {
    return NextResponse.json(
      { error: 'Missing status', message: '"status" field is required in request body' },
      { status: 400 },
    );
  }

  // ── Fetch current project ─────────────────────────────────────────────────
  const { data: project, error: fetchErr } = await ctx.supabase
    .from('projects')
    .select('id, status, client_name, deposit_paid, design_validated, total_amount, client_latitude, client_longitude, client_gps_validated')
    .eq('id', projectId)
    .single();

  if (fetchErr || !project) {
    return NextResponse.json(
      { error: 'Project not found', message: `No project with id ${projectId}` },
      { status: 404 },
    );
  }

  const fromStatus = project.status as ProjectStatus;

  // Same status — no-op
  if (fromStatus === toStatus) {
    return NextResponse.json(
      { error: 'No change', message: `Project is already in "${toStatus}" status` },
      { status: 409 },
    );
  }

  // ── Per-transition role check ─────────────────────────────────────────────
  const requiredRoles = TRANSITION_ROLES[toStatus];
  if (!requiredRoles) {
    return NextResponse.json(
      {
        error: 'Transition not allowed',
        message: `No role permissions defined for transitioning to "${toStatus}". Contact admin.`,
      },
      { status: 403 },
    );
  }
  if (!requiredRoles.includes(ctx.role)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `Transitioning to "${toStatus}" requires one of: ${requiredRoles.join(', ')}. Your role: ${ctx.role}`,
      },
      { status: 403 },
    );
  }

  // ── FSM Validation (hard blocks + soft blocks) ───────────────────────────
  // Hard blocks (invalid FSM edge): always rejected, no override possible.
  // Soft blocks (business warnings): rejected unless override=true AND role=ceo.
  const fsm = await guardProjectTransition({
    from:      fromStatus,
    to:        toStatus,
    projectId,
    project,
    supabase:  ctx.supabase,
    override,
    userRole:  ctx.role,
    notes:     notes || '',
  });

  // ── DEBUG: structured transition decision log ──────────────────────────
  if (fsm !== null) {
    const debugBody = await fsm.clone().json();
    console.log('[transition:debug]', JSON.stringify({
      from: fromStatus,
      to: toStatus,
      projectId,
      override,
      userRole: ctx.role,
      decision: debugBody,
    }));
    return fsm;
  }

  console.log('[transition:debug]', JSON.stringify({
    from: fromStatus,
    to: toStatus,
    projectId,
    override,
    userRole: ctx.role,
    decision: { ok: true, blockType: null },
  }));

  // ── Apply the transition ──────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await ctx.supabase
    .from('projects')
    .update({
      status:     toStatus,
      updated_at: new Date().toISOString(),
      // Set actual_delivery_date when project is delivered
      ...(toStatus === 'delivered' ? { actual_delivery_date: new Date().toISOString().split('T')[0] } : {}),
    })
    .eq('id', projectId)
    .select('id, status, client_name, reference_code, updated_at')
    .single();

  if (updateErr || !updated) {
    console.error('[transition] Update failed:', updateErr?.message);
    return NextResponse.json(
      { error: 'Transition failed', message: updateErr?.message ?? 'Database error' },
      { status: 500 },
    );
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const isReopen = fromStatus === 'measurements_confirmed' && toStatus === 'measurements';
  await ctx.audit({
    action:      'status_change',
    entity_type: 'project',
    entity_id:   projectId,
    old_value:   { status: fromStatus },
    new_value:   { status: toStatus, ...(isReopen ? { reopen: true } : {}) },
    notes:       isReopen
      ? `MEASUREMENTS REOPENED: ${fromStatus} → ${toStatus}. Reason: ${notes}`
      : `Project transition: ${fromStatus} → ${toStatus}${notes ? `. Notes: ${notes}` : ''}`,
  });

  // ── Timeline event: enrich the trigger's row for reopens ─────────────────
  // The DB trigger (log_project_status_change) creates a generic status_change
  // row. For reopens, we UPDATE that row to add the reason + metadata instead
  // of inserting a duplicate. We find it by matching project_id + old/new status
  // within the last 5 seconds.
  if (isReopen && notes) {
    const { data: triggerRow } = await ctx.supabase
      .from('project_events')
      .select('id')
      .eq('project_id', projectId)
      .eq('event_type', 'status_change')
      .eq('old_value', fromStatus)
      .eq('new_value', toStatus)
      .gte('created_at', new Date(Date.now() - 5000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (triggerRow) {
      // Enrich the trigger's row
      await ctx.supabase.from('project_events').update({
        event_type:  'measurements_reopened',
        user_id:     ctx.userId,
        description: `Mesures réouvertes: ${fromStatus} → ${toStatus}. Raison: ${notes}`,
        metadata:    { reopen: true, reason: notes },
      }).eq('id', triggerRow.id);
    } else {
      // Trigger row not found (shouldn't happen) — insert as fallback
      await ctx.supabase.from('project_events').insert({
        project_id:  projectId,
        user_id:     ctx.userId,
        event_type:  'measurements_reopened',
        old_value:   fromStatus,
        new_value:   toStatus,
        description: `Mesures réouvertes: ${fromStatus} → ${toStatus}. Raison: ${notes}`,
        metadata:    { reopen: true, reason: notes },
      });
    }
  }

  return NextResponse.json({
    ok:      true,
    project: updated,
    from:    fromStatus,
    to:      toStatus,
    message: `Project "${project.client_name}" transitioned from "${fromStatus}" to "${toStatus}"`,
  });
}
