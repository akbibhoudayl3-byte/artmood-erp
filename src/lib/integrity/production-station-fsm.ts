/**
 * Data Integrity Engine — Production Station FSM
 *
 * Enforces sequential station flow for production parts.
 * A part cannot move to the next station unless the previous station is completed.
 *
 * STATION FLOW (strictly sequential):
 *   pending → saw → cnc → edge → assembly → qc → packing
 *
 * RULES:
 *   - Cannot skip stations
 *   - Each station transition must log: timestamp, operator, station
 *   - Previous station must be completed before advancing
 *   - Part can be sent back one station for rework (controlled regression)
 *
 * USAGE:
 *   import { validateStationTransition } from '@/lib/integrity/production-station-fsm';
 */

import { NextResponse } from 'next/server';
import type { ProductionStation } from '@/types/database';

// ── Station Order (strictly sequential) ───────────────────────────────────────

export const STATION_ORDER: readonly ProductionStation[] = [
  'pending',
  'saw',
  'cnc',
  'edge',
  'assembly',
  'qc',
  'packing',
] as const;

// ── Valid transitions: next station or one-step rework ────────────────────────

export const VALID_STATION_TRANSITIONS: Record<ProductionStation, readonly ProductionStation[]> = {
  pending:  ['saw'],
  saw:      ['cnc'],
  cnc:      ['edge'],
  edge:     ['assembly'],
  assembly: ['qc'],
  qc:       ['packing', 'assembly'],  // QC can send back to assembly for rework
  packing:  [],                        // terminal
} as const;

// ── Result Type ───────────────────────────────────────────────────────────────

export type StationTransitionResult =
  | { allowed: true; isRework: boolean }
  | { allowed: false; reason: string; violations: string[] };

// ── Core Validation ───────────────────────────────────────────────────────────

/**
 * Check if station transition is valid (sequential, no skipping).
 */
export function isValidStationTransition(from: ProductionStation, to: ProductionStation): boolean {
  return (VALID_STATION_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Validate a station transition with context.
 */
export function validateStationTransition(params: {
  from: ProductionStation;
  to: ProductionStation;
  operatorId?: string;
}): StationTransitionResult {
  const { from, to, operatorId } = params;

  // Terminal check
  if (from === 'packing') {
    return {
      allowed: false,
      reason: 'Cette pièce est déjà emballée. Aucune transition possible.',
      violations: ['Part is already at terminal station (packing)'],
    };
  }

  // Same station — no-op
  if (from === to) {
    return {
      allowed: false,
      reason: 'La pièce est déjà à cette station.',
      violations: [`Part is already at station: ${from}`],
    };
  }

  // Operator required
  if (!operatorId) {
    return {
      allowed: false,
      reason: 'Un opérateur doit être assigné pour chaque transition de station.',
      violations: ['Operator ID is required for station transition'],
    };
  }

  // FSM edge check
  if (!isValidStationTransition(from, to)) {
    const fromIdx = STATION_ORDER.indexOf(from);
    const toIdx = STATION_ORDER.indexOf(to);

    let reason: string;
    if (toIdx > fromIdx + 1) {
      const nextStation = STATION_ORDER[fromIdx + 1];
      reason = `Impossible de sauter des stations: "${from}" → "${to}". La prochaine station est "${nextStation}".`;
    } else if (toIdx < fromIdx - 1) {
      reason = `Retour arrière non autorisé: "${from}" → "${to}". Seul le renvoi d'une station est possible depuis le contrôle qualité.`;
    } else {
      reason = `Transition de station "${from}" vers "${to}" non autorisée.`;
    }

    return {
      allowed: false,
      reason,
      violations: [`Invalid station transition: ${from} → ${to}`],
    };
  }

  // Check if this is a rework (going backwards)
  const fromIdx = STATION_ORDER.indexOf(from);
  const toIdx = STATION_ORDER.indexOf(to);
  const isRework = toIdx < fromIdx;

  return { allowed: true, isRework };
}

/**
 * NextResponse helper for API routes.
 */
export function guardStationTransition(params: {
  from: ProductionStation;
  to: ProductionStation;
  operatorId?: string;
}): null | NextResponse {
  const result = validateStationTransition(params);
  if (result.allowed) return null;

  return NextResponse.json(
    {
      error: 'Invalid station transition',
      reason: result.reason,
      violations: result.violations,
      transition: `${params.from} → ${params.to}`,
    },
    { status: 422 },
  );
}

/**
 * Returns valid next stations for a given current station (for UI).
 */
export function getNextStations(from: ProductionStation): readonly ProductionStation[] {
  return VALID_STATION_TRANSITIONS[from];
}

/**
 * Returns a human-readable label for a station.
 */
export function getStationLabel(station: ProductionStation): string {
  const labels: Record<ProductionStation, string> = {
    pending:  'En attente',
    saw:      'Scie',
    cnc:      'CNC',
    edge:     'Chant',
    assembly: 'Assemblage',
    qc:       'Contrôle Qualité',
    packing:  'Emballage',
  };
  return labels[station] ?? station;
}
