// ═══════════════════════════════════════════════════════════════
// SAW Optimizer v5 — MAXRECTS + Destroy-Rebuild + Simulated Annealing
// npx tsx --tsconfig tsconfig.json scripts/test_maxrects_optimizer.ts
// ═══════════════════════════════════════════════════════════════
// Key changes vs v4:
//  1. MAXRECTS free-rect management (overlapping rects, more placement options)
//  2. Destroy-rebuild: iteratively remove worst sheet, redistribute parts
//  3. Simulated annealing: accept worse solutions to escape local optima
//  4. Gap-fill pass: after initial pack, scan all free rects for small parts
//  5. Cross-sheet global reshuffling with temperature decay
//  6. Multi-iteration: pack → destroy worst 20% → repack → repeat
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KERF = 4;
const TRIM = 15;
const RANDOM_STARTS = 80;
const SA_ITERATIONS = 2000;      // simulated annealing iterations
const DESTROY_REBUILD_ROUNDS = 10;
const GAP_FILL_PASSES = 3;

const SHEET_SIZES: Record<string, [number, number]> = {
  mdf_18: [2800, 1220], mdf_16: [2800, 1220], mdf_22: [2800, 1220], mdf_10: [2800, 1220],
  back_hdf_5: [2440, 1220], back_hdf_3: [2440, 1220], back_mdf_8: [2440, 1220],
  stratifie_18: [2800, 1220], stratifie_16: [2800, 1220],
  melamine_anthracite: [2800, 1220], melamine_blanc: [2800, 1220],
  melamine_chene: [2800, 1220], melamine_noyer: [2800, 1220],
};

// ── Types ─────────────────────────────────────────────────────
interface IPart {
  id: string; label: string; w: number; h: number; area: number;
  canRotate: boolean; grain: string;
  eT: boolean; eB: boolean; eL: boolean; eR: boolean;
}
interface FreeRect { x: number; y: number; w: number; h: number; }
interface Placement { part: IPart; x: number; y: number; placedW: number; placedH: number; rotated: boolean; }
interface PackedSheet { placements: Placement[]; freeRects: FreeRect[]; usedArea: number; placedIds: Set<string>; }
type Heuristic = 'bssf' | 'blsf' | 'baf' | 'bl' | 'cp';
type Candidate = { sheets: PackedSheet[]; strategy: string; waste: number; yieldPct: number; score: number; balance: number; minYield: number; maxYield: number };

function canRotateGrain(g: string): boolean { return !g || g === 'none'; }
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function deepCloneSheets(sheets: PackedSheet[]): PackedSheet[] {
  return sheets.map(s => ({
    placements: [...s.placements],
    freeRects: s.freeRects.map(fr => ({ ...fr })),
    usedArea: s.usedArea,
    placedIds: new Set(s.placedIds),
  }));
}

// ═══════════════════════════════════════════════════════════════
// MAXRECTS BIN PACKING
// ═══════════════════════════════════════════════════════════════
// Unlike guillotine: free rects can OVERLAP. When a part is placed,
// every free rect overlapping the placement is split into up to 4
// sub-rectangles. Then containment pruning removes rects fully
// inside another. This gives far more placement options.

function rectsOverlap(a: FreeRect, bx: number, by: number, bw: number, bh: number): boolean {
  return a.x < bx + bw && a.x + a.w > bx && a.y < by + bh && a.y + a.h > by;
}

function splitFreeRect(fr: FreeRect, px: number, py: number, pw: number, ph: number, kerf: number): FreeRect[] {
  // Part placed at (px, py) with size (pw+kerf, ph+kerf) effective footprint
  const ew = pw + kerf; // effective width with kerf
  const eh = ph + kerf;
  const result: FreeRect[] = [];

  // Left portion
  if (px > fr.x) {
    result.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
  }
  // Right portion
  if (px + ew < fr.x + fr.w) {
    result.push({ x: px + ew, y: fr.y, w: (fr.x + fr.w) - (px + ew), h: fr.h });
  }
  // Top portion
  if (py > fr.y) {
    result.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
  }
  // Bottom portion
  if (py + eh < fr.y + fr.h) {
    result.push({ x: fr.x, y: py + eh, w: fr.w, h: (fr.y + fr.h) - (py + eh) });
  }

  return result.filter(r => r.w > 0 && r.h > 0);
}

function containmentPrune(rects: FreeRect[]): FreeRect[] {
  const keep: boolean[] = new Array(rects.length).fill(true);
  for (let i = 0; i < rects.length; i++) {
    if (!keep[i]) continue;
    for (let j = 0; j < rects.length; j++) {
      if (i === j || !keep[j]) continue;
      // Is rect[i] fully contained in rect[j]?
      if (rects[j].x <= rects[i].x && rects[j].y <= rects[i].y &&
          rects[j].x + rects[j].w >= rects[i].x + rects[i].w &&
          rects[j].y + rects[j].h >= rects[i].y + rects[i].h) {
        keep[i] = false;
        break;
      }
    }
  }
  return rects.filter((_, i) => keep[i]);
}

