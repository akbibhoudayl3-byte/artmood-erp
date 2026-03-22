const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  \u2705 " + name + (detail ? " \u2014 " + detail : "")); passed++; }
  else { console.log("  \u274C " + name + (detail ? " \u2014 " + detail : "")); failed++; }
}

async function run() {
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("  KITCHEN CONFIGURATOR \u2014 VERIFICATION REPORT");
  console.log("  Date: " + new Date().toISOString());
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

  // 1. Tables exist
  console.log("1. TABLES");
  const tables = ['cabinet_material_presets', 'cabinet_hardware_presets', 'kitchen_layout_templates', 'kitchen_configurations'];
  for (const t of tables) {
    const { error } = await sb.from(t).select("*").limit(1);
    check(t + " exists", !error, error ? error.message : "OK");
  }

  // 2. Material presets seeded
  console.log("\n2. MATERIAL PRESETS");
  const { data: matPresets } = await sb.from("cabinet_material_presets").select("*").order("sort_order");
  check("Material presets seeded", matPresets && matPresets.length >= 5, matPresets ? matPresets.length + " presets" : "0");
  if (matPresets) {
    for (const p of matPresets) {
      console.log("    \u2022 " + p.name + " (carcass=" + p.carcass_material + ", facade=" + p.facade_material + ", back=" + p.back_panel_material + ")");
    }
  }

  // 3. Hardware presets seeded
  console.log("\n3. HARDWARE PRESETS");
  const { data: hwPresets } = await sb.from("cabinet_hardware_presets").select("*").order("sort_order");
  check("Hardware presets seeded", hwPresets && hwPresets.length >= 3, hwPresets ? hwPresets.length + " presets" : "0");
  if (hwPresets) {
    for (const p of hwPresets) {
      console.log("    \u2022 " + p.name + " [" + p.tier + "] (hinge=" + p.hinge_unit_price + " MAD, slide=" + p.drawer_slide_unit_price + " MAD)");
    }
  }

  // 4. Layout templates seeded
  console.log("\n4. LAYOUT TEMPLATES");
  const { data: layouts } = await sb.from("kitchen_layout_templates").select("*").order("sort_order");
  check("Layout templates seeded", layouts && layouts.length >= 5, layouts ? layouts.length + " layouts" : "0");
  if (layouts) {
    for (const l of layouts) {
      const slots = l.default_module_slots || [];
      console.log("    \u2022 " + l.name + " (" + l.layout_type + ") \u2014 " + slots.length + " slots");
    }
  }

  // 5. Cabinet modules seeded
  console.log("\n5. CABINET MODULES");
  const kitchenCodes = ['BASE-400', 'BASE-600', 'BASE-800', 'SINK-BASE', 'DRAWER-600', 'CORNER-BASE',
    'WALL-400', 'WALL-600', 'WALL-800', 'CORNER-WALL', 'OVEN-TALL', 'FRIDGE-TALL', 'PANTRY-TALL'];
  const { data: modules } = await sb.from("product_modules").select("id, code, name, category").in("code", kitchenCodes);
  check("13 kitchen modules exist", modules && modules.length === 13, modules ? modules.length + "/13 found" : "0");
  if (modules) {
    for (const m of modules) {
      console.log("    \u2022 " + m.code + " \u2014 " + m.name + " [" + m.category + "]");
    }
  }

  // 6. Module parts
  console.log("\n6. MODULE PARTS");
  if (modules && modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    const { data: parts, error: pErr } = await sb.from("module_parts").select("module_id, code").in("module_id", moduleIds);
    check("Module parts seeded", parts && parts.length > 50, parts ? parts.length + " parts total" : "0");

    // Count per module
    const counts = {};
    for (const p of (parts || [])) {
      counts[p.module_id] = (counts[p.module_id] || 0) + 1;
    }
    for (const m of modules) {
      console.log("    \u2022 " + m.code + ": " + (counts[m.id] || 0) + " parts");
    }
  }

  // 7. Migration recorded
  console.log("\n7. MIGRATION TRACKING");
  const { data: mig } = await sb.from("schema_migrations").select("*").eq("version", "20260316_020").maybeSingle();
  check("Migration 20260316_020 recorded", !!mig, mig ? "name: " + mig.name : "NOT FOUND");

  // 8. File deployment check
  console.log("\n8. FILE DEPLOYMENT");
  const fs = require("fs");
  const files = [
    "/home/ubuntu/artmood/migrations/20260316_020_kitchen_configurator.js",
    "/home/ubuntu/artmood/src/lib/services/kitchen-engine.service.ts",
    "/home/ubuntu/artmood/src/app/(app)/kitchen/modules/page.tsx",
    "/home/ubuntu/artmood/src/app/(app)/kitchen/presets/page.tsx",
    "/home/ubuntu/artmood/src/app/(app)/projects/[id]/kitchen-config/page.tsx",
    "/home/ubuntu/artmood/src/types/finance.ts",
  ];
  for (const f of files) {
    check(f.split("/").pop() + " deployed", fs.existsSync(f));
  }

  // 9. Service file check
  console.log("\n9. SERVICE LAYER CHECK");
  const svcContent = fs.readFileSync("/home/ubuntu/artmood/src/lib/services/kitchen-engine.service.ts", "utf8");
  check("generateKitchen export", svcContent.includes("export async function generateKitchen"));
  check("getMaterialPresets export", svcContent.includes("export async function getMaterialPresets"));
  check("getHardwarePresets export", svcContent.includes("export async function getHardwarePresets"));
  check("getLayoutTemplates export", svcContent.includes("export async function getLayoutTemplates"));
  check("saveKitchenConfig export", svcContent.includes("export async function saveKitchenConfig"));

  // Summary
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("  RESULT: " + passed + " passed, " + failed + " failed");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
