// ============================================================
// ArtMood Factory OS -- Project Workflow Validator (pure utilities)
// ============================================================
//
// Delegates FSM validation to the canonical source:
//   @/lib/integrity/project-fsm.ts
//
// This module provides:
//   - Pure client-side transition checks (no Supabase needed)
//   - Production stage FSM (separate from project FSM)
//
// All functions are pure -- no React, no Supabase, no side effects.
// ============================================================

import type { ProjectStatus, Project } from '@/types/crm';
import {
  VALID_TRANSITIONS,
  isValidTransition,
  getAvailableTransitions as fsmGetAvailableTransitions,
} from '@/lib/integrity/project-fsm-core';

// ---------------------------------------------------------------------------
// Re-export FSM as single source of truth
// ---------------------------------------------------------------------------

export { VALID_TRANSITIONS, isValidTransition };

/**
 * All statuses in pipeline order (used for ordering / progress).
 */
export const STATUS_ORDER: ProjectStatus[] = [
  'measurements',
  'measurements_confirmed',
  'design',
  'client_validation',
  'production',
  'installation',
  'delivered',
  'cancelled',
];

// ---------------------------------------------------------------------------
// Public API — delegates to FSM
// ---------------------------------------------------------------------------

/**
 * Check whether a transition from `currentStatus` to `targetStatus` is
 * structurally allowed by the FSM.
 *
 * HARD BLOCK: returns false for invalid FSM edges.
 * Does NOT check business rules (those are soft blocks handled server-side).
 */
export function canTransitionTo(
  currentStatus: ProjectStatus,
  targetStatus: ProjectStatus,
): boolean {
  if (currentStatus === targetStatus) return false;
  return isValidTransition(currentStatus, targetStatus);
}

/**
 * Returns the list of statuses the project can move to from its current
 * status, as defined by the FSM.
 */
export function getAvailableTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
  return [...fsmGetAvailableTransitions(currentStatus)];
}

/**
 * Returns the *recommended* forward transitions (same as FSM available).
 * Kept for backward compatibility.
 */
export function getRecommendedTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
  return [...fsmGetAvailableTransitions(currentStatus)];
}

// ---------------------------------------------------------------------------
// Business-rule validation (client-side, for UI display only)
// ---------------------------------------------------------------------------

export interface TransitionValidation {
  valid: boolean;
  /** Hard errors (FSM violations) — cannot be overridden */
  errors: string[];
  /** Soft warnings (business rules) — CEO can override */
  warnings: string[];
}

/**
 * Client-side validation for a status transition.
 *
 * Step 1: FSM check → hard error if invalid edge
 * Step 2: Business rules → soft warnings (CEO can override server-side)
 *
 * The actual enforcement happens server-side via /api/projects/[id]/transition.
 * This function provides early feedback in the UI.
 */
export function validateTransitionRequirements(
  project: Pick<
    Project,
    'status' | 'deposit_paid' | 'design_validated' | 'total_amount'
  >,
  targetStatus: ProjectStatus,
  context?: {
    criticalStockItemNames?: string[];
  },
): TransitionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Self-transition
  if (project.status === targetStatus) {
    errors.push('Project is already in this status.');
    return { valid: false, errors, warnings };
  }

  // ── HARD BLOCK: FSM edge check ──────────────────────────────────────
  if (!isValidTransition(project.status, targetStatus)) {
    errors.push(`Cannot transition from "${project.status}" to "${targetStatus}".`);
    return { valid: false, errors, warnings };
  }

  // ── SOFT BLOCK: Business rules (overridable by CEO) ─────────────────

  if (targetStatus === 'production') {
    if (!project.deposit_paid) {
      warnings.push('50% deposit has not been paid.');
    }
    if (!project.design_validated) {
      warnings.push('Design not validated by client.');
    }
    if (project.total_amount === 0) {
      warnings.push('No quote amount set (total_amount is 0).');
    }
    const criticals = context?.criticalStockItemNames ?? [];
    if (criticals.length > 0) {
      warnings.push(
        `${criticals.length} stock item(s) at zero: ${criticals.join(', ')}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Production stage FSM (from workflow page)
// ---------------------------------------------------------------------------

export type ProductionStageStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/**
 * The ordered production stages used in the workflow page.
 */
export const PRODUCTION_STAGE_ORDER = [
  'design',
  'cutting',
  'edge_banding',
  'assembly',
  'quality_check',
  'ready',
  'installation',
] as const;

export type ProductionStage = typeof PRODUCTION_STAGE_ORDER[number];

/**
 * Checks if a production stage can transition to a given status.
 *
 * Rules extracted from workflow/page.tsx:
 * - pending  -> in_progress (start)
 * - in_progress -> completed (finish) or blocked (block)
 * - blocked -> in_progress (resume)
 * - completed -> (terminal, no further transitions)
 */
export function canProductionStageTransition(
  currentStatus: ProductionStageStatus,
  targetStatus: ProductionStageStatus,
): boolean {
  switch (currentStatus) {
    case 'pending':
      return targetStatus === 'in_progress';
    case 'in_progress':
      return targetStatus === 'completed' || targetStatus === 'blocked';
    case 'blocked':
      return targetStatus === 'in_progress';
    case 'completed':
      return false;
    default:
      return false;
  }
}

/**
 * Returns available production stage actions for a given status.
 */
export function getProductionStageActions(
  currentStatus: ProductionStageStatus,
): ProductionStageStatus[] {
  switch (currentStatus) {
    case 'pending':
      return ['in_progress'];
    case 'in_progress':
      return ['completed', 'blocked'];
    case 'blocked':
      return ['in_progress'];
    case 'completed':
      return [];
    default:
      return [];
  }
}
