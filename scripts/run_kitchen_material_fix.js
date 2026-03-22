/**
 * Run migration 20260316_025 — Kitchen Material Fix
 * Usage: node scripts/run_kitchen_material_fix.js
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

async function run() {
  // Check if already applied
  const { data: existing } = await supabase
    .from("schema_migrations")
    .select("version")
    .eq("version", "20260316_025")
    .maybeSingle();

  if (existing) {
    console.log("Migration 20260316_025 already applied, skipping.");
    return;
  }

  console.log("Running migration: 20260316_025 (kitchen_material_fix)");

  // Load and run
  const migration = require("../migrations/20260316_025_kitchen_material_fix.js");
  await migration.up(supabase);

  // Record migration
  const { error } = await supabase
    .from("schema_migrations")
    .insert({ version: "20260316_025", name: "kitchen_material_fix" });
  if (error) console.warn("WARN: Could not record migration:", error.message);
  else console.log("Migration 20260316_025 recorded.");
}

run().catch(e => { console.error(e); process.exit(1); });
