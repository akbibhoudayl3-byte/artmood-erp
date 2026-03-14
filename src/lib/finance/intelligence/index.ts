/**
 * Financial Intelligence Layer — Unified Export
 *
 * All financial intelligence functions available from a single import:
 *   import {
 *     getProjectIntelligence, getFactoryDashboard,
 *     getProjectCostBreakdown, addProjectCost,
 *     estimateLaborCost, estimateOverheadAllocation,
 *   } from '@/lib/finance/intelligence';
 *
 * LAYER HIERARCHY:
 *   Security Guardian (@/lib/security)
 *     └─ guard() ← auth + RBAC
 *         └─ Data Integrity Engine (@/lib/integrity)
 *             └─ FINANCIAL INTELLIGENCE LAYER (@/lib/finance/intelligence)
 *                 ├─ getProjectIntelligence()      ← per-project P&L
 *                 ├─ getFactoryDashboard()          ← factory-wide analytics
 *                 ├─ getProjectCostBreakdown()      ← itemized cost detail
 *                 ├─ addProjectCost()               ← record a cost entry
 *                 ├─ estimateLaborCost()            ← labor cost from production duration
 *                 └─ estimateOverheadAllocation()   ← overhead distribution
 *
 * PERMANENT POLICY:
 *   Every project cost must be recorded via addProjectCost() (auto-audited).
 *   Dashboard data comes from SQL views — never computed ad-hoc in JS.
 *   All financial reads are CEO-only or workshop_manager-limited.
 */

export {
  getProjectIntelligence,
  getProjectCostBreakdown,
  getAllProjectsIntelligence,
  getMonthlyPL,
  getFactoryFinancialSummary,
  getFactoryDashboard,
  addProjectCost,
  estimateLaborCost,
  estimateOverheadAllocation,
} from '@/lib/finance/intelligence/calculator';

export type {
  ProjectFinancialIntelligence,
  CostBreakdownItem,
  MonthlyPL,
  FactorySummaryMetric,
  FactoryDashboard,
  AddCostParams,
  AddCostResult,
  ProfitHealth,
} from '@/lib/finance/intelligence/calculator';
