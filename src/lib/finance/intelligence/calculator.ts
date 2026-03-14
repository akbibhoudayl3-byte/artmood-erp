/**
 * Financial Intelligence Layer — Core Calculator
 *
 * Wraps all SQL views and functions into clean TypeScript functions.
 * All heavy computation happens in PostgreSQL (views + functions).
 * This layer handles calling, caching hints, and result shaping.
 *
 * USAGE:
 *   import { getProjectIntelligence, getFactoryDashboard } from '@/lib/finance/intelligence';
 *
 *   const intel = await getProjectIntelligence(supabase, projectId);
 *   // intel.margin_percent, intel.profit_health, intel.total_project_costs, etc.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProfitHealth = 'healthy' | 'warning' | 'critical' | 'loss' | 'uncalculated';

export interface ProjectFinancialIntelligence {
  id:                      string;
  reference_code:          string | null;
  client_name:             string;
  status:                  string;
  project_type:            string;
  sale_price:              number;
  paid_amount:             number;
  revenue:                 number;
  material_cost_consumed:  number;
  material_cost_manual:    number;
  labor_cost:              number;
  transport_cost:          number;
  installation_cost:       number;
  overhead_cost:           number;
  other_cost:              number;
  total_project_costs:     number;
  total_material_cost:     number;
  estimated_profit:        number;
  margin_percent:          number;
  cost_ratio_percent:      number;
  profit_health:           ProfitHealth;
  created_at:              string;
  estimated_production_end: string | null;
  actual_delivery_date:    string | null;
}

export interface CostBreakdownItem {
  source:      'manual' | 'auto_consumption';
  cost_type:   string;
  description: string;
  amount:      number;
  quantity:    number;
  unit_price:  number | null;
  created_at:  string;
}

export interface MonthlyPL {
  month:                string;
  total_income:         number;
  total_expenses:       number;
  production_costs:     number;
  gross_profit:         number;
  net_profit:           number;
  payment_count:        number;
  expense_count:        number;
  gross_margin_percent: number;
}

export interface FactorySummaryMetric {
  metric: string;
  value:  number;
  label:  string;
}

export interface FactoryDashboard {
  summary:          Record<string, number>;
  monthlyPL:        MonthlyPL[];
  projectsIntel:    ProjectFinancialIntelligence[];
  topProjects:      ProjectFinancialIntelligence[];
  lossProjects:     ProjectFinancialIntelligence[];
  warningProjects:  ProjectFinancialIntelligence[];
}

// ── Project-Level Intelligence ─────────────────────────────────────────────

/**
 * Returns full financial intelligence for a single project.
 * Uses v_project_financial_intelligence VIEW.
 */
export async function getProjectIntelligence(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectFinancialIntelligence | null> {
  const { data, error } = await supabase
    .from('v_project_financial_intelligence')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('[getProjectIntelligence]', error.message);
    return null;
  }

  return data as ProjectFinancialIntelligence;
}

/**
 * Returns detailed cost breakdown for a project (manual + auto-tracked).
 * Uses get_project_cost_breakdown() SQL function.
 */
export async function getProjectCostBreakdown(
  supabase: SupabaseClient,
  projectId: string,
): Promise<CostBreakdownItem[]> {
  const { data, error } = await supabase
    .rpc('get_project_cost_breakdown', { p_project_id: projectId });

  if (error) {
    console.error('[getProjectCostBreakdown]', error.message);
    return [];
  }

  return (data ?? []) as CostBreakdownItem[];
}

// ── Factory-Level Intelligence ─────────────────────────────────────────────

/**
 * Returns all projects with financial intelligence, sorted by profit.
 * Excludes cancelled projects.
 */
export async function getAllProjectsIntelligence(
  supabase: SupabaseClient,
  limit = 100,
): Promise<ProjectFinancialIntelligence[]> {
  const { data, error } = await supabase
    .from('v_project_financial_intelligence')
    .select('*')
    .order('estimated_profit', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[getAllProjectsIntelligence]', error.message);
    return [];
  }

  return (data ?? []) as ProjectFinancialIntelligence[];
}

/**
 * Returns 12-month factory P&L from v_factory_monthly_pl VIEW.
 */
export async function getMonthlyPL(
  supabase: SupabaseClient,
): Promise<MonthlyPL[]> {
  const { data, error } = await supabase
    .from('v_factory_monthly_pl')
    .select('*')
    .order('month', { ascending: true });

  if (error) {
    console.error('[getMonthlyPL]', error.message);
    return [];
  }

  return (data ?? []) as MonthlyPL[];
}

/**
 * Returns factory-wide financial KPIs for a date range.
 * Uses get_factory_financial_summary() SQL function.
 */
export async function getFactoryFinancialSummary(
  supabase: SupabaseClient,
  startDate?: string,
  endDate?: string,
): Promise<Record<string, number>> {
  const params: Record<string, string> = {};
  if (startDate) params['p_start_date'] = startDate;
  if (endDate)   params['p_end_date']   = endDate;

  const { data, error } = await supabase
    .rpc('get_factory_financial_summary', params);

  if (error) {
    console.error('[getFactoryFinancialSummary]', error.message);
    return {};
  }

  const metrics = (data ?? []) as FactorySummaryMetric[];
  return Object.fromEntries(metrics.map(m => [m.metric, Number(m.value)]));
}

