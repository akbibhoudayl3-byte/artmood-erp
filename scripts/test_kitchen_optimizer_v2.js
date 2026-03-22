/**
 * KITCHEN MODULE OPTIMIZER v2 — Custom widths + smart fitting
 *
 * Key insight: standard modules (400/600/800) can't always fill walls exactly
 * because walls aren't always multiples of 200mm after corner deduction.
 *
 * Solution: The engine supports custom_width_mm per module slot.
 * Strategy:
 *   1. Start with standard widths — find best combo
 *   2. If gap remains, resize ONE module by ±gap to absorb it
 *   3. Validate: custom width must be within ±100mm of catalog width
 *   4. Only use fillers for gaps that can't be absorbed by resizing
 */

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

const WALL_A = 3000;
const WALL_B = 2400;
const STD_WIDTHS = [400, 600, 800];
const CUSTOM_TOLERANCE = 100; // max ±mm from catalog width
const MIN_MODULE_WIDTH = 300; // absolute minimum
const MAX_FILLER = 50; // fillers only for ≤ 50mm gaps

function findBestCombo(target, maxModules = 5) {
  const results = [];

  function recurse(remaining, combo, depth) {
    if (depth > maxModules || remaining < -CUSTOM_TOLERANCE) return;
    if (combo.length > 0) {
      const total = combo.reduce((s, w) => s + w, 0);
      const gap = target - total;
      if (gap >= 0 && gap <= 200) {
        results.push({ modules: [...combo].sort((a, b) => b - a), total, gap, count: combo.length });
      }
    }
    const minW = combo.length > 0 ? combo[combo.length - 1] : STD_WIDTHS[0];
    for (const w of STD_WIDTHS) {
      if (w < minW) continue;
      recurse(remaining - w, [...combo, w], depth + 1);
    }
  }

  recurse(target, [], 0);
  results.sort((a, b) => {
    if (a.gap === 0 && b.gap !== 0) return -1;
    if (b.gap === 0 && a.gap !== 0) return 1;
    if (a.gap !== b.gap) return a.gap - b.gap;
    return a.count - b.count;
  });

  const seen = new Set();
  return results.filter(r => {
    const key = r.modules.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Absorb gap by resizing one module.
 * Rules:
 *   - New width must be within [catalogWidth - CUSTOM_TOLERANCE, catalogWidth + CUSTOM_TOLERANCE]
 *   - New width must be ≥ MIN_MODULE_WIDTH
 *   - Prefer expanding over shrinking (expanding = bigger cabinet = more storage)
 *   - Prefer adjusting the largest module (less visual impact)
 */
function absorbGap(combo, gap) {
  if (gap === 0) return { combo, gap: 0, adjusted: null };

  const options = [];

  for (let i = 0; i < combo.length; i++) {
    const origW = combo[i];
    const newW = origW + gap; // expand this module to eat the gap

    // Find which catalog width this module maps to
    const catalogW = STD_WIDTHS.reduce((best, w) => Math.abs(w - origW) < Math.abs(best - origW) ? w : best, STD_WIDTHS[0]);

    // Check if new width is within tolerance of ANY standard width
    const closestCatalog = STD_WIDTHS.reduce((best, w) => Math.abs(w - newW) < Math.abs(best - newW) ? w : best, STD_WIDTHS[0]);
    const deviation = Math.abs(newW - closestCatalog);

    if (newW >= MIN_MODULE_WIDTH && deviation <= CUSTOM_TOLERANCE) {
      const newCombo = [...combo];
      newCombo[i] = newW;
      options.push({
        combo: newCombo.sort((a, b) => b - a),
        gap: 0,
        adjusted: { index: i, from: origW, to: newW, catalogBase: closestCatalog, deviation },
      });
    }
  }

  // Also try splitting the gap across two modules
  if (combo.length >= 2 && gap > 0) {
    for (let i = 0; i < combo.length; i++) {
      for (let j = i + 1; j < combo.length; j++) {
        const splitA = Math.ceil(gap / 2);
        const splitB = Math.floor(gap / 2);
        const newWi = combo[i] + splitA;
        const newWj = combo[j] + splitB;

        const closestI = STD_WIDTHS.reduce((best, w) => Math.abs(w - newWi) < Math.abs(best - newWi) ? w : best, STD_WIDTHS[0]);
        const closestJ = STD_WIDTHS.reduce((best, w) => Math.abs(w - newWj) < Math.abs(best - newWj) ? w : best, STD_WIDTHS[0]);

        if (newWi >= MIN_MODULE_WIDTH && Math.abs(newWi - closestI) <= CUSTOM_TOLERANCE &&
            newWj >= MIN_MODULE_WIDTH && Math.abs(newWj - closestJ) <= CUSTOM_TOLERANCE) {
          const newCombo = [...combo];
          newCombo[i] = newWi;
          newCombo[j] = newWj;
          options.push({
            combo: newCombo.sort((a, b) => b - a),
            gap: 0,
            adjusted: { index: i, from: combo[i] + "+" + combo[j], to: newWi + "+" + newWj, split: true, deviation: Math.max(Math.abs(newWi - closestI), Math.abs(newWj - closestJ)) },
          });
        }
      }
    }
  }

  // Pick best: smallest deviation from standard
  options.sort((a, b) => a.adjusted.deviation - b.adjusted.deviation);
  return options.length > 0 ? options[0] : { combo, gap, adjusted: null };
}

function fillerPlan(gap) {
  if (gap === 0) return { count: 0, detail: "none needed", verdict: "🟢 PERFECT" };
  if (gap <= 30) return { count: 1, detail: gap + "mm (one side)", verdict: "🟢 EXCELLENT" };
  if (gap <= MAX_FILLER) return { count: 1, detail: gap + "mm (one side)", verdict: "🟢 GOOD" };
  if (gap <= 100) return { count: 2, detail: Math.ceil(gap/2) + "+" + Math.floor(gap/2) + "mm", verdict: "🟠 ACCEPTABLE" };
  return { count: 2, detail: gap + "mm — too large", verdict: "🔴 BAD" };
}

function optimizeWall(label, fixedModules, fixedTotal, usable) {
  const flex = usable - fixedTotal;

  console.log("\n" + "─".repeat(70));
  console.log("  " + label);
  console.log("─".repeat(70));
  console.log("  Fixed: " + fixedModules.join(" + ") + " = " + fixedTotal + "mm");
  console.log("  Flexible space: " + flex + "mm");

  // Step 1: Standard combos
  const combos = findBestCombo(flex);
  if (combos.length === 0) {
    console.log("  ⛔ No valid standard combination found!");
    return { modules: [], gap: flex, fillers: { count: 1, detail: flex + "mm", verdict: "🔴 BAD" }, adjusted: false };
  }

  const best = combos[0];
  console.log("\n  Standard best: " + best.modules.map(w => w + "mm").join(" + ") + " = " + best.total + "mm (gap: " + best.gap + "mm)");

  // Show alternatives
  if (combos.length > 1) {
    console.log("  Alternatives:");
    for (let i = 1; i < Math.min(4, combos.length); i++) {
      const c = combos[i];
      console.log("    " + c.modules.map(w => w + "mm").join(" + ") + " = " + c.total + "mm (gap: " + c.gap + "mm)");
    }
  }

  // Step 2: Try absorbing gap via custom width
  let finalModules = best.modules;
  let finalGap = best.gap;
  let wasAdjusted = false;

  if (best.gap > 0) {
    const absorbed = absorbGap(best.modules, best.gap);
    if (absorbed.adjusted) {
      finalModules = absorbed.combo;
      finalGap = absorbed.gap;
      wasAdjusted = true;
      const adj = absorbed.adjusted;
      if (adj.split) {
        console.log("\n  💡 ABSORB: split " + best.gap + "mm across 2 modules (" + adj.from + " → " + adj.to + "mm)");
      } else {
        console.log("\n  💡 ABSORB: expand " + adj.from + "→" + adj.to + "mm (custom_width, ±" + adj.deviation + "mm from catalog)");
      }
      console.log("     Result: " + finalModules.map(w => w + "mm").join(" + ") + " = " + finalModules.reduce((s, w) => s + w, 0) + "mm (gap: " + finalGap + "mm)");
    } else {
      console.log("\n  ⚠️  Cannot absorb " + best.gap + "mm gap — exceeds ±" + CUSTOM_TOLERANCE + "mm tolerance");
    }
  }

  // Step 3: Filler plan for remaining gap
  const filler = fillerPlan(finalGap);
  console.log("  📐 Fillers: " + filler.detail + "  " + filler.verdict);

  return { modules: finalModules, gap: finalGap, fillers: filler, adjusted: wasAdjusted };
}

async function run() {
  console.log("\n" + "═".repeat(70));
  console.log("  KITCHEN MODULE OPTIMIZER v2 — Smart Fitting");
  console.log("  Wall A: " + WALL_A + "mm  |  Wall B: " + WALL_B + "mm");
  console.log("  Standard widths: " + STD_WIDTHS.join(", ") + "mm");
  console.log("  Custom tolerance: ±" + CUSTOM_TOLERANCE + "mm");
  console.log("  Max filler before resize: " + MAX_FILLER + "mm");
  console.log("═".repeat(70));

  const { data: corner } = await sb.from("product_modules")
    .select("width_mm, depth_mm").eq("code", "CORNER-BASE").single();
  const cornerOn = corner.depth_mm; // 900mm
  const usableA = WALL_A - cornerOn;
  const usableB = WALL_B - cornerOn;

  console.log("\n  Corner: " + cornerOn + "mm per wall");
  console.log("  Usable A: " + usableA + "mm  |  Usable B: " + usableB + "mm");

  // Optimize each wall
  const rA = optimizeWall("WALL A — BASE", ["PANTRY(600)", "SINK(800)"], 1400, usableA);
  const rB = optimizeWall("WALL B — BASE", ["DRAWER(600)"], 600, usableB);
  const rAw = optimizeWall("WALL A — UPPER (excl tall+sink zone)", [], 0, usableA - 600 - 800);
  const rBw = optimizeWall("WALL B — UPPER", [], 0, usableB);

  // ═══════════════════════════════════════════════════════════════
  // COMPARISON
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(70));
  console.log("  RESULTS COMPARISON");
  console.log("═".repeat(70));

  console.log("\n  " + "Wall".padEnd(25) + "Modules".padEnd(25) + "Gap".padStart(6) + "  Fillers  Adjusted?  Verdict");
  console.log("  " + "─".repeat(90));

  const walls = [
    { label: "A base", r: rA, fixed: "P600+S800" },
    { label: "B base", r: rB, fixed: "D600" },
    { label: "A upper", r: rAw, fixed: "—" },
    { label: "B upper", r: rBw, fixed: "—" },
  ];

  for (const w of walls) {
    const mods = w.r.modules.map(m => m + "mm").join("+");
    console.log("  " + w.label.padEnd(25) + (w.fixed + "+" + mods).padEnd(25) + (w.r.gap + "mm").padStart(6) + "  " + String(w.r.fillers.count).padEnd(8) + "  " + (w.r.adjusted ? "YES ✨" : "no").padEnd(10) + " " + w.r.fillers.verdict);
  }

  const totalGap = walls.reduce((s, w) => s + w.r.gap, 0);
  const totalFillers = walls.reduce((s, w) => s + w.r.fillers.count, 0);
  const adjustedCount = walls.filter(w => w.r.adjusted).length;

  console.log("  " + "─".repeat(90));
  console.log("  TOTAL gap: " + totalGap + "mm  |  Fillers: " + totalFillers + "  |  Custom-resized: " + adjustedCount + "/4 walls");

  // BEFORE vs AFTER
  console.log("\n  BEFORE (naive v2):      400mm total gap, 4 fillers, 0 custom widths");
  console.log("  AFTER  (optimizer v2):  " + totalGap + "mm total gap, " + totalFillers + " fillers, " + adjustedCount + " custom widths");

  if (totalGap === 0) {
    console.log("\n  🟢 PERFECT FIT — zero fillers, zero waste");
  } else if (totalGap <= 100) {
    console.log("\n  🟢 NEAR PERFECT — only " + totalGap + "mm total gap");
  } else {
    console.log("\n  🟠 ACCEPTABLE — " + totalGap + "mm remaining");
  }

  // Final layout
  console.log("\n" + "─".repeat(70));
  console.log("  FINAL LAYOUT");
  console.log("─".repeat(70));

  function drawWall(label, wallLen, parts) {
    const totalUsed = parts.reduce((s, p) => s + p.w, 0);
    console.log("\n  " + label + " (" + wallLen + "mm, used: " + totalUsed + "mm):");
    const bar = parts.map(p => {
      const tag = p.custom ? "⚡" + p.label + " " + p.w : p.label + " " + p.w;
      return tag;
    });
    console.log("  ┌" + bar.map(b => "─".repeat(b.length + 2)).join("┬") + "┐");
    console.log("  │" + bar.map(b => " " + b + " ").join("│") + "│");
    console.log("  └" + bar.map(b => "─".repeat(b.length + 2)).join("┴") + "┘");
  }

  const partsA = [{ label: "PANTRY", w: 600 }, { label: "SINK", w: 800 }];
  for (const w of rA.modules) partsA.push({ label: "BASE", w, custom: !STD_WIDTHS.includes(w) });
  if (rA.gap > 0) partsA.push({ label: "filler", w: rA.gap });
  partsA.push({ label: "CORNER", w: 900 });
  drawWall("Wall A base", WALL_A, partsA);

  const partsB = [{ label: "CORNER", w: 900 }, { label: "DRAWER", w: 600 }];
  for (const w of rB.modules) partsB.push({ label: "BASE", w, custom: !STD_WIDTHS.includes(w) });
  if (rB.gap > 0) partsB.push({ label: "filler", w: rB.gap });
  drawWall("Wall B base", WALL_B, partsB);

  const partsAw = [{ label: "—tall—", w: 600 }, { label: "—sink—", w: 800 }];
  for (const w of rAw.modules) partsAw.push({ label: "WALL", w, custom: !STD_WIDTHS.includes(w) });
  if (rAw.gap > 0) partsAw.push({ label: "filler", w: rAw.gap });
  partsAw.push({ label: "CORNER", w: 900 });
  drawWall("Wall A upper", WALL_A, partsAw);

  const partsBw = [{ label: "CORNER", w: 900 }];
  for (const w of rBw.modules) partsBw.push({ label: "WALL", w, custom: !STD_WIDTHS.includes(w) });
  if (rBw.gap > 0) partsBw.push({ label: "filler", w: rBw.gap });
  drawWall("Wall B upper", WALL_B, partsBw);

  console.log("\n  ⚡ = custom width (resized from catalog to absorb gap)");

  console.log("\n" + "═".repeat(70) + "\n");
}

run().catch(e => { console.error(e); process.exit(1); });
