-- ============================================================================
-- Migration: Partial unique index on calendar_events to prevent duplicates
-- Date: 2026-03-24
--
-- Only ONE active (non-completed) event per (reference_type, reference_id, event_type).
-- PostgreSQL enforces at DB level — no race conditions possible.
-- Application code uses plain INSERT and catches/ignores 23505 (unique_violation).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_calendar_event
ON calendar_events(reference_type, reference_id, event_type)
WHERE is_completed = false;
