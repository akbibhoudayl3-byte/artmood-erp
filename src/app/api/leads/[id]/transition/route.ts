/**
 * Data Integrity Engine — Lead Status Transition Endpoint
 *
 * POST /api/leads/[id]/transition
 *
 * Validates and applies a lead status transition through the Lead FSM.
 * All mandatory fields and pre-conditions must pass before the status is updated.
 *
 * PIPELINE:
 *   Standard: new → contacted → visit_scheduled → quote_sent → won → (locked)
 *   Bypass:   contacted → quote_sent (with plan file + disclaimer + measurements flag)
 *   Any:      any → lost (except won with project)
 *   Reopen:   lost → new
 *
 * Request body:
 *   {
 *     status: LeadStatus,
 *     call_log?: string,                        // required for → contacted
 *     visit_date?: string,                      // required for → visit_scheduled
 *     quote_id?: string,                        // required for → quote_sent
 *     quote_url?: string,                       // alternative for → quote_sent
 *     lost_reason?: string,                     // recommended for → lost
 *     // Plan-based bypass fields (contacted → quote_sent only):
 *     plan_file?: string,                       // uploaded plan file URL
 *     measurements_provided_by_client?: boolean, // client/architect provided measurements
 *     disclaimer_accepted?: boolean,            // disclaimer confirmed
 *   }
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';
import { guardLeadTransition, isBypassTransition, BYPASS_DISCLAIMER } from '@/lib/integrity/lead-fsm';
import type { LeadStatus } from '@/types/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await guard(['ceo', 'commercial_manager', 'community_manager', 'operations_manager', 'owner_admin']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: leadId } = await params;

  if (!isValidUUID(leadId)) {
    return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
  }

  let body: {
    status?: string;
    call_log?: string;
    visit_date?: string;
    quote_id?: string;
    quote_url?: string;
    lost_reason?: string;
    plan_file?: string;
    measurements_provided_by_client?: boolean;
    disclaimer_accepted?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const toStatus = body?.status as LeadStatus | undefined;
  if (!toStatus) {
    return NextResponse.json(
      { error: 'Missing status', message: '"status" field is required' },
      { status: 400 },
    );
  }

  // ── Fetch current lead ──────────────────────────────────────────────────
  const { data: lead, error: fetchErr } = await ctx.supabase
    .from('leads')
    .select('id, status, full_name, project_id')
    .eq('id', leadId)
    .single();

  if (fetchErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const fromStatus = lead.status as LeadStatus;

  // Same status — no-op
  if (fromStatus === toStatus) {
    return NextResponse.json(
      { error: 'No change', message: `Lead is already in "${toStatus}" status` },
      { status: 409 },
    );
  }

  // ── Lead FSM Validation ─────────────────────────────────────────────────
  const fsmResult = await guardLeadTransition({
    from: fromStatus,
    to: toStatus,
    leadId,
    context: {
      call_log: sanitizeString(body.call_log ?? '', 2000) || undefined,
      visit_date: body.visit_date || undefined,
      quote_id: body.quote_id || undefined,
      quote_url: body.quote_url || undefined,
      plan_file: sanitizeString(body.plan_file ?? '', 2000) || undefined,
      measurements_provided_by_client: body.measurements_provided_by_client ?? false,
      disclaimer_accepted: body.disclaimer_accepted ?? false,
    },
    supabase: ctx.supabase,
  });

  // If NextResponse, it's an error — return it
  if (fsmResult instanceof NextResponse) return fsmResult;

  const { isBypass } = fsmResult;

  // ── Build update payload ──────────────────────────────────────────────
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
    updated_at: new Date().toISOString(),
  };

  // Set visit date if transitioning to visit_scheduled
  if (toStatus === 'visit_scheduled' && body.visit_date) {
    updatePayload.next_follow_up = body.visit_date;
  }

  // Set lost reason if transitioning to lost
  if (toStatus === 'lost' && body.lost_reason) {
    updatePayload.lost_reason = sanitizeString(body.lost_reason, 500);
  }

  // ── BYPASS: Set external measurement fields ─────────────────────────────
  if (isBypass) {
    updatePayload.measurement_source = 'external';
    updatePayload.plan_file_url = sanitizeString(body.plan_file ?? '', 2000);
    updatePayload.measurements_provided_by_client = true;
    updatePayload.disclaimer_accepted = true;
  }

  const { data: updated, error: updateErr } = await ctx.supabase
    .from('leads')
    .update(updatePayload)
    .eq('id', leadId)
    .select('id, status, full_name, measurement_source')
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: 'Transition failed', message: updateErr?.message ?? 'Database error' },
      { status: 500 },
    );
  }

  // ── Log activities ────────────────────────────────────────────────────

  // Insert call log as activity if provided
  if (toStatus === 'contacted' && body.call_log) {
    await ctx.supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: ctx.userId,
      activity_type: 'call',
      description: body.call_log,
    });
  }

  // Build activity description
  let activityDescription: string;
  if (isBypass) {
    activityDescription =
      `⚠️ BYPASS: Status → ${toStatus} (visite sautée — mesures externes). ` +
      `Plan: ${body.plan_file ? 'fichier fourni' : 'N/A'}. ` +
      `Clause acceptée: "${BYPASS_DISCLAIMER.substring(0, 80)}..."`;
  } else if (toStatus === 'contacted' && body.call_log) {
    activityDescription = `Status → ${toStatus}. Call log: ${body.call_log.substring(0, 200)}`;
  } else if (toStatus === 'visit_scheduled' && body.visit_date) {
    activityDescription = `Status → ${toStatus}. Visit date: ${body.visit_date}`;
  } else if (toStatus === 'lost' && body.lost_reason) {
    activityDescription = `Status → ${toStatus}. Reason: ${body.lost_reason}`;
  } else {
    activityDescription = `Status → ${toStatus}`;
  }

  // Log status change activity
  await ctx.supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: ctx.userId,
    activity_type: isBypass ? 'bypass_transition' : 'status_change',
    description: activityDescription,
  });

  // ── Audit log ─────────────────────────────────────────────────────────
  await ctx.audit({
    action: isBypass ? 'lead_transition' : 'status_change',
    entity_type: 'lead',
    entity_id: leadId,
    old_value: { status: fromStatus },
    new_value: {
      status: toStatus,
      ...(isBypass ? {
        measurement_source: 'external',
        bypass: true,
        plan_file: body.plan_file,
        disclaimer_accepted: true,
      } : {}),
    },
    notes: isBypass
      ? `⚠️ BYPASS: Lead pipeline ${fromStatus} → ${toStatus} (visit skipped — external measurements). Plan file provided. Disclaimer accepted.`
      : `Lead pipeline transition: ${fromStatus} → ${toStatus}${body.call_log ? `. Call log: ${body.call_log.substring(0, 100)}` : ''}`,
  });

  return NextResponse.json({
    ok: true,
    lead: updated,
    from: fromStatus,
    to: toStatus,
    bypass: isBypass,
    measurement_source: isBypass ? 'external' : undefined,
    message: isBypass
      ? `Lead "${lead.full_name}" → "${toStatus}" via bypass (mesures externes). ⚠️ ArtMood non responsable des erreurs de mesure.`
      : `Lead "${lead.full_name}" transitioned from "${fromStatus}" to "${toStatus}"`,
  });
}
