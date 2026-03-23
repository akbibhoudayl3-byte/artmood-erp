/**
 * Project FSM Core — Pure client-safe module.
 *
 * Contains ONLY the transition map and pure functions.
 * No NextResponse, no SupabaseClient, no server dependencies.
 *
 * Used by:
 *   - Client components (projects/[id]/page.tsx, workflow-validator)
 *   - Server module (project-fsm.ts) re-imports from here
 */

import type { ProjectStatus } from '@/types/database';

// ── Transition Map ────────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  measurements:              ['measurements_confirmed', 'design', 'cancelled'],
  measurements_confirmed:    ['design', 'cancelled'],
  design:                    ['client_validation', 'measurements', 'cancelled'],
  client_validation:         ['production', 'design', 'cancelled'],
  production:                ['installation', 'cancelled'],
  installation:              ['delivered', 'cancelled'],
  delivered:                 [],
  cancelled:                 [],
} as const;

/**
 * Synchronous check — valid FSM edge only.
 */
export function isValidTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Returns all statuses that can be transitioned TO from the given status.
 */
export function getAvailableTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return VALID_TRANSITIONS[from];
}

/**
 * Returns a human-readable label for a project status.
 */
export function getStatusLabel(status: ProjectStatus): string {
  const labels: Record<ProjectStatus, string> = {
    measurements:              'Measurements',
    measurements_confirmed:    'Measurements Confirmed',
    design:                    'Design',
    client_validation:         'Client Validation',
    production:                'Production',
    installation:              'Installation',
    delivered:                 'Delivered',
    cancelled:                 'Cancelled',
  };
  return labels[status] ?? status;
}
