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
 *   Every lead status change MUST call validateLeadTransition().
 *   Every station transition MUST call validateStationTransition().
 *   Every production run SHOULD call planConsumption() + recordActualConsumption().
 *   Production orders can ONLY be created from BOM (no manual creation).
 *   Material consumption can ONLY happen from production events (no manual entry).
 *   Installation completion REQUIRES all checklist items validated.
 *   Delivery REQUIRES invoice generated. Project is LOCKED after delivery.
 *   Integrity checks are run on demand (CEO) and after critical operations.
 */

// ── Project Workflow State Machine ────────────────────────────────────────────
export {
  validateProjectTransition,
  guardProjectTransition,
  isValidProjectTransition,
  getAvailableProjectTransitions,
  getProjectStatusLabel,
  getProjectStepIndex,
  VALID_PROJECT_TRANSITIONS,
  PROJECT_PIPELINE_ORDER,
  // Backward-compatible aliases
  isValidTransition,
  getAvailableTransitions,
  getStatusLabel,
  VALID_TRANSITIONS,
} from '@/lib/integrity/project-fsm';
export type { ProjectTransitionResult, TransitionResult } from '@/lib/integrity/project-fsm';

// ── Lead Pipeline State Machine ────────────────────────────────────────────────
export {
  validateLeadTransition,
  guardLeadTransition,
  isValidLeadTransition,
  isBypassTransition,
  getAvailableLeadTransitions,
  getLeadStatusLabel,
  VALID_LEAD_TRANSITIONS,
  LEAD_PIPELINE_ORDER,
  BYPASS_DISCLAIMER,
} from '@/lib/integrity/lead-fsm';
export type { LeadTransitionResult, LeadTransitionContext, MeasurementSource } from '@/lib/integrity/lead-fsm';

// ── Production Station State Machine ──────────────────────────────────────────
export {
  validateStationTransition,
  guardStationTransition,
  isValidStationTransition,
  getNextStations,
  getStationLabel,
  STATION_ORDER,
  VALID_STATION_TRANSITIONS,
} from '@/lib/integrity/production-station-fsm';
export type { StationTransitionResult } from '@/lib/integrity/production-station-fsm';

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
