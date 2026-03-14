import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST /api/installation/geo-gate
 *
 * Server-side geolocation enforcement for installer actions.
 * Delegates to the validate_installer_location() Postgres RPC
 * which logs every attempt to installation_location_logs.
 *
 * Body:
 *   project_id      string (UUID)
 *   action_type     'checkin' | 'checkout' | 'start_installation' | 'finish_installation' | 'report_issue'
 *   user_lat        number
 *   user_lng        number
 *   accuracy_m?     number
 *   installation_id? string (UUID)
 *   device_info?    string
 *
 * Response 200: { allowed: boolean, distance_meters: number, reason: string, radius_meters: number }
 * Response 400: { error: string }
 * Response 403: { error: string }
 */

const ALLOWED_ACTIONS = [
  'checkin', 'checkout',
  'start_installation', 'finish_installation',
  'report_issue',
] as const;

type ActionType = (typeof ALLOWED_ACTIONS)[number];

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get:    (name) => cookieStore.get(name)?.value,
        set:    () => {},
        remove: () => {},
      },
    }
  );

  // ── Auth check ────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ── Role check ────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['installer', 'owner_admin', 'ceo'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden: only installers may perform installation actions' },
      { status: 403 }
    );
  }

  // ── Validate body ─────────────────────────────────────────────
  let body: {
    project_id: string;
    action_type: ActionType;
    user_lat: number;
    user_lng: number;
    accuracy_m?: number;
    installation_id?: string;
    device_info?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id, action_type, user_lat, user_lng } = body;

  if (!project_id) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }
  if (!action_type || !(ALLOWED_ACTIONS as readonly string[]).includes(action_type)) {
    return NextResponse.json(
      { error: `action_type must be one of: ${ALLOWED_ACTIONS.join(', ')}` },
      { status: 400 }
    );
  }
  if (typeof user_lat !== 'number' || typeof user_lng !== 'number') {
    return NextResponse.json(
      { error: 'user_lat and user_lng must be numbers (GPS coordinates required)' },
      { status: 400 }
    );
  }
  if (Math.abs(user_lat) > 90 || Math.abs(user_lng) > 180) {
    return NextResponse.json({ error: 'GPS coordinates out of valid range' }, { status: 400 });
  }

  // ── Call Postgres RPC (authoritative server-side check) ───────
  const { data, error } = await supabase.rpc('validate_installer_location', {
    p_project_id:      project_id,
    p_user_lat:        user_lat,
    p_user_lng:        user_lng,
    p_action_type:     action_type,
    p_installation_id: body.installation_id ?? null,
    p_accuracy_m:      body.accuracy_m ?? null,
    p_device_info:     body.device_info ?? null,
  });

  if (error) {
    console.error('[geo-gate] RPC error:', error.message);
    return NextResponse.json(
      { error: 'Geolocation validation failed. Try again.' },
      { status: 500 }
    );
  }

  const result = data as {
    allowed: boolean;
    distance_meters: number;
    radius_meters: number;
    reason: string;
    missing_gps?: boolean;
  };

  // Return 403 when blocked so the client can display a clear error
  if (!result.allowed) {
    return NextResponse.json(
      {
        allowed: false,
        distance_meters: result.distance_meters,
        radius_meters: result.radius_meters,
        reason: result.reason,
        missing_gps: result.missing_gps ?? false,
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    allowed: true,
    distance_meters: result.distance_meters,
    radius_meters: result.radius_meters,
    reason: result.reason,
  });
}
