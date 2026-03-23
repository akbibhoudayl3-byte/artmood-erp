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
 * HARD pre-conditions — critical structural / data integrity checks.
 * These can NEVER be overridden. Evaluated BEFORE soft checks.
 * Returns list of violation messages (empty = all pass).
 */
function checkHardPreConditions(
  from: ProjectStatus,
  to: ProjectStatus,
  project: {
    client_latitude: number | null;
    client_longitude: number | null;
    client_gps_validated: boolean;
  },
  notes: string,
): string[] {
  const violations: string[] = [];

  const hasGPS = project.client_latitude != null && project.client_longitude != null;

  // GPS required at measurements confirmation (earliest field visit checkpoint)
  if (to === 'measurements_confirmed') {
    if (!hasGPS) {
      violations.push(
        'Client GPS location is required before confirming measurements. ' +
        'Go to Project Settings or Visit Form and record the client location.'
      );
    }
  }

  // GPS required before installation (backup hard block)
  if (to === 'installation') {
    if (!hasGPS) {
      violations.push(
        'Client GPS location is required before scheduling installation. ' +
        'Go to Project Settings and record the client location.'
      );
    }
  }

  // Reopen measurements: mandatory reason required
  if (from === 'measurements_confirmed' && to === 'measurements') {
    if (!notes || notes.trim().length === 0) {
      violations.push(
        'A reason is required to reopen measurements. ' +
        'Provide a reopen reason explaining why measurements need to be redone.'
      );
    }
  }

  return violations;
}

/**
 * SOFT pre-conditions — business readiness warnings.
 * CEO can override. Only evaluated when NO hard errors exist.
 * Returns list of warning messages (empty = all pass).
 */
function checkSoftPreConditions(
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
 * Async SOFT pre-conditions — business rules requiring DB queries.
 * Only evaluated when NO hard errors exist.
 * Returns list of warning messages (empty = all pass).
 */
async function checkAsyncSoftPreConditions(
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
 * Full transition validation with strict 3-step ordering.
 *
 * Step 1: FSM edge check     → HARD BLOCK (cannot override)
 * Step 2: Hard pre-conditions → HARD BLOCK (cannot override)
 * Step 3: Soft pre-conditions → SOFT BLOCK (CEO can override)
 *         Only reached if Step 1 + Step 2 produce zero errors.
 *
 * GUARANTEE: response is always exactly ONE of: hard | soft | ok.
 * Never both hard errors AND soft warnings in the same response.
 */
export async function validateProjectTransition(params: {
  from: ProjectStatus;
  to: ProjectStatus;
  projectId: string;
  project: {
    deposit_paid: boolean;
    design_validated: boolean;
    total_amount: number;
    client_latitude: number | null;
    client_longitude: number | null;
    client_gps_validated: boolean;
  };
  supabase: SupabaseClient;
  notes?: string;
}): Promise<TransitionResult> {
  const { from, to, projectId, project, supabase, notes = '' } = params;

  // ── Step 1: FSM edge check — HARD BLOCK ────────────────────────────────
  if (!_isValidTransition(from, to)) {
    console.log('[transition:validation]', JSON.stringify({
      hardErrorsCount: 1, softWarningsCount: 0, validationStageReached: 'step1_fsm',
    }));
    return {
      allowed: false,
      blockType: 'hard',
      reason: `Transition from "${from}" to "${to}" is not allowed by the project state machine`,
      violations: [`Invalid transition: ${from} → ${to}`],
    };
  }

  // ── Step 2: Hard pre-conditions — HARD BLOCK ───────────────────────────
  const hardViolations = checkHardPreConditions(from, to, project, notes);

  if (hardViolations.length > 0) {
    console.log('[transition:validation]', JSON.stringify({
      hardErrorsCount: hardViolations.length, softWarningsCount: 0, validationStageReached: 'step2_hard',
      from, to,
      client_latitude: project.client_latitude,
      client_longitude: project.client_longitude,
      client_gps_validated: project.client_gps_validated,
      violations: hardViolations,
    }));
    return {
      allowed: false,
      blockType: 'hard',
      reason: hardViolations[0],
      violations: hardViolations,
    };
  }

  // ── Step 3: Soft pre-conditions — SOFT BLOCK (only if no hard errors) ──
  const syncWarnings = checkSoftPreConditions(to, project);
  const asyncWarnings = await checkAsyncSoftPreConditions(to, projectId, supabase);
  const allWarnings = [...syncWarnings, ...asyncWarnings];

  console.log('[transition:validation]', JSON.stringify({
    hardErrorsCount: 0, softWarningsCount: allWarnings.length, validationStageReached: 'step3_soft',
    warnings: allWarnings,
  }));

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
    client_latitude: number | null;
    client_longitude: number | null;
    client_gps_validated: boolean;
  };
  supabase: SupabaseClient;
  override?: boolean;
  userRole?: string;
  notes?: string;
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
