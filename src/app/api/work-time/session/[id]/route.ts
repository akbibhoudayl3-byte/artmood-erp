import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * PATCH /api/work-time/session/[id]
 *
 * Perform a lifecycle action on an existing work session:
 *   pause   — suspend active session (GPS required)
 *   resume  — resume paused session (GPS required)
 *   finish  — close session, calculate total_minutes (GPS required)
 *   cancel  — cancel without recording time (no GPS required)
 *
 * Body:
 *   action      'pause' | 'resume' | 'finish' | 'cancel'
 *   user_lat    number (required except cancel)
 *   user_lng    number (required except cancel)
 *   accuracy_m? number
 *   notes?      string
 *
 * Deploy to: src/app/api/work-time/session/[id]/route.ts
 */

const EXEMPT_ROLES = ['owner_admin', 'commercial_manager'];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); }, setAll(cookiesToSet: {name: string; value: string; options?: any}[]) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} }
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: {
    action:      'pause' | 'resume' | 'finish' | 'cancel';
    user_lat?:   number;
    user_lng?:   number;
    accuracy_m?: number;
    notes?:      string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { action, user_lat, user_lng, accuracy_m, notes } = body;

  if (!['pause','resume','finish','cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const requiresGps = action !== 'cancel';
  if (requiresGps && (typeof user_lat !== 'number' || typeof user_lng !== 'number')) {
    return NextResponse.json({ error: 'user_lat and user_lng required for this action' }, { status: 400 });
  }

  // ── Load session (must belong to this user) ───────────────────────────────
  const { data: session, error: sessionErr } = await supabase
    .from('work_sessions')
    .select('id, user_id, status, started_at, project_id, location_type')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // ── Validate state machine ────────────────────────────────────────────────
  const allowed: Record<string, string[]> = {
    active:   ['pause','finish','cancel'],
    paused:   ['resume','cancel'],
    finished: [],
    cancelled:[],
  };
  if (!allowed[session.status]?.includes(action)) {
    return NextResponse.json({
      error: `Cannot ${action} a session with status '${session.status}'`,
    }, { status: 409 });
  }

  // ── Geo validation (skip for cancel and exempt roles) ─────────────────────
  let geoResult: { allowed: boolean; reason?: string; distance_meters?: number } = { allowed: true };
  if (requiresGps && !EXEMPT_ROLES.includes(profile.role)) {
    const actionTypeMap = { pause: 'task_pause', resume: 'task_resume', finish: 'task_finish' };
    const { data: geoData, error: geoErr } = await supabase.rpc('validate_work_location', {
      p_user_lat:    user_lat,
      p_user_lng:    user_lng,
      p_project_id:  session.project_id ?? null,
      p_action_type: actionTypeMap[action as keyof typeof actionTypeMap] ?? 'task_finish',
      p_accuracy_m:  accuracy_m ?? null,
    });
    if (geoErr) {
      return NextResponse.json({ error: 'Location validation failed' }, { status: 500 });
    }
    geoResult = geoData as typeof geoResult;
    if (!geoResult.allowed) {
      return NextResponse.json({
        error:           'Location check failed',
        reason:          geoResult.reason,
        distance_meters: geoResult.distance_meters,
      }, { status: 403 });
    }
  }

  // ── Apply action ──────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  let updatePayload: Record<string, unknown> = {};
  let eventType = action;
  let totalMinutes: number | null = null;

  switch (action) {
    case 'pause':
      updatePayload = { status: 'paused' };
      break;

    case 'resume':
      updatePayload = { status: 'active' };
      break;

    case 'finish': {
      // Calculate total worked minutes via Postgres function
      const { data: mins } = await supabase.rpc('calculate_session_minutes', {
        p_session_id: sessionId,
      });
      totalMinutes = (mins as number) ?? 0;
      updatePayload = {
        status:        'finished',
        finished_at:   now,
        total_minutes: totalMinutes,
        gps_lat_end:   user_lat ?? null,
        gps_lng_end:   user_lng ?? null,
        ...(notes ? { notes } : {}),
      };
      break;
    }

    case 'cancel':
      updatePayload = { status: 'cancelled' };
      break;
  }

  // Update session
  const { data: updated, error: updateErr } = await supabase
    .from('work_sessions')
    .update(updatePayload)
    .eq('id', sessionId)
    .select('id, status, finished_at, total_minutes')
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Log session event
  await supabase.from('work_session_events').insert({
    session_id:   sessionId,
    user_id:      user.id,
    event_type:   eventType,
    gps_lat:      user_lat ?? null,
    gps_lng:      user_lng ?? null,
    gps_accuracy: accuracy_m ?? null,
    event_time:   now,
    notes:        notes ?? null,
  });

  return NextResponse.json({
    ...updated,
    action,
    total_minutes: totalMinutes,
    distance_meters: geoResult.distance_meters ?? 0,
  });
}
