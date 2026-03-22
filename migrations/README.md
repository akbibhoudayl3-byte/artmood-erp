# ArtMood Migration System

## Setup (one-time via Supabase Dashboard SQL Editor)

Run this SQL in the Supabase Dashboard to create the tracking table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now(),
  checksum TEXT
);

-- RPC helper to run DDL from Node.js (optional, avoids needing dashboard for simple changes)
CREATE OR REPLACE FUNCTION run_migration_ddl(sql_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;
```

## How to Create a Migration

1. Create a new file: `migrations/YYYYMMDD_NNN_description.ts`
2. Export `up()` function that takes a Supabase client
3. Add DDL SQL in comments (if needed, run via dashboard or `run_migration_ddl` RPC)

## How to Run Migrations

```bash
cd /home/ubuntu/artmood
NODE_PATH=./node_modules node migrations/run.js
```

## Migration File Template

```typescript
// migrations/20260316_001_example.ts
export const version = '20260316_001';
export const name = 'example_migration';

export async function up(supabase) {
  // DDL (requires run_migration_ddl RPC or dashboard):
  // await supabase.rpc('run_migration_ddl', { sql_text: 'ALTER TABLE ...' });

  // DML (works directly):
  // await supabase.from('table').update({...}).eq('id', '...');
}
```
