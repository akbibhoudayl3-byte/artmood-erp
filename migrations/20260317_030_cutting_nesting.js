/**
 * Migration 20260317_030 — Cutting Jobs, Nesting Panels, Placements, CNC Programs
 * Creates 4 tables for the Cutting / Nesting / G-code pipeline.
 */
exports.version = '20260317_030';
exports.name = 'cutting_nesting';

exports.up = async function (supabase) {
  async function ddl(sql) {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
    if (error) throw new Error('DDL failed: ' + error.message);
  }

  // 1. cutting_jobs — one per project cutting session
  await ddl(`
    CREATE TABLE IF NOT EXISTS cutting_jobs (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','nesting','nested','cutting','done')),
      total_parts     INT NOT NULL DEFAULT 0,
      total_panels    INT NOT NULL DEFAULT 0,
      total_waste_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cutting_jobs_project ON cutting_jobs(project_id);
  `);

  // 2. cutting_panels — one physical sheet per material group
  await ddl(`
    CREATE TABLE IF NOT EXISTS cutting_panels (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      cutting_job_id  UUID NOT NULL REFERENCES cutting_jobs(id) ON DELETE CASCADE,
      material_code   TEXT NOT NULL,
      thickness_mm    INT NOT NULL,
      sheet_width_mm  INT NOT NULL,
      sheet_height_mm INT NOT NULL,
      panel_index     INT NOT NULL DEFAULT 1,
      used_area_mm2   NUMERIC NOT NULL DEFAULT 0,
      waste_area_mm2  NUMERIC NOT NULL DEFAULT 0,
      waste_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cutting_panels_job ON cutting_panels(cutting_job_id);
  `);

  // 3. panel_placements — one per part placed on a panel
  await ddl(`
    CREATE TABLE IF NOT EXISTS panel_placements (
      id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      cutting_panel_id  UUID NOT NULL REFERENCES cutting_panels(id) ON DELETE CASCADE,
      project_part_id   UUID REFERENCES project_parts(id) ON DELETE SET NULL,
      x_mm              NUMERIC NOT NULL DEFAULT 0,
      y_mm              NUMERIC NOT NULL DEFAULT 0,
      width_mm          NUMERIC NOT NULL,
      height_mm         NUMERIC NOT NULL,
      rotated           BOOLEAN NOT NULL DEFAULT false,
      part_label        TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_panel_placements_panel ON panel_placements(cutting_panel_id);
  `);

  // 4. cnc_programs — G-code files stored as text
  await ddl(`
    CREATE TABLE IF NOT EXISTS cnc_programs (
      id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
      cutting_job_id    UUID NOT NULL REFERENCES cutting_jobs(id) ON DELETE CASCADE,
      cutting_panel_id  UUID NOT NULL REFERENCES cutting_panels(id) ON DELETE CASCADE,
      file_name         TEXT NOT NULL,
      file_content      TEXT NOT NULL,
      format            TEXT NOT NULL DEFAULT 'gcode',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cnc_programs_job ON cnc_programs(cutting_job_id);
  `);

  // 5. RLS — enable + allow authenticated
  for (const tbl of ['cutting_jobs', 'cutting_panels', 'panel_placements', 'cnc_programs']) {
    await ddl(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`);
    await ddl(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${tbl}' AND policyname = '${tbl}_auth_all'
        ) THEN
          CREATE POLICY ${tbl}_auth_all ON ${tbl}
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `);
  }

  // 6. Record migration
  await ddl(`
    INSERT INTO schema_migrations (version, name)
    VALUES ('20260317_030', 'cutting_nesting')
    ON CONFLICT (version) DO NOTHING;
  `);
};
