/**
 * REAL KITCHEN SCENARIO TEST v2 — L-Shape Layout
 *
 * Wall A: 3000mm | Wall B: 2400mm
 * Corner module: CORNER-BASE (900×900mm) — eats 900mm from EACH wall
 *
 * This test:
 *   1. Uses correct corner footprint (900mm, not 560mm)
 *   2. Fits modules that actually work in the usable space
 *   3. Validates gaps, fillers, overlaps
 */

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

const WALL_A = 3000;
const WALL_B = 2400;

async function run() {
  console.log("\n" + "═".repeat(70));
  console.log("  L-SHAPE KITCHEN SCENARIO TEST v2");
  console.log("  Wall A: " + WALL_A + "mm  |  Wall B: " + WALL_B + "mm");
  console.log("═".repeat(70));

  // Load modules
  const codes = [
    "BASE-400", "BASE-600", "BASE-800", "SINK-BASE", "DRAWER-600",
    "CORNER-BASE", "WALL-400", "WALL-600", "WALL-800", "CORNER-WALL",
    "OVEN-TALL", "FRIDGE-TALL", "PANTRY-TALL",
  ];
  const { data: modules } = await sb
    .from("product_modules")
    .select("id, code, name, category, width_mm, height_mm, depth_mm")
    .in("code", codes);
  const mod = {};
  for (const m of modules) mod[m.code] = m;

  // ═══════════════════════════════════════════════════════════════
  // 1. CORNER ANALYSIS
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  1. CORNER ANALYSIS");
  console.log("─".repeat(70));

  const corner = mod["CORNER-BASE"];
  const cornerW = mod["CORNER-WALL"];

  // CORNER-BASE is 900×720×900mm
  // In an L-shape, it sits at the junction and occupies:
  //   - 900mm along Wall A (its width)
  //   - 900mm along Wall B (its depth, also 900)
  // This is a blind corner — the full 900mm is eaten from each wall
  const cornerOnA = corner.width_mm;  // 900mm
  const cornerOnB = corner.depth_mm;  // 900mm

  const usableA = WALL_A - cornerOnA;  // 3000 - 900 = 2100mm
  const usableB = WALL_B - cornerOnB;  // 2400 - 900 = 1500mm

  console.log("  CORNER-BASE: " + corner.width_mm + "×" + corner.height_mm + "×" + corner.depth_mm + "mm");
  console.log("  Footprint on Wall A: " + cornerOnA + "mm");
  console.log("  Footprint on Wall B: " + cornerOnB + "mm");
  console.log("");
  console.log("  Wall A: " + WALL_A + " - " + cornerOnA + " = " + usableA + "mm usable");
  console.log("  Wall B: " + WALL_B + " - " + cornerOnB + " = " + usableB + "mm usable");

  // ═══════════════════════════════════════════════════════════════
  // 2. BASE CABINET DISTRIBUTION — Realistic selection
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  2. BASE CABINET DISTRIBUTION");
  console.log("─".repeat(70));

  // Wall A (2100mm): PANTRY(600) + SINK(800) + BASE-600(600)
  //   Total: 2000mm, gap: 100mm
  const wallA_base = [
    { ...mod["PANTRY-TALL"], slot: "A1", note: "Tall column — left end" },
    { ...mod["SINK-BASE"],   slot: "A2", note: "Sink" },
    { ...mod["BASE-600"],    slot: "A3", note: "Standard base" },
  ];

  // Wall B (1500mm): DRAWER(600) + BASE-600(600)
  //   Total: 1200mm, gap: 300mm → swap B2 for BASE-400 to reduce gap
  // Better: DRAWER(600) + BASE-400(400) + BASE-400(400) = 1400mm, gap: 100mm
  const wallB_base = [
    { ...mod["DRAWER-600"],  slot: "B1", note: "Drawers — near corner" },
    { ...mod["BASE-400"],    slot: "B2", note: "Small base" },
    { ...mod["BASE-400"],    slot: "B3", note: "End base" },
  ];

  function analyzeWall(label, mods, usable) {
    const total = mods.reduce((s, m) => s + m.width_mm, 0);
    const gap = usable - total;

    console.log("\n  " + label + " (usable: " + usable + "mm):");
    console.log("  " + "─".repeat(64));
    console.log("  " + "Slot".padEnd(6) + "Code".padEnd(16) + "Width".padStart(6) + "  Range".padEnd(18) + "Note");
    console.log("  " + "─".repeat(64));
    let pos = 0;
    for (const m of mods) {
      const range = pos + "→" + (pos + m.width_mm) + "mm";
      console.log("  " + m.slot.padEnd(6) + m.code.padEnd(16) + (m.width_mm + "mm").padStart(6) + "  " + range.padEnd(18) + (m.note || ""));
      pos += m.width_mm;
    }
    console.log("  " + "─".repeat(64));
    console.log("  TOTAL: " + total + "mm  |  GAP: " + gap + "mm");
    return { total, gap };
  }

  const rA = analyzeWall("WALL A — Base", wallA_base, usableA);
  const rB = analyzeWall("WALL B — Base", wallB_base, usableB);

  // ═══════════════════════════════════════════════════════════════
  // 3. WALL CABINET DISTRIBUTION
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  3. WALL CABINET DISTRIBUTION");
  console.log("─".repeat(70));

  // Wall A upper: skip tall zone (600mm) + skip above sink (800mm)
  // Remaining: 2100 - 600 - 800 = 700mm → 1× WALL-600 (600mm), gap 100mm
  const upperA_usable = usableA - mod["PANTRY-TALL"].width_mm - mod["SINK-BASE"].width_mm;
  const wallA_wall = [
    { ...mod["WALL-600"], slot: "AW1", note: "Above base A3" },
  ];

  // Wall B upper: 1500mm → 2× WALL-600 (1200mm), gap 300mm
  //   OR: WALL-600 + WALL-400 + WALL-400 = 1400mm, gap 100mm
  const wallB_wall = [
    { ...mod["WALL-600"], slot: "BW1", note: "Above drawer" },
    { ...mod["WALL-400"], slot: "BW2", note: "Above base B2" },
    { ...mod["WALL-400"], slot: "BW3", note: "Above base B3" },
  ];

  const rAw = analyzeWall("WALL A — Upper (excl. tall 600 + sink 800)", wallA_wall, upperA_usable);
  const rBw = analyzeWall("WALL B — Upper", wallB_wall, usableB);

  // ═══════════════════════════════════════════════════════════════
  // 4. OVERLAP DETECTION
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  4. OVERLAP DETECTION");
  console.log("─".repeat(70));

  let anyOverlap = false;
  function checkOv(label, mods, usable) {
    let pos = 0;
    let ov = false;
    for (const m of mods) {
      pos += m.width_mm;
      if (pos > usable) {
        console.log("  ⛔ " + label + ": " + m.code + " end=" + pos + "mm > wall=" + usable + "mm (+" + (pos - usable) + "mm)");
        ov = true;
      }
    }
    if (!ov) console.log("  ✅ " + label + ": no overlap");
    if (ov) anyOverlap = true;
  }
  checkOv("Wall A base", wallA_base, usableA);
  checkOv("Wall B base", wallB_base, usableB);
  checkOv("Wall A upper", wallA_wall, upperA_usable);
  checkOv("Wall B upper", wallB_wall, usableB);

  // ═══════════════════════════════════════════════════════════════
  // 5. FILLER SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  5. FILLER SUGGESTIONS");
  console.log("─".repeat(70));

  function filler(label, gap) {
    if (gap === 0) {
      console.log("  ✅ " + label + ": perfect fit");
    } else if (gap < 0) {
      console.log("  ⛔ " + label + ": OVERFLOW " + Math.abs(gap) + "mm — remove/resize module");
    } else if (gap <= 50) {
      console.log("  💡 " + label + ": " + gap + "mm → single filler (left or right)");
    } else if (gap <= 100) {
      console.log("  💡 " + label + ": " + gap + "mm → split filler " + Math.ceil(gap / 2) + "+" + Math.floor(gap / 2) + "mm (L+R) or single " + gap + "mm");
    } else if (gap <= 200) {
      console.log("  ⚠️  " + label + ": " + gap + "mm → decorative panel or split fillers");
    } else {
      console.log("  ⚠️  " + label + ": " + gap + "mm → add a module (too large for filler alone)");
    }
  }
  filler("Wall A base (gap " + rA.gap + "mm)", rA.gap);
  filler("Wall B base (gap " + rB.gap + "mm)", rB.gap);
  filler("Wall A upper (gap " + rAw.gap + "mm)", rAw.gap);
  filler("Wall B upper (gap " + rBw.gap + "mm)", rBw.gap);

  // ═══════════════════════════════════════════════════════════════
  // 6. CORNER LOGIC VALIDATION
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  6. CORNER LOGIC VALIDATION");
  console.log("─".repeat(70));

  const checks = [
    { ok: cornerOnA <= WALL_A, msg: "Corner footprint (" + cornerOnA + ") ≤ Wall A (" + WALL_A + ")" },
    { ok: cornerOnB <= WALL_B, msg: "Corner footprint (" + cornerOnB + ") ≤ Wall B (" + WALL_B + ")" },
    { ok: usableA >= 1200, msg: "Wall A usable " + usableA + "mm ≥ 1200mm min" },
    { ok: usableB >= 1200, msg: "Wall B usable " + usableB + "mm ≥ 1200mm min" },
    { ok: cornerW.width_mm <= corner.width_mm, msg: "Corner wall (" + cornerW.width_mm + ") ≤ corner base (" + corner.width_mm + ")" },
    { ok: rA.total + cornerOnA <= WALL_A, msg: "A modules + corner = " + (rA.total + cornerOnA) + "mm ≤ " + WALL_A + "mm" },
    { ok: rB.total + cornerOnB <= WALL_B, msg: "B modules + corner = " + (rB.total + cornerOnB) + "mm ≤ " + WALL_B + "mm" },
  ];

  let cornerOk = true;
  for (const c of checks) {
    console.log("  " + (c.ok ? "✅" : "❌") + " " + c.msg);
    if (!c.ok) cornerOk = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. LAYOUT VISUALIZATION
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  7. LAYOUT VISUALIZATION");
  console.log("─".repeat(70));

  console.log("");
  console.log("  Wall A (" + WALL_A + "mm)");
  console.log("  ┌─────────┬──────────┬────────┬───────┬───────────┐");
  console.log("  │ PANTRY  │   SINK   │ BASE   │filler │  CORNER   │");
  console.log("  │  600mm  │  800mm   │ 600mm  │" + String(rA.gap).padStart(4) + "mm │  900mm    │");
  console.log("  └─────────┴──────────┴────────┴───────┴─────┬─────┘");
  console.log("                                               │");
  console.log("                                    ┌──────────┤ Wall B (" + WALL_B + "mm)");
  console.log("                                    │  CORNER  │");
  console.log("                                    │  900mm   │");
  console.log("                                    ├──────────┤");
  console.log("                                    │ DRAWER   │");
  console.log("                                    │  600mm   │");
  console.log("                                    ├──────────┤");
  console.log("                                    │ BASE-400 │");
  console.log("                                    │  400mm   │");
  console.log("                                    ├──────────┤");
  console.log("                                    │ BASE-400 │");
  console.log("                                    │  400mm   │");
  console.log("                                    ├──────────┤");
  console.log("                                    │  filler  │");
  console.log("                                    │  " + rB.gap + "mm   │");
  console.log("                                    └──────────┘");

  // ═══════════════════════════════════════════════════════════════
  // 8. FULL MODULE LIST + VERDICT
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  8. FULL MODULE LIST + VERDICT");
  console.log("─".repeat(70));

  const all = [
    ...wallA_base.map(m => ({ slot: m.slot, code: m.code, w: m.width_mm, wall: "A", level: "base" })),
    { slot: "CRN", code: "CORNER-BASE", w: corner.width_mm, wall: "A↔B", level: "base" },
    ...wallB_base.map(m => ({ slot: m.slot, code: m.code, w: m.width_mm, wall: "B", level: "base" })),
    ...wallA_wall.map(m => ({ slot: m.slot, code: m.code, w: m.width_mm, wall: "A", level: "upper" })),
    { slot: "CRN-W", code: "CORNER-WALL", w: cornerW.width_mm, wall: "A↔B", level: "upper" },
    ...wallB_wall.map(m => ({ slot: m.slot, code: m.code, w: m.width_mm, wall: "B", level: "upper" })),
  ];

  console.log("\n  " + "Slot".padEnd(8) + "Code".padEnd(16) + "Width".padStart(6) + "  Wall   Level");
  console.log("  " + "─".repeat(50));
  for (const m of all) {
    console.log("  " + m.slot.padEnd(8) + m.code.padEnd(16) + (m.w + "mm").padStart(6) + "  " + m.wall.padEnd(6) + " " + m.level);
  }
  console.log("  " + "─".repeat(50));
  console.log("  Total modules: " + all.length);

  // FILLERS
  const fillers = [];
  if (rA.gap > 0) fillers.push({ wall: "A", level: "base", size: rA.gap });
  if (rB.gap > 0) fillers.push({ wall: "B", level: "base", size: rB.gap });
  if (rAw.gap > 0) fillers.push({ wall: "A", level: "upper", size: rAw.gap });
  if (rBw.gap > 0) fillers.push({ wall: "B", level: "upper", size: rBw.gap });

  if (fillers.length > 0) {
    console.log("\n  FILLERS NEEDED:");
    for (const f of fillers) {
      console.log("    • Wall " + f.wall + " " + f.level + ": " + f.size + "mm filler");
    }
  }

  // VERDICT
  const issues = [];
  const warnings = [];

  if (rA.gap < 0) issues.push("Wall A base overflow " + Math.abs(rA.gap) + "mm");
  if (rB.gap < 0) issues.push("Wall B base overflow " + Math.abs(rB.gap) + "mm");
  if (rAw.gap < 0) issues.push("Wall A upper overflow " + Math.abs(rAw.gap) + "mm");
  if (rBw.gap < 0) issues.push("Wall B upper overflow " + Math.abs(rBw.gap) + "mm");
  if (anyOverlap) issues.push("Module overlap detected");
  if (!cornerOk) issues.push("Corner logic failed");

  if (rA.gap > 100) warnings.push("Wall A base gap " + rA.gap + "mm — large");
  else if (rA.gap > 0) warnings.push("Wall A base filler " + rA.gap + "mm");
  if (rB.gap > 100) warnings.push("Wall B base gap " + rB.gap + "mm — large");
  else if (rB.gap > 0) warnings.push("Wall B base filler " + rB.gap + "mm");
  if (rAw.gap > 100) warnings.push("Wall A upper gap " + rAw.gap + "mm — large");
  else if (rAw.gap > 0) warnings.push("Wall A upper filler " + rAw.gap + "mm");
  if (rBw.gap > 100) warnings.push("Wall B upper gap " + rBw.gap + "mm — large");
  else if (rBw.gap > 0) warnings.push("Wall B upper filler " + rBw.gap + "mm");

  let verdict, color;
  if (issues.length > 0) { verdict = "RED — CRITICAL ISSUES"; color = "🔴"; }
  else if (warnings.length > 0) { verdict = "ORANGE — NEEDS FILLERS"; color = "🟠"; }
  else { verdict = "GREEN — PERFECT FIT"; color = "🟢"; }

  console.log("\n  " + color + " " + verdict);
  if (issues.length > 0) for (const i of issues) console.log("    ❌ " + i);
  if (warnings.length > 0) for (const w of warnings) console.log("    ⚠️  " + w);

  // SUMMARY TABLE
  console.log("\n  SUMMARY:");
  console.log("  " + "─".repeat(50));
  console.log("  " + "".padEnd(20) + "Wall A".padStart(10) + "Wall B".padStart(10));
  console.log("  " + "─".repeat(50));
  console.log("  " + "Total length".padEnd(20) + (WALL_A + "mm").padStart(10) + (WALL_B + "mm").padStart(10));
  console.log("  " + "Corner eats".padEnd(20) + (cornerOnA + "mm").padStart(10) + (cornerOnB + "mm").padStart(10));
  console.log("  " + "Usable".padEnd(20) + (usableA + "mm").padStart(10) + (usableB + "mm").padStart(10));
  console.log("  " + "Base total".padEnd(20) + (rA.total + "mm").padStart(10) + (rB.total + "mm").padStart(10));
  console.log("  " + "Base gap".padEnd(20) + (rA.gap + "mm").padStart(10) + (rB.gap + "mm").padStart(10));
  console.log("  " + "Upper usable".padEnd(20) + (upperA_usable + "mm").padStart(10) + (usableB + "mm").padStart(10));
  console.log("  " + "Upper total".padEnd(20) + (rAw.total + "mm").padStart(10) + (rBw.total + "mm").padStart(10));
  console.log("  " + "Upper gap".padEnd(20) + (rAw.gap + "mm").padStart(10) + (rBw.gap + "mm").padStart(10));
  console.log("  " + "─".repeat(50));

  console.log("\n" + "═".repeat(70) + "\n");
}

run().catch(e => { console.error(e); process.exit(1); });
