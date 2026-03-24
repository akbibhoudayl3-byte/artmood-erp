-- ============================================================================
-- Migration: Atomic Project Transition with Financial Gating
-- Date: 2026-03-24
--
-- Single-transaction RPC that:
-- 1. Validates FSM edge
-- 2. Computes confirmed payment SUM (once)
-- 3. Checks hard blocks (GPS, 100% payment for delivered, reopen reason)
-- 4. Checks soft blocks (50% production, 90% installation, design_validated)
-- 5. Handles CEO override with audit logging
-- 6. Updates project status
-- 7. Inserts project_events timeline entry
--
-- Returns JSONB with result (ok, hard_block, soft_block)
-- All within one transaction. No stale reads. No race conditions.
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_project_atomic(
  p_project_id   uuid,
  p_to_status    text,
  p_override     boolean DEFAULT false,
  p_user_role    text DEFAULT NULL,
  p_user_id      uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project        record;
  v_from_status    text;
  v_confirmed_sum  numeric;
  v_total          numeric;
  v_pct            numeric;
  v_has_gps        boolean;
  v_hard_violations text[] := '{}';
  v_soft_warnings   text[] := '{}';
  v_shortage       numeric;
  v_required_pct   numeric;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. FETCH PROJECT (locked row to prevent concurrent transitions)
  -- ═══════════════════════════════════════════════════════════════════════════
  SELECT id, status, client_name, total_amount, design_validated,
         client_latitude, client_longitude, client_gps_validated
  INTO v_project
  FROM projects
  WHERE id = p_project_id
  FOR UPDATE;  -- Row lock: prevents concurrent transitions

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'blockType', 'hard',
      'reason', 'Project not found', 'violations', jsonb_build_array('Project not found'));
  END IF;

  v_from_status := v_project.status;
  v_total := COALESCE(v_project.total_amount, 0);

  -- Same status = no-op
  IF v_from_status = p_to_status THEN
    RETURN jsonb_build_object('ok', false, 'blockType', 'hard',
      'reason', 'Project is already in "' || p_to_status || '" status',
      'violations', jsonb_build_array('No change'));
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. FSM EDGE VALIDATION (HARD BLOCK)
  -- ═══════════════════════════════════════════════════════════════════════════
  IF NOT (
    (v_from_status = 'measurements'           AND p_to_status IN ('measurements_confirmed','design','cancelled'))
    OR (v_from_status = 'measurements_confirmed' AND p_to_status IN ('design','measurements','cancelled'))
    OR (v_from_status = 'design'               AND p_to_status IN ('client_validation','measurements','cancelled'))
    OR (v_from_status = 'client_validation'    AND p_to_status IN ('production','design','cancelled'))
    OR (v_from_status = 'production'           AND p_to_status IN ('installation','cancelled'))
    OR (v_from_status = 'installation'         AND p_to_status IN ('delivered','cancelled'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'blockType', 'hard', 'overridable', false,
      'reason', 'Transition from "' || v_from_status || '" to "' || p_to_status || '" is not allowed',
      'violations', jsonb_build_array('Invalid FSM transition: ' || v_from_status || ' → ' || p_to_status));
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. COMPUTE CONFIRMED PAYMENT SUM (ONCE — reused for all checks)
  -- ═══════════════════════════════════════════════════════════════════════════
  SELECT COALESCE(SUM(amount), 0) INTO v_confirmed_sum
  FROM payments
  WHERE project_id = p_project_id
    AND payment_status = 'confirmed';

  v_pct := CASE WHEN v_total > 0 THEN v_confirmed_sum / v_total ELSE 0 END;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. HARD BLOCKS (no override allowed)
  -- ═══════════════════════════════════════════════════════════════════════════
  v_has_gps := v_project.client_latitude IS NOT NULL AND v_project.client_longitude IS NOT NULL;

  -- GPS required at measurements confirmation
  IF p_to_status = 'measurements_confirmed' AND NOT v_has_gps THEN
    v_hard_violations := array_append(v_hard_violations,
      'Client GPS location is required before confirming measurements.');
  END IF;

  -- GPS required before installation
  IF p_to_status = 'installation' AND NOT v_has_gps THEN
    v_hard_violations := array_append(v_hard_violations,
      'Client GPS location is required before scheduling installation.');
  END IF;

  -- Reopen measurements: mandatory reason
  IF v_from_status = 'measurements_confirmed' AND p_to_status = 'measurements' THEN
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
      v_hard_violations := array_append(v_hard_violations,
        'A reason is required to reopen measurements.');
    END IF;
  END IF;

  -- 100% payment required for delivered (HARD BLOCK — no override)
  IF p_to_status = 'delivered' AND v_total > 0 THEN
    IF v_confirmed_sum < v_total THEN
      v_shortage := v_total - v_confirmed_sum;
      v_hard_violations := array_append(v_hard_violations,
        'Paiement complet requis avant livraison. Reste: ' || to_char(v_shortage, 'FM999G999G999') || ' MAD');
    END IF;
  END IF;

  -- Return hard block if any
  IF array_length(v_hard_violations, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'blockType', 'hard', 'overridable', false,
      'reason', v_hard_violations[1],
      'violations', to_jsonb(v_hard_violations),
      'confirmed_amount', v_confirmed_sum,
      'total_amount', v_total);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. SOFT BLOCKS (CEO can override)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- 50% for production
  IF p_to_status = 'production' THEN
    IF v_total > 0 AND v_pct < 0.5 THEN
      v_shortage := (v_total * 0.5) - v_confirmed_sum;
      v_soft_warnings := array_append(v_soft_warnings,
        'Acompte requis: ' || round(v_pct * 100) || '% payé, 50% requis. Manque: ' || to_char(v_shortage, 'FM999G999G999') || ' MAD');
    END IF;

    IF NOT COALESCE(v_project.design_validated, false) THEN
      v_soft_warnings := array_append(v_soft_warnings,
        'Design must be validated and approved before starting production');
    END IF;

    IF v_total <= 0 THEN
      v_soft_warnings := array_append(v_soft_warnings,
        'Project must have a positive total amount before starting production');
    END IF;
  END IF;

  -- 90% for installation
  IF p_to_status = 'installation' THEN
    IF v_total > 0 AND v_pct < 0.9 THEN
      v_shortage := (v_total * 0.9) - v_confirmed_sum;
      v_soft_warnings := array_append(v_soft_warnings,
        'Paiement pré-installation requis: ' || round(v_pct * 100) || '% payé, 90% requis. Manque: ' || to_char(v_shortage, 'FM999G999G999') || ' MAD');
    END IF;

    -- Check production orders completed
    IF NOT EXISTS (
      SELECT 1 FROM production_orders
      WHERE project_id = p_project_id AND status = 'completed'
    ) THEN
      v_soft_warnings := array_append(v_soft_warnings,
        'No completed production order found. Complete production before installation.');
    END IF;
  END IF;

  -- Delivered: check installation completed (soft, override allowed)
  IF p_to_status = 'delivered' THEN
    IF NOT EXISTS (
      SELECT 1 FROM installations
      WHERE project_id = p_project_id AND status = 'completed'
    ) THEN
      v_soft_warnings := array_append(v_soft_warnings,
        'Installation must be fully completed before marking as delivered');
    END IF;
  END IF;

  -- If soft warnings exist and no override
  IF array_length(v_soft_warnings, 1) > 0 THEN
    IF p_override AND p_user_role = 'ceo' THEN
      -- CEO override accepted — log it
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data, reason)
      VALUES (
        p_user_id,
        CASE WHEN p_to_status = 'installation' THEN 'ceo_installation_override'
             ELSE 'ceo_production_override' END,
        'projects',
        p_project_id,
        jsonb_build_object('status', v_from_status, 'confirmed_amount', v_confirmed_sum),
        jsonb_build_object('status', p_to_status, 'override', true),
        'CEO override: ' || COALESCE(p_reason, 'No reason') ||
        '. Required: ' || CASE
          WHEN p_to_status = 'production' THEN to_char(v_total * 0.5, 'FM999G999G999')
          WHEN p_to_status = 'installation' THEN to_char(v_total * 0.9, 'FM999G999G999')
          ELSE to_char(v_total, 'FM999G999G999')
        END || ' MAD, Confirmed: ' || to_char(v_confirmed_sum, 'FM999G999G999') || ' MAD'
      );
      -- Fall through to apply transition
    ELSE
      -- Return soft block
      RETURN jsonb_build_object('ok', false, 'blockType', 'soft', 'overridable', true,
        'reason', v_soft_warnings[1],
        'warnings', to_jsonb(v_soft_warnings),
        'confirmed_amount', v_confirmed_sum,
        'required_amount', CASE
          WHEN p_to_status = 'production' THEN v_total * 0.5
          WHEN p_to_status = 'installation' THEN v_total * 0.9
          ELSE v_total
        END,
        'total_amount', v_total,
        'shortage', CASE
          WHEN p_to_status = 'production' THEN GREATEST(0, v_total * 0.5 - v_confirmed_sum)
          WHEN p_to_status = 'installation' THEN GREATEST(0, v_total * 0.9 - v_confirmed_sum)
          ELSE GREATEST(0, v_total - v_confirmed_sum)
        END);
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. APPLY TRANSITION
  -- ═══════════════════════════════════════════════════════════════════════════
  UPDATE projects SET
    status = p_to_status,
    updated_at = now(),
    actual_delivery_date = CASE WHEN p_to_status = 'delivered' THEN CURRENT_DATE ELSE actual_delivery_date END,
    production_started_at = CASE WHEN p_to_status = 'production' THEN now() ELSE production_started_at END
  WHERE id = p_project_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 7. INSERT TIMELINE EVENT
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_from_status = 'measurements_confirmed' AND p_to_status = 'measurements' THEN
    -- Reopen event with reason
    INSERT INTO project_events (project_id, user_id, event_type, old_value, new_value, description, metadata)
    VALUES (p_project_id, p_user_id, 'measurements_reopened', v_from_status, p_to_status,
      'Mesures réouvertes: ' || v_from_status || ' → ' || p_to_status || '. Raison: ' || COALESCE(p_reason, ''),
      jsonb_build_object('reopen', true, 'reason', COALESCE(p_reason, '')));
  ELSIF p_override AND p_user_role = 'ceo' THEN
    -- Override event
    INSERT INTO project_events (project_id, user_id, event_type, old_value, new_value, description, metadata)
    VALUES (p_project_id, p_user_id, 'ceo_override', v_from_status, p_to_status,
      'Dérogation CEO: ' || v_from_status || ' → ' || p_to_status || '. Raison: ' || COALESCE(p_reason, ''),
      jsonb_build_object('override', true, 'reason', COALESCE(p_reason, ''),
        'confirmed_amount', v_confirmed_sum, 'required_amount',
        CASE WHEN p_to_status = 'production' THEN v_total * 0.5
             WHEN p_to_status = 'installation' THEN v_total * 0.9
             ELSE v_total END));
  END IF;
  -- NOTE: normal transitions get their event from the DB trigger (trg_project_status_log)

  RETURN jsonb_build_object(
    'ok', true,
    'from', v_from_status,
    'to', p_to_status,
    'confirmed_amount', v_confirmed_sum,
    'total_amount', v_total,
    'override_used', (p_override AND p_user_role = 'ceo' AND array_length(v_soft_warnings, 1) > 0)
  );

END;
$$;
