-- ============================================================================
-- Migration: Normalize project statuses + add CHECK constraint
-- Date: 2026-03-23
-- Problem: DB has legacy status values (design_validated, in_production)
--          that don't match the app's FSM (client_validation, production).
--          Also, NO check constraint exists — any garbage value is accepted.
-- ============================================================================

BEGIN;

-- ── Step 1: Normalize legacy status values ──────────────────────────────────
-- design_validated → client_validation  (20 rows expected)
-- in_production   → production          (10 rows expected)

UPDATE projects SET status = 'client_validation', updated_at = now()
WHERE status = 'design_validated';

UPDATE projects SET status = 'production', updated_at = now()
WHERE status = 'in_production';

-- ── Step 2: Drop any existing constraint (safe idempotent) ──────────────────
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- ── Step 3: Add strict CHECK constraint matching the app FSM ────────────────
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (
  status IN (
    'measurements',
    'measurements_confirmed',
    'design',
    'client_validation',
    'production',
    'installation',
    'delivered',
    'cancelled'
  )
);

COMMIT;
