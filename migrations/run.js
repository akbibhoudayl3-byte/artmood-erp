#!/usr/bin/env node
/**
 * ArtMood Migration Runner
 *
 * Usage: NODE_PATH=./node_modules node migrations/run.js
 *
 * Reads migration files from ./migrations/, checks schema_migrations table,
 * and runs any pending migrations in order.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run: source .env.local && export $(grep -v "^#" .env.local | xargs)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function getAppliedMigrations() {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('version')
    .order('version');

  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema_migrations') || error.code === '42P01') {
      console.error('\n  schema_migrations table does not exist.');
      console.error('  Run the setup SQL from migrations/README.md in the Supabase Dashboard:\n');
      console.error('  CREATE TABLE IF NOT EXISTS schema_migrations (');
      console.error('    id SERIAL PRIMARY KEY,');
      console.error('    version TEXT NOT NULL UNIQUE,');
      console.error('    name TEXT NOT NULL,');
      console.error('    applied_at TIMESTAMPTZ DEFAULT now()');
      console.error('  );\n');
      process.exit(1);
    }
    throw error;
  }
  return new Set((data || []).map(r => r.version));
}

function loadMigrationFiles() {
  const dir = path.join(__dirname);
  const files = fs.readdirSync(dir)
    .filter(f => f.match(/^\d{8}_\d{3}_.*\.js$/) && f !== 'run.js')
    .sort();

  return files.map(f => {
    const mod = require(path.join(dir, f));
    return {
      file: f,
      version: mod.version,
      name: mod.name,
      up: mod.up,
    };
  });
}

async function main() {
  console.log('ArtMood Migration Runner');
  console.log('========================\n');

  const applied = await getAppliedMigrations();
  const migrations = loadMigrationFiles();

  console.log(`Found ${migrations.length} migration file(s), ${applied.size} already applied.\n`);

  const pending = migrations.filter(m => !applied.has(m.version));

  if (pending.length === 0) {
    console.log('Nothing to do. All migrations are up to date.');
    return;
  }

  console.log(`Pending migrations: ${pending.length}\n`);

  for (const m of pending) {
    console.log(`  Running: ${m.version} — ${m.name}`);

    try {
      await m.up(supabase);

      // Record as applied
      const { error } = await supabase.from('schema_migrations').insert({
        version: m.version,
        name: m.name,
        applied_at: new Date().toISOString(),
      });

      if (error) {
        console.error(`  FAILED to record migration: ${error.message}`);
        process.exit(1);
      }

      console.log(`  OK: ${m.version}\n`);
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
