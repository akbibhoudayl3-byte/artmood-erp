/**
 * Financial Intelligence Layer — Per-Project Intelligence API
 *
 * GET /api/finance/intelligence/project/[id]
 *   Returns full financial intelligence for a single project:
 *   - P&L breakdown (sale price, costs, profit, margin)
 *   - Itemized cost breakdown (manual + auto-tracked)
 *   - Labor and overhead estimates
 *   - Profit health status
 *
 * CEO + commercial_manager (read own projects).
 */

import { NextResponse }                  from 'next/server';
import { createClient }                  from '@supabase/supabase-js';
import { guard }                         from '@/lib/security/guardian';
import { isValidUUID }                   from '@/lib/auth/server';
import {
  getProjectIntelligence,
  getProjectCostBreakdown,
  estimateLaborCost,
  estimateOverheadAllocation,
} from '@/lib/finance/intelligence/calculator';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await guard(['ceo', 'commercial_manager', 'workshop_manager']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;

  if (!isValidUUID(projectId)) {
    return NextResponse.json(
      { error: 'Invalid project ID' },
      { status: 400 },
    );
  }

  try {
    // Run all fetches in parallel
    const [intelligence, breakdown] = await Promise.all([
      getProjectIntelligence(adminClient, projectId),
      getProjectCostBreakdown(adminClient, projectId),
    ]);

    if (!intelligence) {
      return NextResponse.json(
        { error: 'Project not found or cancelled' },
        { status: 404 },
      );
    }

    // Fetch production order for labor estimation (if available)
    const { data: productionOrder } = await adminClient
      .from('production_orders')
      .select('started_at, completed_at')
      .eq('project_id', projectId)
      .not('started_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let laborEstimate = null;
    let overheadEstimate = null;

    if (productionOrder?.started_at) {
      // Get active project count for overhead split
      const { count: activeCount } = await adminClient
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("cancelled","delivered")');

      const [labor, overhead] = await Promise.all([
        estimateLaborCost(adminClient, {
          startedAt:   productionOrder.started_at,
          completedAt: productionOrder.completed_at,
          workerCount: 2, // default 2 workers
        }),
        estimateOverheadAllocation(adminClient, {
          productionDays: Math.max(1, Math.ceil(
            (new Date(productionOrder.completed_at ?? new Date()).getTime()
             - new Date(productionOrder.started_at).getTime())
            / (1000 * 60 * 60 * 24)
          )),
          activeProjects: activeCount ?? 1,
        }),
      ]);
      laborEstimate    = labor;
      overheadEstimate = overhead;
    }

    await ctx.audit({
      action:      'view_sensitive',
      entity_type: 'project_finance',
      entity_id:   projectId,
      notes:       `Project financial intelligence viewed for ${intelligence.client_name}`,
    });

    return NextResponse.json({
      intelligence,
      cost_breakdown:    breakdown,
      estimates: {
        labor:    laborEstimate,
        overhead: overheadEstimate,
      },
    });
  } catch (error) {
    console.error('[GET /api/finance/intelligence/project/[id]]', error);
    return NextResponse.json(
      { error: 'Failed to load project financial intelligence' },
      { status: 500 },
    );
  }
}
