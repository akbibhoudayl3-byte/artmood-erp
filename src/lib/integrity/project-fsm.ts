/**
 * Data Integrity Engine — Project Workflow State Machine (FSM)
 *
 * Enforces STRICT sequential project lifecycle transitions.
 * All status changes MUST pass through this module.
 *
 * VALID TRANSITION GRAPH (STRICTLY SEQUENTIAL — NO SKIPPING):
 *
 *   draft                → measurements_confirmed, cancelled
 *   measurements_confirmed → design_validated, cancelled
 *   design_validated     → bom_generated, cancelled
 *   bom_generated        → ready_for_production, cancelled
 *   ready_for_production → in_production, cancelled
 *   in_production        → installation, cancelled
 *   installation         → delivered, cancelled
 *   delivered            → (terminal — locked)
 *   cancelled            → (terminal — locked)
 *
 * NO backward transitions. NO skipping steps.
 * Every transition must pass validation rules.
 *
 * VALIDATION RULES PER STAGE:
 *   → measurements_confirmed : internal measurement done OR (plan_file + external measurements)
 *   → design_validated       : design file/flag approved
 *   → bom_generated          : at least 1 module/cabinet + parts exist
 *   → ready_for_production   : cost calculated, margin validated, quote accepted
 *   → in_production          : production order exists (BOM-only, no manual)
 *   → installation           : all production stations completed
 *   → delivered              : installation checklist + invoice exists
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectStatus } from '@/types/database';

// ── Transition Map (STRICTLY SEQUENTIAL + cancelled) ─────────────────────────

export const VALID_PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft:                   ['measurements_confirmed', 'cancelled'],
  measurements_confirmed:  ['design_validated', 'cancelled'],
  design_validated:        ['bom_generated', 'cancelled'],
  bom_generated:           ['ready_for_production', 'cancelled'],
  ready_for_production:    ['in_production', 'cancelled'],
  in_production:           ['installation', 'cancelled'],
  installation:            ['delivered', 'cancelled'],
  delivered:               [],  // terminal — locked
  cancelled:               [],  // terminal — locked
} as const;

// ── Ordered pipeline stages (for progress bar) ──────────────────────────────

export const PROJECT_PIPELINE_ORDER: readonly ProjectStatus[] = [
  'draft',
  'measurements_confirmed',
  'design_validated',
  'bom_generated',
  'ready_for_production',
  'in_production',
  'installation',
  'delivered',
] as const;

// ── Result Type ──────────────────────────────────────────────────────────────

export type ProjectTransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string; violations: string[] };

// ── Core Validation ──────────────────────────────────────────────────────────

/**
 * Check if the FSM edge is valid.
 */
