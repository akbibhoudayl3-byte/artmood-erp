/**
 * Payment Service — Domain logic for payment CRUD and project sync.
 *
 * Extracts Supabase queries from src/app/(app)/finance/payments/page.tsx
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { PaymentType, PaymentMethod, PaymentStatus } from '@/types/database';

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
  payment_status: PaymentStatus;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  received_at: string;
  created_at: string;
  proof_url: string | null;
  cheque_id: string | null;
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
  cheque_id?: string;
  proof_url?: string;
}

// ── Status Derivation ─────────────────────────────────────────────────────

/**
 * Derive initial payment_status from method.
 * Cash/card = auto-confirmed. Everything else = pending_proof.
 */
export function derivePaymentStatus(method: PaymentMethod): PaymentStatus {
  if (method === 'cash' || method === 'card') return 'confirmed';
  if (method === 'cheque') return 'pending';
  return 'pending_proof'; // bank_transfer, other
}

// ── Financial Status ──────────────────────────────────────────────────────

export interface ProjectFinancialStatus {
  project_id: string;
  total_amount: number;
  confirmed_amount: number;  // only confirmed payments count
  pending_amount: number;    // pending_proof payments (not yet confirmed)
  paid_amount: number;       // confirmed_amount (alias for backward compat)
  remaining: number;
  overpayment: number;
  is_fully_paid: boolean;
  max_allowed: number;       // maximum new payment amount
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

  // SUM payments by status (source of truth)
  const { data: payments, error: payErr } = await supabase()
    .from('payments')
    .select('amount, payment_status')
    .eq('project_id', projectId);

  if (payErr) return fail('Failed to load project payments.');

