/**
 * Security Guardian Layer — Financial Protection Module
 *
 * Validates all financial amounts before any DB write.
 * Also provides in-process duplicate transaction detection.
 *
 * USAGE:
 *   import { guardFinancial } from '@/lib/security';
 *
 *   const fin = await guardFinancial({ amount: body.amount, projectId: body.project_id });
 *   if (!fin.ok) return fin.response;
 *   // fin.amount is validated, rounded to 2 decimal places
 *
 * RULES ENFORCED:
 *   1. Must be a finite real number (not NaN, not Infinity)
 *   2. Must be positive (> 0)
 *   3. Must be within realistic MAD bounds [0.01, 10_000_000]
 *   4. Must have at most 2 decimal places
 *   5. No duplicate transactions: same projectId + amount within 5 minutes
 */

import { NextResponse } from 'next/server';

// ── Constants ─────────────────────────────────────────────────────────────────

export const FINANCIAL_LIMITS = {
  MIN_AMOUNT: 0.01,
  MAX_AMOUNT: 10_000_000,   // 10 million MAD — prevents clearly erroneous entries
  DECIMAL_PLACES: 2,
  DUPLICATE_WINDOW_MS: 5 * 60 * 1000,   // 5 minutes
} as const;

// ── In-Process Duplicate Detection ───────────────────────────────────────────
//
// Key format: `${projectId}:${amount.toFixed(2)}`
// Value: timestamp of last submission
//
// NOTE: This Map lives in the Node.js process. Because PM2 runs a single
// `next dev` process, this is fully effective for the current deployment.
// For a multi-instance setup, replace with Redis (e.g. Upstash) using the
// same key/TTL pattern.
//
const recentTransactions = new Map<string, number>();

/** Remove stale entries to prevent unbounded memory growth */
function pruneExpired(): void {
  const cutoff = Date.now() - FINANCIAL_LIMITS.DUPLICATE_WINDOW_MS;
  for (const [key, ts] of recentTransactions) {
    if (ts < cutoff) recentTransactions.delete(key);
  }
}

// ── Result Types ──────────────────────────────────────────────────────────────

export type FinancialGuardResult =
  | { ok: true; amount: number }
  | { ok: false; response: NextResponse };

// ── Main Guard Function ───────────────────────────────────────────────────────

/**
 * Validates a financial amount for use in payment/expense routes.
 *
 * @param amount    Raw input (may be string from form or number from JSON)
 * @param projectId Optional — used for duplicate detection (per-project scope)
 * @param limits    Override default min/max MAD bounds
 */
export async function guardFinancial(params: {
  amount: unknown;
  projectId?: string | null;
  limits?: { min?: number; max?: number };
}): Promise<FinancialGuardResult> {
  const { amount: rawAmount, projectId, limits } = params;
  const min = limits?.min ?? FINANCIAL_LIMITS.MIN_AMOUNT;
  const max = limits?.max ?? FINANCIAL_LIMITS.MAX_AMOUNT;

  // ── 1. Type coercion + NaN/Infinity check ─────────────────────────────
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid amount', message: 'Amount must be a valid finite number' },
        { status: 400 }
      ),
    };
  }

  // ── 2. Positivity ─────────────────────────────────────────────────────
  if (amount <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid amount', message: 'Amount must be greater than zero' },
        { status: 400 }
      ),
    };
  }

  // ── 3. Realistic MAD bounds ───────────────────────────────────────────
  if (amount < min || amount > max) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Amount out of range',
          message: `Amount must be between ${min} and ${max.toLocaleString('fr-MA')} MAD`,
        },
        { status: 400 }
      ),
    };
  }

  // ── 4. Decimal precision — at most 2 decimal places ──────────────────
  const rounded = Math.round(amount * 100) / 100;
  if (Math.abs(rounded - amount) > 1e-9) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid amount', message: 'Amount cannot have more than 2 decimal places' },
        { status: 400 }
      ),
    };
  }

  // ── 5. Duplicate detection (per-project, 5-minute window) ─────────────
  if (projectId) {
    pruneExpired();
    const key = `${projectId}:${amount.toFixed(2)}`;
    const lastSeen = recentTransactions.get(key);
    if (lastSeen && Date.now() - lastSeen < FINANCIAL_LIMITS.DUPLICATE_WINDOW_MS) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'Duplicate transaction',
            message:
              'An identical transaction for this project was submitted within the last 5 minutes. ' +
              'Please wait before retrying.',
          },
          { status: 409 }
        ),
      };
    }
    recentTransactions.set(key, Date.now());
  }

  return { ok: true, amount: rounded };
}
