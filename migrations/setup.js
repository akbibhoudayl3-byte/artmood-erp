#!/usr/bin/env node
/**
 * Setup: Create schema_migrations table and run_migration_ddl function
 * Then run pending migrations.
 *
 * This script uses the Supabase Management API to execute DDL.
 * Falls back to checking if the table already exists.
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Extract project ref from URL
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];

/**
 * Try to execute SQL via PostgREST by creating a temporary function,
 * or use existing run_migration_ddl if available.
 */
async function executeDDL(sql) {
  // First try: use run_migration_ddl if it exists
  const { error: rpcError } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
  if (!rpcError) {
    return { success: true };
  }

  // If function doesn't exist, we need another approach
  if (rpcError.message.includes('Could not find the function')) {
    return { success: false, error: 'run_migration_ddl not available' };
  }

  return { success: false, error: rpcError.message };
}

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(0);

  return !error || !error.message.includes('Could not find');
}

async function main() {
  console.log('ArtMood Migration Setup');
  console.log('=======================\n');

  // Check if schema_migrations already exists
  const tableExists = await checkTableExists('schema_migrations');

  if (tableExists) {
    console.log('✓ schema_migrations table already exists');
  } else {
    console.log('✗ schema_migrations table does not exist');
    console.log('  Attempting to create via SQL...\n');

    // Try to create via run_migration_ddl (if it exists from a previous setup)
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT now(),
        checksum TEXT
      );
    `;

    const result = await executeDDL(createTableSQL);
    if (result.success) {
      console.log('✓ Created schema_migrations table via RPC');
    } else {
      console.log('  Cannot create table via API (DDL requires direct DB access).');
      console.log('  Please run this SQL in the Supabase Dashboard SQL Editor:\n');
      console.log('  CREATE TABLE IF NOT EXISTS schema_migrations (');
      console.log('    id SERIAL PRIMARY KEY,');
      console.log('    version TEXT NOT NULL UNIQUE,');
      console.log('    name TEXT NOT NULL,');
      console.log('    applied_at TIMESTAMPTZ DEFAULT now(),');
      console.log('    checksum TEXT');
      console.log('  );\n');
      console.log('  CREATE OR REPLACE FUNCTION run_migration_ddl(sql_text text)');
      console.log('  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$');
      console.log('  BEGIN EXECUTE sql_text; END; $$;\n');
      process.exit(1);
    }
  }

  // Check if run_migration_ddl function exists
  const { error: funcCheck } = await supabase.rpc('run_migration_ddl', { sql_text: 'SELECT 1' });
  if (funcCheck && funcCheck.message.includes('Could not find the function')) {
    console.log('✗ run_migration_ddl function does not exist');
    console.log('  DDL migrations will need to be run manually in Dashboard.\n');
  } else {
    console.log('✓ run_migration_ddl function is available');
  }

  // Now run pending migrations (same logic as run.js)
  console.log('\n--- Running pending migrations ---\n');

  const fs = require('fs');
  const path = require('path');

  // Get applied migrations
  const { data: appliedData, error: appliedError } = await supabase
    .from('schema_migrations')
    .select('version')
    .order('version');

  if (appliedError) {
    console.error('Error reading schema_migrations:', appliedError.message);
    process.exit(1);
  }

  const applied = new Set((appliedData || []).map(r => r.version));

  // Load migration files
  const dir = path.join(__dirname);
  const files = fs.readdirSync(dir)
    .filter(f => f.match(/^\d{8}_\d{3}_.*\.js$/) && f !== 'run.js' && f !== 'setup.js')
    .sort();

  const migrations = files.map(f => {
    const mod = require(path.join(dir, f));
    return { file: f, version: mod.version, name: mod.name, up: mod.up };
  });

  console.log(`Found ${migrations.length} migration(s), ${applied.size} already applied.\n`);

  const pending = migrations.filter(m => !applied.has(m.version));

  if (pending.length === 0) {
    console.log('All migrations are up to date. Nothing to do.');
    return;
  }

  for (const m of pending) {
    console.log(`  Running: ${m.version} — ${m.name}`);
    try {
      await m.up(supabase);

      const { error } = await supabase.from('schema_migrations').insert({
        version: m.version,
        name: m.name,
        applied_at: new Date().toISOString(),
      });

      if (error) {
        console.error(`  FAILED to record: ${error.message}`);
        process.exit(1);
      }
      console.log(`  ✓ ${m.version}\n`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`Done. ${pending.length} migration(s) applied.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
