/**
 * Migration: Production Workflow Engine
 * Creates production_stations + production_tasks tables,
 * seeds 8 workflow stations, and generates tasks for existing orders.
 */

exports.version = '20260316_004';
exports.name = 'production_workflow';

exports.up = async function (supabase) {
  // ── 1. production_stations table ──────────────────────────
  const { error: e1 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE TABLE IF NOT EXISTS production_stations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        legacy_code TEXT,
        order_index INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `,
  });
  if (e1) { console.error('ERR create production_stations:', e1.message); return; }
  console.log('✅ production_stations table created');

  // ── 2. Seed 8 stations ────────────────────────────────────
  const { error: e2 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      INSERT INTO production_stations (name, code, legacy_code, order_index) VALUES
        ('Design Check',       'DESIGN_CHECK',      NULL,       1),
        ('Cutting',            'CUTTING',           'saw',      2),
        ('Edge Banding',       'EDGE_BANDING',      'edge',     3),
        ('Drilling',           'DRILLING',          'cnc',      4),
        ('Assembly',           'ASSEMBLY',          'assembly', 5),
        ('Quality Check',      'QUALITY_CHECK',     'qc',       6),
        ('Packaging',          'PACKAGING',         'packing',  7),
        ('Ready for Install',  'READY_FOR_INSTALL', NULL,       8)
      ON CONFLICT (code) DO NOTHING;
    `,
  });
  if (e2) { console.error('ERR seed stations:', e2.message); return; }
  console.log('✅ 8 workflow stations seeded');

  // ── 3. production_tasks table ─────────────────────────────
  const { error: e3 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE TABLE IF NOT EXISTS production_tasks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id),
        station_id UUID NOT NULL REFERENCES production_stations(id),
        assigned_to UUID REFERENCES profiles(id),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','in_progress','paused','completed','blocked','rework_sent')),
        qc_result TEXT CHECK (qc_result IS NULL OR qc_result IN ('approved','rework_required','rejected')),
        rework_target_station_id UUID REFERENCES production_stations(id),
        rework_from_task_id UUID REFERENCES production_tasks(id),
        rework_count INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        duration_minutes INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `,
  });
  if (e3) { console.error('ERR create production_tasks:', e3.message); return; }
  console.log('✅ production_tasks table created');

  // ── 4. Indexes ────────────────────────────────────────────
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_ptasks_order ON production_tasks(production_order_id);',
    'CREATE INDEX IF NOT EXISTS idx_ptasks_assigned ON production_tasks(assigned_to);',
    'CREATE INDEX IF NOT EXISTS idx_ptasks_station ON production_tasks(station_id);',
    'CREATE INDEX IF NOT EXISTS idx_ptasks_status ON production_tasks(status);',
  ];
  for (const ddl of indexes) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: ddl });
    if (error) console.warn('WARN index:', error.message);
  }
  console.log('✅ Indexes created');

  // ── 5. updated_at trigger ─────────────────────────────────
  const { error: e5 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE OR REPLACE TRIGGER trg_production_tasks_updated_at
        BEFORE UPDATE ON production_tasks
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `,
  });
  if (e5) console.warn('WARN trigger:', e5.message);
  else console.log('✅ updated_at trigger created');

  // ── 6. View: v_production_task_board ──────────────────────
  const { error: e6 } = await supabase.rpc('run_migration_ddl', {
    sql_text: `
      CREATE OR REPLACE VIEW v_production_task_board AS
      SELECT
        t.id,
        t.production_order_id,
        t.project_id,
        t.station_id,
        s.code AS station_code,
        s.name AS station_name,
        s.order_index,
        t.assigned_to,
        p.full_name AS assignee_name,
        t.status,
        t.qc_result,
        t.rework_count,
        t.started_at,
        t.ended_at,
        t.duration_minutes,
        t.notes,
        t.created_at,
        o.name AS order_name,
        o.status AS order_status,
        pr.client_name,
        pr.reference_code
      FROM production_tasks t
      JOIN production_stations s ON s.id = t.station_id
      JOIN production_orders o ON o.id = t.production_order_id
      LEFT JOIN profiles p ON p.id = t.assigned_to
      LEFT JOIN projects pr ON pr.id = t.project_id;
    `,
  });
  if (e6) console.warn('WARN view:', e6.message);
  else console.log('✅ v_production_task_board view created');

  // ── 7. RLS ────────────────────────────────────────────────
  const rlsDDL = [
    'ALTER TABLE production_stations ENABLE ROW LEVEL SECURITY;',
    `CREATE POLICY "ps_select" ON production_stations FOR SELECT USING (true);`,
    'ALTER TABLE production_tasks ENABLE ROW LEVEL SECURITY;',
    `CREATE POLICY "pt_select" ON production_tasks FOR SELECT USING (true);`,
    `CREATE POLICY "pt_insert" ON production_tasks FOR INSERT WITH CHECK (true);`,
    `CREATE POLICY "pt_update" ON production_tasks FOR UPDATE USING (true);`,
  ];
  for (const ddl of rlsDDL) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: ddl });
    if (error && !error.message.includes('already exists')) console.warn('WARN RLS:', error.message);
  }
  console.log('✅ RLS policies created');

  // ── 8. Data migration: generate tasks for existing orders ─
  console.log('⏳ Generating tasks for existing production orders...');

  // Fetch all stations
  const { data: stations, error: stErr } = await supabase
    .from('production_stations')
    .select('id, code, legacy_code, order_index')
    .order('order_index');
  if (stErr || !stations?.length) {
    console.warn('WARN: Could not fetch stations for data migration:', stErr?.message);
    return;
  }

  // Fetch existing orders
  const { data: orders, error: ordErr } = await supabase
    .from('production_orders')
    .select('id, project_id, status')
    .in('status', ['pending', 'in_progress']);
  if (ordErr) {
    console.warn('WARN: Could not fetch orders:', ordErr.message);
    return;
  }
  if (!orders?.length) {
    console.log('ℹ️  No existing orders to migrate');
    return;
  }

  let taskCount = 0;
  for (const order of orders) {
    // Check if tasks already exist for this order
    const { count } = await supabase
      .from('production_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('production_order_id', order.id);
    if (count && count > 0) continue;

    const tasks = stations.map((s) => ({
      production_order_id: order.id,
      project_id: order.project_id,
      station_id: s.id,
      status: 'pending',
    }));

    const { error: insErr } = await supabase.from('production_tasks').insert(tasks);
    if (insErr) {
      console.warn(`WARN: Failed to generate tasks for order ${order.id}:`, insErr.message);
    } else {
      taskCount += tasks.length;
    }
  }
  console.log(`✅ Generated ${taskCount} tasks for ${orders.length} existing orders`);
};
