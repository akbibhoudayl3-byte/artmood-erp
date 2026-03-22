/**
 * Payment Service — Domain logic for payment CRUD and project sync.
 *
 * Extracts Supabase queries from src/app/(app)/finance/payments/page.tsx
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { PaymentType, PaymentMethod } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[payment-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaymentWithProject {
  id: string;
  project_id: string;
  amount: number;
  payment_type: PaymentType;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  received_at: string;
  created_at: string;
  project?: { client_name: string; reference_code: string } | null;
}

export interface CreatePaymentData {
  project_id: string;
  amount: number;
  payment_type: PaymentType;
  payment_method: PaymentMethod;
  received_at: string;
  reference_number?: string;
  notes?: string;
  received_by?: string;
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Load all payments with project join, ordered by most recent.
 */
export async function loadPayments(): Promise<ServiceResult<PaymentWithProject[]>> {
  const { data, error } = await supabase()
    .from('payments')
    .select('*, project:projects(client_name, reference_code)')
    .order('received_at', { ascending: false })
    .limit(100);

  if (error) return fail('Failed to load payments: ' + error.message);
  return ok((data as PaymentWithProject[]) || []);
}

/**
 * Load active projects for the payment form dropdown.
 */
export async function loadActiveProjects(): Promise<
  ServiceResult<{ id: string; client_name: string; reference_code: string }[]>
> {
  const { data, error } = await supabase()
    .from('projects')
    .select('id, client_name, reference_code')
    .in('status', [
      'measurements_confirmed',
      'design_validated',
      'bom_generated',
      'ready_for_production',
      'in_production',
      'installation',
    ])
    .order('created_at', { ascending: false });

  if (error) return fail('Failed to load projects: ' + error.message);
  return ok(data || []);
}

/**
 * Create a new payment and sync the project's paid_amount.
 */
export async function createPayment(
  data: CreatePaymentData,
): Promise<ServiceResult<{ id: string }>> {
  if (!data.project_id) return fail('Please select a project.');
  if (!data.amount || data.amount <= 0)
    return fail('Amount must be greater than zero.');
  if (!data.received_at) return fail('Payment date is required.');

  const { data: payment, error: insertErr } = await supabase()
    .from('payments')
    .insert({
      project_id: data.project_id,
      amount: data.amount,
      payment_type: data.payment_type,
      payment_method: data.payment_method,
      received_at: new Date(data.received_at).toISOString(),
      reference_number: data.reference_number || null,
      notes: data.notes || null,
      received_by: data.received_by || null,
    })
    .select('id')
    .single();

  if (insertErr) return fail('Failed to record payment: ' + insertErr.message);

  // Sync project paid_amount
  await syncProjectPaidAmountAdd(data.project_id, data.amount);

  return ok({ id: payment.id });
}

/**
 * Update an existing payment. Handles project paid_amount adjustments
 * when the amount or project changes.
 */
export async function updatePayment(
  id: string,
  data: Record<string, unknown>,
): Promise<ServiceResult> {
  if (!id) return fail('Payment ID is required.');

  const { error } = await supabase()
    .from('payments')
    .update({
      project_id: data.project_id,
      amount: data.amount,
      payment_type: data.payment_type,
      payment_method: data.payment_method,
      received_at: data.received_at
        ? new Date(data.received_at as string).toISOString()
        : undefined,
      reference_number: (data.reference_number as string) || null,
      notes: (data.notes as string) || null,
    })
    .eq('id', id);

  if (error) return fail('Failed to update: ' + error.message);
  return ok();
}

/**
 * Delete a payment and subtract its amount from the project's paid_amount.
 */
export async function deletePayment(
  id: string,
  projectId: string,
  amount: number,
): Promise<ServiceResult> {
  if (!id) return fail('Payment ID is required.');

  const { error } = await supabase()
    .from('payments')
    .delete()
    .eq('id', id);

  if (error) return fail('Failed to delete: ' + error.message);

  // Subtract from project paid_amount
  await syncProjectPaidAmountSubtract(projectId, amount);

  return ok();
}

/**
 * Recalculate and sync a project's paid_amount from the sum of its payments.
 * Useful after edits that change amount or project assignment.
 */
export async function syncProjectPaidAmount(
  projectId: string,
): Promise<ServiceResult> {
  if (!projectId) return fail('Project ID is required.');

  // Sum all payments for this project
  const { data: payments, error: paymentsErr } = await supabase()
    .from('payments')
    .select('amount')
    .eq('project_id', projectId);

  if (paymentsErr) return fail('Failed to load payments for sync: ' + paymentsErr.message);

  const totalPaid = (payments || []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );

  const { data: project } = await supabase()
    .from('projects')
    .select('total_amount')
    .eq('id', projectId)
    .single();

  const totalAmount = project?.total_amount || 0;
  const pct = totalAmount > 0 ? totalPaid / totalAmount : 0;

  const { error } = await supabase()
    .from('projects')
    .update({
      paid_amount: totalPaid,
      deposit_paid: pct >= 0.5,
      pre_install_paid: pct >= 0.9,
      final_paid: pct >= 1.0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (error) return fail('Failed to sync project paid_amount: ' + error.message);
  return ok();
}

// ── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Add an amount to a project's paid_amount and recalculate payment flags.
 */
async function syncProjectPaidAmountAdd(
  projectId: string,
  amount: number,
): Promise<void> {
  const { data: project } = await supabase()
    .from('projects')
    .select('paid_amount, total_amount')
    .eq('id', projectId)
    .single();

  if (!project) return;

  const newPaid = (project.paid_amount || 0) + amount;
  const pct = project.total_amount > 0 ? newPaid / project.total_amount : 0;

  await supabase()
    .from('projects')
    .update({
      paid_amount: newPaid,
      deposit_paid: pct >= 0.5,
      pre_install_paid: pct >= 0.9,
      final_paid: pct >= 1.0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
}

/**
 * Subtract an amount from a project's paid_amount and recalculate payment flags.
 */
async function syncProjectPaidAmountSubtract(
  projectId: string,
  amount: number,
): Promise<void> {
  const { data: project } = await supabase()
    .from('projects')
    .select('paid_amount, total_amount')
    .eq('id', projectId)
    .single();

  if (!project) return;

  const newPaid = Math.max(0, (project.paid_amount || 0) - amount);
  const pct = project.total_amount > 0 ? newPaid / project.total_amount : 0;

  await supabase()
    .from('projects')
    .update({
      paid_amount: newPaid,
      deposit_paid: pct >= 0.5,
      pre_install_paid: pct >= 0.9,
      final_paid: pct >= 1.0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
}
