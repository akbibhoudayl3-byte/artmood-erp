/**
 * SAV Service — After-Sales Service domain logic.
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type {
  SavTicket, SavIntervention, SavPhoto,
  SavTicketStatus, SavPriority, SavWarrantyStatus,
  SavDashboardStats,
} from '@/types/sav';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[sav-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Ticket Queries ─────────────────────────────────────────────────────────

export interface TicketFilters {
  status?: SavTicketStatus;
  priority?: SavPriority;
  assignedTo?: string;
  search?: string;
}

export async function listTickets(filters?: TicketFilters): Promise<ServiceResult<SavTicket[]>> {
  let query = supabase()
    .from('sav_tickets')
    .select(`
      *,
      project:projects(id, reference_code, client_name, client_phone, client_address, actual_delivery_date, status),
      assigned_profile:profiles!sav_tickets_assigned_to_fkey(id, full_name)
    `)
    .order('priority', { ascending: true })  // urgent first (alphabetically: low > normal > urgent, so asc works inverted — we fix below)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo);
  }
  if (filters?.search) {
    // Search by ticket number or client name via project
    query = query.or(`ticket_number.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) return fail('Failed to load tickets: ' + error.message);

  // Sort urgent first (priority sort: urgent > normal > low)
  const priorityOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
  const sorted = (data || []).sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return ok(sorted as SavTicket[]);
}

export async function getTicket(id: string): Promise<ServiceResult<SavTicket>> {
  const { data, error } = await supabase()
    .from('sav_tickets')
    .select(`
      *,
      project:projects(id, reference_code, client_name, client_phone, client_email, client_address, actual_delivery_date, status),
      assigned_profile:profiles!sav_tickets_assigned_to_fkey(id, full_name),
      created_profile:profiles!sav_tickets_created_by_fkey(id, full_name),
      sav_photos(*),
      sav_interventions(
        *,
        technician:profiles!sav_interventions_technician_id_fkey(id, full_name)
      )
    `)
    .eq('id', id)
    .single();

  if (error) return fail('Ticket not found: ' + error.message);
  return ok(data as SavTicket);
}

// ── Warranty Check ─────────────────────────────────────────────────────────

export async function checkWarranty(projectId: string): Promise<{ status: SavWarrantyStatus; expiry_date: string | null }> {
  const { data: project } = await supabase()
    .from('projects')
    .select('actual_delivery_date')
    .eq('id', projectId)
    .single();

  if (!project?.actual_delivery_date) {
    return { status: 'unknown', expiry_date: null };
  }

  const delivery = new Date(project.actual_delivery_date);
  const expiry = new Date(delivery);
  expiry.setMonth(expiry.getMonth() + 12);

  const now = new Date();
  return {
    status: now <= expiry ? 'under_warranty' : 'expired',
    expiry_date: expiry.toISOString().split('T')[0],
  };
}

// ── Ticket Mutations ───────────────────────────────────────────────────────

export interface CreateTicketPayload {
  project_id: string;
  issue_type: string;
  issue_description: string;
  priority?: SavPriority;
  assigned_to?: string | null;
  created_by: string;
}

export async function createTicket(payload: CreateTicketPayload): Promise<ServiceResult<{ id: string }>> {
  if (!payload.project_id) return fail('Project is required.');
  if (!payload.issue_type) return fail('Issue type is required.');
  if (!payload.issue_description?.trim()) return fail('Description is required.');

  // Auto warranty check
  const warranty = await checkWarranty(payload.project_id);

  const { data, error } = await supabase()
    .from('sav_tickets')
    .insert({
      project_id: payload.project_id,
      issue_type: payload.issue_type,
      issue_description: payload.issue_description.trim(),
      priority: payload.priority || 'normal',
      assigned_to: payload.assigned_to || null,
      warranty_status: warranty.status,
      warranty_expiry_date: warranty.expiry_date,
      created_by: payload.created_by,
    })
    .select('id')
    .single();

  if (error) return fail('Failed to create ticket: ' + error.message);
  return ok({ id: data.id });
}

export interface UpdateTicketPayload {
  status?: SavTicketStatus;
  priority?: SavPriority;
  assigned_to?: string | null;
  resolution_report?: string;
  issue_description?: string;
}

export async function updateTicket(id: string, payload: UpdateTicketPayload): Promise<ServiceResult<void>> {
  const update: Record<string, unknown> = {};

  if (payload.status) {
    update.status = payload.status;
    if (payload.status === 'resolved') update.resolved_at = new Date().toISOString();
    if (payload.status === 'closed') update.closed_at = new Date().toISOString();
  }
  if (payload.priority) update.priority = payload.priority;
  if (payload.assigned_to !== undefined) update.assigned_to = payload.assigned_to || null;
  if (payload.resolution_report !== undefined) update.resolution_report = payload.resolution_report;
  if (payload.issue_description !== undefined) update.issue_description = payload.issue_description.trim();

  const { error } = await supabase()
    .from('sav_tickets')
    .update(update)
    .eq('id', id);

  if (error) return fail('Failed to update ticket: ' + error.message);
  return ok();
}

export async function submitResolution(ticketId: string, report: string): Promise<ServiceResult<void>> {
  if (!report?.trim()) return fail('Resolution report is required.');

  const { error } = await supabase()
    .from('sav_tickets')
    .update({
      resolution_report: report.trim(),
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', ticketId);

  if (error) return fail('Failed to submit resolution: ' + error.message);
  return ok();
}

// ── Intervention Mutations ─────────────────────────────────────────────────

export interface CreateInterventionPayload {
  ticket_id: string;
  technician_id?: string | null;
  planned_date: string;
  planned_time?: string | null;
  notes?: string;
}

export async function createIntervention(payload: CreateInterventionPayload): Promise<ServiceResult<{ id: string }>> {
  if (!payload.ticket_id) return fail('Ticket ID is required.');
  if (!payload.planned_date) return fail('Planned date is required.');

  const { data, error } = await supabase()
    .from('sav_interventions')
    .insert({
      ticket_id: payload.ticket_id,
      technician_id: payload.technician_id || null,
      planned_date: payload.planned_date,
      planned_time: payload.planned_time || null,
      notes: payload.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error) return fail('Failed to create intervention: ' + error.message);

  // Update ticket status to 'planned' if currently 'open'
  await supabase()
    .from('sav_tickets')
    .update({ status: 'planned', assigned_to: payload.technician_id || undefined })
    .eq('id', payload.ticket_id)
    .eq('status', 'open');

  return ok({ id: data.id });
}

export interface UpdateInterventionPayload {
  status?: string;
  work_description?: string;
  parts_used?: string;
  notes?: string;
  travel_cost?: number;
  parts_cost?: number;
  labor_cost?: number;
  actual_start?: string;
  actual_end?: string;
}

export async function updateIntervention(id: string, ticketId: string, payload: UpdateInterventionPayload): Promise<ServiceResult<void>> {
  const update: Record<string, unknown> = {};

  if (payload.status) update.status = payload.status;
  if (payload.work_description !== undefined) update.work_description = payload.work_description;
  if (payload.parts_used !== undefined) update.parts_used = payload.parts_used;
  if (payload.notes !== undefined) update.notes = payload.notes;
  if (payload.travel_cost !== undefined) update.travel_cost = payload.travel_cost;
  if (payload.parts_cost !== undefined) update.parts_cost = payload.parts_cost;
  if (payload.labor_cost !== undefined) update.labor_cost = payload.labor_cost;
  if (payload.actual_start) update.actual_start = payload.actual_start;
  if (payload.actual_end) update.actual_end = payload.actual_end;

  const { error } = await supabase()
    .from('sav_interventions')
    .update(update)
    .eq('id', id);

  if (error) return fail('Failed to update intervention: ' + error.message);

  // Sync ticket status
  if (payload.status === 'in_progress') {
    await supabase().from('sav_tickets').update({ status: 'in_progress' }).eq('id', ticketId);
  }

  return ok();
}

// ── Photos ─────────────────────────────────────────────────────────────────

export async function addPhoto(
  ticketId: string,
  photoUrl: string,
  photoType: string,
  uploadedBy: string,
  caption?: string,
  interventionId?: string,
): Promise<ServiceResult<{ id: string }>> {
  const { data, error } = await supabase()
    .from('sav_photos')
    .insert({
      ticket_id: ticketId,
      intervention_id: interventionId || null,
      photo_url: photoUrl,
      photo_type: photoType,
      caption: caption || null,
      uploaded_by: uploadedBy,
    })
    .select('id')
    .single();

  if (error) return fail('Failed to add photo: ' + error.message);
  return ok({ id: data.id });
}

// ── Dashboard Stats ────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<ServiceResult<SavDashboardStats>> {
  const { data, error } = await supabase()
    .from('v_sav_dashboard')
    .select('*')
    .single();

  if (error) return fail('Failed to load dashboard stats: ' + error.message);
  return ok(data as SavDashboardStats);
}

// ── Helpers for dropdowns ──────────────────────────────────────────────────

export async function getInstallers(): Promise<ServiceResult<{ id: string; full_name: string }[]>> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('id, full_name')
    .in('role', ['installer', 'workshop_worker', 'workshop_manager'])
    .eq('is_active', true)
    .order('full_name');

  if (error) return fail('Failed to load installers: ' + error.message);
  return ok(data || []);
}
