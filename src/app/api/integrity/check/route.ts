/**
 * Data Integrity Engine — Manual Integrity Check Endpoint
 *
 * POST /api/integrity/check
 *
 * CEO + workshop_manager only.
 * Runs full DB integrity scan and pushes alerts as notifications.
 *
 * Request body (optional):
 *   { notify: boolean }   — if true (default), create notifications for CEO + managers
 *
 * Response:
 *   { alerts: IntegrityAlert[], notificationsCreated: number, checkedAt: string }
 */

import { NextResponse }           from 'next/server';
import { createClient }           from '@supabase/supabase-js';
import { guard }                  from '@/lib/security/guardian';
import { runIntegrityChecks }     from '@/lib/integrity/alerts';

// Service-role client: needed to read all projects + users for notification targeting
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(request: Request) {
  // ── Guard: CEO + workshop_manager only ───────────────────────────────────
  const ctx = await guard(['ceo', 'workshop_manager']);
  if (ctx instanceof NextResponse) return ctx;

  let notify = true;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.notify === 'boolean') notify = body.notify;
  } catch { /* default notify=true */ }

  // ── Resolve notification target users (CEO + workshop_managers) ──────────
  let targetUserIds: string[] = [];
  if (notify) {
    try {
      const { data: managers } = await adminClient
        .from('profiles')
        .select('id')
        .in('role', ['ceo', 'workshop_manager'])
        .eq('is_active', true);

      targetUserIds = (managers ?? []).map((m: { id: string }) => m.id);
    } catch {
      // Non-critical — continue without notifications
    }
  }

  // ── Run checks ───────────────────────────────────────────────────────────
  const result = await runIntegrityChecks({
    supabase:       adminClient,
    userId:         ctx.userId,
    targetUserIds:  notify ? targetUserIds : [],
  });

  return NextResponse.json({
    ok:                   true,
    alerts:               result.alerts,
    notificationsCreated: result.notificationsCreated,
    checkedAt:            result.checkedAt,
    summary: {
      total:    result.alerts.length,
      critical: result.alerts.filter(a => a.severity === 'critical').length,
      warning:  result.alerts.filter(a => a.severity === 'warning').length,
      info:     result.alerts.filter(a => a.severity === 'info').length,
    },
  });
}
