-- ============================================================================
-- Migration: Clean up historical duplicate rows in project_events
-- Date: 2026-03-23
-- Applied via Supabase SQL Editor on 2026-03-23
--
-- Context: The duplicate trigger (trg_log_project_status) was already dropped
-- in migration 005. This migration cleans up the 145 historical duplicate rows
-- that were created before the trigger fix.
--
-- Before: 320 total rows, 145 duplicate groups
-- After:  175 total rows, 0 duplicates remaining
--
-- Safety:
-- - Immutability trigger temporarily disabled then re-enabled
-- - Only exact duplicates deleted (same project_id, event_type, old_value,
--   new_value within same second)
-- - Oldest row kept per group (ORDER BY created_at ASC)
-- - Reopen events (measurements_reopened) had 0 duplicates, untouched
-- ============================================================================

-- Step 1: Disable immutability trigger
ALTER TABLE project_events DISABLE TRIGGER trg_immutable_project_events;

-- Step 2: Delete duplicates (keep first row per group)
DELETE FROM project_events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id, event_type, old_value, new_value, date_trunc('second', created_at)
        ORDER BY created_at ASC
      ) as rn
    FROM project_events
  ) ranked
  WHERE rn > 1
);

-- Step 3: Re-enable immutability trigger
ALTER TABLE project_events ENABLE TRIGGER trg_immutable_project_events;
