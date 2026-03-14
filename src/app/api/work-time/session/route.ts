import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Work Session API — start, pause, resume, finish a task session
 *
 * POST /api/work-time/session        → start a new work session
 * PATCH /api/work-time/session/[id]  → pause | resume | finish | cancel
 * GET  /api/work-time/session        → list sessions (current user or manager view)
 *
 * Geo-enforcement:
 *   All actions call validate_work_location() RPC.
 *   Exempt roles (owner_admin, commercial_manager) bypass location checks.
 *
 * Business rule:
 *   Pointage-required roles must have an open attendance check-in
 *   before they can start a work session.
 *
 * Deploy POST+GET to: src/app/api/work-time/session/route.ts
 * Deploy PATCH to:    src/app/api/work-time/session/[id]/route.ts
 */

const EXEMPT_ROLES     = ['owner_admin', 'commercial_manager'];
const POINTAGE_ROLES   = [
  'operations_manager','designer','workshop_manager','workshop_worker',
  'worker','installer','logistics',
];
const VALID_TASK_TYPES = [
  'production','cutting','edge_banding','assembly','finishing',
  'installation','quality_check','administrative','other',
];

function makeSupabase(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get:    (name: string) => cookieStore.get(name)?.value,
        set:    () => {},
        remove: () => {},
      },
    }
  );
}

async function getAuthProfile(supabase: ReturnType<typeof makeSupabase>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  return { user, profile };
}

async function validateGeo(
  supabase: ReturnType<typeof makeSupabase>,
  role: string,
  userLat: number, userLng: number,
  actionType: string,
  projectId?: string | null,
) {
  if (EXEMPT_ROLES.includes(role)) {
    return { allowed: true, reason: 'exempt', distance_meters: 0 };
  }
  const { data, error } = await supabase.rpc('validate_work_location', {
    p_user_lat:    userLat,
    p_user_lng:    userLng,
    p_project_id:  projectId ?? null,
    p_action_type: actionType,
    p_accuracy_m:  null,
  });
  if (error) throw new Error('Location validation failed: ' + error.message);
  return data as { allowed: boolean; reason?: string; distance_meters?: number; radius_meters?: number; location_name?: string };
}

// ── POST: Start a new work session ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);
  const { user, profile } = await getAuthProfile(supabase);
  if (!user || !profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    task_type:       string;
    user_lat:        number;
    user_lng:        number;
    accuracy_m?:     number;
    project_id?:     string;
    installation_id?: string;
    workflow_stage?: string;
    location_type?:  'company' | 'client';
    notes?:          string;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const {
    task_type, user_lat, user_lng, accuracy_m,
    project_id, installation_id, workflow_stage, notes,
  } = body;

  if (!VALID_TASK_TYPES.includes(task_type)) {
    return NextResponse.json({
      error: `task_type must be one of: ${VALID_TASK_TYPES.join(', ')}`,
    }, { status: 400 });
  }
  if (typeof user_lat !== 'number' || typeof user_lng !== 'number') {
    return NextResponse.json({ error: 'user_lat and user_lng required' }, { status: 400 });
  }

  // ── Rule: must be checked in today (for pointage roles) ─────────────────
  if (POINTAGE_ROLES.includes(profile.role)) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('attendance_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'check_in')
      .gte('event_time', todayStart.toISOString());

    if ((count ?? 0) === 0) {
      return NextResponse.json({
        error: 'You must check in first before starting a work session.',
        code:  'NOT_CHECKED_IN',
      }, { status: 403 });
    }
  }

  // ── Rule: no concurrent active sessions ─────────────────────────────────
  const { count: activeCount } = await supabase
    .from('work_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['active', 'paused']);

  if ((activeCount ?? 0) > 0) {
    return NextResponse.json({
      error: 'You already have an active or paused work session. Finish it before starting a new one.',
      code:  'SESSION_ALREADY_ACTIVE',
    }, { status: 409 });
  }

  // ── Geo validation ────────────────────────────────────────────────────────
  let geoResult;
  try {
    geoResult = await validateGeo(supabase, profile.role, user_lat, user_lng, 'task_start', project_id);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  if (!geoResult.allowed) {
    return NextResponse.json({
      error:           'Location check failed',
      reason:          geoResult.reason,
      distance_meters: geoResult.distance_meters,
      radius_meters:   geoResult.radius_meters,
    }, { status: 403 });
  }

  // ── Create session ────────────────────────────────────────────────────────
  const locationType = (project_id || installation_id) ? 'client' : 'company';
  const now = new Date().toISOString();

  const { data: session, error: sessionErr } = await supabase
    .from('work_sessions')
    .insert({
      user_id:            user.id,
      project_id:         project_id ?? null,
      installation_id:    installation_id ?? null,
      task_type,
      workflow_stage:     workflow_stage ?? null,
      location_type:      locationType,
      gps_lat_start:      user_lat,
      gps_lng_start:      user_lng,
      gps_accuracy_start: accuracy_m ?? null,
      started_at:         now,
      status:             'active',
      notes:              notes ?? null,
    })
    .select('id, started_at, task_type, location_type, status')
    .single();

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }

  // Log start event
  await supabase.from('work_session_events').insert({
    session_id:   session.id,
    user_id:      user.id,
    event_type:   'start',
    gps_lat:      user_lat,
    gps_lng:      user_lng,
    event_time:   now,
  });

  return NextResponse.json({
    ...session,
    location_name:   geoResult.location_name ?? locationType,
    distance_meters: geoResult.distance_meters,
  }, { status: 201 });
}

// ── GET: List sessions ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);
  const { user, profile } = await getAuthProfile(supabase);
  if (!user || !profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('user_id');
  const date         = searchParams.get('date');
  const status       = searchParams.get('status');
  const projectId    = searchParams.get('project_id');

  const managerRoles = ['owner_admin','ceo','operations_manager','workshop_manager','hr_manager'];
  const isManager    = managerRoles.includes(profile.role);

  // Non-managers can only see own sessions
  const filterUserId = (targetUserId && isManager) ? targetUserId : user.id;

  let query = supabase
    .from('work_sessions')
    .select(`
      id, user_id, project_id, installation_id,
      task_type, workflow_stage, location_type,
      started_at, finished_at, total_minutes, status, notes,
      project:projects(reference_code, client_name)
    `)
    .eq('user_id', filterUserId)
    .order('started_at', { ascending: false });

  if (date) {
    const dayStart = `${date}T00:00:00Z`;
    const dayEnd   = `${date}T23:59:59Z`;
    query = query.gte('started_at', dayStart).lte('started_at', dayEnd);
  }
  if (status) query = query.eq('status', status);
  if (projectId) query = query.eq('project_id', projectId);

  query = query.limit(100);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sessions: data ?? [] });
}
