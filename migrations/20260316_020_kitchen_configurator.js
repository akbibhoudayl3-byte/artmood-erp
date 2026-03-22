// ============================================================
// Migration 20260316_020 — Kitchen Configurator
// Adds material presets, hardware presets, layout templates,
// kitchen_configurations table, and seeds 13 cabinet modules
// ============================================================

exports.version = '20260316_020';
exports.name = 'kitchen_configurator';

exports.up = async function (supabase) {
  // Helper: run DDL via the existing RPC
  async function ddl(sql) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
    if (error) throw new Error('DDL failed: ' + error.message + ' | SQL: ' + sql.substring(0, 200));
  }

  // ─── 1. cabinet_material_presets ───────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS cabinet_material_presets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      carcass_material TEXT NOT NULL DEFAULT 'mdf_18',
      carcass_thickness_mm NUMERIC NOT NULL DEFAULT 18,
      facade_material TEXT NOT NULL DEFAULT 'mdf_18',
      facade_thickness_mm NUMERIC NOT NULL DEFAULT 18,
      back_panel_material TEXT NOT NULL DEFAULT 'back_hdf_5',
      back_panel_thickness_mm NUMERIC NOT NULL DEFAULT 5,
      edge_band_type TEXT NOT NULL DEFAULT '1mm_pvc',
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ─── 2. cabinet_hardware_presets ───────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS cabinet_hardware_presets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'standard',
      description TEXT,
      hinge_type TEXT NOT NULL DEFAULT 'soft_close_110',
      hinge_unit_price NUMERIC NOT NULL DEFAULT 25,
      drawer_slide_type TEXT NOT NULL DEFAULT 'ball_bearing_full',
      drawer_slide_unit_price NUMERIC NOT NULL DEFAULT 80,
      handle_type TEXT NOT NULL DEFAULT 'bar_160mm',
      handle_unit_price NUMERIC NOT NULL DEFAULT 35,
      shelf_support_unit_price NUMERIC NOT NULL DEFAULT 2,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ─── 3. kitchen_layout_templates ───────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS kitchen_layout_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      layout_type TEXT NOT NULL,
      description TEXT,
      default_module_slots JSONB NOT NULL DEFAULT '[]',
      illustration_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ─── 4. kitchen_configurations ─────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS kitchen_configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      layout_template_id UUID REFERENCES kitchen_layout_templates(id),
      material_preset_id UUID REFERENCES cabinet_material_presets(id),
      hardware_preset_id UUID REFERENCES cabinet_hardware_presets(id),
      opening_system TEXT NOT NULL DEFAULT 'handle',
      wall_length_mm NUMERIC,
      wall_length_b_mm NUMERIC,
      ceiling_height_mm NUMERIC DEFAULT 2700,
      notes TEXT,
      generation_status TEXT NOT NULL DEFAULT 'draft',
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id)
    );
  `);

  // ─── 5. RLS policies ──────────────────────────────────────────────────────
  const tables = ['cabinet_material_presets', 'cabinet_hardware_presets', 'kitchen_layout_templates', 'kitchen_configurations'];
  for (const t of tables) {
    await ddl(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    await ddl(`DROP POLICY IF EXISTS "${t}_select" ON ${t};`);
    await ddl(`CREATE POLICY "${t}_select" ON ${t} FOR SELECT USING (true);`);
    await ddl(`DROP POLICY IF EXISTS "${t}_insert" ON ${t};`);
    await ddl(`CREATE POLICY "${t}_insert" ON ${t} FOR INSERT WITH CHECK (true);`);
    await ddl(`DROP POLICY IF EXISTS "${t}_update" ON ${t};`);
    await ddl(`CREATE POLICY "${t}_update" ON ${t} FOR UPDATE USING (true);`);
    await ddl(`DROP POLICY IF EXISTS "${t}_delete" ON ${t};`);
    await ddl(`CREATE POLICY "${t}_delete" ON ${t} FOR DELETE USING (true);`);
  }

  // ─── 6. Seed material presets ──────────────────────────────────────────────
  const materialPresets = [
    { name: 'MDF Blanc 18mm', description: 'MDF blanc standard pour caisson et façade', carcass_material: 'mdf_18', carcass_thickness_mm: 18, facade_material: 'mdf_18', facade_thickness_mm: 18, back_panel_material: 'back_hdf_5', back_panel_thickness_mm: 5, edge_band_type: '1mm_pvc', sort_order: 1 },
    { name: 'Stratifié Chêne', description: 'Stratifié chêne pour façade, MDF pour caisson', carcass_material: 'mdf_18', carcass_thickness_mm: 18, facade_material: 'stratifie_18', facade_thickness_mm: 18, back_panel_material: 'back_hdf_5', back_panel_thickness_mm: 5, edge_band_type: '2mm_pvc', sort_order: 2 },
    { name: 'Stratifié Noyer', description: 'Stratifié noyer pour façade, MDF pour caisson', carcass_material: 'mdf_18', carcass_thickness_mm: 18, facade_material: 'stratifie_18', facade_thickness_mm: 18, back_panel_material: 'back_hdf_5', back_panel_thickness_mm: 5, edge_band_type: '2mm_pvc', sort_order: 3 },
    { name: 'MDF Laqué', description: 'MDF à laquer — finition haut de gamme', carcass_material: 'mdf_18', carcass_thickness_mm: 18, facade_material: 'mdf_18', facade_thickness_mm: 22, back_panel_material: 'back_mdf_8', back_panel_thickness_mm: 8, edge_band_type: '2mm_abs', sort_order: 4 },
    { name: 'Mélaminé Anthracite', description: 'Mélaminé anthracite biface', carcass_material: 'melamine_anthracite', carcass_thickness_mm: 18, facade_material: 'melamine_anthracite', facade_thickness_mm: 18, back_panel_material: 'back_hdf_5', back_panel_thickness_mm: 5, edge_band_type: '1mm_pvc', sort_order: 5 },
  ];

  for (const p of materialPresets) {
    const { error } = await supabase.from('cabinet_material_presets').upsert(p, { onConflict: 'name' });
    if (error) console.warn('Material preset upsert:', error.message);
  }

  // ─── 7. Seed hardware presets ──────────────────────────────────────────────
  const hardwarePresets = [
    { name: 'Premium', tier: 'premium', description: 'Blum / Hettich haut de gamme', hinge_type: 'blum_clip_top', hinge_unit_price: 55, drawer_slide_type: 'blum_tandem_full', drawer_slide_unit_price: 180, handle_type: 'gola_profile', handle_unit_price: 85, shelf_support_unit_price: 4, sort_order: 1 },
    { name: 'Standard', tier: 'standard', description: 'Quincaillerie standard qualité', hinge_type: 'soft_close_110', hinge_unit_price: 25, drawer_slide_type: 'ball_bearing_full', drawer_slide_unit_price: 80, handle_type: 'bar_160mm', handle_unit_price: 35, shelf_support_unit_price: 2, sort_order: 2 },
    { name: 'Budget', tier: 'budget', description: 'Économique — projets petits budgets', hinge_type: 'basic_110', hinge_unit_price: 12, drawer_slide_type: 'roller_partial', drawer_slide_unit_price: 35, handle_type: 'knob_basic', handle_unit_price: 15, shelf_support_unit_price: 1, sort_order: 3 },
  ];

  for (const p of hardwarePresets) {
    const { error } = await supabase.from('cabinet_hardware_presets').upsert(p, { onConflict: 'name' });
    if (error) console.warn('Hardware preset upsert:', error.message);
  }

  // ─── 8. Seed kitchen layout templates ──────────────────────────────────────
  const layouts = [
    { name: 'Cuisine en I', layout_type: 'I', description: 'Linéaire — un seul mur', default_module_slots: JSON.stringify([
      { position: 1, category: 'base_cabinet', label: 'Bas gauche' },
      { position: 2, category: 'base_cabinet', label: 'Évier' },
      { position: 3, category: 'base_cabinet', label: 'Bas centre' },
      { position: 4, category: 'base_cabinet', label: 'Bas droite' },
      { position: 5, category: 'wall_cabinet', label: 'Haut gauche' },
      { position: 6, category: 'wall_cabinet', label: 'Haut centre' },
      { position: 7, category: 'wall_cabinet', label: 'Haut droite' },
    ]), sort_order: 1 },
    { name: 'Cuisine en L', layout_type: 'L', description: 'Deux murs perpendiculaires', default_module_slots: JSON.stringify([
      { position: 1, category: 'base_cabinet', label: 'Mur A — Bas 1' },
      { position: 2, category: 'base_cabinet', label: 'Mur A — Évier' },
      { position: 3, category: 'base_cabinet', label: 'Mur A — Bas 3' },
      { position: 4, category: 'base_cabinet', label: 'Angle bas' },
      { position: 5, category: 'base_cabinet', label: 'Mur B — Bas 1' },
      { position: 6, category: 'base_cabinet', label: 'Mur B — Bas 2' },
      { position: 7, category: 'wall_cabinet', label: 'Mur A — Haut 1' },
      { position: 8, category: 'wall_cabinet', label: 'Mur A — Haut 2' },
      { position: 9, category: 'wall_cabinet', label: 'Angle haut' },
      { position: 10, category: 'wall_cabinet', label: 'Mur B — Haut 1' },
    ]), sort_order: 2 },
    { name: 'Cuisine en U', layout_type: 'U', description: 'Trois murs', default_module_slots: JSON.stringify([
      { position: 1, category: 'base_cabinet', label: 'Mur A — Bas 1' },
      { position: 2, category: 'base_cabinet', label: 'Mur A — Bas 2' },
      { position: 3, category: 'base_cabinet', label: 'Angle A-B' },
      { position: 4, category: 'base_cabinet', label: 'Mur B — Bas 1' },
      { position: 5, category: 'base_cabinet', label: 'Mur B — Évier' },
      { position: 6, category: 'base_cabinet', label: 'Mur B — Bas 3' },
      { position: 7, category: 'base_cabinet', label: 'Angle B-C' },
      { position: 8, category: 'base_cabinet', label: 'Mur C — Bas 1' },
      { position: 9, category: 'base_cabinet', label: 'Mur C — Bas 2' },
      { position: 10, category: 'wall_cabinet', label: 'Mur A — Haut' },
      { position: 11, category: 'wall_cabinet', label: 'Mur B — Haut 1' },
      { position: 12, category: 'wall_cabinet', label: 'Mur B — Haut 2' },
      { position: 13, category: 'wall_cabinet', label: 'Mur C — Haut' },
    ]), sort_order: 3 },
    { name: 'Cuisine Parallèle', layout_type: 'parallel', description: 'Deux murs face à face (galley)', default_module_slots: JSON.stringify([
      { position: 1, category: 'base_cabinet', label: 'Mur A — Bas 1' },
      { position: 2, category: 'base_cabinet', label: 'Mur A — Évier' },
      { position: 3, category: 'base_cabinet', label: 'Mur A — Bas 3' },
      { position: 4, category: 'base_cabinet', label: 'Mur B — Bas 1' },
      { position: 5, category: 'base_cabinet', label: 'Mur B — Bas 2' },
      { position: 6, category: 'base_cabinet', label: 'Mur B — Bas 3' },
      { position: 7, category: 'wall_cabinet', label: 'Mur A — Haut' },
      { position: 8, category: 'wall_cabinet', label: 'Mur B — Haut' },
    ]), sort_order: 4 },
    { name: 'Cuisine avec Îlot', layout_type: 'island', description: 'Mur + îlot central', default_module_slots: JSON.stringify([
      { position: 1, category: 'base_cabinet', label: 'Mur — Bas 1' },
      { position: 2, category: 'base_cabinet', label: 'Mur — Évier' },
      { position: 3, category: 'base_cabinet', label: 'Mur — Bas 3' },
      { position: 4, category: 'tall_cabinet', label: 'Colonne four' },
      { position: 5, category: 'tall_cabinet', label: 'Colonne frigo' },
      { position: 6, category: 'wall_cabinet', label: 'Mur — Haut 1' },
      { position: 7, category: 'wall_cabinet', label: 'Mur — Haut 2' },
      { position: 8, category: 'base_cabinet', label: 'Îlot — Bas 1' },
      { position: 9, category: 'base_cabinet', label: 'Îlot — Bas 2' },
      { position: 10, category: 'base_cabinet', label: 'Îlot — Bas 3' },
    ]), sort_order: 5 },
  ];

  for (const l of layouts) {
    const { error } = await supabase.from('kitchen_layout_templates').upsert(l, { onConflict: 'name' });
    if (error) console.warn('Layout upsert:', error.message);
  }

  // ─── 9. Seed 13 cabinet modules into product_modules ───────────────────────
  // Only insert if they don't exist (by code)
  const modules = [
    // Base cabinets
    { code: 'BASE-400', name: 'Caisson bas 400mm', category: 'base_cabinet', width_mm: 400, height_mm: 720, depth_mm: 560, description: 'Caisson bas 1 porte — 400mm', has_doors: true, door_count: 1, has_shelves: true, shelf_count: 1, has_drawers: false, drawer_count: 0 },
    { code: 'BASE-600', name: 'Caisson bas 600mm', category: 'base_cabinet', width_mm: 600, height_mm: 720, depth_mm: 560, description: 'Caisson bas 1 porte — 600mm', has_doors: true, door_count: 1, has_shelves: true, shelf_count: 1, has_drawers: false, drawer_count: 0 },
    { code: 'BASE-800', name: 'Caisson bas 800mm', category: 'base_cabinet', width_mm: 800, height_mm: 720, depth_mm: 560, description: 'Caisson bas 2 portes — 800mm', has_doors: true, door_count: 2, has_shelves: true, shelf_count: 1, has_drawers: false, drawer_count: 0 },
    { code: 'SINK-BASE', name: 'Caisson sous évier', category: 'base_cabinet', width_mm: 800, height_mm: 720, depth_mm: 560, description: 'Caisson sous évier 2 portes (sans étagère)', has_doors: true, door_count: 2, has_shelves: false, shelf_count: 0, has_drawers: false, drawer_count: 0 },
    { code: 'DRAWER-600', name: 'Caisson tiroirs 600mm', category: 'base_cabinet', width_mm: 600, height_mm: 720, depth_mm: 560, description: 'Caisson 3 tiroirs — 600mm', has_doors: false, door_count: 0, has_shelves: false, shelf_count: 0, has_drawers: true, drawer_count: 3 },
    { code: 'CORNER-BASE', name: 'Caisson angle bas', category: 'base_cabinet', width_mm: 900, height_mm: 720, depth_mm: 900, description: 'Caisson angle bas avec plateau tournant', has_doors: true, door_count: 1, has_shelves: false, shelf_count: 0, has_drawers: false, drawer_count: 0 },
    // Wall cabinets
    { code: 'WALL-400', name: 'Caisson haut 400mm', category: 'wall_cabinet', width_mm: 400, height_mm: 720, depth_mm: 330, description: 'Caisson haut 1 porte — 400mm', has_doors: true, door_count: 1, has_shelves: true, shelf_count: 2, has_drawers: false, drawer_count: 0 },
    { code: 'WALL-600', name: 'Caisson haut 600mm', category: 'wall_cabinet', width_mm: 600, height_mm: 720, depth_mm: 330, description: 'Caisson haut 1 porte — 600mm', has_doors: true, door_count: 1, has_shelves: true, shelf_count: 2, has_drawers: false, drawer_count: 0 },
    { code: 'WALL-800', name: 'Caisson haut 800mm', category: 'wall_cabinet', width_mm: 800, height_mm: 720, depth_mm: 330, description: 'Caisson haut 2 portes — 800mm', has_doors: true, door_count: 2, has_shelves: true, shelf_count: 2, has_drawers: false, drawer_count: 0 },
    { code: 'CORNER-WALL', name: 'Caisson angle haut', category: 'wall_cabinet', width_mm: 600, height_mm: 720, depth_mm: 600, description: 'Caisson angle haut diagonal', has_doors: true, door_count: 1, has_shelves: true, shelf_count: 2, has_drawers: false, drawer_count: 0 },
    // Tall cabinets
    { code: 'OVEN-TALL', name: 'Colonne four', category: 'tall_cabinet', width_mm: 600, height_mm: 2100, depth_mm: 560, description: 'Colonne encastrement four + micro-ondes', has_doors: true, door_count: 2, has_shelves: true, shelf_count: 1, has_drawers: false, drawer_count: 0 },
    { code: 'FRIDGE-TALL', name: 'Colonne frigo', category: 'tall_cabinet', width_mm: 600, height_mm: 2100, depth_mm: 560, description: 'Colonne encastrement réfrigérateur', has_doors: true, door_count: 2, has_shelves: false, shelf_count: 0, has_drawers: false, drawer_count: 0 },
    { code: 'PANTRY-TALL', name: 'Colonne rangement', category: 'tall_cabinet', width_mm: 600, height_mm: 2100, depth_mm: 560, description: 'Colonne rangement 2 portes + étagères', has_doors: true, door_count: 2, has_shelves: true, shelf_count: 4, has_drawers: false, drawer_count: 0 },
  ];

  for (const m of modules) {
    // Check existing
    const { data: existing } = await supabase.from('product_modules').select('id').eq('code', m.code).maybeSingle();
    if (existing) { console.log('Module ' + m.code + ' already exists, skipping.'); continue; }

    const { data: inserted, error: mErr } = await supabase.from('product_modules').insert({
      code: m.code,
      name: m.name,
      category: m.category,
      width_mm: m.width_mm,
      height_mm: m.height_mm,
      depth_mm: m.depth_mm,
      description: m.description,
      is_active: true,
    }).select('id').single();
    if (mErr) { console.warn('Module insert ' + m.code + ':', mErr.message); continue; }
    console.log('Inserted module ' + m.code + ' → ' + inserted.id);

    // Generate parts for this module
    const moduleId = inserted.id;
    const parts = generateModuleParts(m);
    for (const part of parts) {
      part.module_id = moduleId;
      const { error: pErr } = await supabase.from('module_parts').insert(part);
      if (pErr) console.warn('Part insert:', pErr.message);
    }
    console.log('  → ' + parts.length + ' parts seeded for ' + m.code);
  }

  console.log('Migration 20260316_020 complete.');
};

// ─── Part generation logic ────────────────────────────────────────────────────
// Each module generates panels based on its type/dimensions using {W}, {H}, {D} formulas

function generateModuleParts(mod) {
  const parts = [];
  let order = 1;

  const isBase = mod.category === 'base_cabinet';
  const isWall = mod.category === 'wall_cabinet';
  const isTall = mod.category === 'tall_cabinet';
  const isCorner = mod.code.startsWith('CORNER');

  // ── Carcass panels (always present) ──

  // Left side
  parts.push({
    code: mod.code + '-SIDE-L',
    name: 'Côté gauche',
    part_type: 'panel',
    material_type: 'carcass',  // Will be resolved by preset
    thickness_mm: 18,
    width_formula: '{D}',
    height_formula: '{H}',
    quantity_formula: '1',
    edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
    grain_direction: 'length',
    sort_order: order++,
  });

  // Right side
  parts.push({
    code: mod.code + '-SIDE-R',
    name: 'Côté droit',
    part_type: 'panel',
    material_type: 'carcass',
    thickness_mm: 18,
    width_formula: '{D}',
    height_formula: '{H}',
    quantity_formula: '1',
    edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
    grain_direction: 'length',
    sort_order: order++,
  });

  // Top panel (base/tall = dessus, wall = dessus)
  parts.push({
    code: mod.code + '-TOP',
    name: 'Dessus',
    part_type: 'panel',
    material_type: 'carcass',
    thickness_mm: 18,
    width_formula: '{W} - 36',
    height_formula: '{D}',
    quantity_formula: '1',
    edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
    grain_direction: 'width',
    sort_order: order++,
  });

  // Bottom panel
  parts.push({
    code: mod.code + '-BOTTOM',
    name: 'Dessous',
    part_type: 'panel',
    material_type: 'carcass',
    thickness_mm: 18,
    width_formula: '{W} - 36',
    height_formula: '{D}',
    quantity_formula: '1',
    edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
    grain_direction: 'width',
    sort_order: order++,
  });

  // Back panel
  parts.push({
    code: mod.code + '-BACK',
    name: 'Fond',
    part_type: 'panel',
    material_type: 'back_panel',  // Will be resolved by preset
    thickness_mm: 5,
    width_formula: '{W} - 6',
    height_formula: '{H} - 6',
    quantity_formula: '1',
    edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
    grain_direction: 'none',
    sort_order: order++,
  });

  // ── Shelves ──
  if (mod.has_shelves && mod.shelf_count > 0) {
    parts.push({
      code: mod.code + '-SHELF',
      name: 'Étagère',
      part_type: 'panel',
      material_type: 'carcass',
      thickness_mm: 18,
      width_formula: '{W} - 37',
      height_formula: '{D} - 20',
      quantity_formula: String(mod.shelf_count),
      edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
      grain_direction: 'width',
      sort_order: order++,
    });
  }

  // ── Doors (facade material) ──
  if (mod.has_doors && mod.door_count > 0) {
    if (mod.door_count === 1) {
      parts.push({
        code: mod.code + '-DOOR',
        name: 'Porte',
        part_type: 'panel',
        material_type: 'facade',  // Will be resolved by preset
        thickness_mm: 18,
        width_formula: '{W} - 4',
        height_formula: '{H} - 4',
        quantity_formula: '1',
        edge_top: true, edge_bottom: true, edge_left: true, edge_right: true,
        grain_direction: 'length',
        sort_order: order++,
      });
    } else {
      // 2 doors
      parts.push({
        code: mod.code + '-DOOR',
        name: 'Porte',
        part_type: 'panel',
        material_type: 'facade',
        thickness_mm: 18,
        width_formula: 'Math.round(({W} - 6) / 2)',
        height_formula: '{H} - 4',
        quantity_formula: String(mod.door_count),
        edge_top: true, edge_bottom: true, edge_left: true, edge_right: true,
        grain_direction: 'length',
        sort_order: order++,
      });
    }
  }

  // ── Drawers (facade for fronts, carcass for boxes) ──
  if (mod.has_drawers && mod.drawer_count > 0) {
    // Drawer fronts
    parts.push({
      code: mod.code + '-DRW-FRONT',
      name: 'Façade tiroir',
      part_type: 'panel',
      material_type: 'facade',
      thickness_mm: 18,
      width_formula: '{W} - 4',
      height_formula: 'Math.round(({H} - ' + (mod.drawer_count + 1) * 2 + ') / ' + mod.drawer_count + ')',
      quantity_formula: String(mod.drawer_count),
      edge_top: true, edge_bottom: true, edge_left: true, edge_right: true,
      grain_direction: 'length',
      sort_order: order++,
    });

    // Drawer box sides (2 per drawer)
    parts.push({
      code: mod.code + '-DRW-SIDE',
      name: 'Côté tiroir',
      part_type: 'panel',
      material_type: 'carcass',
      thickness_mm: 16,
      width_formula: '{D} - 80',
      height_formula: '120',
      quantity_formula: String(mod.drawer_count * 2),
      edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
      grain_direction: 'length',
      sort_order: order++,
    });

    // Drawer box front/back (2 per drawer)
    parts.push({
      code: mod.code + '-DRW-FB',
      name: 'Devant/arrière tiroir',
      part_type: 'panel',
      material_type: 'carcass',
      thickness_mm: 16,
      width_formula: '{W} - 76',
      height_formula: '120',
      quantity_formula: String(mod.drawer_count * 2),
      edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
      grain_direction: 'width',
      sort_order: order++,
    });

    // Drawer bottom
    parts.push({
      code: mod.code + '-DRW-BOTTOM',
      name: 'Fond tiroir',
      part_type: 'panel',
      material_type: 'back_panel',
      thickness_mm: 5,
      width_formula: '{W} - 78',
      height_formula: '{D} - 82',
      quantity_formula: String(mod.drawer_count),
      edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
      grain_direction: 'none',
      sort_order: order++,
    });
  }

  // ── Tall cabinet specifics ──
  if (isTall && mod.code === 'OVEN-TALL') {
    // Middle shelf for oven support
    parts.push({
      code: mod.code + '-OVEN-SHELF',
      name: 'Tablette four',
      part_type: 'panel',
      material_type: 'carcass',
      thickness_mm: 18,
      width_formula: '{W} - 36',
      height_formula: '{D}',
      quantity_formula: '1',
      edge_top: true, edge_bottom: false, edge_left: false, edge_right: false,
      grain_direction: 'width',
      sort_order: order++,
    });
  }

  return parts;
}
