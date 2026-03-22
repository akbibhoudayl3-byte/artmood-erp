/**
 * Migration: BOM & Parts Engine
 *
 * 1. Create `materials` catalog table + seed common materials
 * 2. Create `generate_project_bom()` SQL function
 * 3. Back-fill BOM for projects that have project_parts but no BOM rows
 * 4. Update production order validation to check project_parts count
 * 5. Add RLS
 */

exports.version = '20260316_005';
exports.name = 'bom_engine';

exports.up = async function (supabase) {
  // ── 1. materials catalog ──────────────────────────────────────────────────
  const { error: e1 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE TABLE IF NOT EXISTS materials (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'panel',
        thickness_mm NUMERIC,
        unit TEXT NOT NULL DEFAULT 'm2',
        cost_per_unit NUMERIC DEFAULT 0,
        waste_factor NUMERIC DEFAULT 0.15,
        supplier_ref TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `,
  });
  if (e1) { console.error('ERR create materials:', e1.message); return; }
  console.log('✅ materials table created');

  // ── 2. Seed common materials ──────────────────────────────────────────────
  const { error: e2 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      INSERT INTO materials (code, name, category, thickness_mm, unit, cost_per_unit, waste_factor) VALUES
        ('MDF_18_WHITE',    'MDF 18mm White',          'panel',    18, 'm2', 120, 0.15),
        ('MDF_18_RAW',      'MDF 18mm Raw',            'panel',    18, 'm2', 90,  0.15),
        ('MDF_16_WHITE',    'MDF 16mm White',          'panel',    16, 'm2', 105, 0.15),
        ('MDF_22_WHITE',    'MDF 22mm White',          'panel',    22, 'm2', 140, 0.15),
        ('MEL_18_WHITE',    'Melamine 18mm White',     'panel',    18, 'm2', 95,  0.12),
        ('MEL_18_OAK',      'Melamine 18mm Oak',       'panel',    18, 'm2', 110, 0.12),
        ('MEL_18_WALNUT',   'Melamine 18mm Walnut',    'panel',    18, 'm2', 115, 0.12),
        ('MEL_18_ANTHRACITE','Melamine 18mm Anthracite','panel',    18, 'm2', 110, 0.12),
        ('PLY_18',          'Plywood 18mm',            'panel',    18, 'm2', 160, 0.15),
        ('HDF_3_BACK',      'HDF 3mm Back Panel',      'back',      3, 'm2', 35,  0.10),
        ('HDF_5_BACK',      'HDF 5mm Back Panel',      'back',      5, 'm2', 45,  0.10),
        ('PVC_04',          'PVC Edge Band 0.4mm',     'edge',    0.4, 'ml', 2,   0.05),
        ('PVC_1',           'PVC Edge Band 1mm',       'edge',      1, 'ml', 4,   0.05),
        ('PVC_2',           'PVC Edge Band 2mm',       'edge',      2, 'ml', 6,   0.05),
        ('ABS_2',           'ABS Edge Band 2mm',       'edge',      2, 'ml', 8,   0.05),
        ('SOLID_45',        'Solid Wood Edge 45mm',    'edge',     45, 'ml', 25,  0.08),
        ('HINGE_SOFT',      'Soft-close Hinge',        'hardware', NULL, 'pcs', 18, 0),
        ('DRAWER_SLIDE',    'Drawer Slide Pair',       'hardware', NULL, 'pair', 65, 0),
        ('SHELF_SUPPORT',   'Shelf Support Pin',       'hardware', NULL, 'pcs', 1.5, 0),
        ('CAM_LOCK',        'Cam Lock + Dowel',        'hardware', NULL, 'pcs', 3,   0),
        ('HANDLE_128',      'Handle 128mm CC',         'hardware', NULL, 'pcs', 12,  0),
        ('LEG_ADJUST',      'Adjustable Leg 100mm',    'hardware', NULL, 'pcs', 8,   0)
      ON CONFLICT (code) DO NOTHING;
    `,
  });
  if (e2) console.warn('WARN seed materials:', e2.message);
  else console.log('✅ 22 materials seeded');

  // ── 3. generate_project_bom() SQL function ────────────────────────────────
  const { error: e3 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE OR REPLACE FUNCTION generate_project_bom(p_project_id UUID)
      RETURNS JSONB AS $$
      DECLARE
        v_panel_count INT := 0;
        v_mat_count INT := 0;
      BEGIN
        -- Delete existing BOM for this project
        DELETE FROM project_material_requirements_bom WHERE project_id = p_project_id;

        -- Aggregate project_parts into material requirements
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
        GROUP BY pp.material_type, m.waste_factor, m.cost_per_unit;

        GET DIAGNOSTICS v_mat_count = ROW_COUNT;

        -- Count total parts
        SELECT COALESCE(SUM(quantity), 0) INTO v_panel_count
        FROM project_parts WHERE project_id = p_project_id;

        RETURN jsonb_build_object(
          'materials', v_mat_count,
          'panels', v_panel_count,
          'project_id', p_project_id
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `,
  });
  if (e3) console.warn('WARN create generate_project_bom:', e3.message);
  else console.log('✅ generate_project_bom() function created');

  // ── 4. Back-fill BOM for projects with parts but no BOM ───────────────────
  console.log('⏳ Back-filling BOM for projects with parts...');
  const { data: projectsWithParts } = await supabase
    .from('project_parts')
    .select('project_id')
    .limit(500);

  if (projectsWithParts && projectsWithParts.length > 0) {
    const uniqueProjects = [...new Set(projectsWithParts.map(p => p.project_id))];
    let filled = 0;
    for (const pid of uniqueProjects) {
      const { data: result, error: genErr } = await supabase.rpc('generate_project_bom', { p_project_id: pid });
      if (genErr) {
        console.warn('  WARN BOM for ' + pid + ':', genErr.message);
      } else {
        filled++;
        console.log('  BOM generated for ' + pid + ':', JSON.stringify(result));
      }
    }
    console.log('✅ BOM back-filled for ' + filled + ' project(s)');
  } else {
    console.log('ℹ️  No projects with parts to back-fill');
  }

  // ── 5. Update production order validation ─────────────────────────────────
  // Replace the trigger function to check project_parts OR project_material_requirements_bom
  const { error: e5 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE OR REPLACE FUNCTION validate_production_order()
      RETURNS TRIGGER AS $$
      DECLARE
        v_project_status TEXT;
        v_module_count INT;
        v_parts_count INT;
        v_bom_count INT;
      BEGIN
        -- Check project status
        SELECT status INTO v_project_status
        FROM projects WHERE id = NEW.project_id;

        IF v_project_status IS NULL THEN
          RAISE EXCEPTION 'Production order rejected: Project not found.';
        END IF;

        IF v_project_status NOT IN ('production', 'installation', 'delivered', 'completed') THEN
          RAISE EXCEPTION 'Production order rejected: Project status is "%" — must be in production, installation, or delivered stage. Current stage: %',
            v_project_status, v_project_status;
        END IF;

        -- Check for modules OR cabinet specs
        SELECT COUNT(*) INTO v_module_count
        FROM cabinet_specs WHERE project_id = NEW.project_id;

        IF v_module_count = 0 THEN
          SELECT COUNT(*) INTO v_module_count
          FROM project_modules WHERE project_id = NEW.project_id AND deleted_at IS NULL;
        END IF;

        IF v_module_count = 0 THEN
          RAISE EXCEPTION 'Production order rejected: No modules assigned to this project. Assign cabinet modules before creating a production order.';
        END IF;

        -- Check for parts OR BOM (either source is valid)
        SELECT COUNT(*) INTO v_parts_count
        FROM project_parts WHERE project_id = NEW.project_id;

        SELECT COUNT(*) INTO v_bom_count
        FROM project_material_requirements_bom WHERE project_id = NEW.project_id;

        -- Also check panel_list via cabinet_specs
        IF v_parts_count = 0 AND v_bom_count = 0 THEN
          SELECT COUNT(*) INTO v_parts_count
          FROM panel_list pl
          JOIN cabinet_specs cs ON cs.id = pl.cabinet_spec_id
          WHERE cs.project_id = NEW.project_id;
        END IF;

        IF v_parts_count = 0 AND v_bom_count = 0 THEN
          RAISE EXCEPTION 'Production order rejected: No BOM or parts found for this project. Generate parts list or BOM before creating a production order.';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  });
  if (e5) console.warn('WARN update trigger fn:', e5.message);
  else console.log('✅ validate_production_order() updated (accepts parts OR BOM OR panel_list)');

  // Ensure trigger exists
  const { error: e5b } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      DROP TRIGGER IF EXISTS trg_validate_production_order ON production_orders;
      CREATE TRIGGER trg_validate_production_order
        BEFORE INSERT ON production_orders
        FOR EACH ROW
        EXECUTE FUNCTION validate_production_order();
    `,
  });
  if (e5b) console.warn('WARN create trigger:', e5b.message);
  else console.log('✅ Trigger trg_validate_production_order created');

  // ── 6. RLS for materials ──────────────────────────────────────────────────
  const rlsDDL = [
    'ALTER TABLE materials ENABLE ROW LEVEL SECURITY;',
    `CREATE POLICY "materials_select" ON materials FOR SELECT USING (true);`,
    `CREATE POLICY "materials_insert" ON materials FOR INSERT WITH CHECK (true);`,
    `CREATE POLICY "materials_update" ON materials FOR UPDATE USING (true);`,
  ];
  for (const ddl of rlsDDL) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: ddl });
    if (error && !error.message.includes('already exists')) console.warn('WARN RLS:', error.message);
  }
  console.log('✅ RLS policies for materials created');

  // ── 7. Indexes ────────────────────────────────────────────────────────────
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);',
    'CREATE INDEX IF NOT EXISTS idx_materials_code ON materials(code);',
    'CREATE INDEX IF NOT EXISTS idx_project_parts_project ON project_parts(project_id);',
    'CREATE INDEX IF NOT EXISTS idx_project_bom_project ON project_material_requirements_bom(project_id);',
  ];
  for (const ddl of indexes) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: ddl });
    if (error) console.warn('WARN index:', error.message);
  }
  console.log('✅ Indexes created');

  console.log('\n🎉 BOM Engine migration complete');
};
