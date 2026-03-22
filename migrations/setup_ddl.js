#!/usr/bin/env node
/**
 * Setup DDL: Creates schema_migrations table and run_migration_ddl function
 * using a direct PostgreSQL connection (pg module) to bypass PostgREST limitations.
 *
 * Then runs any pending migrations.
 */

const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars.');
  process.exit(1);
}

const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];

// Try multiple connection methods
async function getDbClient() {
  const configs = [
    {
      name: 'Supavisor (session mode, port 5432)',
      connectionString: `postgresql://postgres.${PROJECT_REF}:${SERVICE_ROLE_KEY}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
      ssl: { rejectUnauthorized: false },
    },
    {
      name: 'Supavisor (transaction mode, port 6543)',
      connectionString: `postgresql://postgres.${PROJECT_REF}:${SERVICE_ROLE_KEY}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
      ssl: { rejectUnauthorized: false },
    },
    {
      name: 'Direct connection',
      connectionString: `postgresql://postgres:${SERVICE_ROLE_KEY}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
      ssl: { rejectUnauthorized: false },
    },
  ];

  for (const cfg of configs) {
    console.log(`  Trying: ${cfg.name}...`);
    const client = new Client({
      connectionString: cfg.connectionString,
      ssl: cfg.ssl,
      connectionTimeoutMillis: 10000,
    });

    try {
      await client.connect();
      console.log(`  ✓ Connected via ${cfg.name}\n`);
      return client;
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message.substring(0, 80)}`);
      try { await client.end(); } catch (_) {}
    }
  }

  return null;
}

async function main() {
  console.log('ArtMood Migration Setup (DDL)\n');

  // Step 1: Connect to PostgreSQL directly
  console.log('Step 1: Connecting to database...');
  const client = await getDbClient();

  if (!client) {
    console.error('\nCould not connect to database. Please run the setup SQL manually in the Supabase Dashboard.');
    process.exit(1);
  }

  // Step 2: Create schema_migrations table
  console.log('Step 2: Creating schema_migrations table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now(),
      checksum TEXT
    );
  `);
  console.log('  ✓ schema_migrations table ready\n');

  // Step 3: Create run_migration_ddl function
  console.log('Step 3: Creating run_migration_ddl function...');
  await client.query(`
    CREATE OR REPLACE FUNCTION run_migration_ddl(sql_text text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_text;
    END;
    $$;
  `);
  console.log('  ✓ run_migration_ddl function ready\n');

  // Step 4: Create leads.project_id column directly (the first migration's DDL)
  console.log('Step 4: Adding leads.project_id column...');
  await client.query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
  `);
  console.log('  ✓ leads.project_id column ready\n');

  // Close direct connection
  await client.end();
  console.log('  (Direct DB connection closed)\n');

  // Step 5: Run pending migrations via Supabase client (for DML parts)
  console.log('Step 5: Running pending migrations...');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: appliedData, error: appliedError } = await supabase
    .from('schema_migrations')
    .select('version')
    .order('version');

  if (appliedError) {
    console.error('  Error reading schema_migrations:', appliedError.message);
    process.exit(1);
  }

  const applied = new Set((appliedData || []).map(r => r.version));

  const dir = path.join(__dirname);
  const files = fs.readdirSync(dir)
    .filter(f => f.match(/^\d{8}_\d{3}_.*\.js$/) && f !== 'run.js' && f !== 'setup.js' && f !== 'setup_ddl.js')
    .sort();

  const migrations = files.map(f => {
    const mod = require(path.join(dir, f));
    return { file: f, version: mod.version, name: mod.name, up: mod.up };
  });

  console.log(`  Found ${migrations.length} migration(s), ${applied.size} already applied.\n`);

  const pending = migrations.filter(m => !applied.has(m.version));

  if (pending.length === 0) {
    console.log('  All migrations up to date.');
    console.log('\n✓ Setup complete!');
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

  console.log(`\n✓ Setup complete! ${pending.length} migration(s) applied.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
