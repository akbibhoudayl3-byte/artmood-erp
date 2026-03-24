/**
 * Financial Reminder Backfill Service
 *
 * Manual-only function to create missing calendar reminders for
 * unresolved cheques and pending bank transfers.
 *
 * SAFE: idempotent, no duplicates (DB partial unique index enforced).
 * MANUAL: never called from dashboard or page load.
 * USE: admin script or future cron job only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BackfillResult {
  created: number;
  completed: number;
  errors: string[];
}

/**
 * Backfill missing calendar reminders and auto-complete resolved ones.
 *
 * 1. Find unresolved cheques (pending/deposited) WITHOUT an active calendar event → create
 * 2. Find pending_proof payments WITHOUT an active calendar event → create
 * 3. Find resolved cheques/payments WITH non-completed calendar events → mark completed
 *
 * Uses plain INSERT — DB partial unique index prevents duplicates (catches 23505).
 */
export async function backfillFinancialReminders(
  supabase: SupabaseClient,
): Promise<BackfillResult> {
  let created = 0;
  let completed = 0;
  const errors: string[] = [];

  // ── 1. Missing cheque reminders ─────────────────────────────────────────
  const { data: unresolvedCheques } = await supabase
    .from('cheques')
    .select('id, amount, due_date, client_name, cheque_number, created_by')
    .in('status', ['pending', 'deposited'])
    .eq('type', 'received');

  for (const cheque of unresolvedCheques || []) {
    // GUARD: skip if cheque has no valid id
    if (!cheque.id) {
      errors.push('Skipped cheque with null id');
      continue;
    }
    // Check if active event exists
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('reference_type', 'cheque')
      .eq('reference_id', cheque.id)
      .eq('is_completed', false)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error } = await supabase.from('calendar_events').insert({
        title: `Chèque à traiter: ${Number(cheque.amount).toLocaleString('fr-MA')} MAD`,
        description: `Chèque #${cheque.cheque_number || 'N/A'} — ${cheque.client_name || 'Unknown'}`,
        event_type: 'cheque_due',
        event_date: cheque.due_date,
        reference_type: 'cheque',
        reference_id: cheque.id,
        created_by: cheque.created_by,
      });

      if (error && error.code !== '23505') {
        errors.push(`Cheque ${cheque.id}: ${error.message}`);
      } else if (!error) {
        created++;
      }
    }
  }

  // ── 2. Missing bank transfer reminders ──────────────────────────────────
  const { data: pendingTransfers } = await supabase
    .from('payments')
    .select('id, amount, received_at, reference_number, received_by, project:projects(client_name)')
    .eq('payment_status', 'pending_proof')
    .eq('payment_method', 'bank_transfer');

  for (const payment of pendingTransfers || []) {
    // GUARD: skip if payment has no valid id
    if (!payment.id) {
      errors.push('Skipped payment with null id');
      continue;
    }
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('reference_type', 'payment')
      .eq('reference_id', payment.id)
      .eq('is_completed', false)
      .limit(1);

    if (!existing || existing.length === 0) {
      const clientName = (payment.project as any)?.client_name || 'Unknown';
      const { error } = await supabase.from('calendar_events').insert({
        title: `Virement à confirmer: ${Number(payment.amount).toLocaleString('fr-MA')} MAD`,
        description: `Projet: ${clientName}${payment.reference_number ? '. Ref: ' + payment.reference_number : ''}`,
        event_type: 'payment_due',
        event_date: payment.received_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        reference_type: 'payment',
        reference_id: payment.id,
        created_by: payment.received_by,
      });

      if (error && error.code !== '23505') {
        errors.push(`Payment ${payment.id}: ${error.message}`);
      } else if (!error) {
        created++;
      }
    }
  }

  // ── 3. Auto-complete resolved items ─────────────────────────────────────
  // Cheques that are cleared/bounced but still have open calendar events
  const { data: resolvedChequeEvents } = await supabase
    .from('calendar_events')
    .select('id, reference_id')
    .eq('reference_type', 'cheque')
    .eq('is_completed', false);

  for (const evt of resolvedChequeEvents || []) {
    const { data: cheque } = await supabase
      .from('cheques')
      .select('status')
      .eq('id', evt.reference_id)
      .single();

    if (cheque && (cheque.status === 'cleared' || cheque.status === 'bounced' || cheque.status === 'cancelled')) {
      await supabase.from('calendar_events').update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      }).eq('id', evt.id);
      completed++;
    }
  }

  // Payments that are confirmed/rejected but still have open calendar events
  const { data: resolvedPaymentEvents } = await supabase
    .from('calendar_events')
    .select('id, reference_id')
    .eq('reference_type', 'payment')
    .eq('is_completed', false);

  for (const evt of resolvedPaymentEvents || []) {
    const { data: payment } = await supabase
      .from('payments')
      .select('payment_status')
      .eq('id', evt.reference_id)
      .single();

    if (payment && (payment.payment_status === 'confirmed' || payment.payment_status === 'rejected')) {
      await supabase.from('calendar_events').update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      }).eq('id', evt.id);
      completed++;
    }
  }

  console.log(`[backfill] Created: ${created}, Completed: ${completed}, Errors: ${errors.length}`);
  return { created, completed, errors };
}
