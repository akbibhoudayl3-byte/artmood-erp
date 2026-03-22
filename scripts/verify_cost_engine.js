const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✅ " + name + (detail ? " — " + detail : "")); passed++; }
  else { console.log("  ❌ " + name + (detail ? " — " + detail : "")); failed++; }
}

async function run() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  COST ENGINE — VERIFICATION REPORT");
  console.log("  Date: " + new Date().toISOString());
  console.log("═══════════════════════════════════════════════\n");

  // 1. cost_settings table
  console.log("1. COST SETTINGS TABLE");
  const { data: settings, error: e1 } = await sb.from("cost_settings").select("*").limit(1).single();
  check("cost_settings exists", !e1, e1 ? e1.message : "OK");
  check("Default settings seeded", settings && settings.labor_rate_per_hour === 50,
    settings ? `labor=${settings.labor_rate_per_hour}, margin=${settings.recommended_margin_percent}%` : "");

  // 2. quotes table extensions
  console.log("\n2. QUOTES TABLE EXTENSIONS");
  const { data: qSample, error: e2 } = await sb.from("quotes").select("margin_override, is_auto_generated, cost_snapshot").limit(1).maybeSingle();
  check("margin_override column exists", !e2, e2 ? e2.message : "OK");

  // 3. calculate_project_cost() function
  console.log("\n3. CALCULATE_PROJECT_COST() FUNCTION");
  const { data: costResult, error: e3 } = await sb.rpc("calculate_project_cost", {
    p_project_id: "00000000-0000-0000-0000-000000000000"
  });
  check("RPC callable", !e3, e3 ? e3.message : "OK");
  check("Returns expected fields", costResult && "material_cost" in costResult && "total_cost" in costResult && "min_margin_percent" in costResult,
    costResult ? JSON.stringify(costResult) : "");

  // 4. v_project_real_cost view
  console.log("\n4. V_PROJECT_REAL_COST VIEW");
  const { error: e4 } = await sb.from("v_project_real_cost").select("*").limit(1);
  check("View exists", !e4, e4 ? e4.message : "OK");

  // 5. Migration recorded
  console.log("\n5. MIGRATION TRACKING");
  const { data: mig } = await sb.from("schema_migrations").select("*").eq("version", "20260316_010").maybeSingle();
  check("Migration 20260316_010 recorded", !!mig, mig ? "name: " + mig.name : "NOT FOUND");

  // 6. End-to-end: Calculate cost for project with BOM
  console.log("\n6. END-TO-END TEST");
  const { data: bomProjects } = await sb
    .from("project_material_requirements_bom")
    .select("project_id")
    .limit(1);

  if (bomProjects && bomProjects.length > 0) {
    const pid = bomProjects[0].project_id;
    const { data: cost, error: costErr } = await sb.rpc("calculate_project_cost", { p_project_id: pid });
    check("Cost calculated for project " + pid.substring(0, 8) + "...", !costErr,
      costErr ? costErr.message : "total=" + cost.total_cost + " MAD (mat=" + cost.material_cost + " labor=" + cost.labor_cost + " machine=" + cost.machine_cost + " transport=" + cost.transport_cost + ")");

    // Check v_project_real_cost for same project
    const { data: rc, error: rcErr } = await sb.from("v_project_real_cost").select("*").eq("project_id", pid).maybeSingle();
    check("v_project_real_cost returns data", !rcErr && rc, rc ? "margin=" + rc.margin_percent + "% health=" + rc.margin_health : "");
  } else {
    console.log("  ℹ️  No projects with BOM found — skipping E2E");
  }

  // 7. File deployment check
  console.log("\n7. FILE DEPLOYMENT");
  const fs = require("fs");
  const files = [
    "/home/ubuntu/artmood/migrations/20260316_010_cost_engine.js",
    "/home/ubuntu/artmood/src/lib/services/cost-engine.service.ts",
    "/home/ubuntu/artmood/src/app/(app)/settings/cost-engine/page.tsx",
    "/home/ubuntu/artmood/src/types/finance.ts",
  ];
  for (const f of files) {
    check(f.split("/").pop() + " deployed", fs.existsSync(f));
  }

  // 8. Check cost_engine.service.ts is valid (contains key exports)
  console.log("\n8. SERVICE LAYER CHECK");
  const svcContent = fs.readFileSync("/home/ubuntu/artmood/src/lib/services/cost-engine.service.ts", "utf8");
  check("calculateAndStoreCosts export", svcContent.includes("export async function calculateAndStoreCosts"));
  check("generateAutoQuote export", svcContent.includes("export async function generateAutoQuote"));
  check("checkMarginCompliance export", svcContent.includes("export async function checkMarginCompliance"));
  check("getCostSettings export", svcContent.includes("export async function getCostSettings"));

  // Summary
  console.log("\n═══════════════════════════════════════════════");
  console.log("  RESULT: " + passed + " passed, " + failed + " failed");
  console.log("═══════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
