/**
 * Migration: Add project_id column to leads table
 *
 * Previously, the code tried to write leads.project_id but the column didn't exist.
 * Phase 1 fixed the code to use a reverse FK query (projects.lead_id),
 * but adding the column is still useful for direct queries and future use.
 *
 * DDL REQUIRED — needs run_migration_ddl RPC or Supabase Dashboard:
 *   ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
 */

exports.version = '20260316_001';
exports.name = 'add_leads_project_id';

exports.up = async function (supabase) {
  // Try the DDL via RPC (works if run_migration_ddl function exists)
  const { error } = await supabase.rpc('run_migration_ddl', {
    sql_text: 'ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);',
  });

  if (error) {
    if (error.message.includes('Could not find the function')) {
      console.log('    NOTE: run_migration_ddl RPC not found. Run this DDL manually in Supabase Dashboard:');
      console.log('    ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);');
      // Don't fail — the code works without this column (uses reverse FK)
      return;
    }
    throw error;
  }

  // Backfill: for any project that has lead_id set, update the lead's project_id
  const { data: linkedProjects } = await supabase
    .from('projects')
    .select('id, lead_id')
    .not('lead_id', 'is', null);

  if (linkedProjects && linkedProjects.length > 0) {
    for (const p of linkedProjects) {
      await supabase.from('leads')
        .update({ project_id: p.id })
        .eq('id', p.lead_id);
    }
    console.log(`    Backfilled ${linkedProjects.length} lead→project links`);
  }
};
