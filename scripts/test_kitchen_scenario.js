/**
 * REAL KITCHEN SCENARIO TEST — L-Shape Layout
 *
 * Wall A: 3000mm | Wall B: 2400mm
 * Tests: module distribution, gap calculation, filler suggestions,
 *        corner logic, overlap detection, validation.
 *
 * Run: node scripts/test_kitchen_scenario.js
 */

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

// ═══════════════════════════════════════════════════════════════════
// SCENARIO CONFIG
// ═══════════════════════════════════════════════════════════════════
const WALL_A = 3000; // mm
const WALL_B = 2400; // mm
const CORNER_DEPTH = 560; // standard cabinet depth — corner eats this from each wall

// ═══════════════════════════════════════════════════════════════════
// KITCHEN DISTRIBUTION ENGINE (what the app SHOULD do)
// ═══════════════════════════════════════════════════════════════════

/**
 * L-shape corner logic:
 *
 *  Wall A (3000mm)
 *  ┌──────────────────────────────────┐
 *  │ [Tall] [Base] [Sink] [Base] [CRN]│
 *  └──────────────────────────────────┘
 *                                      │
 *                                      │ Wall B (2400mm)
 *                                      │
 *                                      │ [Base] [Drawer] [Base]
 *                                      │
 *
 * Corner module sits at the junction.
 * Wall A usable = WALL_A - CORNER_DEPTH (corner eats depth from wall A)
 * Wall B usable = WALL_B - CORNER_DEPTH (corner eats depth from wall B)
 *
 * The corner module itself has width 900mm but occupies CORNER_DEPTH (560mm)
 * on each wall's linear run. The extra 340mm is diagonal/internal.
 */