/**
 * Assembles the complete factory financial dashboard in parallel.
 */
export async function getFactoryDashboard(
  supabase: SupabaseClient,
  period: '30d' | '90d' | 'ytd' = '30d',
): Promise<FactoryDashboard> {
  const now = new Date();
  let startDate: string;

  if (period === '30d') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
  } else if (period === '90d') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
  } else {
    // Year to date
    startDate = `${now.getFullYear()}-01-01`;
  }
  const endDate = now.toISOString().split('T')[0];

  // Run all queries in parallel
  const [summary, monthlyPL, projectsIntel] = await Promise.all([
    getFactoryFinancialSummary(supabase, startDate, endDate),
    getMonthlyPL(supabase),
    getAllProjectsIntelligence(supabase),
  ]);

  // Categorize projects by health
  const lossProjects    = projectsIntel.filter(p => p.profit_health === 'loss');
  const warningProjects = projectsIntel.filter(p => ['critical', 'warning'].includes(p.profit_health));
  const topProjects     = [...projectsIntel]
    .filter(p => p.total_project_costs > 0)
    .sort((a, b) => b.margin_percent - a.margin_percent)
    .slice(0, 10);

  return {
    summary,
    monthlyPL,
    projectsIntel,
    topProjects,
    lossProjects,
    warningProjects,
  };
}

// ── Cost Entry Management ─────────────────────────────────────────────────────

export interface AddCostParams {
  projectId:    string;
  costType:     'material' | 'labor' | 'transport' | 'installation' | 'subcontract' | 'overhead' | 'other';
  description:  string;
  amount:       number;
  quantity?:    number;
  unitPrice?:   number;
  supplierId?:  string | null;
  stockItemId?: string | null;
}

export interface AddCostResult {
  ok:       boolean;
  data?:    Record<string, unknown>;
  error?:   string;
}

/**
 * Adds a manual cost entry to a project.
 * Validates amount and cost_type before inserting.
 */
export async function addProjectCost(
  supabase: SupabaseClient,
  userId: string,
  params: AddCostParams,
): Promise<AddCostResult> {
  const { projectId, costType, description, amount, quantity, unitPrice, supplierId, stockItemId } = params;

  // Validate
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: 'Amount must be a non-negative number' };
  }
  if (!description?.trim()) {
    return { ok: false, error: 'Description is required' };
  }

  const validTypes = ['material', 'labor', 'transport', 'installation', 'subcontract', 'overhead', 'other'];
  if (!validTypes.includes(costType)) {
    return { ok: false, error: `Invalid cost type: ${costType}` };
  }

  const { data, error } = await supabase
    .from('project_costs')
    .insert({
      project_id:    projectId,
      cost_type:     costType,
      description:   description.trim(),
      amount,
      quantity:      quantity ?? 1,
      unit_price:    unitPrice ?? null,
      supplier_id:   supplierId ?? null,
      stock_item_id: stockItemId ?? null,
      created_by:    userId,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as Record<string, unknown> };
}

// ── Labor Cost Estimator ──────────────────────────────────────────────────────

/**
 * Estimates labor cost from production order duration and worker count.
 * Uses finance_settings.labor_daily_rate_mad as the daily rate.
 */
export async function estimateLaborCost(
  supabase: SupabaseClient,
  params: {
    startedAt:    string;
    completedAt?: string | null;
    workerCount?: number;
  },
): Promise<{ estimated: number; dailyRate: number; days: number; workers: number }> {
  // Get configurable daily rate
  const { data: rateRow } = await supabase
    .from('finance_settings')
    .select('value')
    .eq('key', 'labor_daily_rate_mad')
    .single();

  const dailyRate  = Number(rateRow?.value ?? 300);
  const workers    = params.workerCount ?? 1;
  const startDate  = new Date(params.startedAt);
  const endDate    = params.completedAt ? new Date(params.completedAt) : new Date();
  const days       = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const estimated  = days * workers * dailyRate;

  return { estimated, dailyRate, days, workers };
}

// ── Overhead Allocator ────────────────────────────────────────────────────────

/**
 * Computes overhead allocation for a project based on production duration.
 * Uses recent expense history to calculate average daily overhead.
 */
export async function estimateOverheadAllocation(
  supabase: SupabaseClient,
  params: {
    productionDays: number;
    activeProjects?: number;
  },
): Promise<{ allocated: number; dailyRate: number }> {
  // Get configurable overhead rate
  const { data: rateRow } = await supabase
    .from('finance_settings')
    .select('value')
    .eq('key', 'overhead_daily_rate_mad')
    .single();

  const baseRate     = Number(rateRow?.value ?? 200);
  const projects     = Math.max(1, params.activeProjects ?? 1);
  const dailyRate    = baseRate / projects; // split among active projects
  const allocated    = dailyRate * params.productionDays;

  return { allocated: Math.round(allocated * 100) / 100, dailyRate };
}
