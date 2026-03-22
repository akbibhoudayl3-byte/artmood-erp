/**
 * Project Service — Domain logic for project detail updates & status transitions.
 *
 * Extracts inline Supabase write queries from src/app/(app)/projects/[id]/page.tsx
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { ProjectStatus } from '@/types/crm';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[project-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface UpdateProjectData {
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  client_address?: string | null;
  client_city?: string | null;
  total_amount?: number;
  priority?: string;
  notes?: string | null;
}

export interface ProductionValidationError {
  code: string;
  message: string;
}

export interface ProductionReadinessResult {
  ready: boolean;
  errors: ProductionValidationError[];
  /** Stock items at zero that may block production */
  criticalStockItems: string[];
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Update a project's client details, amount, priority, and notes.
 */
export async function updateProject(
  projectId: string,
  data: UpdateProjectData,
): Promise<ServiceResult> {
  if (!projectId) return fail('Project ID is required.');
  if (!data.client_name?.trim()) return fail('Client name is required.');

  const { error } = await supabase()
    .from('projects')
    .update({
      client_name: data.client_name.trim(),
      client_phone: data.client_phone || null,
      client_email: data.client_email || null,
      client_address: data.client_address || null,
      client_city: data.client_city || null,
      total_amount: data.total_amount ?? 0,
      priority: data.priority || 'normal',
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (error) return fail('Failed to update project: ' + error.message);
  return ok();
}

/**
 * Check whether a project is ready for production.
 * Returns a structured result with all validation errors and critical stock items.
 * Does NOT block — caller decides whether to proceed (CEO override) or abort.
 */
export async function checkProductionReadiness(
  projectId: string,
): Promise<ServiceResult<ProductionReadinessResult>> {
  if (!projectId) return fail('Project ID is required.');

  const { data: project, error: projErr } = await supabase()
    .from('projects')
    .select('deposit_paid, design_validated, total_amount')
    .eq('id', projectId)
    .single();

  if (projErr || !project) return fail('Failed to load project for validation.');

  const errors: ProductionValidationError[] = [];

  if (!project.deposit_paid) {
    errors.push({ code: 'deposit_not_paid', message: '50% deposit not paid' });
  }
  if (!project.design_validated) {
    errors.push({ code: 'design_not_validated', message: 'Design not validated' });
  }
  if (project.total_amount === 0) {
    errors.push({ code: 'no_quote_amount', message: 'No quote amount set' });
  }

  // Check critical stock items
  const { data: criticalStock } = await supabase()
    .from('stock_items')
    .select('name')
    .lte('current_quantity', 0)
    .eq('is_active', true)
    .limit(5);

  const criticalStockItems = (criticalStock || []).map(s => s.name);
  if (criticalStockItems.length > 0) {
    errors.push({
      code: 'stock_critical',
      message: `${criticalStockItems.length} stock items at zero: ${criticalStockItems.join(', ')}`,
    });
  }

  return ok({
    ready: errors.length === 0,
    errors,
    criticalStockItems,
  });
}

/**
 * Update a project's status with automatic timestamp management and event logging.
 * Does NOT perform production readiness validation — caller should use
 * `checkProductionReadiness()` first and handle the CEO override flow.
 */
export async function updateProjectStatus(
  projectId: string,
  newStatus: ProjectStatus,
  userId?: string,
): Promise<ServiceResult> {
  if (!projectId) return fail('Project ID is required.');

  const updates: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  // Automatic timestamps
  if (newStatus === 'production') updates.production_started_at = new Date().toISOString();
  if (newStatus === 'delivered') updates.actual_delivery_date = new Date().toISOString();

  const { error } = await supabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) return fail('Failed to update project status: ' + error.message);

  // Log event (non-fatal)
  try {
    await supabase().from('project_events').insert({
      project_id: projectId,
      event_type: 'status_change',
      description: `Status changed to ${newStatus}`,
      new_value: newStatus,
      user_id: userId || null,
    });
  } catch { /* non-fatal */ }

  return ok();
}
