-- ============================================================
-- Employee Leave Management
-- ============================================================

CREATE TYPE leave_type AS ENUM ('vacation', 'sick', 'personal', 'maternity', 'unpaid', 'other');
CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE IF NOT EXISTS employee_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  leave_type leave_type NOT NULL DEFAULT 'vacation',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(4,1) NOT NULL DEFAULT 1,
  reason TEXT,
  status leave_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_employee_leaves_user ON employee_leaves(user_id);
CREATE INDEX idx_employee_leaves_status ON employee_leaves(status);
CREATE INDEX idx_employee_leaves_dates ON employee_leaves(start_date, end_date);

-- RLS
ALTER TABLE employee_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leaves"
  ON employee_leaves FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR and CEO can manage leaves"
  ON employee_leaves FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ceo', 'hr_manager')
    )
    OR user_id = auth.uid()
  );

-- Allow employees to insert their own leave requests
CREATE POLICY "Employees can request leaves"
  ON employee_leaves FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER set_employee_leaves_updated_at
  BEFORE UPDATE ON employee_leaves
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Leave balance view
CREATE OR REPLACE VIEW v_leave_balances AS
SELECT
  p.id AS user_id,
  p.full_name,
  p.role,
  COALESCE(SUM(CASE WHEN el.leave_type = 'vacation' AND el.status = 'approved' AND EXTRACT(YEAR FROM el.start_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN el.days_count ELSE 0 END), 0) AS vacation_used,
  COALESCE(SUM(CASE WHEN el.leave_type = 'sick' AND el.status = 'approved' AND EXTRACT(YEAR FROM el.start_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN el.days_count ELSE 0 END), 0) AS sick_used,
  COALESCE(SUM(CASE WHEN el.leave_type = 'personal' AND el.status = 'approved' AND EXTRACT(YEAR FROM el.start_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN el.days_count ELSE 0 END), 0) AS personal_used,
  18 - COALESCE(SUM(CASE WHEN el.leave_type = 'vacation' AND el.status = 'approved' AND EXTRACT(YEAR FROM el.start_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN el.days_count ELSE 0 END), 0) AS vacation_remaining
FROM profiles p
LEFT JOIN employee_leaves el ON el.user_id = p.id
WHERE p.is_active = true
GROUP BY p.id, p.full_name, p.role;
