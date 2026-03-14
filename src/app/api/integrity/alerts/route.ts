/**
 * Data Integrity Engine — Active Alerts Endpoint
 *
 * GET /api/integrity/alerts
 *
 * CEO + workshop_manager only.
 * Returns unread integrity notifications for the authenticated user.
 *
 * Query params:
 *   ?limit=50          — max results (default 50, max 200)
 *   ?include_read=true — include already-read alerts (default: false)
 *
 * Response:
 *   { alerts: Notification[], total: number }
 */

import { NextResponse }               from 'next/server';
import { guard }                      from '@/lib/security/guardian';

export async function GET(request: Request) {
  // ── Guard: CEO + workshop_manager only ───────────────────────────────────
  const ctx = await guard(['ceo', 'workshop_manager']);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    parseInt(searchParams.get('limit') ?? '50', 10) || 50,
    200,
  );
  const includeRead = searchParams.get('include_read') === 'true';

  // ── Fetch integrity notifications ────────────────────────────────────────
  let query = ctx.supabase
    .from('notifications')
    .select('id, title, body, type, severity, reference_type, reference_id, is_read, created_at')
    .eq('user_id', ctx.userId)
    .like('type', 'integrity_%')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeRead) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[GET /api/integrity/alerts]', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch alerts', message: error.message },
      { status: 500 },
    );
  }

  const alerts = data ?? [];

  return NextResponse.json({
    alerts,
    total:    alerts.length,
    critical: alerts.filter((a: { severity: string }) => a.severity === 'critical').length,
    warning:  alerts.filter((a: { severity: string }) => a.severity === 'warning').length,
  });
}

// ── Mark alerts as read ──────────────────────────────────────────────────────

/**
 * PATCH /api/integrity/alerts
 * Body: { ids: string[] } — mark specific alert IDs as read
 *       {} — mark all integrity alerts as read
 */
export async function PATCH(request: Request) {
  const ctx = await guard(['ceo', 'workshop_manager']);
  if (ctx instanceof NextResponse) return ctx;

  let ids: string[] | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.ids) && body.ids.length > 0) ids = body.ids;
  } catch { /* mark all */ }

  let query = ctx.supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', ctx.userId)
    .like('type', 'integrity_%');

  if (ids) {
    query = query.in('id', ids);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'Failed to mark alerts as read', message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
