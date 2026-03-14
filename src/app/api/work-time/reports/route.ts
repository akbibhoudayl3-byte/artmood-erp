import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/work-time/reports
 *
 * Reports on worked time. Role-gated:
 *   worker / designer / installer → own data only
 *   workshop_manager              → team data
 *   operations_manager / ceo / owner_admin → all data
 *
 * Query params:
 *   type    'employee' | 'project' | 'stage' | 'daily'
 *   from    ISO date string (YYYY-MM-DD), default: 7 days ago
 *   to      ISO date string (YYYY-MM-DD), default: today
 *   user_id specific employee (managers only)
 *   project_id specific project filter
 *
 * Deploy to: src/app/api/work-time/reports/route.ts
 */

const MANAGER_ROLES = ['owner_admin','ceo','operations_manager','workshop_manager','hr_manager'];

export async function GET(req: NextRequest) {
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

  const isManager = MANAGER_ROLES.includes(profile.role);

  const { searchParams } = new URL(req.url);
  const type      = searchParams.get('type') ?? 'daily';
  const rawFrom   = searchParams.get('from');
  const rawTo     = searchParams.get('to');
  const reqUserId = searchParams.get('user_id');
  const projectId = searchParams.get('project_id');

  // Default date range: last 7 days
  const toDate   = rawTo   ? new Date(rawTo)   : new Date();
  const fromDate = rawFrom ? new Date(rawFrom) : new Date(Date.now() - 7 * 86_400_000);
  const fromISO  = fromDate.toISOString().split('T')[0] + 'T00:00:00Z';
  const toISO    = toDate.toISOString().split('T')[0]   + 'T23:59:59Z';

  // Scope: managers can query any user, others see only own data
  const scopedUserId = isManager ? (reqUserId ?? null) : user.id;

  // ── Report: daily attendance + worked hours ────────────────────────────────
  if (type === 'daily') {
    let q = supabase
      .from('v_work_daily_summary')
      .select('*')
      .gte('work_date', fromDate.toISOString().split('T')[0])
      .lte('work_date', toDate.toISOString().split('T')[0])
      .order('work_date', { ascending: false });

    if (scopedUserId) q = q.eq('user_id', scopedUserId);

    const { data, error } = await q.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: 'daily', from: fromISO, to: toISO, rows: data ?? [] });
  }

  // ── Report: hours per employee ────────────────────────────────────────────
  if (type === 'employee') {
    let q = supabase
      .from('work_sessions')
      .select('user_id, task_type, workflow_stage, location_type, total_minutes, started_at, profiles!inner(full_name, role)')
      .eq('status', 'finished')
      .gte('started_at', fromISO)
      .lte('started_at', toISO);

    if (scopedUserId) q = q.eq('user_id', scopedUserId);
    if (projectId)    q = q.eq('project_id', projectId);

    const { data, error } = await q.limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aggregate client-side
    const byEmployee: Record<string, {
      user_id: string; employee_name: string; role: string;
      total_minutes: number; company_minutes: number; client_minutes: number;
      session_count: number; task_breakdown: Record<string, number>;
    }> = {};

    for (const row of (data ?? [])) {
      const uid  = row.user_id;
      const prof = (row as any).profiles;
      if (!byEmployee[uid]) {
        byEmployee[uid] = {
          user_id:         uid,
          employee_name:   prof?.full_name ?? 'Unknown',
          role:            prof?.role ?? '',
          total_minutes:   0,
          company_minutes: 0,
          client_minutes:  0,
          session_count:   0,
          task_breakdown:  {},
        };
      }
      const mins = row.total_minutes ?? 0;
      byEmployee[uid].total_minutes   += mins;
      byEmployee[uid].session_count   += 1;
      if (row.location_type === 'client')  byEmployee[uid].client_minutes  += mins;
      else                                 byEmployee[uid].company_minutes  += mins;
      const stage = row.workflow_stage ?? row.task_type;
      byEmployee[uid].task_breakdown[stage] = (byEmployee[uid].task_breakdown[stage] ?? 0) + mins;
    }

    return NextResponse.json({
      type: 'employee', from: fromISO, to: toISO,
      rows: Object.values(byEmployee).sort((a, b) => b.total_minutes - a.total_minutes),
    });
  }

  // ── Report: hours per project ─────────────────────────────────────────────
  if (type === 'project') {
    let q = supabase
      .from('work_sessions')
      .select('project_id, task_type, workflow_stage, location_type, total_minutes, user_id, projects(reference_code, client_name)')
      .eq('status', 'finished')
      .not('project_id', 'is', null)
      .gte('started_at', fromISO)
      .lte('started_at', toISO);

    if (scopedUserId) q = q.eq('user_id', scopedUserId);
    if (projectId)    q = q.eq('project_id', projectId);

    const { data, error } = await q.limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byProject: Record<string, {
      project_id: string; reference_code: string; client_name: string;
      total_minutes: number; session_count: number; employee_count: Set<string>;
      stages: Record<string, number>;
    }> = {};

    for (const row of (data ?? [])) {
      const pid  = row.project_id!;
      const proj = (row as any).projects;
      if (!byProject[pid]) {
        byProject[pid] = {
          project_id:    pid,
          reference_code: proj?.reference_code ?? '—',
          client_name:    proj?.client_name    ?? '—',
          total_minutes:  0,
          session_count:  0,
          employee_count: new Set(),
          stages:         {},
        };
      }
      const mins = row.total_minutes ?? 0;
      byProject[pid].total_minutes  += mins;
      byProject[pid].session_count  += 1;
      byProject[pid].employee_count.add(row.user_id);
      const stage = row.workflow_stage ?? row.task_type;
      byProject[pid].stages[stage] = (byProject[pid].stages[stage] ?? 0) + mins;
    }

    const rows = Object.values(byProject)
      .map(r => ({ ...r, employee_count: r.employee_count.size }))
      .sort((a, b) => b.total_minutes - a.total_minutes);

    return NextResponse.json({ type: 'project', from: fromISO, to: toISO, rows });
  }

  // ── Report: hours per workflow stage ─────────────────────────────────────
  if (type === 'stage') {
    let q = supabase
      .from('work_sessions')
      .select('task_type, workflow_stage, location_type, total_minutes, user_id')
      .eq('status', 'finished')
      .gte('started_at', fromISO)
      .lte('started_at', toISO);

    if (scopedUserId) q = q.eq('user_id', scopedUserId);
    if (projectId)    q = q.eq('project_id', projectId);

    const { data, error } = await q.limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byStage: Record<string, {
      stage: string; task_type: string; location_type: string;
      total_minutes: number; session_count: number; employee_count: Set<string>;
    }> = {};

    for (const row of (data ?? [])) {
      const stage = row.workflow_stage ?? row.task_type;
      const key   = `${stage}::${row.location_type}`;
      if (!byStage[key]) {
        byStage[key] = {
          stage, task_type: row.task_type, location_type: row.location_type,
          total_minutes: 0, session_count: 0, employee_count: new Set(),
        };
      }
      byStage[key].total_minutes  += row.total_minutes ?? 0;
      byStage[key].session_count  += 1;
      byStage[key].employee_count.add(row.user_id);
    }

    const rows = Object.values(byStage)
      .map(r => ({ ...r, employee_count: r.employee_count.size }))
      .sort((a, b) => b.total_minutes - a.total_minutes);

    return NextResponse.json({ type: 'stage', from: fromISO, to: toISO, rows });
  }

  return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
}
