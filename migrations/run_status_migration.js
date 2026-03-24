// Migration: Normalize project statuses + add CHECK constraint
// Run on server: node migrations/run_status_migration.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://emeznqaweezgsqavxkuu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('=== Project Status Normalization Migration ===\n');

  // Step 1: Create the migration function
  const createFn = `
    CREATE OR REPLACE FUNCTION migrate_project_statuses()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_dv_count int;
      v_ip_count int;
    BEGIN
      -- Drop the old constraint
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

      -- Normalize design_validated -> client_validation
      UPDATE projects SET status = 'client_validation', updated_at = now()
      WHERE status = 'design_validated';
      GET DIAGNOSTICS v_dv_count = ROW_COUNT;

      -- Normalize in_production -> production
      UPDATE projects SET status = 'production', updated_at = now()
      WHERE status = 'in_production';
      GET DIAGNOSTICS v_ip_count = ROW_COUNT;

      -- Add new strict constraint matching the app FSM
      ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (
        status IN (
          'measurements',
          'measurements_confirmed',
          'design',
          'client_validation',
          'production',
          'installation',
          'delivered',
          'cancelled'
        )
      );

      RETURN jsonb_build_object(
        'design_validated_migrated', v_dv_count,
        'in_production_migrated', v_ip_count,
        'constraint_applied', true
      );
    END;
    $fn$;
  `;

  // Use fetch to Supabase SQL API
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
    },
    body: JSON.stringify({ name: 'test' }),
  });

  // Alternative: use the pg_net or direct SQL execution
  // Since Supabase JS client doesn't support raw DDL, we use the Management API

  // Actually, the simplest approach: use Supabase's postgrest SQL function if it exists
  // Or create function via the Supabase Dashboard SQL Editor

  // Let's try using the supabase-js .rpc with a known exec pattern
  // First check if we have a sql_exec function
  const { error: checkErr } = await supabase.rpc('sql_exec', { query: 'SELECT 1' });

  if (checkErr && checkErr.message.includes('Could not find')) {
    console.log('No sql_exec function found. Using Supabase Management API...');

    // Use the Supabase Management API to run SQL
    const mgmtRes = await fetch(
      'https://api.supabase.com/v1/projects/emeznqaweezgsqavxkuu/database/query',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (process.env.SUPABASE_ACCESS_TOKEN || ''),
        },
        body: JSON.stringify({ query: createFn }),
      }
    );

    if (!mgmtRes.ok) {
      console.log('Management API not available. Trying direct approach...');

      // Last resort: use the PostgREST hint to run via a temporary function
      // Create a simple function first using the service role
      const pgRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/migrate_project_statuses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'Prefer': 'return=representation',
        },
        body: '{}',
      });

      if (pgRes.ok) {
        const result = await pgRes.json();
        console.log('Migration result:', JSON.stringify(result, null, 2));
      } else {
        const err = await pgRes.text();
        console.log('Function does not exist yet. Error:', err);
        console.log('\n⚠️  You must run the SQL migration manually via Supabase Dashboard SQL Editor.');
        console.log('Copy and paste the content of: migrations/20260323_004_normalize_project_statuses.sql');
      }
    } else {
      console.log('Function created via Management API');
      // Now call it
      const { data, error } = await supabase.rpc('migrate_project_statuses');
      console.log('Migration result:', error ? error.message : JSON.stringify(data, null, 2));
    }
  } else {
    // sql_exec exists, use it
    const { data, error } = await supabase.rpc('sql_exec', { query: createFn });
    console.log('Function created:', error ? error.message : 'OK');

    // Now call the migration
    const { data: result, error: runErr } = await supabase.rpc('migrate_project_statuses');
    console.log('Migration result:', runErr ? runErr.message : JSON.stringify(result, null, 2));
  }

  // Verify final state
  const { data: all } = await supabase.from('projects').select('status');
  if (all) {
    const counts = {};
    for (const r of all) counts[r.status] = (counts[r.status] || 0) + 1;
    console.log('\nFinal status distribution:', JSON.stringify(counts, null, 2));

    const valid = ['measurements','measurements_confirmed','design','client_validation','production','installation','delivered','cancelled'];
    const invalid = Object.keys(counts).filter(s => !valid.includes(s));
    console.log('Invalid statuses:', invalid.length === 0 ? 'NONE ✓' : invalid);
  }
}

run().catch(console.error);
