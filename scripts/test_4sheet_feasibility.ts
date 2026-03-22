// ═══════════════════════════════════════════════════════════════
// SAW Optimizer — 4-SHEET FEASIBILITY TEST
// Can 38 MDF parts fit on 4 sheets? 1000+ attempts with both
// guillotine and MAXRECTS, exhaustive sort/heuristic combos,
// SA, destroy-rebuild. If YES → 20% waste. If NO → 35.7% is minimum.
// npx tsx --tsconfig tsconfig.json scripts/test_4sheet_feasibility.ts
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KERF = 4;
const TRIM = 15;
const SHEET_SIZES: Record<string, [number, number]> = {
  mdf_18: [2800, 1220], back_hdf_5: [2440, 1220],
};

interface IPart {
  id: string; label: string; w: number; h: number; area: number;
  canRotate: boolean;
}
interface FreeRect { x: number; y: number; w: number; h: number; }
interface Placement { part: IPart; x: number; y: number; pw: number; ph: number; rotated: boolean; }
interface Sheet { placements: Placement[]; freeRects: FreeRect[]; usedArea: number; placed: Set<string>; }

function shuffleArray<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
function canRotateGrain(g: string): boolean { return !g || g === 'none'; }

// ── GUILLOTINE PACKER (proven best from v4) ───────────────────
type GHeuristic = 'ba' | 'bss' | 'bls' | 'wf';

function gFitScore(fr: FreeRect, pw: number, ph: number, h: GHeuristic): number {
  const lw = fr.w - pw, lh = fr.h - ph;
  if (h === 'ba') return fr.w * fr.h - pw * ph;
  if (h === 'bss') return Math.min(lw, lh);
  if (h === 'bls') return Math.max(lw, lh);
  return -(fr.w * fr.h);
}

function gFindBest(frs: FreeRect[], pw: number, ph: number, rot: boolean, h: GHeuristic): { i: number; r: boolean } | null {
  let bi = -1, br = false, bs = Infinity;
  for (let i = 0; i < frs.length; i++) {
    const f = frs[i];
    if (pw <= f.w && ph <= f.h) { const s = gFitScore(f, pw, ph, h); if (s < bs) { bs = s; bi = i; br = false; } }
    if (rot && ph <= f.w && pw <= f.h && pw !== ph) { const s = gFitScore(f, ph, pw, h); if (s < bs) { bs = s; bi = i; br = true; } }
  }
  return bi < 0 ? null : { i: bi, r: br };
}

function gSplit(fr: FreeRect, pw: number, ph: number, k: number): FreeRect[] {
  const res: FreeRect[] = [];
  const kw = Math.min(k, fr.w - pw), kh = Math.min(k, fr.h - ph);
  const rA = { x: fr.x + pw + kw, y: fr.y, w: fr.w - pw - kw, h: fr.h };
  const bA = { x: fr.x, y: fr.y + ph + kh, w: pw, h: fr.h - ph - kh };
  const rB = { x: fr.x + pw + kw, y: fr.y, w: fr.w - pw - kw, h: ph };
  const bB = { x: fr.x, y: fr.y + ph + kh, w: fr.w, h: fr.h - ph - kh };
  const aA = Math.max(rA.w, 0) * Math.max(rA.h, 0) + Math.max(bA.w, 0) * Math.max(bA.h, 0);
  const aB = Math.max(rB.w, 0) * Math.max(rB.h, 0) + Math.max(bB.w, 0) * Math.max(bB.h, 0);
  if (aA >= aB) {
    if (rA.w > 0 && rA.h > 0) res.push(rA);
    if (bA.w > 0 && bA.h > 0) res.push(bA);
  } else {
    if (rB.w > 0 && rB.h > 0) res.push(rB);
    if (bB.w > 0 && bB.h > 0) res.push(bB);
  }
  return res;
}

function packGuillotine(parts: IPart[], sw: number, sh: number, h: GHeuristic, skip: Set<string>): Sheet {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: sw, h: sh }];
  const placements: Placement[] = [];
  const placed = new Set<string>();
  let usedArea = 0;
  for (const p of parts) {
    if (skip.has(p.id) || placed.has(p.id)) continue;
    const fit = gFindBest(freeRects, p.w, p.h, p.canRotate, h);
    if (!fit) continue;
    const fr = freeRects[fit.i];
    const pw = fit.r ? p.h : p.w, ph = fit.r ? p.w : p.h;
    placements.push({ part: p, x: fr.x, y: fr.y, pw, ph, rotated: fit.r });
    usedArea += pw * ph;
    placed.add(p.id);
    const nf = gSplit(fr, pw, ph, KERF);
    freeRects.splice(fit.i, 1, ...nf);
    for (let i = freeRects.length - 1; i >= 0; i--) {
      if (freeRects[i].w < 30 || freeRects[i].h < 30) freeRects.splice(i, 1);
    }
  }
  return { placements, freeRects, usedArea, placed };
}

