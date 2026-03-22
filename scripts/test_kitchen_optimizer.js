/**
 * KITCHEN MODULE OPTIMIZER — Best-fit before fillers
 *
 * Algorithm:
 *   1. Start with required/fixed modules (sink, corner, tall, drawer)
 *   2. Fill remaining space with flexible base/wall modules
 *   3. Try ALL combinations of 400/600/800mm widths
 *   4. Score by: smallest gap → fewest modules → fewest fillers
 *   5. If gap < 100mm, try swapping one module width to absorb it
 *
 * L-Shape: Wall A = 3000mm, Wall B = 2400mm
 */

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

const WALL_A = 3000;
const WALL_B = 2400;
const WIDTHS = [400, 600, 800]; // available flexible module widths

// ═══════════════════════════════════════════════════════════════════
// OPTIMIZER ENGINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Find all combinations of modules that fill `target` mm.
 * fixedWidth = space already consumed by required modules.
 * Returns sorted array of { modules: number[], total, gap, fillerCount }
 */
function findCombinations(target, maxModules = 6) {
  const results = [];

  function recurse(remaining, combo, depth) {
    if (depth > maxModules) return;
    if (remaining < 0) return; // overflow

    // Record this combo (even if remaining > 0 — it's a gap)
    if (combo.length > 0) {
      const total = combo.reduce((s, w) => s + w, 0);
      const gap = target - total;
      if (gap >= 0 && gap <= 200) { // only keep combos with gap ≤ 200mm
        results.push({
          modules: [...combo].sort((a, b) => b - a),
          total,
          gap,
          count: combo.length,
        });
      }
    }

    // Try adding each width (avoid duplicates by only going >= last)
    const minWidth = combo.length > 0 ? combo[combo.length - 1] : WIDTHS[0];
    for (const w of WIDTHS) {
      if (w < minWidth) continue; // keep sorted to avoid duplicate permutations
      recurse(remaining - w, [...combo, w], depth + 1);
    }
  }

  recurse(target, [], 0);

  // Score: prefer gap=0, then smallest gap, then fewest modules
  results.sort((a, b) => {
    if (a.gap === 0 && b.gap !== 0) return -1;
    if (b.gap === 0 && a.gap !== 0) return 1;
    if (a.gap !== b.gap) return a.gap - b.gap;
    return a.count - b.count;
  });

  // Deduplicate
  const seen = new Set();
  return results.filter(r => {
    const key = r.modules.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Try absorbing a small gap by swapping one module to a different width.
 * E.g., gap=100 → swap a 400→600 (absorbs 200, new gap=-100? no)
 * Or gap=200 → swap a 600→800 (absorbs 200, gap=0!)
 */
function tryAbsorbGap(combo, gap) {
  if (gap === 0) return null;
  const adjustments = [];

  for (let i = 0; i < combo.length; i++) {
    for (const newW of WIDTHS) {
      const diff = newW - combo[i];
      if (diff === 0) continue;
      const newGap = gap - diff;
      if (newGap >= 0 && newGap < gap) {
        const newCombo = [...combo];
        newCombo[i] = newW;
        adjustments.push({
          from: combo[i],
          to: newW,
          index: i,
          oldGap: gap,
          newGap,
          modules: newCombo.sort((a, b) => b - a),
        });
      }
    }
  }

  // Best: smallest newGap
  adjustments.sort((a, b) => a.newGap - b.newGap);
  return adjustments.length > 0 ? adjustments[0] : null;
}

/**
 * Determine fillers for a gap.
 * Rules:
 *   - gap = 0: no filler
 *   - gap ≤ 50: 1 filler (left or right, prefer against wall end)
 *   - gap ≤ 100: 1 filler or split 2 (left + right)
 *   - gap > 100: must fix modules, not filler
 */
function planFillers(gap) {
  if (gap === 0) return { count: 0, detail: "exact fit" };
  if (gap <= 30) return { count: 1, detail: gap + "mm single filler (one side)" };
  if (gap <= 60) return { count: 1, detail: gap + "mm filler (one side) or split " + Math.ceil(gap/2) + "+" + Math.floor(gap/2) + "mm" };
  if (gap <= 100) return { count: 2, detail: "split " + Math.ceil(gap/2) + "+" + Math.floor(gap/2) + "mm (L+R)" };
  return { count: 2, detail: gap + "mm — too large, consider different modules" };
}

async function run() {
  console.log("\n" + "═".repeat(70));
  console.log("  KITCHEN MODULE OPTIMIZER — L-Shape");
  console.log("  Wall A: " + WALL_A + "mm  |  Wall B: " + WALL_B + "mm");
  console.log("═".repeat(70));

  // Corner footprint
  const { data: corner } = await sb.from("product_modules")
    .select("width_mm, depth_mm").eq("code", "CORNER-BASE").single();
  const cornerOnA = corner.depth_mm; // 900mm
  const cornerOnB = corner.depth_mm; // 900mm

  const usableA = WALL_A - cornerOnA; // 2100mm
  const usableB = WALL_B - cornerOnB; // 1500mm

  console.log("\n  Corner: " + cornerOnA + "mm on each wall");
  console.log("  Usable A: " + usableA + "mm  |  Usable B: " + usableB + "mm");

  // ═══════════════════════════════════════════════════════════════
  // WALL A — BASE: Fixed = PANTRY(600) + SINK(800) = 1400mm
  // Flexible space = 2100 - 1400 = 700mm
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  WALL A — BASE OPTIMIZATION");
  console.log("─".repeat(70));

  const fixedA = 600 + 800; // PANTRY + SINK
  const flexA = usableA - fixedA; // 700mm
  console.log("  Fixed modules: PANTRY(600) + SINK(800) = " + fixedA + "mm");
  console.log("  Flexible space: " + flexA + "mm");

  const combosA = findCombinations(flexA);
  console.log("  Combinations found: " + combosA.length);
  console.log("\n  TOP 5 COMBINATIONS:");
  console.log("  " + "Rank".padEnd(6) + "Modules".padEnd(24) + "Total".padStart(6) + "  Gap".padStart(6) + "  Verdict");
  console.log("  " + "─".repeat(60));
  for (let i = 0; i < Math.min(5, combosA.length); i++) {
    const c = combosA[i];
    const label = c.modules.map(w => w + "mm").join(" + ");
    const fillers = planFillers(c.gap);
    const verdict = c.gap === 0 ? "🟢 PERFECT" : c.gap <= 50 ? "🟢 EXCELLENT" : c.gap <= 100 ? "🟠 OK+filler" : "🔴 BAD";
    console.log("  " + ("#" + (i + 1)).padEnd(6) + label.padEnd(24) + (c.total + "mm").padStart(6) + ("  " + c.gap + "mm").padStart(6) + "  " + verdict);
  }

  // Best combo
  const bestA = combosA[0];
  console.log("\n  ✅ BEST: " + bestA.modules.map(w => w + "mm").join(" + ") + " = " + bestA.total + "mm (gap: " + bestA.gap + "mm)");

  // Try absorbing gap
  if (bestA.gap > 0 && bestA.gap <= 100) {
    const adj = tryAbsorbGap(bestA.modules, bestA.gap);
    if (adj && adj.newGap < bestA.gap) {
      console.log("  💡 SWAP: change " + adj.from + "→" + adj.to + "mm → gap " + bestA.gap + "→" + adj.newGap + "mm");
      console.log("     New combo: " + adj.modules.map(w => w + "mm").join(" + "));
    }
  }

  const fillerA = planFillers(bestA.gap);
  console.log("  📐 Fillers: " + fillerA.detail);

  // ═══════════════════════════════════════════════════════════════
  // WALL B — BASE: Fixed = DRAWER(600). Flexible = 1500 - 600 = 900mm
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  WALL B — BASE OPTIMIZATION");
  console.log("─".repeat(70));

  const fixedB = 600; // DRAWER
  const flexB = usableB - fixedB; // 900mm
  console.log("  Fixed modules: DRAWER(600) = " + fixedB + "mm");
  console.log("  Flexible space: " + flexB + "mm");

  const combosB = findCombinations(flexB);
  console.log("  Combinations found: " + combosB.length);
  console.log("\n  TOP 5 COMBINATIONS:");
  console.log("  " + "Rank".padEnd(6) + "Modules".padEnd(24) + "Total".padStart(6) + "  Gap".padStart(6) + "  Verdict");
  console.log("  " + "─".repeat(60));
  for (let i = 0; i < Math.min(5, combosB.length); i++) {
    const c = combosB[i];
    const label = c.modules.map(w => w + "mm").join(" + ");
    const verdict = c.gap === 0 ? "🟢 PERFECT" : c.gap <= 50 ? "🟢 EXCELLENT" : c.gap <= 100 ? "🟠 OK+filler" : "🔴 BAD";
    console.log("  " + ("#" + (i + 1)).padEnd(6) + label.padEnd(24) + (c.total + "mm").padStart(6) + ("  " + c.gap + "mm").padStart(6) + "  " + verdict);
  }

  const bestB = combosB[0];
  console.log("\n  ✅ BEST: " + bestB.modules.map(w => w + "mm").join(" + ") + " = " + bestB.total + "mm (gap: " + bestB.gap + "mm)");

  if (bestB.gap > 0 && bestB.gap <= 100) {
    const adj = tryAbsorbGap(bestB.modules, bestB.gap);
    if (adj && adj.newGap < bestB.gap) {
      console.log("  💡 SWAP: change " + adj.from + "→" + adj.to + "mm → gap " + bestB.gap + "→" + adj.newGap + "mm");
      console.log("     New combo: " + adj.modules.map(w => w + "mm").join(" + "));
    }
  }

  const fillerB = planFillers(bestB.gap);
  console.log("  📐 Fillers: " + fillerB.detail);

  // ═══════════════════════════════════════════════════════════════
  // WALL A — UPPER: Skip tall(600) + sink(800) = 1400mm overhead
  // Usable upper = 2100 - 1400 = 700mm
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  WALL A — UPPER OPTIMIZATION");
  console.log("─".repeat(70));

  const upperA = usableA - 600 - 800; // 700mm (skip tall + sink zones)
  console.log("  Usable (excl. tall 600 + sink 800): " + upperA + "mm");

  const combosAw = findCombinations(upperA);
  console.log("  Combinations found: " + combosAw.length);
  console.log("\n  TOP 5 COMBINATIONS:");
  console.log("  " + "Rank".padEnd(6) + "Modules".padEnd(24) + "Total".padStart(6) + "  Gap".padStart(6) + "  Verdict");
  console.log("  " + "─".repeat(60));
  for (let i = 0; i < Math.min(5, combosAw.length); i++) {
    const c = combosAw[i];
    const label = c.modules.map(w => w + "mm").join(" + ");
    const verdict = c.gap === 0 ? "🟢 PERFECT" : c.gap <= 50 ? "🟢 EXCELLENT" : c.gap <= 100 ? "🟠 OK+filler" : "🔴 BAD";
    console.log("  " + ("#" + (i + 1)).padEnd(6) + label.padEnd(24) + (c.total + "mm").padStart(6) + ("  " + c.gap + "mm").padStart(6) + "  " + verdict);
  }

  const bestAw = combosAw[0];
  console.log("\n  ✅ BEST: " + bestAw.modules.map(w => w + "mm").join(" + ") + " = " + bestAw.total + "mm (gap: " + bestAw.gap + "mm)");

  if (bestAw.gap > 0 && bestAw.gap <= 100) {
    const adj = tryAbsorbGap(bestAw.modules, bestAw.gap);
    if (adj && adj.newGap < bestAw.gap) {
      console.log("  💡 SWAP: change " + adj.from + "→" + adj.to + "mm → gap " + bestAw.gap + "→" + adj.newGap + "mm");
    }
  }

  const fillerAw = planFillers(bestAw.gap);
  console.log("  📐 Fillers: " + fillerAw.detail);

  // ═══════════════════════════════════════════════════════════════
  // WALL B — UPPER: Full 1500mm
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "─".repeat(70));
  console.log("  WALL B — UPPER OPTIMIZATION");
  console.log("─".repeat(70));

  console.log("  Usable: " + usableB + "mm");

  const combosBw = findCombinations(usableB);
  console.log("  Combinations found: " + combosBw.length);
  console.log("\n  TOP 5 COMBINATIONS:");
  console.log("  " + "Rank".padEnd(6) + "Modules".padEnd(24) + "Total".padStart(6) + "  Gap".padStart(6) + "  Verdict");
  console.log("  " + "─".repeat(60));
  for (let i = 0; i < Math.min(5, combosBw.length); i++) {
    const c = combosBw[i];
    const label = c.modules.map(w => w + "mm").join(" + ");
    const verdict = c.gap === 0 ? "🟢 PERFECT" : c.gap <= 50 ? "🟢 EXCELLENT" : c.gap <= 100 ? "🟠 OK+filler" : "🔴 BAD";
    console.log("  " + ("#" + (i + 1)).padEnd(6) + label.padEnd(24) + (c.total + "mm").padStart(6) + ("  " + c.gap + "mm").padStart(6) + "  " + verdict);
  }

  const bestBw = combosBw[0];
  console.log("\n  ✅ BEST: " + bestBw.modules.map(w => w + "mm").join(" + ") + " = " + bestBw.total + "mm (gap: " + bestBw.gap + "mm)");

  if (bestBw.gap > 0 && bestBw.gap <= 100) {
    const adj = tryAbsorbGap(bestBw.modules, bestBw.gap);
    if (adj && adj.newGap < bestBw.gap) {
      console.log("  💡 SWAP: change " + adj.from + "→" + adj.to + "mm → gap " + bestBw.gap + "→" + adj.newGap + "mm");
    }
  }

  const fillerBw = planFillers(bestBw.gap);
  console.log("  📐 Fillers: " + fillerBw.detail);

  // ═══════════════════════════════════════════════════════════════
  // FINAL OPTIMIZED LAYOUT
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(70));
  console.log("  OPTIMIZED LAYOUT — BEFORE vs AFTER");
  console.log("═".repeat(70));

  console.log("\n  BEFORE (v2 — naive):");
  console.log("  Wall A base: PANTRY(600) + SINK(800) + BASE-600    = 2000mm  gap 100mm  🟠");
  console.log("  Wall B base: DRAWER(600) + BASE-400 + BASE-400     = 1400mm  gap 100mm  🟠");
  console.log("  Wall A upper: WALL-600                              = 600mm   gap 100mm  🟠");
  console.log("  Wall B upper: WALL-600 + WALL-400 + WALL-400       = 1400mm  gap 100mm  🟠");
  console.log("  Total fillers: 4 × 100mm = 400mm");

  console.log("\n  AFTER (optimized):");

  const fmtModules = (fixed, flex) => {
    const parts = [...fixed];
    for (const w of flex) parts.push("BASE-" + w + "(" + w + ")");
    return parts.join(" + ");
  };

  const allA = ["PANTRY(600)", "SINK(800)"];
  for (const w of bestA.modules) allA.push(w + "mm");
  console.log("  Wall A base: " + allA.join(" + ") + "  = " + (fixedA + bestA.total) + "mm  gap " + bestA.gap + "mm  " + (bestA.gap === 0 ? "🟢" : "🟠"));

  const allB = ["DRAWER(600)"];
  for (const w of bestB.modules) allB.push(w + "mm");
  console.log("  Wall B base: " + allB.join(" + ") + "  = " + (fixedB + bestB.total) + "mm  gap " + bestB.gap + "mm  " + (bestB.gap === 0 ? "🟢" : "🟠"));

  const allAw = [];
  for (const w of bestAw.modules) allAw.push("WALL-" + w + "(" + w + ")");
  console.log("  Wall A upper: " + allAw.join(" + ") + "  = " + bestAw.total + "mm  gap " + bestAw.gap + "mm  " + (bestAw.gap === 0 ? "🟢" : "🟠"));

  const allBw = [];
  for (const w of bestBw.modules) allBw.push("WALL-" + w + "(" + w + ")");
  console.log("  Wall B upper: " + allBw.join(" + ") + "  = " + bestBw.total + "mm  gap " + bestBw.gap + "mm  " + (bestBw.gap === 0 ? "🟢" : "🟠"));

  const totalFillerBefore = 400;
  const totalFillerAfter = bestA.gap + bestB.gap + bestAw.gap + bestBw.gap;
  const fillerCountAfter = fillerA.count + fillerB.count + fillerAw.count + fillerBw.count;

  console.log("\n  Total filler BEFORE: 400mm (4 fillers)");
  console.log("  Total filler AFTER:  " + totalFillerAfter + "mm (" + fillerCountAfter + " fillers)");
  console.log("  Improvement: " + (totalFillerBefore - totalFillerAfter) + "mm saved (" + Math.round((1 - totalFillerAfter / totalFillerBefore) * 100) + "% reduction)");

  // Final verdict
  const greenCount = [bestA, bestB, bestAw, bestBw].filter(b => b.gap === 0).length;
  const totalWalls = 4;

  let verdict;
  if (greenCount === totalWalls) verdict = "🟢 GREEN — ALL PERFECT FIT";
  else if (totalFillerAfter <= 100) verdict = "🟢 GREEN — NEAR PERFECT (" + totalFillerAfter + "mm total filler)";
  else if (totalFillerAfter <= 200) verdict = "🟠 ORANGE — ACCEPTABLE (" + totalFillerAfter + "mm total filler)";
  else verdict = "🔴 RED — NEEDS WORK";

  console.log("\n  " + verdict);

  // Visualization
  console.log("\n" + "─".repeat(70));
  console.log("  FINAL LAYOUT VISUALIZATION");
  console.log("─".repeat(70));

  const aLabels = ["PANTRY 600", "SINK 800"];
  for (const w of bestA.modules) aLabels.push("BASE " + w);
  if (bestA.gap > 0) aLabels.push("filler " + bestA.gap);
  aLabels.push("CORNER 900");

  const bLabels = ["CORNER 900"];
  for (const w of bestB.modules) bLabels.push("BASE " + w);
  if (bestB.gap > 0) bLabels.push("filler " + bestB.gap);

  console.log("\n  Wall A (" + WALL_A + "mm):");
  console.log("  ┌" + aLabels.map(l => "─".repeat(l.length + 2)).join("┬") + "┐");
  console.log("  │" + aLabels.map(l => " " + l + " ").join("│") + "│");
  console.log("  └" + aLabels.map(l => "─".repeat(l.length + 2)).join("┴") + "┘");

  console.log("\n  Wall B (" + WALL_B + "mm):");
  console.log("  ┌" + bLabels.map(l => "─".repeat(l.length + 2)).join("┬") + "┐");
  console.log("  │" + bLabels.map(l => " " + l + " ").join("│") + "│");
  console.log("  └" + bLabels.map(l => "─".repeat(l.length + 2)).join("┴") + "┘");

  console.log("\n" + "═".repeat(70) + "\n");
}

run().catch(e => { console.error(e); process.exit(1); });
