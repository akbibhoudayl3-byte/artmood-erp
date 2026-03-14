/**
 * Data Integrity Engine — Financial Consistency Module
 *
 * Cross-checks financial data across projects, payments, and expenses.
 *
 * CHECKS:
 *   1. Sum of payments matches project.paid_amount
 *   2. paid_amount ≤ total_amount (no overpayment)
 *   3. final_paid=true → a 'final' payment record exists
 *   4. deposit_paid=true → a 'deposit' payment record exists
 *   5. Scans all active projects for financial anomalies
 *
 * All checks delegate to the check_project_financials(uuid) SQL function
 * (handles precision comparison safely in PostgreSQL).
 *
 * USAGE — Check a single project:
 *   import { checkProjectFinancials } from '@/lib/integrity';
 *
 *   const result = await checkProjectFinancials({ supabase, projectId });
 *   if (!result.allPassed) {
 *     // result.failures[] contains violation details
 *   }
 *
 * USAGE — Scan all projects:
 *   const anomalies = await scanFinancialAnomalies({ supabase });
 *   // anomalies[] = projects with financial violations
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FinancialCheck {
  check_name: string;
  passed:     boolean;
  message:    string;
}

export interface ProjectFinancialResult {
  projectId:  string;
  allPassed:  boolean;
  checks:     FinancialCheck[];
  failures:   FinancialCheck[];
}

export interface FinancialAnomaly {
  projectId:    string;
  clientName:   string;
  referenceCode: string | null;
  status:       string;
  violations:   string[];
}

// ── Single Project Check ──────────────────────────────────────────────────────

/**
 * Runs all financial consistency checks for a single project.
 * Delegates to the check_project_financials() SQL function.
 */
export async function checkProjectFinancials(opts: {
  supabase: SupabaseClient;
  projectId: string;
}): Promise<ProjectFinancialResult> {
  const { supabase, projectId } = opts;

  const { data, error } = await supabase
    .rpc('check_project_financials', { p_project_id: projectId });

  if (error) {
    console.error('[checkProjectFinancials] RPC failed:', error.message);
    return {
      projectId,
      allPassed: false,
      checks:    [],
      failures:  [{ check_name: 'rpc_error', passed: false, message: error.message }],
    };
  }

  const checks = (data ?? []) as FinancialCheck[];
  const failures = checks.filter(c => !c.passed);

  return {
    projectId,
    allPassed: failures.length === 0,
    checks,
    failures,
  };
}

// ── Full Scan ─────────────────────────────────────────────────────────────────

/**
 * Scans all non-cancelled projects for financial anomalies.
 * Returns only projects with violations.
 *
 * This is an expensive operation — use sparingly (triggered by CEO, scheduled jobs).
 */
export async function scanFinancialAnomalies(opts: {
  supabase: SupabaseClient;
  /** Max number of projects to scan (default: 200) */
  limit?: number;
}): Promise<FinancialAnomaly[]> {
  const { supabase, limit = 200 } = opts;

  // Fetch all active projects
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, client_name, reference_code, status, total_amount, paid_amount')
    .not('status', 'in', '("cancelled","delivered")')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (projErr || !projects) {
    console.error('[scanFinancialAnomalies] Could not fetch projects:', projErr?.message);
    return [];
  }

  const anomalies: FinancialAnomaly[] = [];

  // Check each project — run in parallel (batches of 10)
  const BATCH = 10;
  for (let i = 0; i < projects.length; i += BATCH) {
    const batch = projects.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(p => checkProjectFinancials({ supabase, projectId: p.id }))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (!result.allPassed) {
        anomalies.push({
          projectId:     batch[j].id,
          clientName:    batch[j].client_name,
          referenceCode: batch[j].reference_code,
          status:        batch[j].status,
          violations:    result.failures.map(f => f.message),
        });
      }
    }
  }

  return anomalies;
}

// ── Quick Inline Checks (no DB) ───────────────────────────────────────────────

/**
 * Fast in-memory financial sanity check for use in payment/expense API handlers.
 * Call before inserting a payment to catch obvious errors immediately.
 */
export function validatePaymentData(opts: {
  amount: number;
  projectTotalAmount: number;
  projectPaidAmount: number;
  paymentType: 'deposit' | 'pre_installation' | 'final' | 'other';
}): { valid: boolean; violations: string[] } {
  const { amount, projectTotalAmount, projectPaidAmount, paymentType } = opts;
  const violations: string[] = [];

  if (!Number.isFinite(amount) || amount <= 0) {
    violations.push('Payment amount must be a positive number');
  }

  if (projectTotalAmount > 0 && amount > projectTotalAmount) {
    violations.push(
      `Payment amount (${amount}) exceeds project total (${projectTotalAmount})`
    );
  }

  const newPaidTotal = projectPaidAmount + amount;
  if (projectTotalAmount > 0 && newPaidTotal > projectTotalAmount * 1.01) {
    // Allow 1% tolerance for rounding
    violations.push(
      `This payment would result in overpayment: ` +
      `paid=${newPaidTotal.toFixed(2)} > total=${projectTotalAmount.toFixed(2)}`
    );
  }

  // Warn about unexpected payment types (not an error, just a flag)
  if (paymentType === 'final' && projectPaidAmount < projectTotalAmount * 0.5) {
    violations.push(
      'Warning: marking as final payment but less than 50% has been paid'
    );
  }

  return { valid: violations.length === 0, violations };
}
