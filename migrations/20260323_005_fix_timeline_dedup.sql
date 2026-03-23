-- ============================================================================
-- Migration: Fix timeline duplication for project status changes
-- Date: 2026-03-23
--
-- Root cause: DB trigger log_project_status_change fires once per UPDATE,
-- but sometimes produces duplicate rows. Additionally, reopen transitions
-- (measurements_confirmed → measurements) create 3 rows: 2 from trigger
-- + 1 from API.
--
-- Fix:
-- 1. Skip reopen transitions in trigger (API handles with reason/metadata)
-- 2. Add dedup guard to prevent identical events within 2 seconds
-- 3. Clean up existing duplicate rows
-- ============================================================================

-- Step 1: Replace trigger function
CREATE OR REPLACE FUNCTION log_project_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Skip reopen transitions: API inserts these with reason + metadata
        IF OLD.status = 'measurements_confirmed' AND NEW.status = 'measurements' THEN
            RETURN NEW;
        END IF;

        -- Dedup guard: skip if identical event exists within last 2 seconds
        IF EXISTS (
            SELECT 1 FROM public.project_events
            WHERE project_id = NEW.id
              AND event_type = 'status_change'
              AND old_value = OLD.status
              AND new_value = NEW.status
              AND created_at > now() - interval '2 seconds'
        ) THEN
            RETURN NEW;
        END IF;

        INSERT INTO public.project_events (project_id, event_type, old_value, new_value, description)
        VALUES (NEW.id, 'status_change', OLD.status, NEW.status,
                'Status changed from ' || OLD.status || ' to ' || NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Clean up existing duplicate rows (keep only the latest per group)
DELETE FROM public.project_events
WHERE id NOT IN (
    SELECT DISTINCT ON (project_id, event_type, old_value, new_value, date_trunc('second', created_at))
           id
    FROM public.project_events
    ORDER BY project_id, event_type, old_value, new_value, date_trunc('second', created_at), created_at DESC
);
