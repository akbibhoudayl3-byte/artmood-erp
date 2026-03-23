// ============================================================
// ArtMood Factory OS -- Project Workflow Validator (pure utilities)
// ============================================================
//
// Extracted from the status-transition and production-safety logic in:
//   - projects/[id]/page.tsx   (updateStatus function)
//   - projects/[id]/workflow/page.tsx (production stage FSM)
//
// All functions are pure -- no React, no Supabase, no side effects.
// ============================================================

import type { ProjectStatus, Project } from '@/types/crm';

// ---------------------------------------------------------------------------
// Status transition map
// ---------------------------------------------------------------------------

/**
 * Allowed transitions between project statuses.
 *
 * Derived from PROJECT_STAGES and the actual UI in `projects/[id]/page.tsx`
 * which shows every stage except the current one as a clickable option for
 * ceo / commercial_manager / workshop_manager.  In practice the intended
 * flow is linear, but the codebase allows any-to-any (with safety checks
 * for certain transitions like -> production).
 *
 * The map below encodes the *recommended* forward transitions.  The
 * `canTransitionTo` function accepts any transition that is either forward
 * or explicitly backwards (to handle corrections / cancellations).
 */
const FORWARD_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  measurements:              ['measurements_confirmed', 'design', 'cancelled'],
  measurements_confirmed:    ['design', 'cancelled'],
  design:                    ['client_validation', 'cancelled'],
  client_validation:         ['production', 'design', 'cancelled'],
  production:                ['installation', 'cancelled'],
  installation:              ['delivered', 'cancelled'],
  delivered:                 [],                          // terminal
  cancelled:                 ['measurements'],            // allow re-opening
};

/**
 * All statuses in pipeline order (used for ordering / progress).
 */
const STATUS_ORDER: ProjectStatus[] = [
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a transition from `currentStatus` to `targetStatus` is
 * structurally allowed (ignoring business-rule validations like deposit
 * checks).
 *
 * The existing UI (`PROJECT_STAGES.filter(s => s.key !== project.status)`)
 * allows any non-current status, so this function mirrors that permissive
 * behaviour while still blocking self-transitions and unknown statuses.
 */
export function canTransitionTo(
  currentStatus: ProjectStatus,
  targetStatus: ProjectStatus,
): boolean {
  if (currentStatus === targetStatus) return false;
  if (!STATUS_ORDER.includes(currentStatus)) return false;
  if (!STATUS_ORDER.includes(targetStatus)) return false;
  return true;
}

/**
 * Returns the list of statuses the project can move to from its current
 * status.  Mirrors the UI filter: every stage except the current one.
 */
export function getAvailableTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
  return STATUS_ORDER.filter(s => s !== currentStatus);
}

/**
 * Returns the *recommended* forward transitions (the natural next steps).
 * Useful for highlighting primary actions vs secondary/override actions.
 */
export function getRecommendedTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
  return FORWARD_TRANSITIONS[currentStatus] ?? [];
}

// ---------------------------------------------------------------------------
// Business-rule validation for specific transitions
// ---------------------------------------------------------------------------

export interface TransitionValidation {
  valid: boolean;
  errors: string[];
  /** Warnings that can be overridden (CEO override) */
  warnings: string[];
}

/**
 * Validates business rules for a status transition.
 *
 * Extracted from the `updateStatus` function in `projects/[id]/page.tsx`:
 *   - Moving to `production` requires deposit_paid
 *   - Moving to `production` warns if design not validated or total_amount is 0
 *
 * @param project  - The project being transitioned
 * @param targetStatus - The desired new status
 * @param context  - Optional extra context (e.g. critical stock items found externally)
 */
export function validateTransitionRequirements(
  project: Pick<
    Project,
    'status' | 'deposit_paid' | 'design_validated' | 'total_amount'
  >,
  targetStatus: ProjectStatus,
  context?: {
    /** Names of stock items at zero quantity (fetched externally) */
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

  // ── Production gate ──────────────────────────────────────────────────
  if (targetStatus === 'production') {
    // Hard blocker: deposit must be paid
    if (!project.deposit_paid) {
      errors.push('50% deposit has not been paid. Please collect the deposit first.');
    }

    // Soft warnings (CEO can override)
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

  // ── Delivered gate ───────────────────────────────────────────────────
  if (targetStatus === 'delivered') {
    // Only allow from installation
    if (project.status !== 'installation') {
      warnings.push('Normally projects are delivered after installation.');
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
