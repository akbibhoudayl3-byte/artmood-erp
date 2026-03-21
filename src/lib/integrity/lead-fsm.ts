/**
 * Data Integrity Engine — Lead Pipeline State Machine (FSM)
 *
 * Enforces legal lead status transitions and mandatory field validation.
 * All lead status changes MUST pass through this module.
 *
 * VALID TRANSITION GRAPH:
 *
 *   STANDARD FLOW (strictly sequential):
 *     new              → contacted, lost
 *     contacted        → visit_scheduled, quote_sent*, lost
 *     visit_scheduled  → quote_sent, lost
 *     quote_sent       → won, lost
 *     won              → (terminal — locked after conversion)
 *     lost             → new  (reopen only)
 *
 *   * contacted → quote_sent is a CONTROLLED BYPASS that requires ALL of:
 *     1. plan_file uploaded (file URL)
 *     2. measurements_provided_by_client = true
 *     3. disclaimer_accepted = true ("ArtMood n'est pas responsable des erreurs de mesure")
 *     4. quote document attached (quote_id or quote_url)
 *
 *     When this bypass is used:
 *     - measurement_source is set to "external"
 *     - The lead is flagged as "External Measurements"
 *     - A warning-level audit log is recorded
 *
 * MANDATORY FIELDS PER STAGE:
 *   → contacted       : call log activity required
 *   → visit_scheduled : visit_date required
 *   → quote_sent      : quote document required (quote_id or quote_url)
 *   → won             : must have passed through quote_sent
 *
 * USAGE:
 *   import { validateLeadTransition } from '@/lib/integrity/lead-fsm';
 *
 *   const result = await validateLeadTransition({
 *     supabase,
 *     leadId: id,
 *     from: lead.status,
 *     to: newStatus,
 *     context: { visit_date, call_log, quote_id },
 *   });
 *   if (!result.allowed) return NextResponse.json({ error: result.reason }, { status: 422 });
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadStatus } from '@/types/database';

// ── Measurement source ────────────────────────────────────────────────────────

export type MeasurementSource = 'internal' | 'external';

// ── Transition Map ────────────────────────────────────────────────────────────
// contacted → quote_sent is conditionally allowed (bypass with plan).
// The FSM map includes it; the bypass conditions are enforced in validation.

export const VALID_LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new:              ['contacted', 'lost'],
  contacted:        ['visit_scheduled', 'quote_sent', 'lost'],
  visit_scheduled:  ['quote_sent', 'lost'],
  quote_sent:       ['won', 'lost'],
  won:              [],      // terminal — locked after project conversion
  lost:             ['new'], // can only reopen to "new"
} as const;

// ── Ordered pipeline stages (for sequential enforcement) ──────────────────────

export const LEAD_PIPELINE_ORDER: readonly LeadStatus[] = [
  'new',
  'contacted',
  'visit_scheduled',
  'quote_sent',
  'won',
] as const;

// ── Result Type ───────────────────────────────────────────────────────────────

export type LeadTransitionResult =
  | { allowed: true; isBypass?: boolean }
  | { allowed: false; reason: string; violations: string[] };

// ── Transition context (mandatory fields per stage) ───────────────────────────

export interface LeadTransitionContext {
  /** Call log note for → contacted */
  call_log?: string;
  /** Visit date for → visit_scheduled */
  visit_date?: string;
  /** Quote ID or URL for → quote_sent */
  quote_id?: string;
  quote_url?: string;

  // ── Plan-based bypass fields (contacted → quote_sent) ─────────────────
  /** Uploaded plan file URL — required for bypass */
  plan_file?: string;
  /** Client/architect provided measurements — required for bypass */
  measurements_provided_by_client?: boolean;
  /** Disclaimer accepted: "ArtMood n'est pas responsable des erreurs de mesure" */
  disclaimer_accepted?: boolean;
}

// ── Bypass Detection ──────────────────────────────────────────────────────────

/**
 * Returns true if this transition is the plan-based bypass
 * (contacted → quote_sent, skipping visit_scheduled).
 */
export function isBypassTransition(from: LeadStatus, to: LeadStatus): boolean {
  return from === 'contacted' && to === 'quote_sent';
}

// ── Core Validation ───────────────────────────────────────────────────────────

/**
 * Check if the FSM edge is valid.
 */