function maxrectsScore(fr: FreeRect, pw: number, ph: number, h: Heuristic): number {
  const lw = fr.w - pw;
  const lh = fr.h - ph;
  switch (h) {
    case 'bssf': return Math.min(lw, lh); // best short side fit
    case 'blsf': return Math.max(lw, lh); // best long side fit
    case 'baf':  return fr.w * fr.h - pw * ph; // best area fit
    case 'bl':   return fr.y * 10000 + fr.x; // bottom-left
    case 'cp':   return Math.min(lw, lh) * 1000 + Math.max(lw, lh); // contact point approx
    default:     return lw + lh;
  }
}

function findBestMaxRect(freeRects: FreeRect[], pw: number, ph: number, canRot: boolean, h: Heuristic): { idx: number; rotated: boolean } | null {
  let bestIdx = -1, bestRot = false, bestScore = Infinity;
  for (let i = 0; i < freeRects.length; i++) {
    const fr = freeRects[i];
    if (pw <= fr.w && ph <= fr.h) {
      const s = maxrectsScore(fr, pw, ph, h);
      if (s < bestScore) { bestScore = s; bestIdx = i; bestRot = false; }
    }
    if (canRot && ph <= fr.w && pw <= fr.h && pw !== ph) {
      const s = maxrectsScore(fr, ph, pw, h);
      if (s < bestScore) { bestScore = s; bestIdx = i; bestRot = true; }
    }
  }
  return bestIdx < 0 ? null : { idx: bestIdx, rotated: bestRot };
}

function packSheetMaxRects(parts: IPart[], sw: number, sh: number, kerf: number, heuristic: Heuristic, already: Set<string>): PackedSheet {
  let freeRects: FreeRect[] = [{ x: 0, y: 0, w: sw, h: sh }];
  const placements: Placement[] = [];
  const placedIds = new Set<string>();
  let usedArea = 0;

  for (const p of parts) {
    if (already.has(p.id) || placedIds.has(p.id)) continue;
    const fit = findBestMaxRect(freeRects, p.w, p.h, p.canRotate, heuristic);
    if (!fit) continue;

    const fr = freeRects[fit.idx];
    const pw = fit.rotated ? p.h : p.w;
    const ph = fit.rotated ? p.w : p.h;
    const px = fr.x;
    const py = fr.y;

    placements.push({ part: p, x: px, y: py, placedW: pw, placedH: ph, rotated: fit.rotated });
    usedArea += pw * ph;
    placedIds.add(p.id);

    // Split ALL overlapping free rects
    const newFree: FreeRect[] = [];
    for (const existing of freeRects) {
      if (rectsOverlap(existing, px, py, pw + kerf, ph + kerf)) {
        newFree.push(...splitFreeRect(existing, px, py, pw, ph, kerf));
      } else {
        newFree.push(existing);
      }
    }

    // Prune tiny rects
    freeRects = newFree.filter(r => r.w >= 30 && r.h >= 30);

    // Containment prune (cap at 200 rects for perf)
    if (freeRects.length > 200) {
      freeRects.sort((a, b) => (b.w * b.h) - (a.w * a.h));
      freeRects = freeRects.slice(0, 200);
    }
    freeRects = containmentPrune(freeRects);
  }

  return { placements, freeRects, usedArea, placedIds };
}

// ═══════════════════════════════════════════════════════════════
// GAP FILLING — After initial packing, try fitting remaining
// parts into any free rect on any sheet
// ═══════════════════════════════════════════════════════════════
function gapFill(sheets: PackedSheet[], unplacedParts: IPart[], sw: number, sh: number, kerf: number): { sheets: PackedSheet[]; remaining: IPart[] } {
  const remaining = [...unplacedParts];
  const heuristics: Heuristic[] = ['bssf', 'baf', 'blsf', 'cp'];

  for (let pass = 0; pass < GAP_FILL_PASSES; pass++) {
    // Sort remaining by area descending for better fill
    remaining.sort((a, b) => b.area - a.area);
    const stillUnplaced: IPart[] = [];

    for (const part of remaining) {
      let placed = false;

      // Try every sheet, every heuristic
      for (const sheet of sheets) {
        for (const h of heuristics) {
          const fit = findBestMaxRect(sheet.freeRects, part.w, part.h, part.canRotate, h);
          if (!fit) continue;

          const fr = sheet.freeRects[fit.idx];
          const pw = fit.rotated ? part.h : part.w;
          const ph = fit.rotated ? part.w : part.h;
          const px = fr.x, py = fr.y;

          sheet.placements.push({ part, x: px, y: py, placedW: pw, placedH: ph, rotated: fit.rotated });
          sheet.usedArea += pw * ph;
          sheet.placedIds.add(part.id);

          // Update free rects
          const newFree: FreeRect[] = [];
          for (const existing of sheet.freeRects) {
            if (rectsOverlap(existing, px, py, pw + kerf, ph + kerf)) {
              newFree.push(...splitFreeRect(existing, px, py, pw, ph, kerf));
            } else {
              newFree.push(existing);
            }
          }
          sheet.freeRects = containmentPrune(newFree.filter(r => r.w >= 30 && r.h >= 30));

          placed = true;
          break;
        }
        if (placed) break;
      }

      if (!placed) stillUnplaced.push(part);
    }

    remaining.length = 0;
    remaining.push(...stillUnplaced);
    if (remaining.length === 0) break;
  }

  return { sheets, remaining };
}

