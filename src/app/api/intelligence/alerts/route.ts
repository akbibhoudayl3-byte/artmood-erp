/**
 * Financial Intelligence Layer — Financial Alerts API
 *
 * GET /api/finance/intelligence/alerts
 *   Returns live financial alerts from get_financial_intelligence_alerts() SQL function.
 *   Also includes unread financial notification history.
 *
 * POST /api/finance/intelligence/alerts/push
 *   Runs full financial alert scan and pushes results to notifications table.
 *
 * CEO only.
 */

import { NextResponse }         from 'next/server';
import { createClient }         from '@supabase/supabase-js';
import { guard }                from '@/lib/security/guardian';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface FinancialAlert {
  alert_type:     string;
  severity:       string;
  title:          string;
  body:           string;
  reference_type: string | null;
  reference_id:   string | null;
}

export async function GET() {
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  try {
    // Fetch live alerts from SQL function (real-time, no caching)
    const { data: liveAlerts, error: alertErr } = await adminClient
      .rpc('get_financial_intelligence_alerts');

    if (alertErr) {
      console.error('[GET /api/finance/intelligence/alerts] RPC error:', alertErr.message);
      return NextResponse.json(
        { error: 'Failed to compute financial alerts', message: alertErr.message },
        { status: 500 },
      );
    }

    const alerts = (liveAlerts ?? []) as FinancialAlert[];

    // Also return recent pushed notifications from DB (last 7 days)
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: history } = await adminClient
      .from('notifications')
      .select('id, title, body, type, severity, reference_type, reference_id, is_read, created_at')
      .eq('user_id', ctx.userId)
      .like('type', 'financial_%')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false })
      .limit(50);

    await ctx.audit({
      action:      'view_sensitive',
      entity_type: 'financial_alerts',
      notes:       `Financial alerts viewed: ${alerts.length} live alert(s)`,
    });

    return NextResponse.json({
      live_alerts:         alerts,
      notification_history: history ?? [],
      summary: {
        total:    alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning:  alerts.filter(a => a.severity === 'warning').length,
        info:     alerts.filter(a => a.severity === 'info').length,
      },
    });
  } catch (error) {
    console.error('[GET /api/finance/intelligence/alerts]', error);
    return NextResponse.json(
      { error: 'Failed to load financial alerts' },
      { status: 500 },
    );
  }
}

/**
 * POST — Run alert scan and push notifications to all CEO users
 */
export async function POST() {
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  try {
    // Get live alerts
    const { data: liveAlerts, error: alertErr } = await adminClient
      .rpc('get_financial_intelligence_alerts');

    if (alertErr) {
      return NextResponse.json(
        { error: 'Alert scan failed', message: alertErr.message },
        { status: 500 },
      );
    }

    const alerts = (liveAlerts ?? []) as FinancialAlert[];

    // Get all CEO user IDs to notify
    const { data: ceoUsers } = await adminClient
      .from('profiles')
      .select('id')
      .eq('role', 'ceo')
      .eq('is_active', true);

    let notificationsCreated = 0;

    if (alerts.length > 0 && ceoUsers && ceoUsers.length > 0) {
      const notifications = [];
      for (const user of ceoUsers) {
        for (const alert of alerts) {
          notifications.push({
            user_id:        user.id,
            title:          alert.title,
            body:           alert.body,
            type:           `financial_${alert.alert_type}`,
            severity:       alert.severity,
            reference_type: alert.reference_type,
            reference_id:   alert.reference_id,
            is_read:        false,
          });
        }
      }

      const { error: notifErr } = await adminClient
        .from('notifications')
        .insert(notifications);

      if (!notifErr) notificationsCreated = notifications.length;
    }

    await ctx.audit({
      action:      'financial_edit',
      entity_type: 'financial_alerts',
      new_value:   {
        alerts_found:          alerts.length,
        notifications_created: notificationsCreated,
      },
      notes: `Financial alert scan: ${alerts.length} alert(s), ${notificationsCreated} notification(s) pushed`,
    });

    return NextResponse.json({
      ok:                   true,
      alerts_found:         alerts.length,
      notificationsCreated,
      alerts,
    });
  } catch (error) {
    console.error('[POST /api/finance/intelligence/alerts]', error);
    return NextResponse.json(
      { error: 'Alert scan failed' },
      { status: 500 },
    );
  }
}