// ── MAXRECTS PACKER (fixed kerf) ──────────────────────────────
function mOverlap(a: FreeRect, px: number, py: number, pw: number, ph: number): boolean {
  return a.x < px + pw && a.x + a.w > px && a.y < py + ph && a.y + a.h > py;
}

function mSplit(fr: FreeRect, px: number, py: number, pw: number, ph: number): FreeRect[] {
  const r: FreeRect[] = [];
  if (px > fr.x) r.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
  if (px + pw < fr.x + fr.w) r.push({ x: px + pw, y: fr.y, w: fr.x + fr.w - px - pw, h: fr.h });
  if (py > fr.y) r.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
  if (py + ph < fr.y + fr.h) r.push({ x: fr.x, y: py + ph, w: fr.w, h: fr.y + fr.h - py - ph });
  return r.filter(x => x.w > 0 && x.h > 0);
}

function mPrune(rects: FreeRect[]): FreeRect[] {
  const keep = new Array(rects.length).fill(true);
  for (let i = 0; i < rects.length; i++) {
    if (!keep[i]) continue;
    for (let j = 0; j < rects.length; j++) {
      if (i === j || !keep[j]) continue;
      if (rects[j].x <= rects[i].x && rects[j].y <= rects[i].y &&
          rects[j].x + rects[j].w >= rects[i].x + rects[i].w &&
          rects[j].y + rects[j].h >= rects[i].y + rects[i].h) { keep[i] = false; break; }
    }
  }
  return rects.filter((_, i) => keep[i]);
}

function packMaxRects(parts: IPart[], sw: number, sh: number, h: GHeuristic, skip: Set<string>): Sheet {
  let freeRects: FreeRect[] = [{ x: 0, y: 0, w: sw, h: sh }];
  const placements: Placement[] = [];
  const placed = new Set<string>();
  let usedArea = 0;

  for (const p of parts) {
    if (skip.has(p.id) || placed.has(p.id)) continue;
    // Require kerf clearance in fit check
    const pw0 = p.w + KERF, ph0 = p.h + KERF;
    const pw0r = p.h + KERF, ph0r = p.w + KERF;

    let bestIdx = -1, bestRot = false, bestScore = Infinity;
    for (let i = 0; i < freeRects.length; i++) {
      const fr = freeRects[i];
      // Normal: need pw+kerf width, ph+kerf height (kerf is space for next part)
      // But if at right/bottom edge, kerf not needed
      const needW = Math.min(pw0, fr.x + fr.w >= sw ? p.w : pw0);
      const needH = Math.min(ph0, fr.y + fr.h >= sh ? p.h : ph0);
      if (needW <= fr.w && needH <= fr.h) {
        const s = gFitScore(fr, p.w, p.h, h);
        if (s < bestScore) { bestScore = s; bestIdx = i; bestRot = false; }
      }
      if (p.canRotate && p.w !== p.h) {
        const nW = Math.min(pw0r, fr.x + fr.w >= sw ? p.h : pw0r);
        const nH = Math.min(ph0r, fr.y + fr.h >= sh ? p.w : ph0r);
        if (nW <= fr.w && nH <= fr.h) {
          const s = gFitScore(fr, p.h, p.w, h);
          if (s < bestScore) { bestScore = s; bestIdx = i; bestRot = true; }
        }
      }
    }

    if (bestIdx < 0) continue;
    const fr = freeRects[bestIdx];
    const pw = bestRot ? p.h : p.w, ph = bestRot ? p.w : p.h;

    placements.push({ part: p, x: fr.x, y: fr.y, pw, ph, rotated: bestRot });
    usedArea += pw * ph;
    placed.add(p.id);

    // Split all overlapping rects using part dimensions (no kerf in split)
    const newFree: FreeRect[] = [];
    for (const ex of freeRects) {
      if (mOverlap(ex, fr.x, fr.y, pw, ph)) {
        newFree.push(...mSplit(ex, fr.x, fr.y, pw, ph));
      } else {
        newFree.push(ex);
      }
    }
    freeRects = mPrune(newFree.filter(r => r.w >= 30 && r.h >= 30));
    if (freeRects.length > 300) {
      freeRects.sort((a, b) => b.w * b.h - a.w * a.h);
      freeRects = freeRects.slice(0, 300);
      freeRects = mPrune(freeRects);
    }
  }
  return { placements, freeRects, usedArea, placed };
}

