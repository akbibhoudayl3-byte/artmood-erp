import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST /api/work-time/attendance
 *
 * Record a GPS-enforced attendance check-in or check-out.
 * Requires roles with pointage obligation (all except owner_admin, commercial_manager).
 *
 * Body:
 *   event_type   'check_in' | 'check_out'
 *   user_lat     number
 *   user_lng     number
 *   accuracy_m?  number
 *   project_id?  string (UUID) — for client-site check-ins
 *   notes?       string
 *
 * Response 200: { id, event_type, event_time, location_name, distance_meters }
 * Response 403: { error, reason, distance_meters? }
 *
 * Deploy to: src/app/api/work-time/attendance/route.ts
 */

const EXEMPT_ROLES = ['owner_admin', 'commercial_manager'];
const POINTAGE_ROLES = [
  'operations_manager','designer','workshop_manager','workshop_worker',
  'worker','installer','logistics',
];

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll() { return cookieStore.getAll(); }, setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } },
    }
  );

  // ── Auth ────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: {
    event_type:  'check_in' | 'check_out';
    user_lat:    number;
    user_lng:    number;
    accuracy_m?: number;
    project_id?: string;
    notes?:      string;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { event_type, user_lat, user_lng, accuracy_m, project_id, notes } = body;

  if (!['check_in','check_out'].includes(event_type)) {
    return NextResponse.json({ error: 'event_type must be check_in or check_out' }, { status: 400 });
  }
  if (typeof user_lat !== 'number' || typeof user_lng !== 'number') {
    return NextResponse.json({ error: 'user_lat and user_lng are required' }, { status: 400 });
  }

  // ── Location validation (skip for exempt roles) ───────────────────────────
  let locationResult: {
    allowed: boolean; distance_meters?: number; radius_meters?: number;
    location_name?: string; reason?: string;
  } = { allowed: true, reason: 'exempt' };

  if (!EXEMPT_ROLES.includes(profile.role)) {
    const { data: geoData, error: geoErr } = await supabase.rpc('validate_work_location', {
      p_user_lat:    user_lat,
      p_user_lng:    user_lng,
      p_project_id:  project_id ?? null,
      p_action_type: event_type === 'check_in' ? 'attendance_check_in' : 'attendance_check_out',
      p_accuracy_m:  accuracy_m ?? null,
    });

    if (geoErr) {
      console.error('[attendance] geo validation error:', geoErr.message);
      return NextResponse.json({ error: 'Location validation failed' }, { status: 500 });
    }

    locationResult = geoData as typeof locationResult;

    if (!locationResult.allowed) {
      return NextResponse.json({
        error:           'Location check failed',
        reason:          locationResult.reason,
        distance_meters: locationResult.distance_meters,
        radius_meters:   locationResult.radius_meters,
        location_name:   locationResult.location_name,
      }, { status: 403 });
    }
  }

  // ── Prevent double check-in same day ─────────────────────────────────────
  if (event_type === 'check_in') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('attendance_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'check_in')
      .gte('event_time', todayStart.toISOString());

    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: 'Already checked in today',
        code:  'ALREADY_CHECKED_IN',
      }, { status: 409 });
    }
  }

  // ── Record the event ─────────────────────────────────────────────────────
  const { data: event, error: insertErr } = await supabase
    .from('attendance_events')
    .insert({
      user_id:         user.id,
      event_type,
      location_type:   project_id ? 'client' : 'company',
      gps_lat:         user_lat,
      gps_lng:         user_lng,
      gps_accuracy:    accuracy_m ?? null,
      event_time:      new Date().toISOString(),
      project_id:      project_id ?? null,
      location_name:   locationResult.location_name ?? null,
      distance_meters: locationResult.distance_meters ?? null,
      notes:           notes ?? null,
      device_info:     req.headers.get('user-agent')?.slice(0, 200) ?? null,
    })
    .select('id, event_type, event_time, location_name, distance_meters')
    .single();

  if (insertErr) {
    console.error('[attendance] insert error:', insertErr.message);
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }

  return NextResponse.json({
    ...event,
    location_name:   locationResult.location_name ?? 'exempt',
    distance_meters: locationResult.distance_meters ?? 0,
    reason:          locationResult.reason,
  });
}

// ── GET: Fetch today's attendance events for current user ─────────────────────
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll() { return cookieStore.getAll(); }, setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const targetUserId = searchParams.get('user_id') ?? user.id;

  // Role check for viewing other users
  if (targetUserId !== user.id) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const managerRoles = ['owner_admin','ceo','operations_manager','workshop_manager','hr_manager'];
    if (!profile || !managerRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const dayStart = `${date}T00:00:00Z`;
  const dayEnd   = `${date}T23:59:59Z`;

  const { data, error } = await supabase
    .from('attendance_events')
    .select('id, event_type, event_time, location_type, location_name, distance_meters, gps_lat, gps_lng, notes')
    .eq('user_id', targetUserId)
    .gte('event_time', dayStart)
    .lte('event_time', dayEnd)
    .order('event_time');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data ?? [] });
}
