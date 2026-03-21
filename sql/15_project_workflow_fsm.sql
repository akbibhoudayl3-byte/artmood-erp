-- ============================================================
-- Migration: Project Workflow FSM — Strict Sequential Statuses
--
-- NEW STATUS SET (sequential, no skipping):
--   draft → measurements_confirmed → design_validated → bom_generated
--   → ready_for_production → in_production → installation → delivered
--
-- Also adds: cancelled (terminal, reachable from any non-terminal state)
--
-- DATA MIGRATION:
--   measurements      → draft
--   design            → draft  (pre-measurements_confirmed)
--   client_validation → design_validated
--   production        → in_production
--   (installation, delivered, cancelled remain as-is)
-- ============================================================

-- 1. Drop the old CHECK constraint
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- 2. Migrate existing data to new status values
UPDATE projects SET status = 'draft' WHERE status = 'measurements';
UPDATE projects SET status = 'draft' WHERE status = 'design';
UPDATE projects SET status = 'design_validated' WHERE status = 'client_validation';
UPDATE projects SET status = 'in_production' WHERE status = 'production';

-- 3. Add the new CHECK constraint
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft',
    'measurements_confirmed',
    'design_validated',
    'bom_generated',
    'ready_for_production',
    'in_production',
    'installation',
    'delivered',
    'cancelled'
  ));

-- 4. Add workflow timestamp columns (if not existing)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bom_generated_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS production_started_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- 5. Set defaults for existing rows
UPDATE projects SET status_updated_at = updated_at WHERE status_updated_at IS NULL;

-- 6. Update the convert_lead_to_project RPC to use 'draft' instead of 'measurements'
CREATE OR REPLACE FUNCTION convert_lead_to_project(
  p_lead_id UUID,
  p_client_name TEXT,
  p_client_phone TEXT,
  p_client_email TEXT DEFAULT NULL,
  p_client_city TEXT DEFAULT NULL,
  p_budget NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_project_type TEXT DEFAULT 'kitchen'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_project RECORD;
  v_reference TEXT;
  v_seq INT;
BEGIN
  SELECT id, status, project_id, converted_at, full_name
  INTO v_lead
  FROM leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead not found');
  END IF;

  IF v_lead.status != 'won' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Seuls les leads avec le statut "Gagné" peuvent être convertis',
      'current_status', v_lead.status
    );
  END IF;

  IF v_lead.project_id IS NOT NULL OR v_lead.converted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Ce lead a déjà été converti en projet',
      'project_id', v_lead.project_id
    );
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN reference_code ~ ('^ART-' || EXTRACT(YEAR FROM NOW())::TEXT || '-\d{4}$')
    THEN SUBSTRING(reference_code FROM '\d{4}$')::INT
    ELSE 0 END
  ), 0) + 1
  INTO v_seq
  FROM projects;

  v_reference := 'ART-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO projects (
    reference_code, lead_id, client_name, client_phone, client_email,
    client_city, project_type, status, total_amount, notes, created_by,
    status_updated_at, created_at, updated_at
  ) VALUES (
    v_reference, p_lead_id, p_client_name, p_client_phone, p_client_email,
    p_client_city, p_project_type, 'draft', p_budget, p_notes, p_created_by,
    NOW(), NOW(), NOW()
  )
  RETURNING * INTO v_project;

  UPDATE leads
  SET project_id = v_project.id,
      converted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'ok', true,
    'project_id', v_project.id,
    'project_reference', v_reference,
    'lead_id', p_lead_id,
    'converted_at', NOW()
  );
END;
$$;

-- 7. Comments
COMMENT ON COLUMN projects.status IS 'Project lifecycle stage: draft → measurements_confirmed → design_validated → bom_generated → ready_for_production → in_production → installation → delivered | cancelled';
COMMENT ON COLUMN projects.status_updated_at IS 'Timestamp of the most recent status transition';
COMMENT ON COLUMN projects.bom_generated_at IS 'When BOM was first generated for this project';
COMMENT ON COLUMN projects.production_started_at IS 'When production orders were first created';
COMMENT ON COLUMN projects.delivered_at IS 'When the project was marked as delivered';
COMMENT ON COLUMN projects.cancelled_at IS 'When the project was cancelled';
