/**
 * Migration 20260316_025 — Kitchen Material Linking + Hardware Costing Fix
 *
 * Fixes:
 * 1. Add sheet dimensions to materials table (for future cutting/nesting)
 * 2. Insert materials matching kitchen preset codes (mdf_18, stratifie_18, etc.)
 * 3. Add unit_price column to project_parts (for hardware cost tracking)
 * 4. Update generate_project_bom() to exclude hardware from panel BOM
 * 5. Update calculate_project_cost() to read hardware cost from project_parts
 * 6. Add edge banding materials to catalog
 */

exports.version = '20260316_025';
exports.name = 'kitchen_material_fix';

exports.up = async function (supabase) {
  async function ddl(sql) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
    if (error) throw new Error('DDL failed: ' + error.message + ' | SQL: ' + sql.substring(0, 200));
  }

  // ── 1. Add sheet dimensions to materials table ──────────────────────────
  console.log('1. Adding sheet dimensions to materials...');
  await ddl(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS sheet_width_mm NUMERIC;`);
  await ddl(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS sheet_length_mm NUMERIC;`);
  console.log('✅ sheet_width_mm, sheet_length_mm added');

  // Update existing panel materials with standard sheet sizes
  await ddl(`
    UPDATE materials SET
      sheet_width_mm = 1220,
      sheet_length_mm = 2800
    WHERE category IN ('panel', 'back') AND sheet_width_mm IS NULL;
  `);
  console.log('✅ Existing materials updated with sheet dimensions');

  // ── 2. Insert kitchen-compatible materials ──────────────────────────────
  console.log('2. Inserting kitchen preset-compatible materials...');
  await ddl(`
    INSERT INTO materials (code, name, category, thickness_mm, unit, cost_per_unit, waste_factor, sheet_width_mm, sheet_length_mm)
    VALUES
      ('mdf_18',               'MDF 18mm Blanc',            'panel', 18, 'm2', 120, 0.15, 1220, 2800),
      ('mdf_22',               'MDF 22mm (à laquer)',       'panel', 22, 'm2', 140, 0.15, 1220, 2800),
      ('mdf_16',               'MDF 16mm',                  'panel', 16, 'm2', 105, 0.15, 1220, 2800),
      ('stratifie_18',         'Stratifié 18mm',            'panel', 18, 'm2', 160, 0.12, 1220, 2800),
      ('melamine_anthracite',  'Mélaminé Anthracite 18mm',  'panel', 18, 'm2', 110, 0.12, 1220, 2800),
      ('melamine_blanc',       'Mélaminé Blanc 18mm',       'panel', 18, 'm2',  95, 0.12, 1220, 2800),
      ('melamine_chene',       'Mélaminé Chêne 18mm',       'panel', 18, 'm2', 110, 0.12, 1220, 2800),
      ('melamine_noyer',       'Mélaminé Noyer 18mm',       'panel', 18, 'm2', 115, 0.12, 1220, 2800),
      ('back_hdf_5',           'HDF 5mm (fond)',            'back',   5, 'm2',  45, 0.10, 1220, 2800),
      ('back_hdf_3',           'HDF 3mm (fond)',            'back',   3, 'm2',  35, 0.10, 1220, 2800),
      ('back_mdf_8',           'MDF 8mm (fond)',            'back',   8, 'm2',  65, 0.10, 1220, 2800),
      ('1mm_pvc',              'Chant PVC 1mm',             'edge',   1, 'ml',   4, 0.05, NULL, NULL),
      ('2mm_pvc',              'Chant PVC 2mm',             'edge',   2, 'ml',   6, 0.05, NULL, NULL),
      ('2mm_abs',              'Chant ABS 2mm',             'edge',   2, 'ml',   8, 0.05, NULL, NULL),
      ('0.4mm_pvc',            'Chant PVC 0.4mm',           'edge', 0.4,'ml',   2, 0.05, NULL, NULL)
    ON CONFLICT (code) DO UPDATE SET
      cost_per_unit = EXCLUDED.cost_per_unit,
      sheet_width_mm = EXCLUDED.sheet_width_mm,
      sheet_length_mm = EXCLUDED.sheet_length_mm,
      name = EXCLUDED.name;
  `);
  console.log('✅ 15 kitchen-compatible materials inserted/updated');

  // ── 3. Add unit_price to project_parts ──────────────────────────────────
  console.log('3. Adding unit_price to project_parts...');
  await ddl(`ALTER TABLE project_parts ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;`);
  await ddl(`ALTER TABLE project_parts ADD COLUMN IF NOT EXISTS edge_length_mm NUMERIC DEFAULT 0;`);
  console.log('✅ unit_price + edge_length_mm columns added to project_parts');

  // ── 4. Update generate_project_bom() — exclude hardware, add edge banding ─
  console.log('4. Updating generate_project_bom()...');
  await ddl(`
    CREATE OR REPLACE FUNCTION generate_project_bom(p_project_id UUID)
    RETURNS JSONB AS $$
    DECLARE
      v_panel_count INT := 0;
      v_mat_count INT := 0;
    BEGIN
      -- Delete existing BOM for this project
      DELETE FROM project_material_requirements_bom WHERE project_id = p_project_id;

      -- Aggregate project_parts into material requirements
      -- EXCLUDE hardware parts (material_type = 'hardware') from panel BOM
      INSERT INTO project_material_requirements_bom (
        project_id, material_type, panel_width_mm, panel_height_mm,
        net_area_m2, panels_required, waste_factor,
        edge_banding_ml, unit_cost, total_cost, status
      )
      SELECT
        p_project_id,
        pp.material_type,
        MAX(pp.width_mm),
        MAX(pp.height_mm),
        ROUND(SUM(pp.width_mm * pp.height_mm * pp.quantity / 1000000.0)::numeric, 3),
        SUM(pp.quantity),
        COALESCE(m.waste_factor, 0.15),
        ROUND(SUM(
          pp.quantity * (
            CASE WHEN pp.edge_top THEN pp.width_mm ELSE 0 END +
            CASE WHEN pp.edge_bottom THEN pp.width_mm ELSE 0 END +
            CASE WHEN pp.edge_left THEN pp.height_mm ELSE 0 END +
            CASE WHEN pp.edge_right THEN pp.height_mm ELSE 0 END
          )
        )::numeric, 0),
        COALESCE(m.cost_per_unit, 0),
        ROUND((
          SUM(pp.width_mm * pp.height_mm * pp.quantity / 1000000.0) *
          (1 + COALESCE(m.waste_factor, 0.15)) *
          COALESCE(m.cost_per_unit, 0)
        )::numeric, 2),
        'planned'
      FROM project_parts pp
      LEFT JOIN materials m ON m.code = pp.material_type OR m.name = pp.material_type
      WHERE pp.project_id = p_project_id
        AND pp.material_type != 'hardware'
      GROUP BY pp.material_type, m.waste_factor, m.cost_per_unit;

      GET DIAGNOSTICS v_mat_count = ROW_COUNT;

      -- Count total panel parts (exclude hardware)
      SELECT COALESCE(SUM(quantity), 0) INTO v_panel_count
      FROM project_parts
      WHERE project_id = p_project_id AND material_type != 'hardware';

      RETURN jsonb_build_object(
        'materials', v_mat_count,
        'panels', v_panel_count,
        'project_id', p_project_id
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);
  console.log('✅ generate_project_bom() updated (excludes hardware)');

  // ── 5. Update calculate_project_cost() — read hardware from project_parts ─
  console.log('5. Updating calculate_project_cost()...');
  await ddl(`
    CREATE OR REPLACE FUNCTION calculate_project_cost(p_project_id UUID)
    RETURNS JSONB AS $$
    DECLARE
      v_material_cost NUMERIC := 0;
      v_hardware_cost NUMERIC := 0;
      v_labor_cost NUMERIC := 0;
      v_machine_cost NUMERIC := 0;
      v_transport_cost NUMERIC := 0;
      v_total_panels INT := 0;
      v_settings RECORD;
    BEGIN
      -- Load settings
      SELECT * INTO v_settings FROM cost_settings LIMIT 1;
      IF v_settings IS NULL THEN
        RAISE EXCEPTION 'Cost settings not configured.';
      END IF;

      -- Material cost from BOM
      SELECT
        COALESCE(SUM(total_cost), 0),
        COALESCE(SUM(panels_required), 0)
      INTO v_material_cost, v_total_panels
      FROM project_material_requirements_bom
      WHERE project_id = p_project_id;

      -- Hardware cost: sum unit_price * quantity from project_parts WHERE material_type = 'hardware'
      SELECT COALESCE(SUM(unit_price * quantity), 0)
      INTO v_hardware_cost
      FROM project_parts
      WHERE project_id = p_project_id AND material_type = 'hardware';

      -- Labor cost: panels * hours_per_panel * rate
      v_labor_cost := ROUND(
        v_total_panels * v_settings.avg_hours_per_panel * v_settings.labor_rate_per_hour, 2
      );

      -- Machine cost: panels * machine_hours_per_panel * rate
      v_machine_cost := ROUND(
        v_total_panels * v_settings.avg_machine_hours_per_panel * v_settings.machine_rate_per_hour, 2
      );

      -- Transport
      v_transport_cost := v_settings.default_transport_cost;

      RETURN jsonb_build_object(
        'material_cost', v_material_cost,
        'hardware_cost', v_hardware_cost,
        'labor_cost', v_labor_cost,
        'machine_cost', v_machine_cost,
        'transport_cost', v_transport_cost,
        'total_panels', v_total_panels,
        'total_cost', ROUND((v_material_cost + v_hardware_cost + v_labor_cost + v_machine_cost + v_transport_cost)::numeric, 2),
        'min_margin_percent', v_settings.min_margin_percent,
        'recommended_margin_percent', v_settings.recommended_margin_percent
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);
  console.log('✅ calculate_project_cost() updated (reads hardware from project_parts)');

  console.log('\n🎉 Migration 20260316_025 complete');
};