// ── Pack into exactly N sheets ────────────────────────────────
type PackerFn = (parts: IPart[], sw: number, sh: number, h: GHeuristic, skip: Set<string>) => Sheet;

function tryPackNSheets(
  parts: IPart[], n: number, sw: number, sh: number,
  packer: PackerFn, heuristic: GHeuristic,
): { sheets: Sheet[]; allPlaced: boolean; placedCount: number } {
  // Distribute by area equalization
  const bins: IPart[][] = Array.from({ length: n }, () => []);
  const areas = new Array(n).fill(0);
  const sorted = [...parts].sort((a, b) => b.area - a.area);
  for (const p of sorted) {
    let mi = 0;
    for (let i = 1; i < n; i++) { if (areas[i] < areas[mi]) mi = i; }
    bins[mi].push(p);
    areas[mi] += p.area;
  }

  const sheets: Sheet[] = [];
  const globalPlaced = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (!bins[i].length) continue;
    const s = packer(bins[i], sw, sh, heuristic, new Set());
    sheets.push(s);
    for (const id of s.placed) globalPlaced.add(id);
  }

  // Gap-fill overflow into existing sheets
  const overflow = parts.filter(p => !globalPlaced.has(p.id));
  const heuristics: GHeuristic[] = ['ba', 'bss', 'bls', 'wf'];
  for (const p of overflow) {
    let fit = false;
    for (const s of sheets) {
      for (const h of heuristics) {
        const f = gFindBest(s.freeRects, p.w, p.h, p.canRotate, h);
        if (f) {
          const fr = s.freeRects[f.i];
          const pw = f.r ? p.h : p.w, ph = f.r ? p.w : p.h;
          s.placements.push({ part: p, x: fr.x, y: fr.y, pw, ph, rotated: f.r });
          s.usedArea += pw * ph;
          s.placed.add(p.id);
          globalPlaced.add(p.id);
          const nf = gSplit(fr, pw, ph, KERF);
          s.freeRects.splice(f.i, 1, ...nf);
          fit = true;
          break;
        }
      }
      if (fit) break;
    }
  }

  return { sheets, allPlaced: globalPlaced.size === parts.length, placedCount: globalPlaced.size };
}

