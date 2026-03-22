/**
 * Data Integrity Engine — Project Status Transition Endpoint
 *
 * POST /api/projects/[id]/transition
 *
 * Validates and applies a project status transition through the strict FSM.
 * NO backward transitions. NO skipping steps. All pre-conditions must pass.
 *
 * Request body:
 *   { status: ProjectStatus, notes?: string, cancelled_reason?: string }
 *
 * Response (success):
 *   { ok: true, project: {...}, from, to }
 *
 * Response (validation failure):
 *   { error: 'Transition projet invalide', reason: string, violations: string[] }
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { guardProjectTransition } from '@/lib/integrity/project-fsm';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';
import type { ProjectStatus, UserRole } from '@/types/database';

// ── Per-transition role restrictions ──────────────────────────────────────────
const TRANSITION_ROLES: Partial<Record<ProjectStatus, readonly UserRole[]>> = {
  in_production:        ['ceo', 'workshop_manager', 'commercial_manager'],
  installation:         ['ceo', 'workshop_manager'],
  delivered:            ['ceo', 'commercial_manager'],
  cancelled:            ['ceo', 'commercial_manager'],
};

// ── Valid status values set (for input validation) ────────────────────────────
const VALID_STATUSES: readonly ProjectStatus[] = [
  'draft', 'measurements_confirmed', 'design_validated', 'bom_generated',
  'ready_for_production', 'in_production', 'installation', 'delivered', 'cancelled',
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Guard: roles that can touch project transitions ─────────────────────
  const ctx = await guard(['ceo', 'commercial_manager', 'workshop_manager', 'designer', 'operations_manager']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;

  if (!isValidUUID(projectId)) {
    return NextResponse.json(
      { error: 'Invalid project ID', message: 'Project ID must be a valid UUID' },
      { status: 400 },
    );
  }

  // ── Parse request body ──────────────────────────────────────────────────
  let body: { status?: string; notes?: string; cancelled_reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const toStatus = body?.status as ProjectStatus | undefined;
  const notes = sanitizeString(body?.notes ?? '', 500);
  const cancelledReason = sanitizeString(body?.cancelled_reason ?? '', 500);

  if (!toStatus || !VALID_STATUSES.includes(toStatus)) {
    return NextResponse.json(
      {
        error: 'Statut invalide',
        message: `"status" doit être l'un de: ${VALID_STATUSES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  // ── Fetch current project ────────────────────────────────────────────────
  const { data: project, error: fetchErr } = await ctx.supabase
    .from('projects')
    .select('id, status, client_name, reference_code, deposit_paid, design_validated, total_amount, measurement_date, measured_by, lead_id')
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
      { error: 'Pas de changement', message: `Le projet est déjà en statut "${toStatus}"` },
      { status: 409 },
    );
  }

  // ── TERMINAL STATES: Delivered and cancelled are LOCKED ─────────────────
  if (fromStatus === 'delivered') {
    return NextResponse.json(
      {
        error: 'Projet verrouillé',
        message: 'Un projet livré est définitivement verrouillé. Aucune modification de statut n\'est possible.',
      },
      { status: 422 },
    );
  }
  if (fromStatus === 'cancelled') {
    return NextResponse.json(
      {
        error: 'Projet annulé',
        message: 'Un projet annulé est définitivement verrouillé. Aucune modification de statut n\'est possible.',
      },
      { status: 422 },
    );
  }

  // ── Per-transition role check ───────────────────────────────────────────
  const requiredRoles = TRANSITION_ROLES[toStatus];
  if (requiredRoles && !requiredRoles.includes(ctx.role)) {
    return NextResponse.json(
      {
        error: 'Accès refusé',
        message: `La transition vers "${toStatus}" nécessite l'un des rôles: ${requiredRoles.join(', ')}. Votre rôle: ${ctx.role}`,
      },
      { status: 403 },
    );
  }

  // ── Cancellation requires a reason ──────────────────────────────────────
  if (toStatus === 'cancelled' && !cancelledReason) {
    return NextResponse.json(
      {
        error: 'Raison obligatoire',
        message: 'Une raison d\'annulation est obligatoire pour annuler un projet.',
      },
      { status: 400 },
    );
  }

  // ── FSM Validation (includes sync + async pre-conditions) ───────────────
  const fsm = await guardProjectTransition({
    from: fromStatus,
    to: toStatus,
    projectId,
    project,
    supabase: ctx.supabase,
    role: ctx.role,
    userId: ctx.userId,
  });
  if (fsm !== null) return fsm;

  // ── Build update payload ────────────────────────────────────────────────
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
    status_updated_at: now,
    updated_at: now,
  };

  // Set lifecycle timestamps
  if (toStatus === 'design_validated') {
    updatePayload.design_validated_at = now;
  }
  if (toStatus === 'bom_generated') {
    updatePayload.bom_generated_at = now;
  }
  if (toStatus === 'in_production') {
    updatePayload.production_started_at = now;
    updatePayload.estimated_production_start = now.split('T')[0];
  }
  if (toStatus === 'delivered') {
    updatePayload.delivered_at = now;
    updatePayload.actual_delivery_date = now.split('T')[0];
  }
  if (toStatus === 'cancelled') {
    updatePayload.cancelled_at = now;
    updatePayload.cancelled_reason = cancelledReason;
  }

  // ── Apply the transition ────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await ctx.supabase
    .from('projects')
    .update(updatePayload)
    .eq('id', projectId)
    .select('id, status, client_name, reference_code, status_updated_at, updated_at')
    .single();

  if (updateErr || !updated) {
    console.error('[project-transition] Update failed:', updateErr?.message);
    return NextResponse.json(
      { error: 'Transition échouée', message: updateErr?.message ?? 'Erreur base de données' },
      { status: 500 },
    );
  }

  // ── Log project event ───────────────────────────────────────────────────
  await ctx.supabase.from('project_events').insert({
    project_id: projectId,
    user_id: ctx.userId,
    event_type: 'status_change',
    old_value: fromStatus,
    new_value: toStatus,
    description: `Statut changé: ${fromStatus} → ${toStatus}${notes ? `. ${notes}` : ''}`,
  });

  // ── Audit log ───────────────────────────────────────────────────────────
  await ctx.audit({
    action: 'project_status_changed',
    entity_type: 'project',
    entity_id: projectId,
    old_value: { status: fromStatus },
    new_value: { status: toStatus, ...(cancelledReason ? { cancelled_reason: cancelledReason } : {}) },
    notes: `Project "${project.client_name}" (${project.reference_code}): ${fromStatus} → ${toStatus}${notes ? `. ${notes}` : ''}`,
  });

  return NextResponse.json({
    ok: true,
    project: updated,
    from: fromStatus,
    to: toStatus,
    message: `Projet "${project.client_name}" : ${fromStatus} → ${toStatus}`,
  });
}
