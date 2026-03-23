-- Migration: record_payment_atomic
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- SECURITY MODEL:
--   SECURITY DEFINER — runs as the function owner (postgres), bypassing RLS.
--   Required because RLS on `payments` restricts SELECT to certain roles,
--   but the SUM(amount) inside must always see ALL payments for the project.
--
--   Role authorization: enforced INSIDE the function via profiles.role check
--   against auth.uid(). Only ceo and commercial_manager can execute the
--   payment write logic. All other roles get EXCEPTION 'Not authorized'.
--
--   EXECUTE is granted to `authenticated` (the role gate inside handles denial).
--   search_path is pinned to prevent schema hijacking.

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_project_id   uuid,
  p_amount       numeric,
  p_method       text,
  p_type         text,
  p_reference    text DEFAULT NULL,
  p_notes        text DEFAULT NULL,
  p_received_by  uuid DEFAULT NULL,
  p_received_at  timestamptz DEFAULT now()
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
  v_new_paid     numeric;
  v_pct          numeric;
BEGIN
  -- ── Role authorization ──────────────────────────────────────────────────
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ceo', 'commercial_manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ── Input validation ────────────────────────────────────────────────────
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;

  -- ── Verify the project exists ───────────────────────────────────────────
  SELECT COALESCE(total_amount, 0) INTO v_total
  FROM projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;

  -- ── 1. Insert the payment row ──────────────────────────────────────────
  INSERT INTO payments (
    project_id, amount, payment_method, payment_type,
    reference_number, notes, received_by, received_at
  ) VALUES (
    p_project_id, p_amount, p_method, p_type,
    p_reference, p_notes, p_received_by, p_received_at
  )
  RETURNING id INTO v_payment_id;

  -- ── 2. Compute new paid_amount from SUM (source of truth) ─────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid
  FROM payments
  WHERE project_id = p_project_id;

  -- ── 3. Compute percentage and update project denormalized fields ──────
  v_pct := CASE WHEN v_total > 0 THEN v_new_paid / v_total ELSE 0 END;

  UPDATE projects SET
    paid_amount      = v_new_paid,
    deposit_paid     = (v_pct >= 0.5),
    pre_install_paid = (v_pct >= 0.9),
    final_paid       = (v_pct >= 1.0),
    updated_at       = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'paid_amount', v_new_paid,
    'deposit_paid', (v_pct >= 0.5),
    'pre_install_paid', (v_pct >= 0.9),
    'final_paid', (v_pct >= 1.0)
  );
END;
$$;

-- Revoke default public access, grant only to authenticated users
REVOKE ALL ON FUNCTION public.record_payment_atomic(uuid, numeric, text, text, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_atomic(uuid, numeric, text, text, text, text, uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(uuid, numeric, text, text, text, text, uuid, timestamptz) TO authenticated;