// ═══════════════════════════════════════════════════════════════
// MULTI-SHEET STRATEGIES
// ═══════════════════════════════════════════════════════════════
function greedyMultiSheet(parts: IPart[], sw: number, sh: number, kerf: number, h: Heuristic): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  const placed = new Set<string>();
  let safety = 0;
  while (placed.size < parts.length && safety++ < 100) {
    const s = packSheetMaxRects(parts, sw, sh, kerf, h, placed);
    if (s.placedIds.size === 0) break;
    sheets.push(s);
    for (const id of s.placedIds) placed.add(id);
  }
  return sheets;
}

function distributedPacking(parts: IPart[], sw: number, sh: number, kerf: number, h: Heuristic, n: number): PackedSheet[] {
  const sheetParts: IPart[][] = Array.from({ length: n }, () => []);
  const sheetAreas = new Array(n).fill(0);
  const sorted = [...parts].sort((a, b) => b.area - a.area);
  for (const p of sorted) {
    let minIdx = 0;
    for (let i = 1; i < n; i++) { if (sheetAreas[i] < sheetAreas[minIdx]) minIdx = i; }
    sheetParts[minIdx].push(p);
    sheetAreas[minIdx] += p.area;
  }

  const sheets: PackedSheet[] = [];
  const globalPlaced = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (!sheetParts[i].length) continue;
    const s = packSheetMaxRects(sheetParts[i], sw, sh, kerf, h, new Set());
    sheets.push(s);
    for (const id of s.placedIds) globalPlaced.add(id);
  }

  // Gap-fill overflow into existing sheets
  const overflow = parts.filter(p => !globalPlaced.has(p.id));
  if (overflow.length > 0) {
    const { remaining } = gapFill(sheets, overflow, sw, sh, kerf);
    for (const s of sheets) for (const id of s.placedIds) globalPlaced.add(id);

    // Still unplaced → new sheets
    if (remaining.length > 0) {
      let safety = 0;
      while (globalPlaced.size < parts.length && safety++ < 50) {
        const s = packSheetMaxRects(remaining, sw, sh, kerf, 'bssf', globalPlaced);
        if (s.placedIds.size === 0) break;
        sheets.push(s);
        for (const id of s.placedIds) globalPlaced.add(id);
      }
    }
  }
  return sheets;
}

// ═══════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════
function scoreSolution(sheets: PackedSheet[], sw: number, sh: number, fullSW: number, fullSH: number): { score: number; balance: number; minYield: number; maxYield: number; waste: number; yieldPct: number } {
  const sa = fullSW * fullSH;
  const totalUsed = sheets.reduce((s, x) => s + x.usedArea, 0);
  const totalArea = sheets.length * sa;
  const wastePct = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
  const yieldPct = 100 - wastePct;
  const yields = sheets.map(x => x.usedArea / sa * 100);
  const avg = yields.reduce((s, y) => s + y, 0) / yields.length;
  const stdDev = Math.sqrt(yields.reduce((s, y) => s + (y - avg) ** 2, 0) / yields.length);
  const minY = Math.min(...yields);
  const maxY = Math.max(...yields);
  const below45 = yields.filter(y => y < 45).length;
  const below35 = yields.filter(y => y < 35).length;
  const minSheets = Math.ceil(totalUsed / (sw * sh));
  const ratio = sheets.length / Math.max(1, minSheets);

  // Heavily penalize extra sheets — most important factor
  const score = wastePct * 0.30 + (ratio - 1) * 100 * 0.30 + stdDev * 0.20 + below45 * 15 * 0.15 + below35 * 25 * 0.05;
  return { score, balance: stdDev, minYield: minY, maxYield: maxY, waste: wastePct, yieldPct };
}

