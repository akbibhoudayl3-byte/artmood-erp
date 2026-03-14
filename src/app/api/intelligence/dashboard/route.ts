/**
 * Financial Intelligence Layer — Factory Dashboard API
 *
 * GET /api/finance/intelligence/dashboard?period=30d|90d|ytd
 *
 * CEO only.
 * Returns complete factory financial dashboard:
 *   - Summary KPIs (revenue, costs, profit, margin)
 *   - 12-month P&L trend
 *   - All projects intelligence (sorted by profit)
 *   - Loss-making projects
 *   - Warning projects (low margin)
 */

import { NextResponse }           from 'next/server';
import { createClient }           from '@supabase/supabase-js';
import { guard }                  from '@/lib/security/guardian';
import { getFactoryDashboard }    from '@/lib/finance/intelligence/calculator';

// Service-role client for unfiltered analytics
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(request: Request) {
  // ── CEO only — most sensitive financial data ─────────────────────────────
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? '30d') as '30d' | '90d' | 'ytd';

  if (!['30d', '90d', 'ytd'].includes(period)) {
    return NextResponse.json(
      { error: 'Invalid period', message: 'period must be 30d, 90d, or ytd' },
      { status: 400 },
    );
  }

  try {
    const dashboard = await getFactoryDashboard(adminClient, period);

    await ctx.audit({
      action:      'view_sensitive',
      entity_type: 'finance_intelligence',
      notes:       `Factory financial dashboard viewed (period: ${period})`,
    });

    return NextResponse.json({
      period,
      generated_at:     new Date().toISOString(),
      summary:          dashboard.summary,
      monthly_pl:       dashboard.monthlyPL,
      projects_count:   dashboard.projectsIntel.length,
      loss_projects:    dashboard.lossProjects,
      warning_projects: dashboard.warningProjects,
      top_projects:     dashboard.topProjects,
      all_projects:     dashboard.projectsIntel,
    });
  } catch (error) {
    console.error('[GET /api/finance/intelligence/dashboard]', error);
    return NextResponse.json(
      { error: 'Failed to load financial dashboard' },
      { status: 500 },
    );
  }
}
