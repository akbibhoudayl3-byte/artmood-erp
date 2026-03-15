// ============================================================
// ArtMood Factory OS -- Project Cost Calculator (pure utilities)
// ============================================================
//
// Extracted from the duplicated cost / profitability logic in:
//   - projects/[id]/page.tsx   (payment progress bar)
//   - projects/[id]/costs/page.tsx (profitability summary + cost breakdown)
//
// All functions are pure -- no React, no Supabase, no side effects.
// ============================================================

import type { Project, ProjectCost, CostType } from '@/types/crm';
import type { Payment } from '@/types/finance';

// ---------------------------------------------------------------------------
// Profitability
// ---------------------------------------------------------------------------

export interface ProfitabilityResult {
  /** project.total_amount */
  totalRevenue: number;
  /** Sum of all cost entries */
  totalCosts: number;
  /** totalRevenue - totalCosts */
  profit: number;
  /** (profit / totalRevenue) * 100, or 0 when revenue is 0 */
  marginPercent: number;
  /** Sum of cost.amount grouped by cost_type */
  costBreakdown: Record<string, number>;
}

/**
 * Calculates project profitability from raw cost entries.
 *
 * Mirrors the logic in `costs/page.tsx`:
 * ```
 * const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
 * const profit = revenue - totalCost;
 * const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
 * ```
 */
export function calculateProjectProfitability(
  project: Pick<Project, 'total_amount'>,
  costs: Pick<ProjectCost, 'amount' | 'cost_type'>[],
): ProfitabilityResult {
  const totalRevenue = project.total_amount ?? 0;
  const totalCosts = costs.reduce((sum, c) => sum + c.amount, 0);
  const profit = totalRevenue - totalCosts;
  const marginPercent = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

  const costBreakdown: Record<string, number> = {};
  for (const c of costs) {
    const key = c.cost_type ?? 'other';
    costBreakdown[key] = (costBreakdown[key] ?? 0) + c.amount;
  }

  return { totalRevenue, totalCosts, profit, marginPercent, costBreakdown };
}

// ---------------------------------------------------------------------------
// Payment Progress
// ---------------------------------------------------------------------------

export interface PaymentProgressResult {
  /** Sum of all payment amounts */
  totalPaid: number;
  /** project.total_amount (what is owed) */
  totalDue: number;
  /** (totalPaid / totalDue) * 100, clamped to 0 when totalDue is 0 */
  percentPaid: number;
  /** Whether the 50 % deposit milestone flag is true */
  depositPaid: boolean;
  /** Whether the 90 % pre-install milestone flag is true */
  preInstallPaid: boolean;
  /** Whether the 100 % final milestone flag is true */
  finalPaid: boolean;
}

/**
 * Computes payment progress for a project.
 *
 * Mirrors the progress bar logic in `projects/[id]/page.tsx`:
 * ```
 * const paymentPct = project.total_amount > 0
 *   ? Math.round((project.paid_amount / project.total_amount) * 100)
 *   : 0;
 * ```
 *
 * Also surfaces the three milestone flags already stored on the project row
 * (`deposit_paid`, `pre_install_paid`, `final_paid`).
 */
export function calculatePaymentProgress(
  project: Pick<Project, 'total_amount' | 'paid_amount' | 'deposit_paid' | 'pre_install_paid' | 'final_paid'>,
  payments: Pick<Payment, 'amount'>[] = [],
): PaymentProgressResult {
  // Use project.paid_amount as the canonical total (kept in sync by DB triggers / service layer).
  // The payments array is accepted for callers that want to derive the total themselves.
  const totalPaid = payments.length > 0
    ? payments.reduce((sum, p) => sum + p.amount, 0)
    : project.paid_amount;

  const totalDue = project.total_amount ?? 0;
  const percentPaid = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  return {
    totalPaid,
    totalDue,
    percentPaid,
    depositPaid: project.deposit_paid ?? false,
    preInstallPaid: project.pre_install_paid ?? false,
    finalPaid: project.final_paid ?? false,
  };
}

// ---------------------------------------------------------------------------
// Margin health label (reusable)
// ---------------------------------------------------------------------------

export type MarginHealth = 'healthy' | 'warning' | 'critical' | 'loss';

/**
 * Determine margin health tier based on marginPercent.
 * Mirrors the thresholds used in the performance page P&L tab.
 */
export function getMarginHealth(marginPercent: number): MarginHealth {
  if (marginPercent < 0) return 'loss';
  if (marginPercent < 10) return 'critical';
  if (marginPercent < 20) return 'warning';
  return 'healthy';
}
