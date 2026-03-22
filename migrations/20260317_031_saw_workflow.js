/**
 * Migration: SAW Workflow (Scie Panneaux)
 * - Add cutting_method to projects (default: 'saw')
 * - Add cut_at / cut_by to project_parts (execution tracking)
 * - Create saw_nesting_results table
 */
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DDL = `
-- 1. Add cutting_method to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cutting_method TEXT DEFAULT 'saw';
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT chk_cutting_method CHECK (cutting_method IN ('saw', 'cnc'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add execution tracking to project_parts
ALTER TABLE project_parts ADD COLUMN IF NOT EXISTS cut_at TIMESTAMPTZ;
ALTER TABLE project_parts ADD COLUMN IF NOT EXISTS cut_by UUID REFERENCES profiles(id);

-- 3. Create saw_nesting_results table
CREATE TABLE IF NOT EXISTS saw_nesting_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL,
  thickness_mm INT NOT NULL,
  sheet_width_mm INT NOT NULL,
  sheet_height_mm INT NOT NULL,
  sheet_index INT NOT NULL DEFAULT 1,
  strips JSONB NOT NULL DEFAULT '[]'::jsonb,
  used_area_mm2 NUMERIC DEFAULT 0,
  waste_area_mm2 NUMERIC DEFAULT 0,
  waste_percent NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_saw_nesting_project ON saw_nesting_results(project_id);
CREATE INDEX IF NOT EXISTS idx_parts_cut_at ON project_parts(cut_at) WHERE cut_at IS NOT NULL;

-- 5. RLS
ALTER TABLE saw_nesting_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY saw_nesting_auth ON saw_nesting_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function main() {
  console.log('=== SAW Workflow Migration ===\n');

  const { error } = await sb.rpc('run_migration_ddl', { ddl: DDL });
  if (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }

  console.log('Migration applied successfully.');

  // Verify
  const { data: cols } = await sb.from('projects').select('cutting_method').limit(1);
  console.log('projects.cutting_method exists:', cols !== null);

  const { data: parts } = await sb.from('project_parts').select('cut_at, cut_by').limit(1);
  console.log('project_parts.cut_at exists:', parts !== null);

  const { data: saw } = await sb.from('saw_nesting_results').select('id').limit(1);
  console.log('saw_nesting_results table exists:', saw !== null);

  console.log('\nSUCCESS: SAW Workflow migration complete');
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
