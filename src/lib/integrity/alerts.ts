/**
 * Data Integrity Engine — Alert Engine
 *
 * Scans the entire database for integrity violations and pushes them
 * as notifications to the notifications table (CEO + workshop_manager).
 *
 * CHECKS PERFORMED:
 *   A. Low / zero stock items (vs minimum_quantity)
 *   B. Projects overdue in production (past estimated_production_end)
 *   C. Projects overdue in installation (past estimated_installation_date)
 *   D. Financial overpayment (paid_amount > total_amount)
 *   E. High material waste (> 20% on consumed production_consumption records)
 *   F. Production stalled (in_progress production orders > 60 days)
 *
 * All checks are executed via the get_integrity_alerts() PostgreSQL function
 * (handles cross-column comparisons that the JS client cannot).
 *
 * USAGE:
 *   import { runIntegrityChecks } from '@/lib/integrity';
 *
 *   const result = await runIntegrityChecks({
 *     supabase: ctx.supabase,
 *     userId: ctx.userId,
 *     targetUserIds: ['ceo-uuid', 'workshop-uuid'],
 *   });
 *   // result.alerts — all issues found
 *   // result.notificationsCreated — how many notifications were inserted
 */

import type { SupabaseClient }  from '@supabase/supabase-js';
import { writeAuditLog }        from '@/lib/security/audit';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrityAlert {
  alert_type:     string;
  severity:       'info' | 'warning' | 'critical';
  title:          string;
  body:           string;
  reference_type: string | null;
  reference_id:   string | null;
}

export interface IntegrityCheckResult {
  alerts:                IntegrityAlert[];
  notificationsCreated:  number;
  checkedAt:             string;
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Runs all integrity checks and optionally pushes notifications.
 *
 * @param supabase        Supabase client (should be admin/service-role for full access)
 * @param userId          Caller's UUID (for audit log)
 * @param targetUserIds   If provided, creates notifications for these users.
 *                        Typically CEO + active workshop_manager UUIDs.
 */
export async function runIntegrityChecks(opts: {
  supabase: SupabaseClient;
  userId: string;
  targetUserIds?: string[];
}): Promise<IntegrityCheckResult> {
  const { supabase, userId, targetUserIds } = opts;
  const checkedAt = new Date().toISOString();

  // ── 1. Call DB function to get all integrity alerts ───────────────────────
  const { data: rawAlerts, error: rpcErr } = await supabase
    .rpc('get_integrity_alerts');

  if (rpcErr) {
    console.error('[runIntegrityChecks] RPC failed:', rpcErr.message);
    return { alerts: [], notificationsCreated: 0, checkedAt };
  }

  const alerts = (rawAlerts ?? []) as IntegrityAlert[];

  // ── 2. Push notifications if target users provided ────────────────────────
  let notificationsCreated = 0;

  if (alerts.length > 0 && targetUserIds && targetUserIds.length > 0) {
    const notifications = [];

    for (const userId of targetUserIds) {
      for (const alert of alerts) {
        notifications.push({
          user_id:        userId,
          title:          alert.title,
          body:           alert.body,
          type:           `integrity_${alert.alert_type}`,
          severity:       alert.severity,
          reference_type: alert.reference_type,
          reference_id:   alert.reference_id,
          is_read:        false,
        });
      }
    }

    if (notifications.length > 0) {
      const { error: notifErr } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifErr) {
        console.error('[runIntegrityChecks] Notification insert failed:', notifErr.message);
      } else {
        notificationsCreated = notifications.length;
      }
    }
  }

  // ── 3. Audit log (silent) ─────────────────────────────────────────────────
  try {
    await writeAuditLog({
      user_id:     userId,
      action:      'view_sensitive',
      entity_type: 'integrity_check',
      new_value:   {
        alerts_found:          alerts.length,
        notifications_created: notificationsCreated,
        alert_types:           [...new Set(alerts.map(a => a.alert_type))],
      },
      notes: `Integrity check run: ${alerts.length} issue(s) found`,
    });
  } catch { /* silent */ }

  return { alerts, notificationsCreated, checkedAt };
}

// ── Fetch Active Integrity Alerts ─────────────────────────────────────────────

/**
 * Fetches unread integrity notifications for a user from the notifications table.
 * Use in dashboards and alert panels.
 */
export async function getActiveIntegrityAlerts(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<{
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  severity: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, type, severity, reference_type, reference_id, is_read, created_at')
    .eq('user_id', userId)
    .like('type', 'integrity_%')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getActiveIntegrityAlerts]', error.message);
    return [];
  }

  return data ?? [];
}

// ── Create a Single Alert ─────────────────────────────────────────────────────

/**
 * Creates a single integrity notification for specified users.
 * Used by domain-specific checks that detect issues at operation time.
 */
export async function createIntegrityAlert(opts: {
  supabase: SupabaseClient;
  targetUserIds: string[];
  alert: Omit<IntegrityAlert, 'reference_id'> & { reference_id?: string | null };
}): Promise<void> {
  const { supabase, targetUserIds, alert } = opts;

  if (!targetUserIds.length) return;

  const notifications = targetUserIds.map(uid => ({
    user_id:        uid,
    title:          alert.title,
    body:           alert.body,
    type:           `integrity_${alert.alert_type}`,
    severity:       alert.severity,
    reference_type: alert.reference_type,
    reference_id:   alert.reference_id ?? null,
    is_read:        false,
  }));

  const { error } = await supabase
    .from('notifications')
    .insert(notifications);

  if (error) {
    console.error('[createIntegrityAlert]', error.message);
  }
}