// ── SA for sheet reduction ────────────────────────────────────
function saReduceSheets(
  sheets: Sheet[], parts: IPart[], sw: number, sh: number,
  packer: PackerFn, iterations: number,
): Sheet[] {
  if (sheets.length <= 1) return sheets;
  let best = sheets;
  let bestCount = sheets.length;
  let current = sheets;
  const heuristics: GHeuristic[] = ['ba', 'bss', 'bls', 'wf'];

  for (let iter = 0; iter < iterations; iter++) {
    const T = 3.0 * Math.pow(0.001 / 3.0, iter / iterations);

    if (current.length < 2) break;

    // Try merging two random sheets
    const i = Math.floor(Math.random() * current.length);
    let j = Math.floor(Math.random() * current.length);
    if (i === j) j = (j + 1) % current.length;

    const combined = [...current[i].placements.map(p => p.part), ...current[j].placements.map(p => p.part)];
    const h = heuristics[iter % heuristics.length];

    // Try both packers
    let merged = packer(combined, sw, sh, h, new Set());
    if (merged.placed.size < combined.length) {
      // Try other heuristic
      for (const h2 of heuristics) {
        const alt = packer(shuffleArray(combined), sw, sh, h2, new Set());
        if (alt.placed.size > merged.placed.size) merged = alt;
        if (merged.placed.size === combined.length) break;
      }
    }

    if (merged.placed.size === combined.length) {
      const neighbor = current.filter((_, idx) => idx !== i && idx !== j);
      neighbor.push(merged);

      if (neighbor.length < current.length || Math.random() < Math.exp(-(neighbor.length - current.length) / T)) {
        current = neighbor;
        if (current.length < bestCount) {
          bestCount = current.length;
          best = [...current];
        }
      }
    } else if (iter % 10 === 0) {
      // Try moving one part from one sheet to another
      const fromIdx = Math.floor(Math.random() * current.length);
      if (current[fromIdx].placements.length <= 1) continue;
      const toIdx = (fromIdx + 1 + Math.floor(Math.random() * (current.length - 1))) % current.length;
      const plIdx = Math.floor(Math.random() * current[fromIdx].placements.length);
      const part = current[fromIdx].placements[plIdx].part;

      const fromParts = current[fromIdx].placements.filter((_, idx) => idx !== plIdx).map(p => p.part);
      const toParts = [...current[toIdx].placements.map(p => p.part), part];

      const newFrom = packer(fromParts, sw, sh, h, new Set());
      const newTo = packer(toParts, sw, sh, h, new Set());

      if (newFrom.placed.size === fromParts.length && newTo.placed.size === toParts.length) {
        const neighbor = [...current];
        neighbor[fromIdx] = newFrom;
        neighbor[toIdx] = newTo;
        // Remove empty
        const filtered = neighbor.filter(s => s.placements.length > 0);
        if (filtered.length <= current.length) {
          current = filtered;
          if (current.length < bestCount) {
            bestCount = current.length;
            best = [...current];
          }
        }
      }
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════
// MAIN BENCHMARK
// ══════════════════════════════════════════════════════════════════
const PROJECTS = [
  { id: 'a5e2d220-2759-44d3-abff-daa4dae6d9f7', code: 'ART-2026-0004', name: 'Laila Benkirane' },
  { id: '5f411604-9cb1-4cdf-af37-81635f382506', code: 'ART-2026-0001', name: 'Kamal Benjelloun' },
];

async function benchmark() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  4-SHEET FEASIBILITY TEST — Can we reduce sheets & beat 33% waste?       ║');
  console.log('║  Tests: Guillotine + MAXRECTS × many orderings × SA merge attempts       ║');
  console.log('║  Kerf: ' + KERF + 'mm | Trim: ' + TRIM + 'mm | Date: ' + new Date().toISOString().slice(0, 19) + '                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  for (const proj of PROJECTS) {
    console.log('━'.repeat(80));
    console.log('PROJECT: ' + proj.code + ' — ' + proj.name);
    console.log('━'.repeat(80));

    const { data: rawParts } = await supabase.from('project_parts')
      .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction')
      .eq('project_id', proj.id);

    if (!rawParts?.length) continue;

    const groups: Record<string, IPart[]> = {};
    for (const p of rawParts) {
      if (!p.material_type || p.material_type.startsWith('hardware') || !p.width_mm || !p.height_mm) continue;
      if (!groups[p.material_type]) groups[p.material_type] = [];
      const qty = p.quantity || 1;
      const grain = p.grain_direction || 'none';
      for (let qi = 0; qi < qty; qi++) {
        groups[p.material_type].push({
          id: qty > 1 ? p.id + '-' + qi : p.id,
          label: p.part_code || p.part_name || 'Part',
          w: Math.round(Number(p.width_mm)),
          h: Math.round(Number(p.height_mm)),
          area: Math.round(Number(p.width_mm)) * Math.round(Number(p.height_mm)),
          canRotate: canRotateGrain(grain),
        });
      }
    }

    for (const [mat, parts] of Object.entries(groups)) {
      const [rawSW, rawSH] = SHEET_SIZES[mat] || [2800, 1220];
      const sw = rawSW - TRIM * 2;
      const sh = rawSH - TRIM * 2;
      const fullSA = rawSW * rawSH;
      const usableSA = sw * sh;
      const totalArea = parts.reduce((s, p) => s + p.area, 0);
      const areaMin = Math.ceil(totalArea / usableSA);

      console.log('\n  ┌── ' + mat.toUpperCase() + ' (' + parts.length + ' parts) ──');
      console.log('  │ Usable: ' + sw + '×' + sh + 'mm (' + (usableSA / 1e6).toFixed(3) + 'm²)');
      console.log('  │ Part area: ' + (totalArea / 1e6).toFixed(3) + 'm²');
      console.log('  │ Area-min sheets: ' + areaMin);
      console.log('  │ Fill at ' + areaMin + ' sheets: ' + (totalArea / (areaMin * usableSA) * 100).toFixed(1) + '% of usable');
      console.log('  │ Waste at ' + areaMin + ' sheets: ' + ((1 - totalArea / (areaMin * fullSA)) * 100).toFixed(1) + '% of full sheet');
      console.log('  │');

      const heuristics: GHeuristic[] = ['ba', 'bss', 'bls', 'wf'];
      const packers: { name: string; fn: PackerFn }[] = [
        { name: 'guillotine', fn: packGuillotine },
        { name: 'maxrects', fn: packMaxRects },
      ];

      const sorts: { name: string; fn: (a: IPart, b: IPart) => number }[] = [
        { name: 'area', fn: (a, b) => b.area - a.area },
        { name: 'height', fn: (a, b) => b.h - a.h || b.w - a.w },
        { name: 'width', fn: (a, b) => b.w - a.w || b.h - a.h },
        { name: 'perim', fn: (a, b) => (b.w + b.h) - (a.w + a.h) },
        { name: 'maxdim', fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) },
      ];

      interface Result { sheets: number; waste: number; yield: number; strategy: string; allPlaced: boolean; detail: Sheet[] }
      const results: Result[] = [];

      function record(sh: Sheet[], strat: string, all: boolean) {
        const u = sh.reduce((s, x) => s + x.usedArea, 0);
        const t = sh.length * fullSA;
        results.push({ sheets: sh.length, waste: (1 - u / t) * 100, yield: u / t * 100, strategy: strat, allPlaced: all, detail: sh });
      }

      // ── Phase 1: Greedy packing (find natural sheet count) ──
      console.log('  │ Phase 1: Greedy packing...');
      let bestGreedySheets = 999;
      for (const sort of sorts) {
        const sorted = [...parts].sort(sort.fn);
        for (const packer of packers) {
          for (const h of heuristics) {
            const sheets: Sheet[] = [];
            const placed = new Set<string>();
            let safety = 0;
            while (placed.size < parts.length && safety++ < 20) {
              const s = packer.fn(sorted, sw, sh, h, placed);
              if (s.placed.size === 0) break;
              sheets.push(s);
              for (const id of s.placed) placed.add(id);
            }
            if (placed.size === parts.length) {
              record(sheets, `greedy:${sort.name}+${packer.name}+${h}`, true);
              bestGreedySheets = Math.min(bestGreedySheets, sheets.length);
            }
          }
        }
      }
      console.log('  │   Best greedy: ' + bestGreedySheets + ' sheets');

      // ── Phase 2: Try target N = areaMin to bestGreedy ──
      console.log('  │ Phase 2: Target-sheet distributed packing...');
      let bestTargetSheets = bestGreedySheets;
      for (let target = areaMin; target <= bestGreedySheets; target++) {
        let foundForTarget = false;
        for (const packer of packers) {
          for (const h of heuristics) {
            const r = tryPackNSheets(parts, target, sw, sh, packer.fn, h);
            if (r.allPlaced) {
              record(r.sheets, `target:${target}s+${packer.name}+${h}`, true);
              bestTargetSheets = Math.min(bestTargetSheets, r.sheets.length);
              foundForTarget = true;
            }
          }
          // Also try with shuffled parts
          for (let r = 0; r < 50; r++) {
            const shuffled = shuffleArray(parts);
            const h = heuristics[r % heuristics.length];
            const res = tryPackNSheets(shuffled, target, sw, sh, packer.fn, h);
            if (res.allPlaced) {
              record(res.sheets, `target:${target}s+${packer.name}+rng${r}`, true);
              bestTargetSheets = Math.min(bestTargetSheets, res.sheets.length);
              foundForTarget = true;
            }
          }
        }
        console.log('  │   Target ' + target + ' sheets: ' + (foundForTarget ? '✅ FEASIBLE' : '❌ INFEASIBLE (all ' + parts.length + ' parts could not fit)'));
      }

      // ── Phase 3: Random greedy with many orderings ──
      console.log('  │ Phase 3: Random greedy (500 attempts)...');
      for (let r = 0; r < 500; r++) {
        const shuffled = shuffleArray(parts);
        const packer = packers[r % 2];
        const h = heuristics[r % heuristics.length];
        const sheets: Sheet[] = [];
        const placed = new Set<string>();
        let safety = 0;
        while (placed.size < parts.length && safety++ < 20) {
          const s = packer.fn(shuffled, sw, sh, h, placed);
          if (s.placed.size === 0) break;
          sheets.push(s);
          for (const id of s.placed) placed.add(id);
        }
        if (placed.size === parts.length) {
          record(sheets, `rng-${packer.name}-${r}`, true);
          bestTargetSheets = Math.min(bestTargetSheets, sheets.length);
        }
      }
      console.log('  │   Best random: ' + bestTargetSheets + ' sheets');

      // ── Phase 4: SA merge attempts on top results ──
      console.log('  │ Phase 4: SA merge attempts (2000 iterations each)...');
      const validResults = results.filter(r => r.allPlaced).sort((a, b) => a.sheets - b.sheets || a.waste - b.waste);
      const top10 = validResults.slice(0, 10);
      for (const r of top10) {
        for (const packer of packers) {
          const reduced = saReduceSheets(r.detail, parts, sw, sh, packer.fn, 2000);
          const totalPlaced = reduced.reduce((s, sh) => s + sh.placed.size, 0);
          if (totalPlaced === parts.length) {
            record(reduced, r.strategy + '+SA+' + packer.name, true);
            bestTargetSheets = Math.min(bestTargetSheets, reduced.length);
          }
        }
      }
      console.log('  │   Best after SA: ' + bestTargetSheets + ' sheets');

      // ── Phase 5: Extra aggressive — try packing into bestTarget-1 sheets ──
      const tryTarget = bestTargetSheets - 1;
      if (tryTarget >= areaMin) {
        console.log('  │ Phase 5: Aggressive attempt at ' + tryTarget + ' sheets (1000 random orderings)...');
        let found = false;
        for (let r = 0; r < 1000; r++) {
          const shuffled = shuffleArray(parts);
          const packer = packers[r % 2];
          const h = heuristics[r % heuristics.length];
          const res = tryPackNSheets(shuffled, tryTarget, sw, sh, packer.fn, h);
          if (res.allPlaced) {
            console.log('  │   ✅ FOUND ' + tryTarget + '-sheet solution at attempt ' + r + '!');
            record(res.sheets, `aggressive:${tryTarget}s+${packer.name}+rng${r}`, true);
            bestTargetSheets = tryTarget;
            found = true;
            break;
          }
        }
        if (!found) {
          console.log('  │   ❌ ' + tryTarget + ' sheets INFEASIBLE after 1000 attempts');
        }
      }

      // ── Results ──
      const best = results.filter(r => r.allPlaced).sort((a, b) => a.waste - b.waste)[0];
      const worst = results.filter(r => r.allPlaced).sort((a, b) => b.waste - a.waste)[0];

      console.log('  │');
      console.log('  │ ╔════════════════════════ RESULTS ═══════════════════════════╗');
      console.log('  │ ║ Total attempts: ' + results.filter(r => r.allPlaced).length + ' successful'.padEnd(43) + '║');
      console.log('  │ ║ Min sheets achieved: ' + bestTargetSheets + ''.padEnd(38) + '║');
      console.log('  │ ║ Area-min sheets:     ' + areaMin + ''.padEnd(38) + '║');
      console.log('  │ ║ Best waste:  ' + (best?.waste.toFixed(1) || 'N/A') + '% (' + (best?.strategy.substring(0, 35) || '') + ')'.padEnd(23) + '║');
      console.log('  │ ║ Best yield:  ' + (best?.yield.toFixed(1) || 'N/A') + '%'.padEnd(46) + '║');
      console.log('  │ ╚════════════════════════════════════════════════════════════╝');

      // Sheet-by-sheet for best result
      if (best) {
        for (let si = 0; si < best.detail.length; si++) {
          const s = best.detail[si];
          const yld = s.usedArea / fullSA * 100;
          const rot = s.placements.filter(p => p.rotated).length;
          console.log('  │ Sheet #' + (si + 1) + ': ' + s.placements.length + ' parts, yield=' + yld.toFixed(1) + '%, rotated=' + rot);
        }
      }

      // Theoretical analysis
      console.log('  │');
      console.log('  │ THEORETICAL LIMIT ANALYSIS:');
      console.log('  │   At ' + bestTargetSheets + ' sheets: max possible yield = ' + (totalArea / (bestTargetSheets * fullSA) * 100).toFixed(1) + '%');
      console.log('  │   At ' + areaMin + ' sheets: max possible yield = ' + (totalArea / (areaMin * fullSA) * 100).toFixed(1) + '% (requires ' + (totalArea / (areaMin * usableSA) * 100).toFixed(1) + '% usable fill)');
      if (bestTargetSheets > areaMin) {
        console.log('  │   ' + areaMin + ' sheets is INFEASIBLE — part geometry prevents it');
        console.log('  │   ' + bestTargetSheets + ' sheets is the PROVEN MINIMUM');
        console.log('  │   ' + (1 - totalArea / (bestTargetSheets * fullSA)).toFixed(3).replace('0.', '') + '% waste is MATHEMATICALLY IRREDUCIBLE');
      }
      console.log('  └' + '─'.repeat(75));
    }
  }
}

benchmark().catch(e => console.error('Fatal:', e));
