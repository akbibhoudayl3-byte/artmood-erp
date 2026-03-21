-- ============================================================
-- Migration: Add measurement source fields to leads table
-- Supports plan-based bypass: contacted → quote_sent without visit
-- ============================================================

-- New columns for the plan-based bypass workflow
ALTER TABLE leads ADD COLUMN IF NOT EXISTS measurement_source TEXT DEFAULT NULL
  CHECK (measurement_source IN ('internal', 'external'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS plan_file_url TEXT DEFAULT NULL;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS measurements_provided_by_client BOOLEAN DEFAULT FALSE;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS disclaimer_accepted BOOLEAN DEFAULT FALSE;

-- Index for quick lookup of leads with external measurements
CREATE INDEX IF NOT EXISTS idx_leads_measurement_source
  ON leads (measurement_source)
  WHERE measurement_source = 'external';

-- Comment for documentation
COMMENT ON COLUMN leads.measurement_source IS 'internal = ArtMood visit, external = client/architect plan (bypass)';
COMMENT ON COLUMN leads.plan_file_url IS 'URL of the plan file uploaded for the plan-based bypass';
COMMENT ON COLUMN leads.measurements_provided_by_client IS 'True when client/architect provided measurements (bypass)';
COMMENT ON COLUMN leads.disclaimer_accepted IS 'True when user accepted: ArtMood not responsible for external measurement errors';
