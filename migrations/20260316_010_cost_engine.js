/**
 * Migration: Cost Engine
 *
 * 1. Create `cost_settings` config table + seed defaults
 * 2. Extend `quotes` table (margin_override, cost_snapshot, is_auto_generated)
 * 3. Create `calculate_project_cost()` SQL function
 * 4. Create `v_project_real_cost` view
 * 5. RLS + indexes
 */

exports.version = '20260316_010';
exports.name = 'cost_engine';

exports.up = async function (supabase) {
  // ── 1. cost_settings table ──────────────────────────────────────────────────
  const { error: e1 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE TABLE IF NOT EXISTS cost_settings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        labor_rate_per_hour NUMERIC NOT NULL DEFAULT 50,
        avg_hours_per_panel NUMERIC NOT NULL DEFAULT 0.5,
        machine_rate_per_hour NUMERIC NOT NULL DEFAULT 30,
        avg_machine_hours_per_panel NUMERIC NOT NULL DEFAULT 0.25,
        default_transport_cost NUMERIC NOT NULL DEFAULT 500,
        min_margin_percent NUMERIC NOT NULL DEFAULT 15,
        recommended_margin_percent NUMERIC NOT NULL DEFAULT 30,
        updated_at TIMESTAMPTZ DEFAULT now(),
        updated_by UUID
      );
    `,
  });
  if (e1) { console.error('ERR create cost_settings:', e1.message); return; }
  console.log('✅ cost_settings table created');

  // Seed one default row
  const { error: e1b } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      INSERT INTO cost_settings (id)
      SELECT gen_random_uuid()
      WHERE NOT EXISTS (SELECT 1 FROM cost_settings LIMIT 1);
    `,
  });
  if (e1b) console.warn('WARN seed cost_settings:', e1b.message);
  else console.log('✅ cost_settings seeded with defaults');

  // ── 2. Extend quotes table ──────────────────────────────────────────────────
  const alterQuotes = [
    'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_override BOOLEAN DEFAULT false;',
    'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_override_by UUID;',
    'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_override_reason TEXT;',
    'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false;',
    'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cost_snapshot JSONB;',
  ];
  for (const ddl of alterQuotes) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: ddl });
    if (error && !error.message.includes('already exists')) console.warn('WARN alter quotes:', error.message);
  }
  console.log('✅ quotes table extended (margin_override, cost_snapshot, is_auto_generated)');

  // ── 3. calculate_project_cost() SQL function ────────────────────────────────
  const { error: e3 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
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
        v_hw_table_exists BOOLEAN;
      BEGIN
        -- Load settings (single row)
        SELECT * INTO v_settings FROM cost_settings LIMIT 1;
        IF v_settings IS NULL THEN
          RAISE EXCEPTION 'Cost settings not configured. Please set up cost_settings first.';
        END IF;

        -- Material cost from BOM (already calculated via materials catalog)
        SELECT
          COALESCE(SUM(total_cost), 0),
          COALESCE(SUM(panels_required), 0)
        INTO v_material_cost, v_total_panels
        FROM project_material_requirements_bom
        WHERE project_id = p_project_id;

        -- Hardware cost (table may not exist for all installs)
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'project_hardware_requirements'
        ) INTO v_hw_table_exists;

        IF v_hw_table_exists THEN
          EXECUTE 'SELECT COALESCE(SUM(total_cost), 0) FROM project_hardware_requirements WHERE project_id = $1'
          INTO v_hardware_cost
          USING p_project_id;
        END IF;

        -- Labor cost: panels * hours_per_panel * rate
        v_labor_cost := ROUND(
          v_total_panels * v_settings.avg_hours_per_panel * v_settings.labor_rate_per_hour, 2
        );

        -- Machine cost: panels * machine_hours_per_panel * rate
        v_machine_cost := ROUND(
          v_total_panels * v_settings.avg_machine_hours_per_panel * v_settings.machine_rate_per_hour, 2
        );

        -- Transport: flat default
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
    `,
  });
  if (e3) console.warn('WARN create calculate_project_cost:', e3.message);
  else console.log('✅ calculate_project_cost() function created');

  // ── 4. v_project_real_cost view ─────────────────────────────────────────────
  const { error: e4 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE OR REPLACE VIEW v_project_real_cost AS
      SELECT
        p.id AS project_id,
        p.reference_code,
        p.client_name,
        p.total_amount AS revenue,
        COALESCE(SUM(pc.amount), 0) AS real_cost,
        p.total_amount - COALESCE(SUM(pc.amount), 0) AS profit,
        CASE WHEN p.total_amount > 0
          THEN ROUND(((p.total_amount - COALESCE(SUM(pc.amount), 0)) / p.total_amount * 100)::numeric, 1)
          ELSE 0
        END AS margin_percent,
        CASE
          WHEN p.total_amount <= 0 THEN 'no_revenue'
          WHEN p.total_amount - COALESCE(SUM(pc.amount), 0) < 0 THEN 'loss'
          WHEN ((p.total_amount - COALESCE(SUM(pc.amount), 0)) / p.total_amount * 100) < 10 THEN 'critical'
          WHEN ((p.total_amount - COALESCE(SUM(pc.amount), 0)) / p.total_amount * 100) < 20 THEN 'warning'
          ELSE 'healthy'
        END AS margin_health
      FROM projects p
      LEFT JOIN project_costs pc ON pc.project_id = p.id
      GROUP BY p.id, p.reference_code, p.client_name, p.total_amount;
    `,
  });
  if (e4) console.warn('WARN create v_project_real_cost:', e4.message);
  else console.log('✅ v_project_real_cost view created');

  // ── 5. RLS for cost_settings ────────────────────────────────────────────────
  const rlsDDL = [
    'ALTER TABLE cost_settings ENABLE ROW LEVEL SECURITY;',
    `CREATE POLICY "cost_settings_select" ON cost_settings FOR SELECT USING (true);`,
    `CREATE POLICY "cost_settings_update" ON cost_settings FOR UPDATE USING (true);`,
    `CREATE POLICY "cost_settings_insert" ON cost_settings FOR INSERT WITH CHECK (true);`,
  ];
  for (const ddl of rlsDDL) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: ddl });
    if (error && !error.message.includes('already exists')) console.warn('WARN RLS:', error.message);
  }
  console.log('✅ RLS policies for cost_settings created');

  console.log('\n🎉 Cost Engine migration complete');
};
