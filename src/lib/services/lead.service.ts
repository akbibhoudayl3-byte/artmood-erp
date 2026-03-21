/**
 * Lead Service — Domain logic for lead CRUD and status management.
 *
 * Extracts Supabase queries from:
 *   - src/app/(app)/leads/page.tsx (list)
 *   - src/app/(app)/leads/new/page.tsx (create)
 *   - src/app/(app)/leads/[id]/page.tsx (detail, edit, status change)
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { Lead, LeadStatus } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[lead-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export type LeadWithProfile = Lead & {
  assigned_profile?: { full_name: string } | null;
};

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Load all leads with assigned user profile joined.
 * Community managers only see leads they created.
 */
export async function loadLeads(params?: {
  role?: string;
  userId?: string;
}): Promise<ServiceResult<LeadWithProfile[]>> {
  let query = supabase()
    .from('leads')
    .select(
      '*, assigned_profile:profiles!leads_assigned_to_fkey(full_name)',
    )
    .order('created_at', { ascending: false });

  // Community managers only see their own leads
  if (params?.role === 'community_manager' && params?.userId) {
    query = query.eq('created_by', params.userId);
  }

  const { data, error } = await query;

  if (error) return fail('Failed to load leads: ' + error.message);
  return ok((data as LeadWithProfile[]) || []);
}

/**
 * Create a new lead.
 */
export async function createLead(
  data: Record<string, unknown>,
): Promise<ServiceResult<{ id: string }>> {
  const fullName = data.full_name as string | undefined;
  const phone = data.phone as string | undefined;
  if (!fullName?.trim()) return fail('Full name is required.');
  if (!phone?.trim()) return fail('Phone is required.');

  const { data: lead, error } = await supabase()
    .from('leads')
    .insert({
      full_name: fullName.trim(),
      phone: phone.trim(),
      city: (data.city as string) || null,
      source: (data.source as string) || null,
      notes: (data.notes as string) || null,
      status: 'new',
      assigned_to: (data.assigned_to as string) || null,
      created_by: (data.created_by as string) || null,
    })
    .select('id')
    .single();

  if (error) return fail('Failed to create lead: ' + error.message);
  return ok({ id: lead.id });
}

/**
 * Update lead information (name, phone, city, email, notes).
 */
export async function updateLead(
  id: string,
  data: Record<string, unknown>,
): Promise<ServiceResult> {
  if (!id) return fail('Lead ID is required.');

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.full_name !== undefined) payload.full_name = (data.full_name as string)?.trim();
  if (data.phone !== undefined) payload.phone = (data.phone as string)?.trim();
  if (data.city !== undefined) payload.city = (data.city as string) || null;
  if (data.email !== undefined) payload.email = (data.email as string) || null;
  if (data.notes !== undefined) payload.notes = (data.notes as string) || null;
  if (data.next_follow_up !== undefined) payload.next_follow_up = data.next_follow_up;

  const { error } = await supabase()
    .from('leads')
    .update(payload)
    .eq('id', id);

  if (error) return fail('Failed to update lead: ' + error.message);
  return ok();
}

/**
 * Change lead status and log the status change as an activity.
 *
 * IMPORTANT: This function enforces the Lead FSM.
 * Status changes must pass through the pipeline validation.
 * Use the /api/leads/[id]/transition endpoint for full validation with mandatory fields.
 *
 * @deprecated Prefer using the /api/leads/[id]/transition API route which provides
 * full FSM validation with mandatory field checks.
 */
export async function updateLeadStatus(
  id: string,
  status: string,
  userId?: string,
  context?: { call_log?: string; visit_date?: string; quote_id?: string; quote_url?: string },
): Promise<ServiceResult> {
  if (!id) return fail('Lead ID is required.');
  if (!status) return fail('Status is required.');

  // Fetch current lead to validate FSM transition
  const { data: lead, error: leadErr } = await supabase()
    .from('leads')
    .select('id, status, project_id')
    .eq('id', id)
    .single();

  if (leadErr || !lead) return fail('Lead not found.');

  // Block changes to locked leads (converted to project)
  if (lead.project_id && lead.status === 'won') {
    return fail('Ce lead est verrouillé après conversion en projet. Aucune modification possible.');
  }

  // Validate FSM transition (basic check — full validation via API route)
  const { isValidLeadTransition } = await import('@/lib/integrity/lead-fsm');
  if (!isValidLeadTransition(lead.status as LeadStatus, status as LeadStatus)) {
    return fail(`Transition de "${lead.status}" vers "${status}" non autorisée par le pipeline commercial.`);
  }

  const { error } = await supabase()
    .from('leads')
    .update({
      status: status as LeadStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return fail('Failed to update lead status: ' + error.message);

  // Log activity (non-fatal)
  try {
    await supabase().from('lead_activities').insert({
      lead_id: id,
      user_id: userId || null,
      activity_type: 'status_change',
      description: `Status changed to ${status}`,
    });
  } catch {
    /* ignore */
  }

  return ok();
}