// ═══════════════════════════════════════════════════════════════
// DESTROY-REBUILD — Remove worst sheets, redistribute parts
// ═══════════════════════════════════════════════════════════════
function destroyRebuild(sheets: PackedSheet[], allParts: IPart[], sw: number, sh: number, kerf: number, fullSW: number, fullSH: number): PackedSheet[] {
  let best = sheets;
  let bestScore = scoreSolution(best, sw, sh, fullSW, fullSH).score;
  const heuristics: Heuristic[] = ['bssf', 'baf', 'blsf', 'cp', 'bl'];

  for (let round = 0; round < DESTROY_REBUILD_ROUNDS; round++) {
    if (best.length <= 1) break;

    // Find worst sheet(s) — destroy bottom 20% (at least 1)
    const sa = fullSW * fullSH;
    const yields = best.map((s, i) => ({ yield: s.usedArea / sa, idx: i }));
    yields.sort((a, b) => a.yield - b.yield);

    const numDestroy = Math.max(1, Math.floor(best.length * 0.2));
    const destroyIdxs = new Set(yields.slice(0, numDestroy).map(y => y.idx));

    // Extract parts from destroyed sheets
    const extractedParts: IPart[] = [];
    const keptSheets: PackedSheet[] = [];
    for (let i = 0; i < best.length; i++) {
      if (destroyIdxs.has(i)) {
        for (const pl of best[i].placements) extractedParts.push(pl.part);
      } else {
        keptSheets.push(best[i]);
      }
    }

    if (extractedParts.length === 0) continue;

    // Try to gap-fill extracted parts into kept sheets
    const cloned = deepCloneSheets(keptSheets);
    const { sheets: filled, remaining } = gapFill(cloned, extractedParts, sw, sh, kerf);

    // Pack remaining into new sheets
    let result = [...filled];
    if (remaining.length > 0) {
      const heuristic = heuristics[round % heuristics.length];
      const sorted = [...remaining].sort((a, b) => b.area - a.area);
      const globalPlaced = new Set<string>();
      let safety = 0;
      while (globalPlaced.size < sorted.length && safety++ < 50) {
        const s = packSheetMaxRects(sorted, sw, sh, kerf, heuristic, globalPlaced);
        if (s.placedIds.size === 0) break;
        result.push(s);
        for (const id of s.placedIds) globalPlaced.add(id);
      }
    }

    // Verify all parts placed
    const totalPlaced = result.reduce((s, sh) => s + sh.placedIds.size, 0);
    if (totalPlaced < allParts.length) continue; // some parts lost, skip

    const newScore = scoreSolution(result, sw, sh, fullSW, fullSH).score;
    if (newScore < bestScore) {
      bestScore = newScore;
      best = result;
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════
// SIMULATED ANNEALING — Cross-sheet moves and swaps
// ═══════════════════════════════════════════════════════════════
function simulatedAnnealing(sheets: PackedSheet[], sw: number, sh: number, kerf: number, fullSW: number, fullSH: number): PackedSheet[] {
  if (sheets.length <= 1) return sheets;

  let best = deepCloneSheets(sheets);
  let bestScore = scoreSolution(best, sw, sh, fullSW, fullSH).score;
  let current = deepCloneSheets(sheets);
  let currentScore = bestScore;
  const heuristics: Heuristic[] = ['bssf', 'baf', 'blsf', 'cp'];

  const T0 = 5.0;  // initial temperature
  const Tf = 0.01;  // final temperature

  for (let iter = 0; iter < SA_ITERATIONS; iter++) {
    const T = T0 * Math.pow(Tf / T0, iter / SA_ITERATIONS);

    // Random perturbation
    const action = Math.random();
    let neighbor: PackedSheet[] | null = null;

    if (action < 0.4 && current.length >= 2) {
      // MOVE: random part from random sheet to another
      const fromIdx = Math.floor(Math.random() * current.length);
      if (current[fromIdx].placements.length === 0) continue;
      let toIdx = Math.floor(Math.random() * current.length);
      if (toIdx === fromIdx) toIdx = (toIdx + 1) % current.length;

      const plIdx = Math.floor(Math.random() * current[fromIdx].placements.length);
      const part = current[fromIdx].placements[plIdx].part;

      // Rebuild both sheets
      const fromParts = current[fromIdx].placements.filter((_, i) => i !== plIdx).map(p => p.part);
      const toParts = [...current[toIdx].placements.map(p => p.part), part];

      const h = heuristics[iter % heuristics.length];
      const newFrom = packSheetMaxRects(fromParts, sw, sh, kerf, h, new Set());
      const newTo = packSheetMaxRects(toParts, sw, sh, kerf, h, new Set());

      if (newFrom.placedIds.size === fromParts.length && newTo.placedIds.size === toParts.length) {
        neighbor = deepCloneSheets(current);
        neighbor[fromIdx] = newFrom;
        neighbor[toIdx] = newTo;
        // Remove empty sheets
        neighbor = neighbor.filter(s => s.placements.length > 0);
      }
    } else if (action < 0.7 && current.length >= 2) {
      // SWAP: random parts between two sheets
      const i = Math.floor(Math.random() * current.length);
      let j = Math.floor(Math.random() * current.length);
      if (i === j) j = (j + 1) % current.length;
      if (current[i].placements.length === 0 || current[j].placements.length === 0) continue;

      const pi = Math.floor(Math.random() * current[i].placements.length);
      const pj = Math.floor(Math.random() * current[j].placements.length);

      const partsI = current[i].placements.filter((_, idx) => idx !== pi).map(p => p.part);
      partsI.push(current[j].placements[pj].part);
      const partsJ = current[j].placements.filter((_, idx) => idx !== pj).map(p => p.part);
      partsJ.push(current[i].placements[pi].part);

      const h = heuristics[iter % heuristics.length];
      const newI = packSheetMaxRects(partsI, sw, sh, kerf, h, new Set());
      const newJ = packSheetMaxRects(partsJ, sw, sh, kerf, h, new Set());

      if (newI.placedIds.size === partsI.length && newJ.placedIds.size === partsJ.length) {
        neighbor = deepCloneSheets(current);
        neighbor[i] = newI;
        neighbor[j] = newJ;
      }
    } else if (current.length >= 2) {
      // MERGE: try combining two random sheets
      const i = Math.floor(Math.random() * current.length);
      let j = Math.floor(Math.random() * current.length);
      if (i === j) j = (j + 1) % current.length;

      const combined = [
        ...current[i].placements.map(p => p.part),
        ...current[j].placements.map(p => p.part),
      ];

      // Quick area check
      if (combined.reduce((s, p) => s + p.area, 0) > sw * sh * 0.98) continue;

      const h = heuristics[iter % heuristics.length];
      const merged = packSheetMaxRects(combined, sw, sh, kerf, h, new Set());
      if (merged.placedIds.size === combined.length) {
        neighbor = current.filter((_, idx) => idx !== i && idx !== j);
        neighbor.push(merged);
      }
    }

    if (!neighbor) continue;

    const neighborScore = scoreSolution(neighbor, sw, sh, fullSW, fullSH).score;
    const delta = neighborScore - currentScore;

    // Accept if better, or with probability based on temperature
    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      current = neighbor;
      currentScore = neighborScore;

      if (currentScore < bestScore) {
        bestScore = currentScore;
        best = deepCloneSheets(current);
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════
// FULL OPTIMIZATION PIPELINE
// ═══════════════════════════════════════════════════════════════
function optimizeGroup(parts: IPart[], rawSW: number, rawSH: number): { winner: Candidate; all: Candidate[] } {
  const sw = rawSW - TRIM * 2;
  const sh = rawSH - TRIM * 2;
  const sheetArea = rawSW * rawSH;
  const totalArea = parts.reduce((s, p) => s + p.area, 0);
  const all: Candidate[] = [];
  const heuristics: Heuristic[] = ['bssf', 'blsf', 'baf', 'bl', 'cp'];

  const sorts: { name: string; fn: (a: IPart, b: IPart) => number }[] = [
    { name: 'area-desc', fn: (a, b) => b.area - a.area },
    { name: 'height-desc', fn: (a, b) => b.h - a.h || b.w - a.w },
    { name: 'width-desc', fn: (a, b) => b.w - a.w || b.h - a.h },
    { name: 'perimeter', fn: (a, b) => (b.w + b.h) - (a.w + a.h) },
    { name: 'max-dim', fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) },
    { name: 'min-dim', fn: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) },
  ];

  function addCandidate(sheets: PackedSheet[], strategy: string) {
    const s = scoreSolution(sheets, sw, sh, rawSW, rawSH);
    all.push({ sheets, strategy, ...s });
  }

  // Phase 1: Initial packing with all strategy combos
  console.log('  │   Phase 1: Initial MAXRECTS packing...');
  for (const sort of sorts) {
    const sorted = [...parts].sort(sort.fn);
    for (const h of heuristics) {
      addCandidate(greedyMultiSheet(sorted, sw, sh, KERF, h), `greedy:${sort.name}+${h}`);
    }
  }

  const minN = Math.max(1, Math.ceil(totalArea / (sw * sh)));
  for (let n = minN; n <= minN + 3; n++) {
    for (const h of heuristics) {
      addCandidate(distributedPacking(parts, sw, sh, KERF, h, n), `dist:${n}s+${h}`);
    }
  }

  // Random starts
  for (let r = 0; r < RANDOM_STARTS; r++) {
    const shuffled = shuffleArray(parts);
    const h = heuristics[Math.floor(Math.random() * heuristics.length)];
    if (r % 2 === 0) {
      addCandidate(greedyMultiSheet(shuffled, sw, sh, KERF, h), `rng-greedy-${r}`);
    } else {
      const n = Math.max(1, minN + Math.floor(Math.random() * 3));
      addCandidate(distributedPacking(shuffled, sw, sh, KERF, h, n), `rng-dist-${r}`);
    }
  }

  console.log('  │   Phase 1 done: ' + all.length + ' candidates');

  // Phase 2: Destroy-rebuild on top 10
  console.log('  │   Phase 2: Destroy-rebuild on top 10...');
  all.sort((a, b) => a.score - b.score);
  const top10 = all.slice(0, 10);
  for (const c of top10) {
    const rebuilt = destroyRebuild(c.sheets, parts, sw, sh, KERF, rawSW, rawSH);
    addCandidate(rebuilt, c.strategy + '+DR');
  }

  // Phase 3: Simulated annealing on top 5
  console.log('  │   Phase 3: Simulated annealing on top 5...');
  all.sort((a, b) => a.score - b.score);
  const top5 = all.slice(0, 5);
  for (const c of top5) {
    const annealed = simulatedAnnealing(c.sheets, sw, sh, KERF, rawSW, rawSH);
    addCandidate(annealed, c.strategy + '+SA');
  }

  // Phase 4: Final destroy-rebuild + SA on absolute best
  console.log('  │   Phase 4: Final refinement on best...');
  all.sort((a, b) => a.score - b.score);
  const best = all[0];
  {
    // Extra aggressive SA on best
    let refined = simulatedAnnealing(best.sheets, sw, sh, KERF, rawSW, rawSH);
    refined = destroyRebuild(refined, parts, sw, sh, KERF, rawSW, rawSH);
    refined = simulatedAnnealing(refined, sw, sh, KERF, rawSW, rawSH);
    addCandidate(refined, best.strategy + '+FINAL');
  }

  all.sort((a, b) => a.score - b.score);
  return { winner: all[0], all };
}

// ══════════════════════════════════════════════════════════════════
// BENCHMARK
// ══════════════════════════════════════════════════════════════════
const PROJECTS = [
  { id: 'a5e2d220-2759-44d3-abff-daa4dae6d9f7', code: 'ART-2026-0004', name: 'Laila Benkirane' },
  { id: '5f411604-9cb1-4cdf-af37-81635f382506', code: 'ART-2026-0001', name: 'Kamal Benjelloun' },
];

const V4_RESULTS: Record<string, Record<string, { waste: number; sheets: number }>> = {
  'a5e2d220': { mdf_18: { waste: 33.0, sheets: 5 }, back_hdf_5: { waste: 34.1, sheets: 2 } },
  '5f411604': { mdf_18: { waste: 44.2, sheets: 2 }, back_hdf_5: { waste: 59.3, sheets: 1 } },
};

async function benchmark() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  SAW OPTIMIZER v5 — MAXRECTS + DESTROY-REBUILD + SIMULATED ANNEALING         ║');
  console.log('║  Kerf: ' + KERF + 'mm | Trim: ' + TRIM + 'mm/edge | SA: ' + SA_ITERATIONS + ' iters | DR: ' + DESTROY_REBUILD_ROUNDS + ' rounds            ║');
  console.log('║  Date: ' + new Date().toISOString().slice(0, 19) + '                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

  const summaryRows: string[] = [];

  for (const proj of PROJECTS) {
    console.log('━'.repeat(85));
    console.log('PROJECT: ' + proj.code + ' — ' + proj.name);
    console.log('━'.repeat(85));

    const { data: parts } = await supabase.from('project_parts')
      .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right')
      .eq('project_id', proj.id);

    if (!parts?.length) { console.log('  No parts!'); continue; }

    const groups: Record<string, IPart[]> = {};
    for (const p of parts) {
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
          canRotate: canRotateGrain(grain), grain,
          eT: !!p.edge_top, eB: !!p.edge_bottom, eL: !!p.edge_left, eR: !!p.edge_right,
        });
      }
    }

    const oldKey = proj.id.substring(0, 8);

    for (const [mat, matParts] of Object.entries(groups)) {
      const [rawSW, rawSH] = SHEET_SIZES[mat] || [2800, 1220];
      const usableW = rawSW - TRIM * 2;
      const usableH = rawSH - TRIM * 2;
      const totalPartArea = matParts.reduce((s, p) => s + p.area, 0);
      const sheetArea = rawSW * rawSH;
      const usableArea = usableW * usableH;
      const areaMin = Math.ceil(totalPartArea / usableArea);

      console.log('\n  ┌── ' + mat.toUpperCase() + ' (' + matParts.length + ' pieces) ──');
      console.log('  │ Sheet: ' + rawSW + '×' + rawSH + 'mm, Usable: ' + usableW + '×' + usableH + 'mm');
      console.log('  │ Total part area: ' + (totalPartArea / 1e6).toFixed(3) + ' m²');
      console.log('  │ Area-min sheets: ' + areaMin + '  (theoretical max yield at ' + areaMin + 's: ' + ((totalPartArea / (areaMin * sheetArea)) * 100).toFixed(1) + '%)');

      const t0 = Date.now();
      const { winner, all } = optimizeGroup(matParts, rawSW, rawSH);
      const elapsed = Date.now() - t0;

      // Unique top
      const uniq = new Map<string, Candidate>();
      for (const c of all) {
        const k = c.sheets.length + '-' + c.waste.toFixed(0);
        if (!uniq.has(k) || c.score < uniq.get(k)!.score) uniq.set(k, c);
      }
      const topList = [...uniq.values()].sort((a, b) => a.score - b.score).slice(0, 8);
      console.log('  │');
      console.log('  │ Ran ' + all.length + ' evaluations in ' + (elapsed / 1000).toFixed(1) + 's');
      console.log('  │ Top unique results:');
      for (const c of topList) {
        console.log('  │   ' + c.strategy.substring(0, 45).padEnd(46) + 'waste=' + c.waste.toFixed(1) + '% yield=' + c.yieldPct.toFixed(1) + '% sheets=' + c.sheets.length + ' σ=' + c.balance.toFixed(1));
      }

      const v4 = V4_RESULTS[oldKey]?.[mat];
      const deltaWaste = v4 ? v4.waste - winner.waste : 0;
      const deltaSheets = v4 ? v4.sheets - winner.sheets.length : 0;

      console.log('  │');
      console.log('  │ ╔═══════════════════════ WINNER ════════════════════════════════╗');
      console.log('  │ ║ Strategy:  ' + winner.strategy.substring(0, 50).padEnd(51) + '║');
      console.log('  │ ║ Sheets:    ' + String(winner.sheets.length).padEnd(51) + '║');
      console.log('  │ ║ Waste:     ' + (winner.waste.toFixed(1) + '%').padEnd(51) + '║');
      console.log('  │ ║ Yield:     ' + (winner.yieldPct.toFixed(1) + '%').padEnd(51) + '║');
      console.log('  │ ║ Balance:   σ=' + winner.balance.toFixed(1) + ' [' + winner.minYield.toFixed(1) + '%–' + winner.maxYield.toFixed(1) + '%]'.padEnd(39) + '║');
      if (v4) {
        console.log('  │ ║──────────────────────────────────────────────────────────────║');
        console.log('  │ ║ vs v4:  waste ' + v4.waste.toFixed(1) + '% → ' + winner.waste.toFixed(1) + '% (' + (deltaWaste >= 0 ? '↓' : '↑') + Math.abs(deltaWaste).toFixed(1) + 'pp)  sheets ' + v4.sheets + ' → ' + winner.sheets.length + ''.padEnd(14) + '║');
      }
      console.log('  │ ╚════════════════════════════════════════════════════════════════╝');

      // Per-sheet details
      for (let si = 0; si < winner.sheets.length; si++) {
        const s = winner.sheets[si];
        const yld = s.usedArea / sheetArea * 100;
        const rotCount = s.placements.filter(p => p.rotated).length;
        console.log('  │');
        console.log('  │ Sheet #' + (si + 1) + ': ' + s.placements.length + ' parts (↻' + rotCount + '), yield=' + yld.toFixed(1) + '%, free rects=' + s.freeRects.length);

        const sorted = [...s.placements].sort((a, b) => a.y - b.y || a.x - b.x);
        for (const pl of sorted) {
          console.log('  │   ' + pl.part.label.padEnd(24) + (pl.placedW + '×' + pl.placedH).padEnd(12) + '@(' + pl.x + ',' + pl.y + ')' + (pl.rotated ? ' ↻' : ''));
        }

        // Show large waste areas
        const bigFree = s.freeRects.filter(fr => fr.w * fr.h > 50000).sort((a, b) => b.w * b.h - a.w * a.h);
        if (bigFree.length > 0) {
          console.log('  │   Waste zones:');
          for (const fr of bigFree.slice(0, 5)) {
            console.log('  │     ' + fr.w + '×' + fr.h + 'mm @(' + fr.x + ',' + fr.y + ') = ' + (fr.w * fr.h / 1e6).toFixed(3) + 'm²');
          }
        }
      }

      // Waste analysis
      const totalUsed = winner.sheets.reduce((s, x) => s + x.usedArea, 0);
      const totalSheetArea = winner.sheets.length * sheetArea;
      const totalTrimArea = winner.sheets.length * (rawSW * rawSH - usableW * usableH);
      const totalFreeArea = winner.sheets.reduce((s, x) => s + x.freeRects.reduce((ss, fr) => ss + fr.w * fr.h, 0), 0);

      console.log('  │');
      console.log('  │ WASTE BREAKDOWN:');
      console.log('  │   Sheets: ' + winner.sheets.length + ' × ' + (sheetArea / 1e6).toFixed(3) + 'm² = ' + (totalSheetArea / 1e6).toFixed(3) + 'm²');
      console.log('  │   Parts:  ' + (totalUsed / 1e6).toFixed(3) + 'm² (' + (totalUsed / totalSheetArea * 100).toFixed(1) + '%)');
      console.log('  │   Trim:   ' + (totalTrimArea / 1e6).toFixed(3) + 'm² (' + (totalTrimArea / totalSheetArea * 100).toFixed(1) + '%)');
      console.log('  │   Gaps:   ' + (totalFreeArea / 1e6).toFixed(3) + 'm² (' + (totalFreeArea / totalSheetArea * 100).toFixed(1) + '%)');

      console.log('  └' + '─'.repeat(80));

      summaryRows.push(
        '  ' + proj.code.padEnd(16) + mat.padEnd(14) + String(matParts.length).padEnd(6) +
        (v4 ? v4.waste.toFixed(1) + '%/' + v4.sheets + 's' : 'N/A').padEnd(12) +
        winner.waste.toFixed(1) + '%/' + winner.sheets.length + 's'.padEnd(2) + '  '.padEnd(4) +
        (v4 ? (deltaWaste >= 0 ? '↓' : '↑') + Math.abs(deltaWaste).toFixed(1) + 'pp/' + (deltaSheets >= 0 ? '-' : '+') + Math.abs(deltaSheets) + 's' : '').padEnd(14) +
        winner.yieldPct.toFixed(1) + '% '.padEnd(4) +
        (winner.sheets.length <= areaMin ? '✅ AT-MIN' : winner.sheets.length <= areaMin + 1 ? '⚠️  +1' : '❌ +' + (winner.sheets.length - areaMin))
      );
    }

    // Persist
    console.log('\n  Persisting to DB...');
    await supabase.from('saw_nesting_results').delete().eq('project_id', proj.id);
    for (const [mat, matParts] of Object.entries(groups)) {
      const [rawSW, rawSH] = SHEET_SIZES[mat] || [2800, 1220];
      const { winner } = optimizeGroup(matParts, rawSW, rawSH);

      for (let si = 0; si < winner.sheets.length; si++) {
        const s = winner.sheets[si];
        const stripMap = new Map<string, { y: number; h: number; pls: Placement[] }>();
        for (const pl of s.placements) {
          const k = pl.y + '-' + pl.placedH;
          if (!stripMap.has(k)) stripMap.set(k, { y: pl.y, h: pl.placedH, pls: [] });
          stripMap.get(k)!.pls.push(pl);
        }

        const strips = [...stripMap.values()].sort((a, b) => a.y - b.y).map((st, idx) => {
          st.pls.sort((a, b) => a.x - b.x);
          let maxX = 0;
          const parts = st.pls.map(pl => {
            maxX = Math.max(maxX, pl.x + pl.placedW);
            return {
              partId: pl.part.id, label: pl.part.label,
              width: pl.placedW, height: pl.placedH,
              crossX: pl.x, rotated: pl.rotated,
              edgeTop: pl.rotated ? pl.part.eL : pl.part.eT,
              edgeBottom: pl.rotated ? pl.part.eR : pl.part.eB,
              edgeLeft: pl.rotated ? pl.part.eT : pl.part.eL,
              edgeRight: pl.rotated ? pl.part.eB : pl.part.eR,
            };
          });
          return { stripIndex: idx + 1, ripY: st.y, stripHeight: st.h, parts, wasteWidth: rawSW - maxX };
        });

        let used = 0;
        for (const st of strips) for (const p of st.parts) used += p.width * p.height;
        const sa = rawSW * rawSH;

        await supabase.from('saw_nesting_results').insert({
          project_id: proj.id, material_code: mat,
          thickness_mm: mat === 'back_hdf_5' ? 5 : 18,
          sheet_width_mm: rawSW, sheet_height_mm: rawSH,
          sheet_index: si + 1, strips,
          used_area_mm2: used, waste_area_mm2: sa - used,
          waste_percent: Number(((sa - used) / sa * 100).toFixed(2)),
        });
      }
    }
    console.log('  ✓ Done\n');
  }

  // Summary
  console.log('\n' + '═'.repeat(85));
  console.log('  SUMMARY: v4 (guillotine) vs v5 (MAXRECTS + DR + SA)');
  console.log('═'.repeat(85));
  console.log('  ' + 'Project'.padEnd(16) + 'Material'.padEnd(14) + 'Parts'.padEnd(6) + 'v4'.padEnd(12) + 'v5'.padEnd(12) + 'Improvement'.padEnd(14) + 'Yield'.padEnd(8) + 'Status');
  console.log('  ' + '─'.repeat(90));
  for (const row of summaryRows) console.log(row);
  console.log('  ' + '─'.repeat(90));
  console.log('═'.repeat(85));
}

benchmark().catch(e => console.error('Fatal:', e));
