/**
 * KITCHEN MODULE OPTIMIZER v3 — Industrial Rules
 *
 * Priority order:
 *   1. Exact fit with standard modules (400/600/800) → 🟢 no filler
 *   2. Standard modules + small filler (≤ 100mm) → 🟢 acceptable
 *   3. Standard modules + medium filler (101–150mm) → 🟠 ok
 *   4. Only if filler > 150mm → try ONE custom width to reduce it
 *   5. Max 1–2 custom widths per wall, only as last resort
 */

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://emeznqaweezgsqavxkuu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXpucWF3ZWV6Z3NxYXZ4a3V1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyODgxMiwiZXhwIjoyMDg4NDA0ODEyfQ.SfyDDaOCjLMMDHSDjyaqi4bIbzcTPsmznOmT5IK1LlY"
);

const WALL_A = 3000;
const WALL_B = 2400;
const STD = [400, 600, 800];

// Industrial thresholds
const FILLER_OK = 100;       // ≤ 100mm filler = fine
const FILLER_WARN = 150;     // 101–150mm = acceptable
const FILLER_CUSTOM = 150;   // > 150mm → try custom width
const CUSTOM_MAX_PER_WALL = 2;
const CUSTOM_TOLERANCE = 100; // custom width = std ± 100mm max
const MIN_WIDTH = 300;