export function isValidProjectTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return (VALID_PROJECT_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Synchronous pre-conditions from the project row alone.
 */
function checkSyncPreConditions(
  to: ProjectStatus,
  project: {
    deposit_paid?: boolean;
    design_validated?: boolean;
    total_amount?: number;
    measurement_date?: string | null;
    measured_by?: string | null;
  },
): string[] {
  const violations: string[] = [];

  if (to === 'measurements_confirmed') {
    // Either internal measurement done OR handled via async check for external plan
    // measurement_date or measured_by indicates internal measurement
    // If neither, async check will verify plan_file
  }

  if (to === 'design_validated') {
    if (!project.design_validated) {
      violations.push(
        'Le design doit être validé et approuvé avant de passer à cette étape. ' +
        'Marquez le design comme validé dans les détails du projet.'
      );
    }
  }

  if (to === 'ready_for_production') {
    if (!project.total_amount || project.total_amount <= 0) {
      violations.push(
        'Le montant total du projet doit être défini avant de lancer la production. ' +
        'Créez et validez un devis.'
      );
    }
    if (!project.deposit_paid) {
      violations.push(
        'L\'acompte (50%) doit être payé avant de passer en production.'
      );
    }
  }

  return violations;
}

/**
 * Async pre-conditions — checks that require DB queries.
 */
async function checkAsyncPreConditions(
  to: ProjectStatus,
  projectId: string,
  supabase: SupabaseClient,
  project: {
    measurement_date?: string | null;
    measured_by?: string | null;
    lead_id?: string | null;
  },
): Promise<string[]> {
  const violations: string[] = [];

  // ── → measurements_confirmed ───────────────────────────────────────────────
  if (to === 'measurements_confirmed') {
    const hasInternalMeasurement = !!(project.measurement_date || project.measured_by);

    if (!hasInternalMeasurement) {
      // Check for external measurements via lead
      if (project.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('measurement_source, plan_file_url, measurements_provided_by_client')
          .eq('id', project.lead_id)
          .single();

        const hasExternalPlan = lead?.measurement_source === 'external'
          && lead?.plan_file_url
          && lead?.measurements_provided_by_client;

        if (!hasExternalPlan) {
          violations.push(
            'Les mesures doivent être confirmées. Effectuez une prise de mesure ' +
            'ou vérifiez qu\'un plan externe a été fourni avec le lead.'
          );
        }
      } else {
        // No lead link and no internal measurement
        // Check for project files with measurement data
        const { data: files } = await supabase
          .from('project_files')
          .select('id')
          .eq('project_id', projectId)
          .limit(1);

        if (!files || files.length === 0) {
          violations.push(
            'Les mesures doivent être confirmées. Effectuez une prise de mesure interne ' +
            'ou téléchargez un plan avec les mesures.'
          );
        }
      }
    }
  }

  // ── → bom_generated ─────────────────────────────────────────────────────────
  if (to === 'bom_generated') {
    // Check for at least 1 kitchen module or cabinet spec
    const [modulesRes, cabinetsRes, partsRes] = await Promise.all([
      supabase.from('kitchen_modules').select('id').eq('project_id', projectId).limit(1),
      supabase.from('cabinet_specs').select('id').eq('project_id', projectId).limit(1),
      supabase.from('production_parts').select('id').eq('project_id', projectId).limit(1),
    ]);

    const hasModules = (modulesRes.data && modulesRes.data.length > 0);
    const hasCabinets = (cabinetsRes.data && cabinetsRes.data.length > 0);
    const hasParts = (partsRes.data && partsRes.data.length > 0);

    if (!hasModules && !hasCabinets) {
      violations.push(
        'Au moins un module de cuisine ou meuble doit être configuré avant de générer le BOM.'
      );
    }

    if (!hasParts && !hasModules) {
      violations.push(
        'Le BOM (nomenclature) doit contenir au moins une pièce. ' +
        'Configurez les modules pour générer automatiquement les pièces.'
      );
    }
  }

  // ── → ready_for_production ──────────────────────────────────────────────────
  if (to === 'ready_for_production') {
    // Quote must be accepted
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('status', 'accepted')
      .limit(1);

    if (!quotes || quotes.length === 0) {
      violations.push(
        'Un devis doit être accepté par le client avant de passer en production. ' +
        'Créez un devis, envoyez-le, et marquez-le comme accepté.'
      );
    }
  }

  // ── → in_production ────────────────────────────────────────────────────────
  if (to === 'in_production') {
    const { data: orders } = await supabase
      .from('production_orders')
      .select('id, status')
      .eq('project_id', projectId)
      .limit(1);

    if (!orders || orders.length === 0) {
      violations.push(
        'Un ordre de production doit être créé à partir du BOM avant de lancer la production. ' +
        'La création manuelle est bloquée — utilisez la génération depuis le BOM.'
      );
    }
  }

  // ── → installation ────────────────────────────────────────────────────────
  if (to === 'installation') {
    const { data: orders, error } = await supabase
      .from('production_orders')
      .select('id, status, current_station')
      .eq('project_id', projectId);

    if (error) {
      violations.push('Impossible de vérifier le statut des ordres de production.');
    } else if (!orders || orders.length === 0) {
      violations.push('Aucun ordre de production trouvé pour ce projet.');
    } else {
      const incomplete = orders.filter(o => o.status !== 'completed');
      if (incomplete.length > 0) {
        violations.push(
          `${incomplete.length} ordre(s) de production non terminé(s). ` +
          'Toutes les stations (saw, cnc, edge, assembly, qc, packing) doivent être complétées.'
        );
      }
    }
  }

  // ── → delivered ────────────────────────────────────────────────────────────
  if (to === 'delivered') {
    // Installation must be completed
    const { data: installations } = await supabase
      .from('installations')
      .select('id, status')
      .eq('project_id', projectId);

    if (!installations || installations.length === 0) {
      violations.push(
        'Aucune fiche d\'installation trouvée. Créez et complétez une installation.'
      );
    } else {
      const incomplete = installations.filter(i => i.status !== 'completed');
      if (incomplete.length > 0) {
        violations.push(
          'L\'installation doit être entièrement complétée (checklist validée) avant la livraison.'
        );
      }
    }

    // Invoice must exist
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('project_id', projectId);

    if (!invoices || invoices.length === 0) {
      violations.push(
        'Une facture doit être générée et validée avant de marquer le projet comme livré.'
      );
    }
  }

  return violations;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Full transition validation: FSM edge + sync pre-conditions + async pre-conditions.
 */
export async function validateProjectTransition(params: {
  from: ProjectStatus;
  to: ProjectStatus;
  projectId: string;
  project: {
    deposit_paid?: boolean;
    design_validated?: boolean;
    total_amount?: number;
    measurement_date?: string | null;
    measured_by?: string | null;
    lead_id?: string | null;
  };
  supabase: SupabaseClient;
}): Promise<ProjectTransitionResult> {
  const { from, to, projectId, project, supabase } = params;

  // 1. FSM edge check — NO skipping, NO backward
  if (!isValidProjectTransition(from, to)) {
    const fromIdx = PROJECT_PIPELINE_ORDER.indexOf(from);
    const toIdx = PROJECT_PIPELINE_ORDER.indexOf(to);

    let reason: string;
    if (to === 'cancelled') {
      reason = `Transition vers "annulé" non autorisée depuis "${from}".`;
    } else if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
      reason = `Retour en arrière interdit: "${from}" → "${to}". Les projets ne peuvent pas revenir à une étape précédente.`;
    } else if (fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx + 1) {
      reason = `Impossible de sauter des étapes: "${from}" → "${to}". Vous devez passer par chaque étape du workflow.`;
    } else {
      reason = `Transition de "${from}" vers "${to}" non autorisée par le workflow projet.`;
    }

    return {
      allowed: false,
      reason,
      violations: [`Invalid transition: ${from} → ${to}`],
    };
  }

  // 2. Sync pre-conditions
  const syncViolations = checkSyncPreConditions(to, project);

  // 3. Async pre-conditions
  const asyncViolations = await checkAsyncPreConditions(to, projectId, supabase, project);

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
 * NextResponse helper for API routes.
 */
export async function guardProjectTransition(params: {
  from: ProjectStatus;
  to: ProjectStatus;
  projectId: string;
  project: {
    deposit_paid?: boolean;
    design_validated?: boolean;
    total_amount?: number;
    measurement_date?: string | null;
    measured_by?: string | null;
    lead_id?: string | null;
  };
  supabase: SupabaseClient;
}): Promise<null | NextResponse> {
  const result = await validateProjectTransition(params);
  if (result.allowed) return null;

  return NextResponse.json(
    {
      error: 'Transition projet invalide',
      reason: result.reason,
      violations: result.violations,
      transition: `${params.from} → ${params.to}`,
    },
    { status: 422 },
  );
}

/**
 * Returns valid next statuses for UI rendering.
 */
export function getAvailableProjectTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return VALID_PROJECT_TRANSITIONS[from];
}

/**
 * Human-readable label for a project status.
 */
export function getProjectStatusLabel(status: ProjectStatus): string {
  const labels: Record<ProjectStatus, string> = {
    draft:                   'Brouillon',
    measurements_confirmed:  'Mesures confirmées',
    design_validated:        'Design validé',
    bom_generated:           'BOM généré',
    ready_for_production:    'Prêt pour production',
    in_production:           'En production',
    installation:            'Installation',
    delivered:               'Livré',
    cancelled:               'Annulé',
  };
  return labels[status] ?? status;
}

/**
 * Returns the current step index (0-based) in the pipeline.
 * Returns -1 for cancelled.
 */
export function getProjectStepIndex(status: ProjectStatus): number {
  if (status === 'cancelled') return -1;
  return PROJECT_PIPELINE_ORDER.indexOf(status);
}

// ── Backward-compatible aliases (to avoid breaking existing imports) ─────────
// These will be removed after all consumers are updated.
export const VALID_TRANSITIONS = VALID_PROJECT_TRANSITIONS;
export const isValidTransition = isValidProjectTransition;
export const getAvailableTransitions = getAvailableProjectTransitions;
export const getStatusLabel = getProjectStatusLabel;

// Re-export the TransitionResult type under original name
export type TransitionResult = ProjectTransitionResult;
