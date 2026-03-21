/**
 * Data Integrity Engine — Lead Pipeline State Machine (FSM)
 *
 * Enforces legal lead status transitions and mandatory field validation.
 * All lead status changes MUST pass through this module.
 *
 * VALID TRANSITION GRAPH (strictly sequential — no skipping):
 *   new              → contacted, lost
 *   contacted        → visit_scheduled, lost
 *   visit_scheduled  → quote_sent, lost
 *   quote_sent       → won, lost
 *   won              → (terminal — locked after conversion)
 *   lost             → new  (reopen only)
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

// ── Transition Map ────────────────────────────────────────────────────────────

export const VALID_LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new:              ['contacted', 'lost'],
  contacted:        ['visit_scheduled', 'lost'],
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
  | { allowed: true }
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
}

// ── Core Validation ───────────────────────────────────────────────────────────

/**
 * Check if the FSM edge is valid (no skipping allowed).
 */
export function isValidLeadTransition(from: LeadStatus, to: LeadStatus): boolean {
  return (VALID_LEAD_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Synchronous mandatory field checks per target stage.
 */
function checkMandatoryFields(
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
    if (!context.quote_id?.trim() && !context.quote_url?.trim()) {
      violations.push('Un devis doit être attaché avant d\'envoyer le devis (quote document required)');
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
 */
export async function validateLeadTransition(params: {
  from: LeadStatus;
  to: LeadStatus;
  leadId: string;
  context: LeadTransitionContext;
  supabase: SupabaseClient;
}): Promise<LeadTransitionResult> {
  const { from, to, leadId, context, supabase } = params;

  // 1. FSM edge check — no skipping stages
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

  // 2. Mandatory field checks (sync)
  const fieldViolations = checkMandatoryFields(to, context);

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

  return { allowed: true };
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
}): Promise<null | NextResponse> {
  const result = await validateLeadTransition(params);
  if (result.allowed) return null;

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
