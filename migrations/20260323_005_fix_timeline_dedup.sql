-- ============================================================================
-- Migration: Fix timeline duplication for project status changes
-- Date: 2026-03-23
--
-- ROOT CAUSE (verified via Supabase SQL Editor):
-- TWO triggers on public.projects called the SAME function:
--   trg_project_status_log  → log_project_status_change()  (original)
--   trg_log_project_status  → log_project_status_change()  (duplicate)
-- One UPDATE fired both triggers → 2 identical rows in project_events.
--
-- Fix: Drop the duplicate trigger. Keep only trg_project_status_log.
-- Applied via Supabase SQL Editor on 2026-03-23.
-- ============================================================================

-- Step 1: Drop the duplicate trigger
DROP TRIGGER IF EXISTS trg_log_project_status ON public.projects;

-- Verification (run manually):
-- SELECT t.tgname, p.proname FROM pg_trigger t
-- JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_proc p ON t.tgfoid = p.oid
-- WHERE c.relname = 'projects' AND p.proname = 'log_project_status_change';
-- Expected: 1 row only (trg_project_status_log)
