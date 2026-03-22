const { createClient } = require("@supabase/supabase-js");
const migration = require("/home/ubuntu/artmood/migrations/20260316_010_cost_engine.js");

const supabase = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

async function run() {
  const { data: existing } = await supabase
    .from("schema_migrations")
    .select("version")
    .eq("version", migration.version)
    .maybeSingle();

  if (existing) {
    console.log("Migration " + migration.version + " already applied, skipping.");
    return;
  }

  console.log("Running migration: " + migration.version + " (" + migration.name + ")");
  await migration.up(supabase);

  const { error } = await supabase
    .from("schema_migrations")
    .insert({ version: migration.version, name: migration.name });
  if (error) console.warn("WARN: Could not record migration:", error.message);
  else console.log("Migration " + migration.version + " recorded.");
}

run().catch(e => { console.error(e); process.exit(1); });
