/**
 * Data Integrity Engine — Unified Export
 *
 * All integrity functions available from a single import:
 *   import { validateProjectTransition, guardProjectTransition,
 *            runIntegrityChecks, planConsumption, recordActualConsumption,
 *            checkProjectFinancials, scanFinancialAnomalies } from '@/lib/integrity';
 *
 * LAYER HIERARCHY:
 *
 *   Security Guardian Layer (@/lib/security)
 *     └─ guard()           ← auth + RBAC + audit
 *         └─ DATA INTEGRITY ENGINE (@/lib/integrity)
 *             ├─ validateProjectTransition()  ← project state machine
 *             ├─ planConsumption()            ← pre-production material planning
 *             ├─ recordActualConsumption()    ← post-production actual recording
 *             ├─ runIntegrityChecks()         ← full DB integrity scan → notifications
 *             └─ checkProjectFinancials()     ← financial consistency per project
 *
 * PERMANENT POLICY:
 *   Every project status change MUST call validateProjectTransition().
 *   Every production run SHOULD call planConsumption() + recordActualConsumption().
 *   Integrity checks are run on demand (CEO) and after critical operations.
 */

// ── Project State Machine ─────────────────────────────────────────────────────
export {
  validateProjectTransition,
  guardProjectTransition,
  isValidTransition,
  getAvailableTransitions,
  getStatusLabel,
  VALID_TRANSITIONS,
} from '@/lib/integrity/project-fsm';
export type { TransitionResult } from '@/lib/integrity/project-fsm';

// ── Production Consumption Tracker ────────────────────────────────────────────
export {
  planConsumption,
  recordActualConsumption,
  getConsumptionReport,
} from '@/lib/integrity/consumption';
export type {
  ConsumptionPlanItem,
  ConsumptionRecord,
  ConsumptionReport,
  ConsumptionResult,
} from '@/lib/integrity/consumption';

// ── Alert Engine ──────────────────────────────────────────────────────────────
export {
  runIntegrityChecks,
  getActiveIntegrityAlerts,
  createIntegrityAlert,
} from '@/lib/integrity/alerts';
export type {
  IntegrityAlert,
  IntegrityCheckResult,
} from '@/lib/integrity/alerts';

// ── Financial Consistency ─────────────────────────────────────────────────────
export {
  checkProjectFinancials,
  scanFinancialAnomalies,
  validatePaymentData,
} from '@/lib/integrity/financial-check';
export type {
  FinancialCheck,
  ProjectFinancialResult,
  FinancialAnomaly,
} from '@/lib/integrity/financial-check';