// ──────────────────────────────────────────────────────────────────
// Combo finder — standard widths only
// ──────────────────────────────────────────────────────────────────
function findStdCombos(target, maxMods = 5) {
  const results = [];
  function go(rem, combo, depth) {
    if (depth > maxMods || rem < -1) return;
    if (combo.length > 0) {
      const total = combo.reduce((s, w) => s + w, 0);
      const gap = target - total;
      if (gap >= 0 && gap <= 300) {
        results.push({
          mods: [...combo].sort((a, b) => b - a),
          total,
          gap,
          n: combo.length,
          customCount: 0,
        });
      }
    }
    const floor = combo.length > 0 ? combo[combo.length - 1] : STD[0];
    for (const w of STD) {
      if (w < floor) continue;
      go(rem - w, [...combo, w], depth + 1);
    }
  }
  go(target, [], 0);

  // Sort: exact fit first, then smallest gap, then fewest modules
  results.sort((a, b) => {
    if (a.gap === 0 && b.gap !== 0) return -1;
    if (b.gap === 0 && a.gap !== 0) return 1;
    if (a.gap !== b.gap) return a.gap - b.gap;
    return a.n - b.n;
  });

  // Deduplicate
  const seen = new Set();
  return results.filter(r => {
    const k = r.mods.join(",");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ──────────────────────────────────────────────────────────────────
// Custom width adjustment — only if gap > FILLER_CUSTOM
// Resize at most ONE module to absorb part of the gap
// ──────────────────────────────────────────────────────────────────
function tryCustomResize(combo, gap) {
  if (gap <= FILLER_CUSTOM) return null; // don't touch — filler is fine

  const options = [];
  for (let i = 0; i < combo.length; i++) {
    const orig = combo[i];
    // Try expanding this module to eat as much gap as possible
    // but stay within CUSTOM_TOLERANCE of a standard width
    for (const stdW of STD) {
      const maxExpand = stdW + CUSTOM_TOLERANCE;
      const minExpand = stdW - CUSTOM_TOLERANCE;
      // New width = orig + some portion of gap
      for (let absorb = gap; absorb >= 50; absorb -= 10) {
        const newW = orig + absorb;
        if (newW >= minExpand && newW <= maxExpand && newW >= MIN_WIDTH) {
          const newGap = gap - absorb;
          const newCombo = [...combo];
          newCombo[i] = newW;
          options.push({
            mods: newCombo.sort((a, b) => b - a),
            gap: newGap,
            customCount: 1,
            detail: orig + "→" + newW + "mm (base: " + stdW + "mm, +" + (newW - stdW) + "mm)",
            absorbed: absorb,
          });
        }
      }
    }
  }

  if (options.length === 0) return null;

  // Best: smallest remaining gap while absorbing the most
  options.sort((a, b) => a.gap - b.gap);
  return options[0];
}

// ──────────────────────────────────────────────────────────────────
// Filler classification
// ──────────────────────────────────────────────────────────────────
function classifyGap(gap) {
  if (gap === 0)              return { verdict: "🟢 EXACT FIT",  fillers: 0, detail: "no filler" };
  if (gap <= 30)              return { verdict: "🟢 EXCELLENT",  fillers: 1, detail: gap + "mm single filler" };
  if (gap <= FILLER_OK)       return { verdict: "🟢 GOOD",       fillers: 1, detail: gap + "mm filler (one side)" };
  if (gap <= FILLER_WARN)     return { verdict: "🟠 ACCEPTABLE", fillers: 1, detail: gap + "mm filler" };
  if (gap <= 200)             return { verdict: "🟠 LARGE",      fillers: 2, detail: Math.ceil(gap/2) + "+" + Math.floor(gap/2) + "mm split" };
  return                               { verdict: "🔴 TOO LARGE", fillers: 2, detail: gap + "mm — add module" };
}

// ──────────────────────────────────────────────────────────────────
// Main wall optimizer
// ──────────────────────────────────────────────────────────────────
function optimizeWall(label, fixedLabels, fixedTotal, usable) {
  const flex = usable - fixedTotal;

  console.log("\n" + "─".repeat(70));
  console.log("  " + label);
  console.log("─".repeat(70));
  console.log("  Fixed: " + (fixedLabels.length ? fixedLabels.join(" + ") : "none") + " = " + fixedTotal + "mm");
  console.log("  Flexible: " + flex + "mm");

  const combos = findStdCombos(flex);
  if (combos.length === 0) {
    console.log("  ⛔ No valid combo found");
    return { mods: [], gap: flex, customCount: 0, cls: classifyGap(flex) };
  }

  // Show top 5
  console.log("\n  STANDARD COMBINATIONS (top 5 of " + combos.length + "):");
  console.log("  " + "#".padEnd(4) + "Modules".padEnd(28) + "Total".padStart(6) + "  Gap".padStart(6) + "  Verdict");
  console.log("  " + "─".repeat(62));
  for (let i = 0; i < Math.min(5, combos.length); i++) {
    const c = combos[i];
    const cls = classifyGap(c.gap);
    console.log("  " + ("#" + (i+1)).padEnd(4) + c.mods.map(w => w + "").join(" + ").padEnd(28) + (c.total + "mm").padStart(6) + ("  " + c.gap + "mm").padStart(6) + "  " + cls.verdict);
  }

  const best = combos[0];
  const cls = classifyGap(best.gap);

  // Decision tree
  if (best.gap <= FILLER_CUSTOM) {
    // Standard modules + filler is fine
    console.log("\n  ✅ PICK: " + best.mods.join(" + ") + "mm = " + best.total + "mm");
    console.log("  📐 Gap " + best.gap + "mm → " + cls.detail + "  " + cls.verdict);
    return { mods: best.mods, gap: best.gap, customCount: 0, cls };
  }

  // Gap > 150mm → try custom resize on ONE module
  console.log("\n  ⚠️  Best standard gap = " + best.gap + "mm (>" + FILLER_CUSTOM + "mm) → trying custom resize...");
  const custom = tryCustomResize(best.mods, best.gap);

  if (custom) {
    const cls2 = classifyGap(custom.gap);
    console.log("  💡 CUSTOM: " + custom.detail);
    console.log("     New: " + custom.mods.join(" + ") + "mm (gap: " + custom.gap + "mm)");
    console.log("  📐 " + cls2.detail + "  " + cls2.verdict);
    return { mods: custom.mods, gap: custom.gap, customCount: custom.customCount, cls: cls2 };
  }

  // Custom didn't help — use standard + large filler
  console.log("  ⚠️  Custom resize didn't help — using standard + filler");
  console.log("  📐 Gap " + best.gap + "mm → " + cls.detail + "  " + cls.verdict);
  return { mods: best.mods, gap: best.gap, customCount: 0, cls };
}

async function run() {
  console.log("\n" + "═".repeat(70));
  console.log("  KITCHEN OPTIMIZER v3 — Industrial Rules");
  console.log("  Wall A: " + WALL_A + "mm  |  Wall B: " + WALL_B + "mm");
  console.log("═".repeat(70));
  console.log("  Rules:");
  console.log("    1. Standard widths first: 400 / 600 / 800mm");
  console.log("    2. Filler ≤ 100mm = 🟢   |   101–150mm = 🟠");
  console.log("    3. Custom width ONLY if filler > 150mm");
  console.log("    4. Max " + CUSTOM_MAX_PER_WALL + " custom modules per wall");

  const { data: corner } = await sb.from("product_modules")
    .select("width_mm, depth_mm").eq("code", "CORNER-BASE").single();
  const cornerOn = corner.depth_mm;
  const usableA = WALL_A - cornerOn;
  const usableB = WALL_B - cornerOn;

  console.log("\n  Corner: " + cornerOn + "mm/wall → Usable A: " + usableA + "mm, B: " + usableB + "mm");

  // Optimize each wall
  const rA  = optimizeWall("WALL A — BASE",  ["PANTRY(600)", "SINK(800)"], 1400, usableA);
  const rB  = optimizeWall("WALL B — BASE",  ["DRAWER(600)"],              600,  usableB);
  const rAw = optimizeWall("WALL A — UPPER (excl. tall+sink)", [],          0,    usableA - 600 - 800);
  const rBw = optimizeWall("WALL B — UPPER", [],                            0,    usableB);

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(70));
  console.log("  FINAL SUMMARY");
  console.log("═".repeat(70));

  const walls = [
    { label: "A base",  r: rA,  fixed: "P600+S800" },
    { label: "B base",  r: rB,  fixed: "D600" },
    { label: "A upper", r: rAw, fixed: "(skip tall+sink)" },
    { label: "B upper", r: rBw, fixed: "—" },
  ];

  console.log("\n  " + "Wall".padEnd(14) + "Fixed".padEnd(18) + "Flex modules".padEnd(20) + "Gap".padStart(6) + "  Custom  Verdict");
  console.log("  " + "─".repeat(76));
  for (const w of walls) {
    const flexStr = w.r.mods.map(m => {
      const isCustom = !STD.includes(m);
      return isCustom ? "⚡" + m : "" + m;
    }).join("+");
    console.log("  " + w.label.padEnd(14) + w.fixed.padEnd(18) + flexStr.padEnd(20) + (w.r.gap + "mm").padStart(6) + "  " + String(w.r.customCount).padEnd(7) + " " + w.r.cls.verdict);
  }

  const totalGap = walls.reduce((s, w) => s + w.r.gap, 0);
  const totalCustom = walls.reduce((s, w) => s + w.r.customCount, 0);
  const totalFillers = walls.reduce((s, w) => s + w.r.cls.fillers, 0);

  console.log("  " + "─".repeat(76));
  console.log("  Total gap: " + totalGap + "mm  |  Fillers: " + totalFillers + "  |  Custom widths: " + totalCustom);

  // Visualization
  console.log("\n" + "─".repeat(70));
  console.log("  LAYOUT");
  console.log("─".repeat(70));

  function draw(label, parts) {
    console.log("\n  " + label + ":");
    const tags = parts.map(p => {
      const custom = p.custom ? "⚡" : "";
      return custom + p.label + " " + p.w;
    });
    console.log("  ┌" + tags.map(t => "─".repeat(t.length + 2)).join("┬") + "┐");
    console.log("  │" + tags.map(t => " " + t + " ").join("│") + "│");
    console.log("  └" + tags.map(t => "─".repeat(t.length + 2)).join("┴") + "┘");
  }

  const pA = [{ label: "PANTRY", w: 600 }, { label: "SINK", w: 800 }];
  for (const w of rA.mods) pA.push({ label: "BASE", w, custom: !STD.includes(w) });
  if (rA.gap > 0) pA.push({ label: "filler", w: rA.gap });
  pA.push({ label: "CORNER", w: 900 });
  draw("Wall A base (" + WALL_A + "mm)", pA);

  const pB = [{ label: "CORNER", w: 900 }, { label: "DRAWER", w: 600 }];
  for (const w of rB.mods) pB.push({ label: "BASE", w, custom: !STD.includes(w) });
  if (rB.gap > 0) pB.push({ label: "filler", w: rB.gap });
  draw("Wall B base (" + WALL_B + "mm)", pB);

  const pAw = [];
  for (const w of rAw.mods) pAw.push({ label: "WALL", w, custom: !STD.includes(w) });
  if (rAw.gap > 0) pAw.push({ label: "filler", w: rAw.gap });
  draw("Wall A upper (700mm usable)", pAw);

  const pBw = [];
  for (const w of rBw.mods) pBw.push({ label: "WALL", w, custom: !STD.includes(w) });
  if (rBw.gap > 0) pBw.push({ label: "filler", w: rBw.gap });
  draw("Wall B upper (" + usableB + "mm usable)", pBw);

  if (totalCustom > 0) console.log("\n  ⚡ = custom width (only used because filler > 150mm)");
  else console.log("\n  ✅ All modules are standard widths — industrial-friendly");

  console.log("\n" + "═".repeat(70) + "\n");
}

run().catch(e => { console.error(e); process.exit(1); });