  const totalAmount = Number(project.total_amount) || 0;
  const confirmedAmount = (payments || [])
    .filter(p => p.payment_status === 'confirmed')
    .reduce((s, p) => s + Number(p.amount), 0);
  const pendingAmount = (payments || [])
    .filter(p => p.payment_status === 'pending_proof' || p.payment_status === 'pending')
    .reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, totalAmount - confirmedAmount);
  const overpayment = Math.max(0, confirmedAmount - totalAmount);
  const isFullyPaid = totalAmount > 0 && confirmedAmount >= totalAmount;

  return ok({
    project_id: projectId,
    total_amount: totalAmount,
    confirmed_amount: confirmedAmount,
    pending_amount: pendingAmount,
    paid_amount: confirmedAmount,  // backward compat alias
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

  // Derive payment status from method
  const paymentStatus = derivePaymentStatus(data.payment_method);

  // Atomic: insert payment + update project paid_amount in one SQL transaction
  // Single 11-param RPC handles everything including payment_status, cheque_id, proof_url.
  const { data: result, error: rpcErr } = await supabase()
    .rpc('record_payment_atomic', {
      p_project_id:     data.project_id,
      p_amount:         data.amount,
      p_method:         data.payment_method,
      p_type:           data.payment_type,
      p_reference:      data.reference_number || null,
      p_notes:          data.notes || null,
      p_received_by:    data.received_by || null,
      p_received_at:    new Date(data.received_at).toISOString(),
      p_payment_status: paymentStatus,
      p_cheque_id:      data.cheque_id || null,
      p_proof_url:      data.proof_url || null,
    });

  if (rpcErr) return fail('Failed to record payment: ' + rpcErr.message);

  // Create calendar reminder for pending payments (bank_transfer + cheque)
  // NOTE: We use the locally-derived paymentStatus, NOT result.payment_status,
  // because the deployed RPC does not return payment_status in its response.
  const paymentId = result?.payment_id;
  console.log('[payment] created:', { paymentId, paymentStatus, method: data.payment_method });

  if (paymentStatus === 'pending_proof' || paymentStatus === 'pending') {
    if (!paymentId) {
      console.error('[calendar] SKIPPED: RPC returned null payment_id — cannot create reminder');
    } else {
      const { data: proj } = await supabase()
        .from('projects')
        .select('client_name')
        .eq('id', data.project_id)
        .single();

      console.log('[calendar] creating reminder for payment', paymentId, 'status=', paymentStatus);
      await createPaymentReminder(
        paymentId,
        data.amount,
        proj?.client_name || 'Unknown',
        data.reference_number || null,
        new Date(data.received_at).toISOString().split('T')[0],
        data.received_by || null,
      );
    }
  }

  return ok({ id: paymentId, payment_status: paymentStatus });
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

  // Sum only CONFIRMED payments for this project (gating source of truth)
  const { data: payments, error: paymentsErr } = await supabase()
    .from('payments')
    .select('amount, payment_status')
    .eq('project_id', projectId);

  if (paymentsErr) return fail('Failed to load payments for sync: ' + paymentsErr.message);

  const totalPaid = (payments || [])
    .filter(p => p.payment_status === 'confirmed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

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

// ── Calendar Event Helpers ─────────────────────────────────────────────────

/**
 * Mark the linked calendar event as completed when a payment/cheque is resolved.
 * Uses reference_type + reference_id to find the active event.
 * Logged, never silent.
 */
async function completeLinkedCalendarEvent(
  referenceType: string,
  referenceId: string,
): Promise<{ completed: boolean; error?: string }> {
  // GUARD: never query with null/empty reference — would match unrelated rows
  if (!referenceId) {
    console.error('[calendar] REFUSED: completeLinkedCalendarEvent called with null/empty referenceId');
    return { completed: false, error: 'referenceId is null or empty' };
  }
  try {
    const { data, error } = await supabase()
      .from('calendar_events')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .eq('is_completed', false)
      .select('id');

    if (error) {
      console.error('[calendar] Failed to complete event:', error.message);
      return { completed: false, error: error.message };
    }

    const count = data?.length || 0;
    if (count > 0) {
      console.log('[calendar] Completed', count, 'event(s) for', referenceType, referenceId);
    }
    return { completed: count > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[calendar] Exception completing event:', msg);
    return { completed: false, error: msg };
  }
}

/**
 * Create a calendar reminder for a pending payment (bank transfer).
 * Uses plain INSERT — DB partial unique index prevents duplicates.
 * Catches unique_violation (23505) silently.
 */
async function createPaymentReminder(
  paymentId: string,
  amount: number,
  projectName: string,
  reference: string | null,
  eventDate: string,
  createdBy: string | null,
): Promise<void> {
  // GUARD: never create a calendar event without a valid reference_id
  if (!paymentId) {
    console.error('[calendar] REFUSED: createPaymentReminder called with null/empty paymentId');
    return;
  }
  try {
    const { error } = await supabase().from('calendar_events').insert({
      title: `Virement à confirmer: ${new Intl.NumberFormat('fr-MA').format(amount)} MAD`,
      description: `Projet: ${projectName}${reference ? '. Ref: ' + reference : ''}`,
      event_type: 'payment_due',
      event_date: eventDate,
      reference_type: 'payment',
      reference_id: paymentId,
      created_by: createdBy,
    });

    if (error) {
      // 23505 = unique_violation from partial index — expected for duplicates, ignore
      if (error.code === '23505') {
        console.log('[calendar] Reminder already exists for payment', paymentId);
      } else {
        console.error('[calendar] Failed to create payment reminder:', error.message);
      }
    } else {
      console.log('[calendar] Created reminder for payment', paymentId);
    }
  } catch (err) {
    console.error('[calendar] Exception creating reminder:', err);
  }
}

// ── Payment Status Actions ────────────────────────────────────────────────

/**
 * Confirm a pending payment. Only confirmed payments count toward gating.
 * Resyncs project paid_amount and milestone flags.
 */
export async function confirmPayment(
  paymentId: string,
  proofUrl?: string,
): Promise<ServiceResult> {
  if (!paymentId) return fail('Payment ID is required.');

  // Get the payment to find its project
  const { data: payment, error: fetchErr } = await supabase()
    .from('payments')
    .select('project_id, payment_status')
    .eq('id', paymentId)
    .single();

  if (fetchErr || !payment) return fail('Payment not found.');
  if (payment.payment_status === 'confirmed') return fail('Payment is already confirmed.');
  if (payment.payment_status === 'rejected') return fail('Cannot confirm a rejected payment. Create a new payment instead.');

  // Update status
  const updates: Record<string, unknown> = { payment_status: 'confirmed' };
  if (proofUrl) updates.proof_url = proofUrl;

  const { error } = await supabase()
    .from('payments')
    .update(updates)
    .eq('id', paymentId);

  if (error) return fail('Failed to confirm payment: ' + error.message);

  // Resync project flags (now includes this newly confirmed amount)
  await syncProjectPaidAmount(payment.project_id);

  // Auto-complete linked calendar reminder
  await completeLinkedCalendarEvent('payment', paymentId);

  return ok();
}

/**
 * Reject a pending payment. Rejected payments are excluded from all totals.
 */
export async function rejectPayment(
  paymentId: string,
  reason?: string,
): Promise<ServiceResult> {
  if (!paymentId) return fail('Payment ID is required.');

  const { data: payment, error: fetchErr } = await supabase()
    .from('payments')
    .select('project_id, payment_status')
    .eq('id', paymentId)
    .single();

  if (fetchErr || !payment) return fail('Payment not found.');
  if (payment.payment_status === 'rejected') return fail('Payment is already rejected.');

  const wasConfirmed = payment.payment_status === 'confirmed';

  const { error } = await supabase()
    .from('payments')
    .update({
      payment_status: 'rejected',
      notes: reason ? `REJECTED: ${reason}` : 'REJECTED',
    })
    .eq('id', paymentId);

  if (error) return fail('Failed to reject payment: ' + error.message);

  // If it was confirmed before, resync to subtract from gating totals
  if (wasConfirmed) {
    await syncProjectPaidAmount(payment.project_id);
  }

  // Auto-complete linked calendar reminder
  await completeLinkedCalendarEvent('payment', paymentId);

  return ok();
}

/**
 * Handle cheque status change → auto-confirm/reject linked payment.
 * Called from the cheques page when a cheque transitions to cleared or bounced.
 */
export async function onChequeStatusChange(
  chequeId: string,
  newChequeStatus: string,
): Promise<ServiceResult> {
  if (!chequeId) return fail('Cheque ID is required.');

  // Find linked payment
  const { data: payment } = await supabase()
    .from('payments')
    .select('id, project_id, payment_status')
    .eq('cheque_id', chequeId)
    .single();

  if (!payment) return ok(); // No linked payment — nothing to do

  if (newChequeStatus === 'cleared') {
    // Auto-complete cheque calendar event
    await completeLinkedCalendarEvent('cheque', chequeId);
    if (payment.payment_status !== 'confirmed') {
      return confirmPayment(payment.id);
    }
  } else if (newChequeStatus === 'bounced') {
    // Auto-complete cheque calendar event
    await completeLinkedCalendarEvent('cheque', chequeId);
    if (payment.payment_status !== 'rejected') {
      return rejectPayment(payment.id, 'Chèque rejeté / bounced');
    }
  }

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
