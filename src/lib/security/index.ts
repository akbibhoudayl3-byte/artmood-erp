/**
 * Security Guardian Layer — Unified Export
 *
 * All security functions are available from a single import:
 *   import { guard, guardFinancial, guardStock, safeInsert, safeUpdate } from '@/lib/security';
 *
 * This replaces all scattered imports from:
 *   @/lib/auth/server      (requireRole, isValidUUID, sanitizeString, sanitizeNumber)
 *   @/lib/security/audit   (writeAuditLog, clientAudit)
 *
 * LAYER HIERARCHY:
 *
 *   guard()                ← authentication + RBAC + pre-bound audit
 *     ├─ guardFinancial()  ← amount validation + duplicate detection
 *     ├─ guardStock()      ← stock sufficiency check + audit
 *     ├─ safeInsert()      ← duplicate check + FK check + audit
 *     └─ safeUpdate()      ← before-snapshot + update + audit
 *
 * PERMANENT POLICY:
 *   Every new API route must call guard() as its first statement.
 *   Every financial write must call guardFinancial().
 *   Every stock deduction must call guardStock().
 */

// ── Security Guardian core ────────────────────────────────────────────────────
export { guard } from '@/lib/security/guardian';
export type { GuardContext, AuditAction } from '@/lib/security/guardian';

// ── Financial protection ──────────────────────────────────────────────────────
export { guardFinancial, FINANCIAL_LIMITS } from '@/lib/security/financial-guard';
export type { FinancialGuardResult } from '@/lib/security/financial-guard';

// ── Stock integrity ───────────────────────────────────────────────────────────
export { guardStock } from '@/lib/security/stock-guard';
export type { StockGuardResult } from '@/lib/security/stock-guard';

// ── Safe database operations ──────────────────────────────────────────────────
export { safeInsert, safeUpdate } from '@/lib/security/db-guard';
export type { DbGuardResult, UniqueCheck, FkCheck } from '@/lib/security/db-guard';

// ── Audit primitives (for direct use when guard() context is not available) ───
export { writeAuditLog, clientAudit } from '@/lib/security/audit';
export type { AuditPayload } from '@/lib/security/audit';

// ── Input validation (re-exported for convenience) ───────────────────────────
export { isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';
