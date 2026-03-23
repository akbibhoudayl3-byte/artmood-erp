/**
 * Data Integrity Engine — Project State Machine (FSM)
 *
 * Enforces legal project status transitions with two-tier validation:
 *
 *   HARD BLOCK  — Invalid FSM edge or role violation. Cannot be overridden.
 *                 Returns blockType: 'hard'. API returns 422.
 *
 *   SOFT BLOCK  — Business warnings (deposit, design, stock, etc.).
 *                 Can be overridden by CEO. API accepts { override: true }.
 *                 Returns blockType: 'soft'. API returns 422 unless override=true.
 *
 * VALID TRANSITION GRAPH:
 *   measurements           → measurements_confirmed, design, cancelled
 *   measurements_confirmed → design, cancelled
 *   design                 → client_validation, measurements, cancelled
 *   client_validation      → production, design, cancelled
 *   production             → installation, cancelled
 *   installation           → delivered, cancelled
 *   delivered              → (terminal)
 *   cancelled              → (terminal)
 *
 * PRE-CONDITIONS (soft blocks — overridable by CEO):
 *   → production :  deposit_paid + design_validated + total_amount > 0
 *   → installation: all production orders completed  (async DB check)
 *   → delivered  :  installation record completed     (async DB check)
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient }  from '@supabase/supabase-js';
import type { ProjectStatus }   from '@/types/database';

// Import pure FSM core for local use
import { isValidTransition as _isValidTransition } from '@/lib/integrity/project-fsm-core';

// Re-export pure FSM core (client-safe)
export {
  VALID_TRANSITIONS,
  isValidTransition,
  getAvailableTransitions,
  getStatusLabel,
} from '@/lib/integrity/project-fsm-core';

// ── Result Types ──────────────────────────────────────────────────────────────

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; blockType: 'hard'; reason: string; violations: string[] }
  | { allowed: false; blockType: 'soft'; reason: string; warnings: string[] };

// ── Pre-condition Checks (server-only, require DB) ───────────────────────────

/**
 * Sync pre-conditions — soft blocks (business rules).
 * Returns list of warning messages (empty = all pass).
 */
function checkSyncPreConditions(
  to: ProjectStatus,
  project: {
    deposit_paid: boolean;
    design_validated: boolean;
    total_amount: number;
  },
): string[] {
  const warnings: string[] = [];

  if (to === 'production') {
    if (!project.deposit_paid)
      warnings.push('Deposit must be paid before starting production');
    if (!project.design_validated)
      warnings.push('Design must be validated and approved before starting production');
    if (!project.total_amount || project.total_amount <= 0)
      warnings.push('Project must have a positive total amount before starting production');
  }

  return warnings;
}

/**
 * Async pre-conditions — soft blocks (business rules requiring DB queries).
 * Returns list of warning messages (empty = all pass).
 */
async function checkAsyncPreConditions(
  to: ProjectStatus,
  projectId: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  const warnings: string[] = [];

  // ── → installation: all production orders must be completed ──────────────
  if (to === 'installation') {
    const { data: orders, error } = await supabase
      .from('production_orders')
      .select('id, status')
      .eq('project_id', projectId);

    if (error) {
      warnings.push('Could not verify production order status');
    } else if (!orders || orders.length === 0) {
      warnings.push('No production order found — create and complete a production order first');
    } else {
      const incomplete = orders.filter(o => o.status !== 'completed');
      if (incomplete.length > 0) {
        warnings.push(
          `${incomplete.length} production order(s) are not yet completed. ` +
          'All must be completed before scheduling installation.',
        );
      }
    }
  }

  // ── → delivered: installation must be completed ───────────────────────────
  if (to === 'delivered') {
    const { data: installations, error } = await supabase
      .from('installations')
      .select('id, status')
      .eq('project_id', projectId);

    if (error) {
      warnings.push('Could not verify installation status');
    } else if (!installations || installations.length === 0) {
      warnings.push('No installation record found — create and complete an installation first');
    } else {
      const incomplete = installations.filter(i => i.status !== 'completed');
      if (incomplete.length > 0) {
        warnings.push(
          'Installation must be fully completed before marking the project as delivered',
        );
      }
    }
  }

  return warnings;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Full transition validation with two-tier blocking.
 *
 * 1. FSM edge check       → HARD BLOCK (cannot override)
 * 2. Business pre-conditions → SOFT BLOCK (CEO can override)
 */
export async function validateProjectTransition(params: {
  from: ProjectStatus;
  to: ProjectStatus;
  projectId: string;
  project: {
    deposit_paid: boolean;
    design_validated: boolean;
    total_amount: number;
  };
  supabase: SupabaseClient;
}): Promise<TransitionResult> {
  const { from, to, projectId, project, supabase } = params;

  // 1. FSM edge check — HARD BLOCK (never overridable)
  if (!_isValidTransition(from, to)) {
    return {
      allowed: false,
      blockType: 'hard',
      reason: `Transition from "${from}" to "${to}" is not allowed by the project state machine`,
      violations: [`Invalid transition: ${from} → ${to}`],
    };
  }

  // 2. Sync + Async pre-conditions — SOFT BLOCK (overridable by CEO)
  const syncWarnings = checkSyncPreConditions(to, project);
  const asyncWarnings = await checkAsyncPreConditions(to, projectId, supabase);
  const allWarnings = [...syncWarnings, ...asyncWarnings];

  if (allWarnings.length > 0) {
    return {
      allowed: false,
      blockType: 'soft',
      reason: allWarnings[0],
      warnings: allWarnings,
    };
  }

  return { allowed: true };
}

/**
 * NextResponse helper for API route handlers.
 *
 * Hard blocks → always returns 422.
 * Soft blocks → returns 422 with overridable=true flag.
 *               If override=true was passed and user is CEO, returns null (allow).
 */
export async function guardProjectTransition(params: {
  from: ProjectStatus;
  to: ProjectStatus;
  projectId: string;
  project: {
    deposit_paid: boolean;
    design_validated: boolean;
    total_amount: number;
  };
  supabase: SupabaseClient;
  override?: boolean;
  userRole?: string;
}): Promise<null | NextResponse> {
  const result = await validateProjectTransition(params);
  if (result.allowed) return null;

  // HARD BLOCK — never overridable
  if (result.blockType === 'hard') {
    return NextResponse.json(
      {
        error: 'Invalid project transition',
        blockType: 'hard',
        reason: result.reason,
        violations: result.violations,
        transition: `${params.from} → ${params.to}`,
        overridable: false,
      },
      { status: 422 },
    );
  }

  // SOFT BLOCK — overridable by CEO
  if (params.override && params.userRole === 'ceo') {
    return null; // CEO override accepted, proceed with transition
  }

  return NextResponse.json(
    {
      error: 'Transition blocked by business rules',
      blockType: 'soft',
      reason: result.reason,
      warnings: result.warnings,
      transition: `${params.from} → ${params.to}`,
      overridable: true,
    },
    { status: 422 },
  );
}