async function run() {
  console.log("\n" + "═".repeat(70));
  console.log("  L-SHAPE KITCHEN SCENARIO TEST");
  console.log("  Wall A: " + WALL_A + "mm  |  Wall B: " + WALL_B + "mm");
  console.log("  Date: " + new Date().toISOString());
  console.log("═".repeat(70));

  // ── Load modules from DB ──
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

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: L-SHAPE CORNER ANALYSIS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  1. CORNER ANALYSIS");
  console.log("─".repeat(70));

  const cornerBase = mod["CORNER-BASE"];
  const cornerWall = mod["CORNER-WALL"];

  console.log("  Corner base module: " + cornerBase.code + " — " + cornerBase.width_mm + "×" + cornerBase.depth_mm + "mm");
  console.log("  Corner wall module: " + cornerWall.code + " — " + cornerWall.width_mm + "×" + cornerWall.depth_mm + "mm");

  // L-shape: corner sits at junction
  // Each wall loses the cabinet depth (560mm) at the corner end
  // This is because the corner module extends 560mm into each wall's linear run
  const cornerFootprintA = cornerBase.depth_mm; // 560mm eaten from wall A
  const cornerFootprintB = cornerBase.depth_mm; // 560mm eaten from wall B

  const usableA = WALL_A - cornerFootprintA;
  const usableB = WALL_B - cornerFootprintB;

  console.log("\n  Wall A total:     " + WALL_A + "mm");
  console.log("  Corner eats:      " + cornerFootprintA + "mm (= cabinet depth)");
  console.log("  Wall A usable:    " + usableA + "mm");
  console.log("\n  Wall B total:     " + WALL_B + "mm");
  console.log("  Corner eats:      " + cornerFootprintB + "mm (= cabinet depth)");
  console.log("  Wall B usable:    " + usableB + "mm");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: MODULE DISTRIBUTION — BASE CABINETS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  2. BASE CABINET DISTRIBUTION");
  console.log("─".repeat(70));

  // Wall A (2440mm usable): PANTRY-TALL(600) + SINK-BASE(800) + BASE-600(600) + gap → CORNER
  // Wall B (1840mm usable): CORNER → DRAWER-600(600) + BASE-600(600) + BASE-400(400)

  const wallA_base = [
    { ...mod["PANTRY-TALL"], slot: "A1", wall: "A", note: "Tall column at left end" },
    { ...mod["SINK-BASE"],   slot: "A2", wall: "A", note: "Sink centered on wall A" },
    { ...mod["BASE-600"],    slot: "A3", wall: "A", note: "Standard base" },
    { ...mod["BASE-400"],    slot: "A4", wall: "A", note: "Fill remaining space" },
  ];

  const wallB_base = [
    { ...mod["DRAWER-600"],  slot: "B1", wall: "B", note: "Drawers near corner" },
    { ...mod["BASE-600"],    slot: "B2", wall: "B", note: "Standard base" },
    { ...mod["BASE-600"],    slot: "B3", wall: "B", note: "Standard base at end" },
  ];

  const totalA_base = wallA_base.reduce((s, m) => s + m.width_mm, 0);
  const totalB_base = wallB_base.reduce((s, m) => s + m.width_mm, 0);
  const gapA_base = usableA - totalA_base;
  const gapB_base = usableB - totalB_base;

  console.log("\n  WALL A — Base modules (usable: " + usableA + "mm):");
  console.log("  " + "─".repeat(66));
  let posA = 0;
  for (const m of wallA_base) {
    console.log("    " + m.slot + " | " + m.code.padEnd(14) + " | " + String(m.width_mm).padStart(4) + "mm | pos " + posA + "→" + (posA + m.width_mm) + "mm | " + m.note);
    posA += m.width_mm;
  }
  console.log("  " + "─".repeat(66));
  console.log("    TOTAL:   " + totalA_base + "mm");
  console.log("    GAP:     " + gapA_base + "mm" + (gapA_base < 0 ? " ⛔ OVERFLOW!" : gapA_base > 0 ? " → needs filler" : " ✅ exact fit"));

  console.log("\n  WALL B — Base modules (usable: " + usableB + "mm):");
  console.log("  " + "─".repeat(66));
  let posB = 0;
  for (const m of wallB_base) {
    console.log("    " + m.slot + " | " + m.code.padEnd(14) + " | " + String(m.width_mm).padStart(4) + "mm | pos " + posB + "→" + (posB + m.width_mm) + "mm | " + m.note);
    posB += m.width_mm;
  }
  console.log("  " + "─".repeat(66));
  console.log("    TOTAL:   " + totalB_base + "mm");
  console.log("    GAP:     " + gapB_base + "mm" + (gapB_base < 0 ? " ⛔ OVERFLOW!" : gapB_base > 0 ? " → needs filler" : " ✅ exact fit"));

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: MODULE DISTRIBUTION — WALL CABINETS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  3. WALL CABINET DISTRIBUTION");
  console.log("─".repeat(70));

  // Wall cabinets: no tall column zone, no sink zone (leave space above sink)
  // Wall A: skip tall column zone (600mm) + leave sink zone open
  // Usable for wall cabs on A: usableA - PANTRY width = 2440 - 600 = 1840mm
  // But we skip above sink (800mm), so: 1840 - 800 = 1040mm for wall cabs

  const wallA_upper_usable = usableA - mod["PANTRY-TALL"].width_mm - mod["SINK-BASE"].width_mm;
  const wallB_upper_usable = usableB; // full usable (no tall on wall B)

  const wallA_wall = [
    { ...mod["WALL-600"], slot: "A-W1", wall: "A", note: "Above base A3" },
    { ...mod["WALL-400"], slot: "A-W2", wall: "A", note: "Above base A4" },
  ];

  const wallB_wall = [
    { ...mod["WALL-600"], slot: "B-W1", wall: "B", note: "Above drawer" },
    { ...mod["WALL-600"], slot: "B-W2", wall: "B", note: "Above base B2" },
    { ...mod["WALL-600"], slot: "B-W3", wall: "B", note: "Above base B3" },
  ];

  const totalA_wall = wallA_wall.reduce((s, m) => s + m.width_mm, 0);
  const totalB_wall = wallB_wall.reduce((s, m) => s + m.width_mm, 0);
  const gapA_wall = wallA_upper_usable - totalA_wall;
  const gapB_wall = wallB_upper_usable - totalB_wall;

  console.log("\n  WALL A — Upper cabinets (usable: " + wallA_upper_usable + "mm, excl. tall + sink zone):");
  console.log("  " + "─".repeat(66));
  for (const m of wallA_wall) {
    console.log("    " + m.slot + " | " + m.code.padEnd(14) + " | " + String(m.width_mm).padStart(4) + "mm | " + m.note);
  }
  console.log("  " + "─".repeat(66));
  console.log("    TOTAL:   " + totalA_wall + "mm");
  console.log("    GAP:     " + gapA_wall + "mm" + (gapA_wall < 0 ? " ⛔ OVERFLOW!" : gapA_wall > 0 ? " → needs filler" : " ✅ exact fit"));

  console.log("\n  WALL B — Upper cabinets (usable: " + wallB_upper_usable + "mm):");
  console.log("  " + "─".repeat(66));
  for (const m of wallB_wall) {
    console.log("    " + m.slot + " | " + m.code.padEnd(14) + " | " + String(m.width_mm).padStart(4) + "mm | " + m.note);
  }
  console.log("  " + "─".repeat(66));
  console.log("    TOTAL:   " + totalB_wall + "mm");
  console.log("    GAP:     " + gapB_wall + "mm" + (gapB_wall < 0 ? " ⛔ OVERFLOW!" : gapB_wall > 0 ? " → needs filler" : " ✅ exact fit"));

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: OVERLAP DETECTION
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  4. OVERLAP DETECTION");
  console.log("─".repeat(70));

  function checkOverlap(label, mods, usable) {
    const total = mods.reduce((s, m) => s + m.width_mm, 0);
    let pos = 0;
    let overlap = false;
    for (let i = 0; i < mods.length; i++) {
      const end = pos + mods[i].width_mm;
      if (end > usable) {
        console.log("  ⛔ " + label + ": " + mods[i].code + " extends to " + end + "mm but wall ends at " + usable + "mm (overflow: " + (end - usable) + "mm)");
        overlap = true;
      }
      // Check module-to-module overlap (shouldn't happen in sequential placement)
      if (i > 0) {
        // sequential → no overlap by definition, but flag if total > usable
      }
      pos = end;
    }
    if (!overlap) console.log("  ✅ " + label + ": no overlap");
    return overlap;
  }

  const ovA_base = checkOverlap("Wall A base", wallA_base, usableA);
  const ovB_base = checkOverlap("Wall B base", wallB_base, usableB);
  const ovA_wall_check = checkOverlap("Wall A upper", wallA_wall, wallA_upper_usable);
  const ovB_wall_check = checkOverlap("Wall B upper", wallB_wall, wallB_upper_usable);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: FILLER SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  5. FILLER SUGGESTIONS");
  console.log("─".repeat(70));

  function suggestFillers(label, gap, wallLength) {
    if (gap === 0) {
      console.log("  ✅ " + label + ": exact fit — no filler needed");
      return;
    }
    if (gap < 0) {
      console.log("  ⛔ " + label + ": OVERFLOW by " + Math.abs(gap) + "mm — remove or resize a module");
      return;
    }
    if (gap > 0 && gap <= 50) {
      console.log("  💡 " + label + ": " + gap + "mm gap — single filler strip (left OR right)");
      console.log("      Option A: LEFT filler " + gap + "mm (against wall end)");
      console.log("      Option B: RIGHT filler " + gap + "mm (against corner)");
    } else if (gap > 50 && gap <= 100) {
      console.log("  💡 " + label + ": " + gap + "mm gap — split fillers recommended");
      console.log("      Option A: LEFT " + Math.ceil(gap / 2) + "mm + RIGHT " + Math.floor(gap / 2) + "mm");
      console.log("      Option B: Single filler " + gap + "mm on one side");
    } else if (gap > 100 && gap <= 400) {
      console.log("  ⚠️  " + label + ": " + gap + "mm gap — consider adding a module or larger filler");
      console.log("      Option A: Add BASE-400 (400mm) and filler " + (gap - 400) + "mm");
      if (gap >= 200) console.log("      Option B: Split filler " + Math.ceil(gap / 2) + "mm + " + Math.floor(gap / 2) + "mm each side");
      console.log("      Option C: Single decorative panel " + gap + "mm");
    } else {
      console.log("  ⚠️  " + label + ": " + gap + "mm gap — too large for filler, add another module");
    }
  }

  suggestFillers("Wall A base", gapA_base, usableA);
  suggestFillers("Wall B base", gapB_base, usableB);
  suggestFillers("Wall A upper", gapA_wall, wallA_upper_usable);
  suggestFillers("Wall B upper", gapB_wall, wallB_upper_usable);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: CORNER LOGIC CORRECTNESS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  6. CORNER LOGIC VALIDATION");
  console.log("─".repeat(70));

  // Corner base: 900×720×900mm — the depth is 900mm (not 560), it's a diagonal/blind corner
  // In an L-shape, the corner module typically:
  //   - Takes 560mm from Wall A's linear run (one depth)
  //   - Takes 560mm from Wall B's linear run (other depth)
  //   - The 900mm "width" is the diagonal measurement

  const cornerWidth = cornerBase.width_mm;    // 900mm
  const cornerDepth = cornerBase.depth_mm;    // 900mm (it's square)

  console.log("  Corner base: " + cornerWidth + "×" + cornerDepth + "mm");
  console.log("  Standard cabinet depth: " + CORNER_DEPTH + "mm");

  // Physical check: does the corner actually fit?
  // The corner takes depth_mm from each wall in the perpendicular direction
  // In practice: corner occupies 560mm on wall A + 560mm on wall B
  // Total footprint: wall A gets 560mm less, wall B gets 560mm less
  // Remaining wall A = 3000 - 560 = 2440mm ✓
  // Remaining wall B = 2400 - 560 = 1840mm ✓

  const checks = [];

  // Check 1: Corner doesn't exceed either wall
  if (cornerFootprintA <= WALL_A && cornerFootprintB <= WALL_B) {
    checks.push({ ok: true, msg: "Corner fits within both walls" });
  } else {
    checks.push({ ok: false, msg: "Corner exceeds wall length!" });
  }

  // Check 2: Usable space is positive and reasonable
  if (usableA >= 1200) { // minimum 2 modules
    checks.push({ ok: true, msg: "Wall A usable " + usableA + "mm ≥ 1200mm minimum" });
  } else {
    checks.push({ ok: false, msg: "Wall A usable " + usableA + "mm too small" });
  }

  if (usableB >= 1200) {
    checks.push({ ok: true, msg: "Wall B usable " + usableB + "mm ≥ 1200mm minimum" });
  } else {
    checks.push({ ok: false, msg: "Wall B usable " + usableB + "mm too small" });
  }

  // Check 3: Corner wall cabinet matches corner base position
  const cornerWallWidth = cornerWall.width_mm;
  const cornerWallDepth = cornerWall.depth_mm;
  if (cornerWallWidth <= cornerWidth) {
    checks.push({ ok: true, msg: "Corner wall (" + cornerWallWidth + "mm) fits within corner base (" + cornerWidth + "mm)" });
  } else {
    checks.push({ ok: false, msg: "Corner wall wider than corner base!" });
  }

  // Check 4: Wall A total modules + corner ≤ wall length
  const fullA = totalA_base + cornerFootprintA;
  if (fullA <= WALL_A) {
    checks.push({ ok: true, msg: "Wall A base + corner = " + fullA + "mm ≤ " + WALL_A + "mm" });
  } else {
    checks.push({ ok: false, msg: "Wall A base + corner = " + fullA + "mm > " + WALL_A + "mm OVERFLOW" });
  }

  const fullB = totalB_base + cornerFootprintB;
  if (fullB <= WALL_B) {
    checks.push({ ok: true, msg: "Wall B base + corner = " + fullB + "mm ≤ " + WALL_B + "mm" });
  } else {
    checks.push({ ok: false, msg: "Wall B base + corner = " + fullB + "mm > " + WALL_B + "mm OVERFLOW" });
  }

  for (const c of checks) {
    console.log("  " + (c.ok ? "✅" : "❌") + " " + c.msg);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: FULL LAYOUT VISUALIZATION
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  7. LAYOUT VISUALIZATION (top-down, not to scale)");
  console.log("─".repeat(70));

  console.log("");
  console.log("  Wall A (" + WALL_A + "mm) ─────────────────────────────────────────");
  console.log("  ┌────────┬──────────┬────────┬──────┬─────┬─────────┐");
  console.log("  │PANTRY  │ SINK-BASE│ BASE   │BASE  │ gap │  CORNER │");
  console.log("  │ 600mm  │  800mm   │ 600mm  │400mm │" + String(gapA_base) + "mm│  560mm  │");
  console.log("  └────────┴──────────┴────────┴──────┴─────┴────┬────┘");
  console.log("                                                  │");
  console.log("                                       ┌─────────┤ Wall B (" + WALL_B + "mm)");
  console.log("                                       │ CORNER  │");
  console.log("                                       │  560mm  │");
  console.log("                                       ├─────────┤");
  console.log("                                       │DRAWER   │");
  console.log("                                       │ 600mm   │");
  console.log("                                       ├─────────┤");
  console.log("                                       │ BASE    │");
  console.log("                                       │ 600mm   │");
  console.log("                                       ├─────────┤");
  console.log("                                       │ BASE    │");
  console.log("                                       │ 600mm   │");
  console.log("                                       ├─────────┤");
  console.log("                                       │  gap    │");
  console.log("                                       │ " + gapB_base + "mm  │");
  console.log("                                       └─────────┘");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: FINAL VALIDATION VERDICT
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  8. VALIDATION VERDICT");
  console.log("─".repeat(70));

  const allModules = [
    ...wallA_base.map(m => ({ ...m, level: "base", wall: "A" })),
    ...wallB_base.map(m => ({ ...m, level: "base", wall: "B" })),
    { ...cornerBase, slot: "CORNER", level: "base", wall: "A↔B" },
    ...wallA_wall.map(m => ({ ...m, level: "upper", wall: "A" })),
    ...wallB_wall.map(m => ({ ...m, level: "upper", wall: "B" })),
    { ...cornerWall, slot: "CORNER-W", level: "upper", wall: "A↔B" },
  ];

  console.log("\n  COMPLETE MODULE LIST:");
  console.log("  " + "─".repeat(66));
  console.log("  " + "Slot".padEnd(12) + "Code".padEnd(16) + "Width".padStart(6) + "  Wall  Level   Category");
  console.log("  " + "─".repeat(66));
  for (const m of allModules) {
    console.log("  " + (m.slot || "").padEnd(12) + m.code.padEnd(16) + String(m.width_mm + "mm").padStart(6) + "  " + (m.wall || "").padEnd(6) + (m.level || "").padEnd(8) + (m.category || ""));
  }
  console.log("  " + "─".repeat(66));
  console.log("  Total modules: " + allModules.length);

  // Scoring
  const issues = [];
  const warnings = [];

  if (gapA_base < 0) issues.push("Wall A base OVERFLOW by " + Math.abs(gapA_base) + "mm");
  if (gapB_base < 0) issues.push("Wall B base OVERFLOW by " + Math.abs(gapB_base) + "mm");
  if (gapA_wall < 0) issues.push("Wall A upper OVERFLOW by " + Math.abs(gapA_wall) + "mm");
  if (gapB_wall < 0) issues.push("Wall B upper OVERFLOW by " + Math.abs(gapB_wall) + "mm");

  if (gapA_base > 100) warnings.push("Wall A base gap " + gapA_base + "mm — large gap, consider adding module");
  else if (gapA_base > 0) warnings.push("Wall A base gap " + gapA_base + "mm — filler needed");
  if (gapB_base > 100) warnings.push("Wall B base gap " + gapB_base + "mm — large gap, consider adding module");
  else if (gapB_base > 0) warnings.push("Wall B base gap " + gapB_base + "mm — filler needed");
  if (gapA_wall > 100) warnings.push("Wall A upper gap " + gapA_wall + "mm — large gap");
  else if (gapA_wall > 0) warnings.push("Wall A upper gap " + gapA_wall + "mm — filler needed");
  if (gapB_wall > 100) warnings.push("Wall B upper gap " + gapB_wall + "mm — large gap");
  else if (gapB_wall > 0) warnings.push("Wall B upper gap " + gapB_wall + "mm — filler needed");

  if (ovA_base || ovB_base || ovA_wall_check || ovB_wall_check) issues.push("Module overlap detected");

  const cornerFails = checks.filter(c => !c.ok);
  if (cornerFails.length > 0) issues.push("Corner logic issues: " + cornerFails.map(c => c.msg).join("; "));

  let verdict, color;
  if (issues.length > 0) {
    verdict = "RED — CRITICAL ISSUES";
    color = "🔴";
  } else if (warnings.length > 0) {
    verdict = "ORANGE — NEEDS FILLERS/ADJUSTMENTS";
    color = "🟠";
  } else {
    verdict = "GREEN — PERFECT FIT";
    color = "🟢";
  }

  console.log("\n  " + color + " VERDICT: " + verdict);

  if (issues.length > 0) {
    console.log("\n  ISSUES:");
    for (const i of issues) console.log("    ❌ " + i);
  }
  if (warnings.length > 0) {
    console.log("\n  WARNINGS:");
    for (const w of warnings) console.log("    ⚠️  " + w);
  }

  // Summary table
  console.log("\n  SUMMARY TABLE:");
  console.log("  " + "─".repeat(55));
  console.log("  " + "".padEnd(18) + "Wall A".padStart(10) + "Wall B".padStart(10));
  console.log("  " + "─".repeat(55));
  console.log("  " + "Total length".padEnd(18) + (WALL_A + "mm").padStart(10) + (WALL_B + "mm").padStart(10));
  console.log("  " + "Corner eats".padEnd(18) + (cornerFootprintA + "mm").padStart(10) + (cornerFootprintB + "mm").padStart(10));
  console.log("  " + "Usable".padEnd(18) + (usableA + "mm").padStart(10) + (usableB + "mm").padStart(10));
  console.log("  " + "Base modules".padEnd(18) + (totalA_base + "mm").padStart(10) + (totalB_base + "mm").padStart(10));
  console.log("  " + "Base gap".padEnd(18) + (gapA_base + "mm").padStart(10) + (gapB_base + "mm").padStart(10));
  console.log("  " + "Upper usable".padEnd(18) + (wallA_upper_usable + "mm").padStart(10) + (wallB_upper_usable + "mm").padStart(10));
  console.log("  " + "Upper modules".padEnd(18) + (totalA_wall + "mm").padStart(10) + (totalB_wall + "mm").padStart(10));
  console.log("  " + "Upper gap".padEnd(18) + (gapA_wall + "mm").padStart(10) + (gapB_wall + "mm").padStart(10));
  console.log("  " + "─".repeat(55));

  console.log("\n" + "═".repeat(70));
  console.log("  TEST COMPLETE");
  console.log("═".repeat(70) + "\n");
}

run().catch(e => { console.error(e); process.exit(1); });
