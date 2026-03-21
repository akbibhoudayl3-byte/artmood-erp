/**
 * Data Integrity Engine — Project State Machine (FSM)
 *
 * Enforces legal project status transitions and their pre-conditions.
 * All state changes MUST pass through this module.
 *
 * VALID TRANSITION GRAPH:
 *   measurements → design, cancelled
 *   design       → client_validation, measurements, cancelled
 *   client_validation → production, design, cancelled
 *   production   → installation, cancelled
 *   installation → delivered, cancelled
 *   delivered    → (terminal)
 *   cancelled    → (terminal)
 *
 * PRE-CONDITIONS (enforced automatically):
 *   → production :  deposit_paid + design_validated + total_amount > 0
 *   → installation: all production orders completed  (async DB check)
 *   → delivered  :  installation record completed     (async DB check)
 *
 * USAGE:
 *   import { validateProjectTransition } from '@/lib/integrity';
 *
 *   const result = await validateProjectTransition({
 *     supabase: ctx.supabase,
 *     projectId: id,
 *     from: project.status,
 *     to: body.status,
 *     project,
 *   });
 *   if (!result.allowed) return NextResponse.json({ error: result.reason }, { status: 422 });
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient }  from '@supabase/supabase-js';
import type { ProjectStatus }   from '@/types/database';

// ── Transition Map ────────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  measurements:      ['design', 'cancelled'],
  design:            ['client_validation', 'measurements', 'cancelled'],
  client_validation: ['production', 'design', 'cancelled'],
  production:        ['installation', 'cancelled'],
  installation:      ['delivered', 'cancelled'],
  delivered:         [],
  cancelled:         [],
} as const;

// ── Result Type ───────────────────────────────────────────────────────────────

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string; violations: string[] };

// ── Core Validation ───────────────────────────────────────────────────────────

/**
 * Synchronous check — valid FSM edge only.
 * No DB access required.
 */
export function isValidTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Sync pre-conditions — checks that can be evaluated from the Project row alone.
 * Returns list of violation messages (empty = all pass).
 */
function checkSyncPreConditions(
  to: ProjectStatus,
  project: {
    deposit_paid: boolean;
    design_validated: boolean;
    total_amount: number;
  },
): string[] {
  const violations: string[] = [];

  if (to === 'production') {
    if (!project.deposit_paid)
      violations.push('Deposit must be paid before starting production');
    if (!project.design_validated)
      violations.push('Design must be validated and approved before starting production');
    if (!project.total_amount || project.total_amount <= 0)
      violations.push('Project must have a positive total amount before starting production');
  }

  return violations;
}

/**
 * Async pre-conditions — checks that require DB queries.
 * Returns list of violation messages (empty = all pass).
 */
async function checkAsyncPreConditions(
  to: ProjectStatus,
  projectId: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  const violations: string[] = [];

  // ── → installation: all production orders must be completed ──────────────
  if (to === 'installation') {
    const { data: orders, error } = await supabase
      .from('production_orders')
      .select('id, status')
      .eq('project_id', projectId);

    if (error) {
      violations.push('Could not verify production order status');
    } else if (!orders || orders.length === 0) {
      violations.push('No production order found — create and complete a production order first');
    } else {
      const incomplete = orders.filter(o => o.status !== 'completed');
      if (incomplete.length > 0) {
        violations.push(
          `${incomplete.length} production order(s) are not yet completed. ` +
          'All must be completed before scheduling installation.',
        );
      }
    }
  }

  // ── → delivered: installation must be completed + invoice required ───────
  if (to === 'delivered') {
    // Check installations
    const { data: installations, error } = await supabase
      .from('installations')
      .select('id, status')
      .eq('project_id', projectId);

    if (error) {
      violations.push('Could not verify installation status');
    } else if (!installations || installations.length === 0) {
      violations.push('No installation record found — create and complete an installation first');
    } else {
      const incomplete = installations.filter(i => i.status !== 'completed');
      if (incomplete.length > 0) {
        violations.push(
          'Installation must be fully completed before marking the project as delivered',
        );
      }
    }

    // WORKFLOW RULE: Invoice must exist before delivery
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('project_id', projectId);

    if (invErr) {
      violations.push('Could not verify invoice status');
    } else if (!invoices || invoices.length === 0) {
      violations.push(
        'Une facture doit être générée avant de marquer le projet comme livré. Créez une facture depuis l\'onglet Finance.',
      );
    }
  }

  return violations;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Full transition validation: FSM edge + sync pre-conditions + async pre-conditions.
 *
 * @param from      Current project status
 * @param to        Requested next status
 * @param projectId UUID of the project (for async DB checks)
 * @param project   Project row object (for sync pre-condition checks)
 * @param supabase  Supabase client (for async checks)
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

  // 1. FSM edge check
  if (!isValidTransition(from, to)) {
    return {
      allowed: false,
      reason: `Transition from "${from}" to "${to}" is not allowed by the project state machine`,
      violations: [`Invalid transition: ${from} → ${to}`],
    };
  }

  // 2. Sync pre-conditions
  const syncViolations = checkSyncPreConditions(to, project);

  // 3. Async pre-conditions
  const asyncViolations = await checkAsyncPreConditions(to, projectId, supabase);

  const allViolations = [...syncViolations, ...asyncViolations];

  if (allViolations.length > 0) {
    return {
      allowed: false,
      reason: allViolations[0],
      violations: allViolations,
    };
  }

  return { allowed: true };
}

/**
 * Returns all statuses that can be transitioned TO from the given status.
 * Used by UI to render valid action buttons.
 */
export function getAvailableTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return VALID_TRANSITIONS[from];
}

/**
 * Returns a human-readable label for a project status.
 */
export function getStatusLabel(status: ProjectStatus): string {
  const labels: Record<ProjectStatus, string> = {
    measurements:      'Measurements',
    design:            'Design',
    client_validation: 'Client Validation',
    production:        'Production',
    installation:      'Installation',
    delivered:         'Delivered',
    cancelled:         'Cancelled',
  };
  return labels[status] ?? status;
}

/**
 * NextResponse helper: validates and returns a structured error response.
 * Use this in API route handlers.
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
}): Promise<null | NextResponse> {
  const result = await validateProjectTransition(params);
  if (result.allowed) return null;

  return NextResponse.json(
    {
      error: 'Invalid project transition',
      reason: result.reason,
      violations: result.violations,
      transition: `${params.from} → ${params.to}`,
    },
    { status: 422 },
  );
}
