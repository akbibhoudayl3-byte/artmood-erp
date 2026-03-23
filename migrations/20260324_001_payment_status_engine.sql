-- ============================================================================
-- Migration: Payment Status Engine — Phase 1
-- Date: 2026-03-24
--
-- Adds payment_status to payments table.
-- Only confirmed payments count toward project milestone flags.
-- Default: pending_proof (new payments must be explicitly confirmed)
-- Backfill: all existing payments → confirmed (do not break current projects)
-- ============================================================================

BEGIN;

-- ── Step 1: Add new columns to payments ─────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending_proof',
  ADD COLUMN IF NOT EXISTS proof_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cheque_id uuid DEFAULT NULL REFERENCES cheques(id);

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS chk_payment_status;

ALTER TABLE payments
  ADD CONSTRAINT chk_payment_status
  CHECK (payment_status IN ('confirmed', 'pending_proof', 'rejected'));

-- ── Step 2: Backfill existing payments to confirmed ─────────────────────────
-- All existing payments were already counted as paid. Do not break current state.

UPDATE payments SET payment_status = 'confirmed' WHERE payment_status = 'pending_proof';

-- ── Step 3: Replace record_payment_atomic with v2 ───────────────────────────
-- Key change: SUM only confirmed payments for gating flags.
-- Cash/card auto-confirmed. Everything else stays pending_proof.

CREATE OR REPLACE FUNCTION record_payment_atomic(
  p_project_id   uuid,
  p_amount       numeric,
  p_method       text,
  p_type         text,
  p_reference    text DEFAULT NULL,
  p_notes        text DEFAULT NULL,
  p_received_by  uuid DEFAULT NULL,
  p_received_at  timestamptz DEFAULT now(),
  p_payment_status text DEFAULT NULL,
  p_cheque_id    uuid DEFAULT NULL,
  p_proof_url    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  text;
  v_payment_id   uuid;
  v_total        numeric;
  v_confirmed    numeric;
  v_pct          numeric;
  v_status       text;
BEGIN
  -- Role authorization
  SELECT role INTO v_caller_role
  FROM profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ceo', 'commercial_manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;

  -- Auto-derive payment_status if not explicitly provided
  IF p_payment_status IS NOT NULL THEN
    v_status := p_payment_status;
  ELSIF p_method IN ('cash', 'card') THEN
    v_status := 'confirmed';
  ELSE
    v_status := 'pending_proof';
  END IF;

  -- Verify project exists
  SELECT COALESCE(total_amount, 0) INTO v_total
  FROM projects WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;

  -- 1. Insert the payment row
  INSERT INTO payments (
    project_id, amount, payment_method, payment_type,
    reference_number, notes, received_by, received_at,
    payment_status, cheque_id, proof_url
  ) VALUES (
    p_project_id, p_amount, p_method, p_type,
    p_reference, p_notes, p_received_by, p_received_at,
    v_status, p_cheque_id, p_proof_url
  )
  RETURNING id INTO v_payment_id;

  -- 2. Compute confirmed paid amount ONLY (source of truth for gating)
  SELECT COALESCE(SUM(amount), 0) INTO v_confirmed
  FROM payments
  WHERE project_id = p_project_id
    AND payment_status = 'confirmed';

  -- 3. Compute percentage and update project flags
  v_pct := CASE WHEN v_total > 0 THEN v_confirmed / v_total ELSE 0 END;

  UPDATE projects SET
    paid_amount      = v_confirmed,
    deposit_paid     = (v_pct >= 0.5),
    pre_install_paid = (v_pct >= 0.9),
    final_paid       = (v_pct >= 1.0),
    updated_at       = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_status,
    'confirmed_amount', v_confirmed,
    'deposit_paid', (v_pct >= 0.5),
    'pre_install_paid', (v_pct >= 0.9),
    'final_paid', (v_pct >= 1.0)
  );
END;
$$;

COMMIT;
