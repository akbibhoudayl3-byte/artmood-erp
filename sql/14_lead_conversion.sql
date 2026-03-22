-- ============================================================
-- Migration: Lead → Project Conversion Support
-- Adds project_id and converted_at to leads for locking after conversion
-- Adds atomic conversion RPC function
-- ============================================================

-- New columns for conversion locking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_id UUID DEFAULT NULL
  REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for quick lookup of converted leads
CREATE INDEX IF NOT EXISTS idx_leads_project_id
  ON leads (project_id)
  WHERE project_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN leads.project_id IS 'FK to the project created from this lead. Set on conversion. Makes lead read-only.';
COMMENT ON COLUMN leads.converted_at IS 'Timestamp when lead was converted to project. Non-null = locked.';

-- ============================================================
-- Atomic Lead → Project Conversion RPC
-- Wraps project creation + lead locking in a single transaction.
-- If anything fails, the entire operation is rolled back.
-- ============================================================
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
  -- 1. Lock the lead row (SELECT FOR UPDATE prevents concurrent conversions)
  SELECT id, status, project_id, converted_at, full_name
  INTO v_lead
  FROM leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead not found');
  END IF;

  -- 2. Only "won" leads can be converted
  IF v_lead.status != 'won' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Seuls les leads avec le statut "Gagné" peuvent être convertis',
      'current_status', v_lead.status
    );
  END IF;

  -- 3. Prevent double conversion
  IF v_lead.project_id IS NOT NULL OR v_lead.converted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Ce lead a déjà été converti en projet',
      'project_id', v_lead.project_id
    );
  END IF;

  -- 4. Generate auto-reference ART-YYYY-XXXX
  SELECT COALESCE(MAX(
    CASE WHEN reference_code ~ ('^ART-' || EXTRACT(YEAR FROM NOW())::TEXT || '-\d{4}$')
    THEN SUBSTRING(reference_code FROM '\d{4}$')::INT
    ELSE 0 END
  ), 0) + 1
  INTO v_seq
  FROM projects;

  v_reference := 'ART-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- 5. Create the project (atomic — same transaction)
  INSERT INTO projects (
    reference_code,
    lead_id,
    client_name,
    client_phone,
    client_email,
    client_city,
    project_type,
    status,
    total_amount,
    notes,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_reference,
    p_lead_id,
    p_client_name,
    p_client_phone,
    p_client_email,
    p_client_city,
    p_project_type,
    'measurements_confirmed',
    p_budget,
    p_notes,
    p_created_by,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_project;

  -- 6. Lock the lead: set project_id + converted_at (READ-ONLY from now on)
  UPDATE leads
  SET project_id = v_project.id,
      converted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_lead_id;

  -- 7. Return success with both IDs
  RETURN jsonb_build_object(
    'ok', true,
    'project_id', v_project.id,
    'project_reference', v_reference,
    'lead_id', p_lead_id,
    'converted_at', NOW()
  );
END;
$$;
