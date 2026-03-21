/**
 * Data Integrity Engine — Lead Status Transition Endpoint
 *
 * POST /api/leads/[id]/transition
 *
 * Validates and applies a lead status transition through the Lead FSM.
 * All mandatory fields and pre-conditions must pass before the status is updated.
 *
 * PIPELINE: new → contacted → visit_scheduled → quote_sent → won → (locked)
 *           any → lost (except won with project)
 *           lost → new (reopen)
 *
 * Request body:
 *   {
 *     status: LeadStatus,
 *     call_log?: string,        // required for → contacted
 *     visit_date?: string,      // required for → visit_scheduled
 *     quote_id?: string,        // required for → quote_sent
 *     quote_url?: string,       // alternative for → quote_sent
 *     lost_reason?: string,     // recommended for → lost
 *   }
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID, sanitizeString } from '@/lib/auth/server';
import { guardLeadTransition } from '@/lib/integrity/lead-fsm';
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
  const fsm = await guardLeadTransition({
    from: fromStatus,
    to: toStatus,
    leadId,
    context: {
      call_log: sanitizeString(body.call_log ?? '', 2000) || undefined,
      visit_date: body.visit_date || undefined,
      quote_id: body.quote_id || undefined,
      quote_url: body.quote_url || undefined,
    },
    supabase: ctx.supabase,
  });
  if (fsm !== null) return fsm; // returns 422 NextResponse with violation list

  // ── Apply the transition ──────────────────────────────────────────────
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

  const { data: updated, error: updateErr } = await ctx.supabase
    .from('leads')
    .update(updatePayload)
    .eq('id', leadId)
    .select('id, status, full_name')
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: 'Transition failed', message: updateErr?.message ?? 'Database error' },
      { status: 500 },
    );
  }

  // ── Log activity ────────────────────────────────────────────────────────
  const activityDescription = toStatus === 'contacted' && body.call_log
    ? `Status → ${toStatus}. Call log: ${body.call_log.substring(0, 200)}`
    : toStatus === 'visit_scheduled' && body.visit_date
      ? `Status → ${toStatus}. Visit date: ${body.visit_date}`
      : toStatus === 'lost' && body.lost_reason
        ? `Status → ${toStatus}. Reason: ${body.lost_reason}`
        : `Status → ${toStatus}`;

  // Insert call log as activity if provided
  if (toStatus === 'contacted' && body.call_log) {
    await ctx.supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: ctx.userId,
      activity_type: 'call',
      description: body.call_log,
    });
  }

  // Log status change activity
  await ctx.supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: ctx.userId,
    activity_type: 'status_change',
    description: activityDescription,
  });

  // ── Audit log ─────────────────────────────────────────────────────────
  await ctx.audit({
    action: 'status_change',
    entity_type: 'lead',
    entity_id: leadId,
    old_value: { status: fromStatus },
    new_value: { status: toStatus },
    notes: `Lead pipeline transition: ${fromStatus} → ${toStatus}${body.call_log ? `. Call log: ${body.call_log.substring(0, 100)}` : ''}`,
  });

  return NextResponse.json({
    ok: true,
    lead: updated,
    from: fromStatus,
    to: toStatus,
    message: `Lead "${lead.full_name}" transitioned from "${fromStatus}" to "${toStatus}"`,
  });
}
