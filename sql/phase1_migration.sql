-- ============================================================
-- Phase 1: Production Validation Checklist Table
-- ============================================================

CREATE TABLE IF NOT EXISTS production_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deposit_check BOOLEAN DEFAULT FALSE,
  measurements_validated BOOLEAN DEFAULT FALSE,
  design_validated BOOLEAN DEFAULT FALSE,
  materials_available BOOLEAN DEFAULT FALSE,
  accessories_available BOOLEAN DEFAULT FALSE,
  installer_validated BOOLEAN DEFAULT FALSE,
  installer_validated_by UUID REFERENCES profiles(id),
  installer_validated_at TIMESTAMPTZ,
  workshop_manager_validated BOOLEAN DEFAULT FALSE,
  workshop_manager_validated_by UUID REFERENCES profiles(id),
  workshop_manager_validated_at TIMESTAMPTZ,
  ceo_override BOOLEAN DEFAULT FALSE,
  ceo_override_by UUID REFERENCES profiles(id),
  ceo_override_at TIMESTAMPTZ,
  ceo_override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Enable RLS
ALTER TABLE production_validations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "All authenticated users can view production_validations"
  ON production_validations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "CEO can do anything on production_validations"
  ON production_validations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ceo')
  );

CREATE POLICY "Roles can insert production_validations"
  ON production_validations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('ceo', 'commercial_manager', 'workshop_manager', 'installer', 'designer')
    )
  );

CREATE POLICY "Roles can update production_validations"
  ON production_validations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('ceo', 'commercial_manager', 'workshop_manager', 'installer', 'designer')
    )
  );

-- Auto-update updated_at
CREATE TRIGGER update_production_validations_updated_at
  BEFORE UPDATE ON production_validations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Function: check_stock_availability for a project
-- ============================================================

CREATE OR REPLACE FUNCTION check_stock_availability(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  missing JSONB := '[]'::JSONB;
  r RECORD;
BEGIN
  -- Check stock items with critical levels
  FOR r IN
    SELECT si.id, si.name, si.current_quantity, si.minimum_quantity, si.unit
    FROM stock_items si
    WHERE si.is_active = true
    AND si.current_quantity <= si.minimum_quantity
  LOOP
    missing := missing || jsonb_build_array(jsonb_build_object(
      'item_id', r.id,
      'name', r.name,
      'current_quantity', r.current_quantity,
      'minimum_quantity', r.minimum_quantity,
      'unit', r.unit
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'available', (jsonb_array_length(missing) = 0),
    'missing_items', missing
  );
END;
$$;

