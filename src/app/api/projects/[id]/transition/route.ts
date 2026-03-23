/**
 * Project Status Transition Endpoint — Atomic Version
 *
 * POST /api/projects/[id]/transition
 *
 * All validation + status update runs inside a single SQL transaction
 * via the transition_project_atomic() RPC. No stale reads, no race conditions.
 *
 * Request body:
 *   { status: ProjectStatus, notes?: string, override?: boolean }
 *
 * Response (success):
 *   { ok: true, from, to, confirmed_amount, total_amount }
 *
 * Response (hard block):
 *   { ok: false, blockType: 'hard', overridable: false, reason, violations }
 *
 * Response (soft block):
 *   { ok: false, blockType: 'soft', overridable: true, reason, warnings,
 *     confirmed_amount, required_amount, shortage }
 */

import { NextResponse }                from 'next/server';
import { guard }                       from '@/lib/security/guardian';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';
import type { ProjectStatus, UserRole } from '@/types/database';

// ── Per-transition role restrictions ──────────────────────────────────────────
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

  // ── Per-transition role check (stays in API, not in RPC) ────────────────
  const requiredRoles = TRANSITION_ROLES[toStatus];
  if (!requiredRoles) {
    return NextResponse.json(
      { error: 'Transition not allowed', message: `No role permissions for "${toStatus}".` },
      { status: 403 },
    );
  }
  if (!requiredRoles.includes(ctx.role)) {
    return NextResponse.json(
      { error: 'Forbidden', message: `Role "${ctx.role}" cannot transition to "${toStatus}".` },
      { status: 403 },
    );
  }

  // ── ATOMIC TRANSITION (single SQL transaction) ──────────────────────────
  // All validation + confirmed SUM + status update + audit in one transaction.
  const { data: result, error: rpcErr } = await ctx.supabase.rpc('transition_project_atomic', {
    p_project_id: projectId,
    p_to_status:  toStatus,
    p_override:   override,
    p_user_role:  ctx.role,
    p_user_id:    ctx.userId,
    p_reason:     notes || null,
  });

  if (rpcErr) {
    console.error('[transition:rpc_error]', rpcErr.message);
    return NextResponse.json(
      { error: 'Transition failed', message: rpcErr.message },
      { status: 500 },
    );
  }

  // ── Interpret RPC result ────────────────────────────────────────────────
  if (!result || result.ok === false) {
    const blockType = result?.blockType || 'hard';
    const httpStatus = 422;

    console.log('[transition:blocked]', JSON.stringify({
      projectId, toStatus, override, role: ctx.role,
      blockType, reason: result?.reason,
    }));

    return NextResponse.json(result, { status: httpStatus });
  }

  // ── Success — log audit (non-fatal, belt-and-suspenders) ────────────────
  // The RPC already handles override audit + timeline events.
  // This is an additional TypeScript-level audit log entry.
  await ctx.audit({
    action:      'status_change',
    entity_type: 'project',
    entity_id:   projectId,
    old_value:   { status: result.from },
    new_value:   { status: result.to, override_used: result.override_used },
    notes:       result.override_used
      ? `CEO OVERRIDE: ${result.from} → ${result.to}. Reason: ${notes}`
      : `Project transition: ${result.from} → ${result.to}${notes ? `. Notes: ${notes}` : ''}`,
  });

  console.log('[transition:success]', JSON.stringify({
    projectId, from: result.from, to: result.to,
    confirmed_amount: result.confirmed_amount,
    override_used: result.override_used,
  }));

  return NextResponse.json({
    ok:               true,
    from:             result.from,
    to:               result.to,
    confirmed_amount: result.confirmed_amount,
    total_amount:     result.total_amount,
    override_used:    result.override_used,
    message:          `Project transitioned from "${result.from}" to "${result.to}"`,
  });
}
