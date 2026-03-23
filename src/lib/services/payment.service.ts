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

// ── Financial Status ──────────────────────────────────────────────────────

export interface ProjectFinancialStatus {
  project_id: string;
  total_amount: number;
  paid_amount: number;
  remaining: number;
  overpayment: number;
  is_fully_paid: boolean;
  max_allowed: number; // maximum new payment amount
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
 * Now includes total_amount and paid_amount for financial validation.
 */
export async function loadActiveProjects(): Promise<
  ServiceResult<{ id: string; client_name: string; reference_code: string; total_amount: number; paid_amount: number }[]>
> {
  const { data, error } = await supabase()
    .from('projects')
    .select('id, client_name, reference_code, total_amount, paid_amount')
    .in('status', [
      'measurements',
      'design',
      'client_validation',
      'production',
      'installation',
    ])
    .order('created_at', { ascending: false });

  if (error) return fail('Failed to load projects: ' + error.message);
  return ok(data || []);
}

/**
 * Get the financial status for a project: paid, remaining, overpayment.
 * Uses real SUM(payments) not the denormalized paid_amount for integrity.
 */
export async function getProjectFinancialStatus(
  projectId: string,
): Promise<ServiceResult<ProjectFinancialStatus>> {
  if (!projectId) return fail('Project ID is required.');

  // Fetch project total
  const { data: project, error: projErr } = await supabase()
    .from('projects')
    .select('total_amount')
    .eq('id', projectId)
    .single();

  if (projErr || !project) return fail('Project not found.');

  // SUM all existing payments for this project (source of truth)
  const { data: payments, error: payErr } = await supabase()
    .from('payments')
    .select('amount')
    .eq('project_id', projectId);

  if (payErr) return fail('Failed to load project payments.');

  const totalAmount = Number(project.total_amount) || 0;
  const paidAmount = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, totalAmount - paidAmount);
  const overpayment = Math.max(0, paidAmount - totalAmount);
  const isFullyPaid = totalAmount > 0 && paidAmount >= totalAmount;

  return ok({
    project_id: projectId,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    remaining,
    overpayment,
    is_fully_paid: isFullyPaid,
    max_allowed: remaining,
  });
}

/**
 * Create a new payment with strict financial validation.
 * Blocks if project is fully paid or payment would exceed total.
 */
export async function createPayment(
  data: CreatePaymentData,
): Promise<ServiceResult<{ id: string }>> {
  if (!data.project_id) return fail('Please select a project.');
  if (!data.amount || data.amount <= 0)
    return fail('Amount must be greater than zero.');
  if (!data.received_at) return fail('Payment date is required.');

  // ── Financial integrity check ──
  const statusRes = await getProjectFinancialStatus(data.project_id);
  if (!statusRes.success || !statusRes.data) return fail(statusRes.error || 'Financial check failed.');

  const fs = statusRes.data;
  if (fs.total_amount > 0) {
    if (fs.is_fully_paid) {
      return fail(`Project already fully paid (${fmtMAD(fs.paid_amount)} / ${fmtMAD(fs.total_amount)}). No further payments allowed.`);
    }
    if (data.amount > fs.remaining) {
      return fail(`Payment of ${fmtMAD(data.amount)} exceeds remaining balance. Maximum allowed: ${fmtMAD(fs.remaining)}.`);
    }
  }

  // Atomic: insert payment + update project paid_amount in one SQL transaction
  const { data: result, error: rpcErr } = await supabase()
    .rpc('record_payment_atomic', {
      p_project_id:  data.project_id,
      p_amount:      data.amount,
      p_method:      data.payment_method,
      p_type:        data.payment_type,
      p_reference:   data.reference_number || null,
      p_notes:       data.notes || null,
      p_received_by: data.received_by || null,
      p_received_at: new Date(data.received_at).toISOString(),
    });

  if (rpcErr) return fail('Failed to record payment: ' + rpcErr.message);

  return ok({ id: result.payment_id });
}

/**
 * Update an existing payment with financial validation.
 * Ensures the new amount won't cause total_paid > total_amount.
 */
export async function updatePayment(
  id: string,
  data: Record<string, unknown>,
): Promise<ServiceResult> {
  if (!id) return fail('Payment ID is required.');

  const projectId = data.project_id as string;
  const newAmount = Number(data.amount);

  // ── Financial integrity check for updates ──
  if (projectId && newAmount > 0) {
    // Get current payment amount to compute the delta
    const { data: currentPayment } = await supabase()
      .from('payments')
      .select('amount, project_id')
      .eq('id', id)
      .single();

    if (currentPayment) {
      const oldAmount = Number(currentPayment.amount);
      const targetProjectId = projectId || currentPayment.project_id;

      // Get financial status for the target project
      const statusRes = await getProjectFinancialStatus(targetProjectId);
      if (statusRes.success && statusRes.data && statusRes.data.total_amount > 0) {
        const fs = statusRes.data;
        // If same project: delta = newAmount - oldAmount (we only care if it's going up)
        // If different project: full newAmount counts against the new project
        let effectiveIncrease: number;
        if (targetProjectId === currentPayment.project_id) {
          effectiveIncrease = newAmount - oldAmount;
        } else {
          effectiveIncrease = newAmount; // full amount goes to new project
        }

        if (effectiveIncrease > 0 && effectiveIncrease > fs.remaining) {
          return fail(`Updated amount would exceed project total. Maximum increase allowed: ${fmtMAD(fs.remaining)}.`);
        }
      }
    }
  }

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

/** Format a number as MAD currency for error messages */
function fmtMAD(n: number): string {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', minimumFractionDigits: 0 }).format(n);
}

/**
 * Delete a payment, subtract from project paid_amount, and create a ledger reversal entry.
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

  // Ledger reversal entry (non-fatal)
  try {
    await supabase().from('ledger').insert({
      date: new Date().toISOString().split('T')[0],
      type: 'income',
      category: 'payment_reversal',
      amount: -amount,
      description: `Payment deleted (reversal). Original: ${fmtMAD(amount)}.`,
      project_id: projectId,
      source_module: 'payments',
      source_id: id,
    });
  } catch { /* ledger reversal is non-fatal */ }

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
