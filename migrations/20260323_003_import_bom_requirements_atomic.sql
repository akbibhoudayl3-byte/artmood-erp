-- Migration: import_bom_requirements_atomic
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- Replaces the non-atomic loop of reservation writes with a single
-- SQL transaction. All reservations succeed together or fully roll back.
--
-- SECURITY: SECURITY DEFINER to bypass RLS for cross-table writes.
-- Role check: only ceo, workshop_manager, commercial_manager, designer.

CREATE OR REPLACE FUNCTION public.import_bom_requirements_atomic(
  p_production_order_id  uuid,
  p_project_id           uuid,
  p_worker_id            uuid DEFAULT NULL,
  p_order_name           text DEFAULT NULL,
  p_items                jsonb DEFAULT '[]'::jsonb
  -- p_items is an array of: { stock_item_id, sheets_needed, unit, material_name, area_m2 }
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role       text;
  v_item              jsonb;
  v_stock_item_id     uuid;
  v_sheets_needed     numeric;
  v_unit              text;
  v_material_name     text;
  v_area_m2           numeric;
  v_current_qty       numeric;
  v_reserved_qty      numeric;
  v_item_name         text;
  v_available         numeric;
  v_new_reserved      numeric;
  v_reserved_count    int := 0;
  -- Accumulator for items that appear multiple times
  v_accum             jsonb := '{}'::jsonb;
BEGIN
  -- ── Role authorization ──────────────────────────────────────────────────
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ceo', 'workshop_manager', 'commercial_manager', 'designer') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ── Input validation ────────────────────────────────────────────────────
  IF p_production_order_id IS NULL THEN
    RAISE EXCEPTION 'production_order_id is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to reserve';
  END IF;

  -- ── Pre-flight: check ALL items have enough stock ───────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := (v_item->>'stock_item_id')::uuid;
    v_sheets_needed := (v_item->>'sheets_needed')::numeric;

    IF v_stock_item_id IS NULL OR v_sheets_needed IS NULL OR v_sheets_needed <= 0 THEN
      CONTINUE;
    END IF;

    SELECT current_quantity, reserved_quantity, name
    INTO v_current_qty, v_reserved_qty, v_item_name
    FROM stock_items
    WHERE id = v_stock_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock item % not found', v_stock_item_id;
    END IF;

    -- Use accumulator for duplicate stock items in the batch
    v_reserved_qty := COALESCE((v_accum->>v_stock_item_id::text)::numeric, v_reserved_qty);
    v_available := v_current_qty - v_reserved_qty;

    IF v_sheets_needed > v_available THEN
      RAISE EXCEPTION 'Insufficient stock: % needs %, available %', v_item_name, v_sheets_needed, v_available;
    END IF;

    v_accum := jsonb_set(v_accum, ARRAY[v_stock_item_id::text], to_jsonb(v_reserved_qty + v_sheets_needed));
  END LOOP;

  -- ── Apply all reservations ──────────────────────────────────────────────
  -- Reset accumulator for the write pass
  v_accum := '{}'::jsonb;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := (v_item->>'stock_item_id')::uuid;
    v_sheets_needed := (v_item->>'sheets_needed')::numeric;
    v_unit          := COALESCE(v_item->>'unit', 'unit');
    v_material_name := COALESCE(v_item->>'material_name', '');
    v_area_m2       := COALESCE((v_item->>'area_m2')::numeric, 0);

    IF v_stock_item_id IS NULL OR v_sheets_needed IS NULL OR v_sheets_needed <= 0 THEN
      CONTINUE;
    END IF;

    -- Get current reserved (from DB or accumulator for duplicates)
    SELECT reserved_quantity, name INTO v_reserved_qty, v_item_name
    FROM stock_items WHERE id = v_stock_item_id;

    v_reserved_qty := COALESCE((v_accum->>v_stock_item_id::text)::numeric, v_reserved_qty);
    v_new_reserved := v_reserved_qty + v_sheets_needed;
    v_accum := jsonb_set(v_accum, ARRAY[v_stock_item_id::text], to_jsonb(v_new_reserved));

    -- 1. Update reserved_quantity
    UPDATE stock_items
    SET reserved_quantity = v_new_reserved
    WHERE id = v_stock_item_id;

    -- 2. Audit movement (qty=0, no stock deduction)
    INSERT INTO stock_movements (
      stock_item_id, movement_type, quantity,
      reference_type, reference_id, project_id,
      notes, created_by
    ) VALUES (
      v_stock_item_id, 'reserve', 0,
      'production_order', p_production_order_id, p_project_id,
      'BOM réservation: ' || v_sheets_needed || ' ' || v_unit || ' ' ||
        COALESCE(v_item_name, '') || ' | Ordre: ' || COALESCE(p_order_name, ''),
      p_worker_id
    );

    -- 3. Create requirement
    INSERT INTO production_material_requirements (
      production_order_id, material_id, planned_qty, unit, status, notes
    ) VALUES (
      p_production_order_id, v_stock_item_id, v_sheets_needed, v_unit, 'reserved',
      'BOM: ' || v_material_name || ' — ' ||
        CASE WHEN v_area_m2 > 0 THEN round(v_area_m2::numeric, 2) || ' m²'
        ELSE v_sheets_needed || ' ' || v_unit END
    );

    v_reserved_count := v_reserved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reserved_count', v_reserved_count,
    'production_order_id', p_production_order_id
  );
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.import_bom_requirements_atomic(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_bom_requirements_atomic(uuid, uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_bom_requirements_atomic(uuid, uuid, uuid, text, jsonb) TO authenticated;
