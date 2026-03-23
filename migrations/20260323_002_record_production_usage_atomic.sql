-- Migration: record_production_usage_atomic
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- Replaces the non-atomic 6-step JS flow with a single SQL transaction.
-- All writes succeed together or fully roll back.
--
-- SECURITY: SECURITY DEFINER to bypass RLS for cross-table writes.
-- Role check: only ceo, workshop_manager, workshop_worker can record usage.

CREATE OR REPLACE FUNCTION public.record_production_usage_atomic(
  p_production_order_id  uuid,
  p_requirement_id       uuid,
  p_material_id          uuid,
  p_project_id           uuid,
  p_used_qty             numeric,
  p_waste_qty            numeric DEFAULT 0,
  p_unit                 text DEFAULT 'unit',
  p_stage                text DEFAULT 'production',
  p_worker_id            uuid DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_order_name           text DEFAULT NULL,
  p_material_name        text DEFAULT NULL,
  p_planned_qty          numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role      text;
  v_current_qty      numeric;
  v_item_unit        text;
  v_item_name        text;
  v_movement_id      uuid;
  v_usage_id         uuid;
  v_reserved_qty     numeric;
BEGIN
  -- ── Role authorization ──────────────────────────────────────────────────
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ceo', 'workshop_manager', 'workshop_worker') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ── Input validation ────────────────────────────────────────────────────
  IF p_used_qty <= 0 THEN
    RAISE EXCEPTION 'Used quantity must be greater than zero';
  END IF;
  IF p_waste_qty < 0 THEN
    RAISE EXCEPTION 'Waste quantity cannot be negative';
  END IF;

  -- ── Load stock item ─────────────────────────────────────────────────────
  SELECT current_quantity, unit, name, reserved_quantity
  INTO v_current_qty, v_item_unit, v_item_name, v_reserved_qty
  FROM stock_items
  WHERE id = p_material_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock item not found';
  END IF;

  -- ── Check sufficient stock ──────────────────────────────────────────────
  IF p_used_qty > v_current_qty THEN
    RAISE EXCEPTION 'Insufficient stock: available=%, requested=%', v_current_qty, p_used_qty;
  END IF;

  -- ── Step 1: Insert stock movement (production_out) ──────────────────────
  -- Negative quantity triggers the DB trigger update_stock_quantity
  INSERT INTO stock_movements (
    stock_item_id, movement_type, quantity, unit,
    reference_type, reference_id, project_id,
    notes, created_by
  ) VALUES (
    p_material_id, 'production_out', -p_used_qty, COALESCE(v_item_unit, 'unit'),
    'production_order', p_production_order_id, p_project_id,
    'Production: ' || COALESCE(p_order_name, p_production_order_id::text) ||
      ' | Stage: ' || p_stage ||
      CASE WHEN p_notes IS NOT NULL THEN ' | ' || p_notes ELSE '' END,
    p_worker_id
  )
  RETURNING id INTO v_movement_id;

  -- ── Step 2: Insert usage record ─────────────────────────────────────────
  INSERT INTO production_material_usage (
    production_order_id, requirement_id, material_id,
    used_qty, waste_qty, unit, stage,
    worker_id, movement_id, notes
  ) VALUES (
    p_production_order_id, p_requirement_id, p_material_id,
    p_used_qty, p_waste_qty, p_unit, p_stage,
    p_worker_id, v_movement_id, p_notes
  )
  RETURNING id INTO v_usage_id;

  -- ── Step 3: Insert waste_record if waste > 0 ───────────────────────────
  IF p_waste_qty > 0 AND p_material_name IS NOT NULL THEN
    INSERT INTO waste_records (
      sheet_id, production_order_id, project_id,
      material, length_mm, width_mm, is_reusable,
      notes, created_by
    ) VALUES (
      NULL, p_production_order_id, p_project_id,
      p_material_name, 1000, ROUND(p_waste_qty * 1000),
      false,
      'Production waste: ' || p_waste_qty || ' ' || p_unit ||
        ' | Order: ' || COALESCE(p_order_name, '') ||
        ' | Stage: ' || p_stage,
      p_worker_id
    );
  END IF;

  -- ── Step 4: Audit waste marker in stock_movements (qty=0, no deduction) ─
  IF p_waste_qty > 0 THEN
    INSERT INTO stock_movements (
      stock_item_id, movement_type, quantity,
      reference_type, reference_id, project_id,
      notes, created_by
    ) VALUES (
      p_material_id, 'production_waste', 0,
      'production_order', p_production_order_id, p_project_id,
      'Waste: ' || p_waste_qty || ' ' || p_unit ||
        ' from ' || COALESCE(p_material_name, 'unknown') ||
        ' | Stage: ' || p_stage,
      p_worker_id
    );
  END IF;

  -- ── Step 5: Mark requirement as consumed ────────────────────────────────
  UPDATE production_material_requirements
  SET status = 'consumed'
  WHERE id = p_requirement_id;

  -- ── Step 6: Release reservation ─────────────────────────────────────────
  IF p_planned_qty IS NOT NULL THEN
    UPDATE stock_items
    SET reserved_quantity = GREATEST(0, reserved_quantity - p_planned_qty)
    WHERE id = p_material_id;
  END IF;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'usage_id', v_usage_id,
    'stock_deducted', p_used_qty,
    'waste_recorded', p_waste_qty
  );
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.record_production_usage_atomic(uuid, uuid, uuid, uuid, numeric, numeric, text, text, uuid, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_production_usage_atomic(uuid, uuid, uuid, uuid, numeric, numeric, text, text, uuid, text, text, text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_production_usage_atomic(uuid, uuid, uuid, uuid, numeric, numeric, text, text, uuid, text, text, text, numeric) TO authenticated;
