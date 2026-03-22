/**
 * Run migration 20260316_026 — Fix Audit Trigger
 * Usage: node scripts/run_fix_audit_trigger.js
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

async function run() {
  const { data: existing } = await supabase
    .from("schema_migrations")
    .select("version")
    .eq("version", "20260316_026")
    .maybeSingle();

  if (existing) {
    console.log("Migration 20260316_026 already applied, skipping.");
    return;
  }

  console.log("Running migration: 20260316_026 (fix_audit_trigger)");

  const migration = require("../migrations/20260316_026_fix_audit_trigger.js");
  await migration.up(supabase);

  const { error } = await supabase
    .from("schema_migrations")
    .insert({ version: "20260316_026", name: "fix_audit_trigger" });
  if (error) console.warn("WARN: Could not record migration:", error.message);
  else console.log("Migration 20260316_026 recorded.");
}

run().catch(e => { console.error(e); process.exit(1); });