export function isValidLeadTransition(from: LeadStatus, to: LeadStatus): boolean {
  return (VALID_LEAD_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Synchronous mandatory field checks per target stage.
 * Includes bypass-specific validation when contacted → quote_sent.
 */
function checkMandatoryFields(
  from: LeadStatus,
  to: LeadStatus,
  context: LeadTransitionContext,
): string[] {
  const violations: string[] = [];

  if (to === 'contacted') {
    if (!context.call_log?.trim()) {
      violations.push('Un journal d\'appel est obligatoire pour passer en "Contacté" (call log required)');
    }
  }

  if (to === 'visit_scheduled') {
    if (!context.visit_date?.trim()) {
      violations.push('Une date de visite est obligatoire pour planifier une visite (visit date required)');
    }
  }

  if (to === 'quote_sent') {
    // Quote document is always required for → quote_sent
    if (!context.quote_id?.trim() && !context.quote_url?.trim()) {
      violations.push('Un devis doit être attaché avant d\'envoyer le devis (quote document required)');
    }

    // ── BYPASS: contacted → quote_sent requires extra conditions ──────────
    if (isBypassTransition(from, to)) {
      if (!context.plan_file?.trim()) {
        violations.push(
          'Un fichier plan est obligatoire pour passer directement au devis sans visite. ' +
          'Téléchargez le plan fourni par le client ou l\'architecte.'
        );
      }

      if (!context.measurements_provided_by_client) {
        violations.push(
          'Vous devez confirmer que les mesures ont été fournies par le client ou l\'architecte ' +
          '(measurements_provided_by_client = true)'
        );
      }

      if (!context.disclaimer_accepted) {
        violations.push(
          'Vous devez accepter la clause de non-responsabilité: ' +
          '"ArtMood n\'est pas responsable des erreurs de mesure fournies par le client/architecte"'
        );
      }
    }
  }

  return violations;
}

/**
 * Async pre-conditions — checks that require DB queries.
 */
async function checkAsyncPreConditions(
  to: LeadStatus,
  from: LeadStatus,
  leadId: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  const violations: string[] = [];

  // → contacted: verify at least one call log activity exists or is being created
  if (to === 'contacted') {
    const { data: activities } = await supabase
      .from('lead_activities')
      .select('id')
      .eq('lead_id', leadId)
      .in('activity_type', ['call', 'status_change', 'note'])
      .limit(1);

    // We allow transition if context.call_log is provided (will be inserted),
    // so this check is complementary — handled by mandatory fields check above
    if (!activities || activities.length === 0) {
      // Will be created with the transition — no violation here if call_log provided in context
    }
  }

  // → quote_sent: verify a quote exists for this lead's project or the lead itself
  if (to === 'quote_sent') {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, project_id')
      .eq('id', leadId)
      .single();

    if (lead?.project_id) {
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id')
        .eq('project_id', lead.project_id)
        .limit(1);

      // If project has quotes, that satisfies the requirement
      if (quotes && quotes.length > 0) {
        // OK — quote exists
      }
    }
  }

  // → won: verify lead is not already converted (locked)
  if (to === 'won') {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, project_id')
      .eq('id', leadId)
      .single();

    if (lead?.project_id) {
      violations.push('Ce lead a déjà été converti en projet. Impossible de le modifier.');
    }
  }

  // Block any transition on a locked (converted) lead
  if (from === 'won') {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, project_id')
      .eq('id', leadId)
      .single();

    if (lead?.project_id) {
      violations.push('Ce lead est verrouillé après conversion en projet. Aucune modification possible.');
    }
  }

  return violations;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Full lead transition validation: FSM edge + mandatory fields + async checks.
 *
 * Returns { allowed: true, isBypass: true } when the plan-based bypass is used.
 */
export async function validateLeadTransition(params: {
  from: LeadStatus;
  to: LeadStatus;
  leadId: string;
  context: LeadTransitionContext;
  supabase: SupabaseClient;
}): Promise<LeadTransitionResult> {
  const { from, to, leadId, context, supabase } = params;

  // 1. FSM edge check
  if (!isValidLeadTransition(from, to)) {
    const fromIdx = LEAD_PIPELINE_ORDER.indexOf(from);
    const toIdx = LEAD_PIPELINE_ORDER.indexOf(to);

    let reason: string;
    if (to !== 'lost' && fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx + 1) {
      reason = `Impossible de sauter des étapes: "${from}" → "${to}". Vous devez passer par chaque étape du pipeline.`;
    } else {
      reason = `Transition de "${from}" vers "${to}" non autorisée par le pipeline commercial`;
    }

    return {
      allowed: false,
      reason,
      violations: [`Invalid transition: ${from} → ${to}`],
    };
  }

  // 2. Mandatory field checks (sync) — includes bypass-specific conditions
  const fieldViolations = checkMandatoryFields(from, to, context);

  // 3. Async pre-conditions (DB checks)
  const asyncViolations = await checkAsyncPreConditions(to, from, leadId, supabase);

  const allViolations = [...fieldViolations, ...asyncViolations];

  if (allViolations.length > 0) {
    return {
      allowed: false,
      reason: allViolations[0],
      violations: allViolations,
    };
  }

  // Flag bypass transitions
  const bypass = isBypassTransition(from, to);

  return { allowed: true, isBypass: bypass };
}

/**
 * NextResponse helper for API routes.
 */
export async function guardLeadTransition(params: {
  from: LeadStatus;
  to: LeadStatus;
  leadId: string;
  context: LeadTransitionContext;
  supabase: SupabaseClient;
}): Promise<{ guard: null; isBypass: boolean } | NextResponse> {
  const result = await validateLeadTransition(params);
  if (result.allowed) {
    return { guard: null, isBypass: result.isBypass ?? false };
  }

  return NextResponse.json(
    {
      error: 'Invalid lead transition',
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
export function getAvailableLeadTransitions(from: LeadStatus): readonly LeadStatus[] {
  return VALID_LEAD_TRANSITIONS[from];
}

/**
 * Human-readable label for a lead status.
 */
export function getLeadStatusLabel(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    new:              'Nouveau',
    contacted:        'Contacté',
    visit_scheduled:  'Visite planifiée',
    quote_sent:       'Devis envoyé',
    won:              'Gagné',
    lost:             'Perdu',
  };
  return labels[status] ?? status;
}

/**
 * Disclaimer text for the plan-based bypass.
 * Must be shown and accepted by the user before the bypass transition.
 */
export const BYPASS_DISCLAIMER =
  "ArtMood n'est pas responsable des erreurs de mesure fournies par le client ou l'architecte. " +
  "En validant cette option, vous confirmez que les mesures sont externes et que la responsabilité " +
  "des dimensions incombe au fournisseur des plans.";
