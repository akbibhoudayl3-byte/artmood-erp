// ═══════════════════════════════════════════════════════════════
// SAW Optimizer v4 — ROTATION UNLOCKED BENCHMARK
// All grain constraints DISABLED. Every part can rotate 0°/90°.
// Same kerf (4mm), trim (15mm/edge), guillotine cuts.
// npx tsx --tsconfig tsconfig.json scripts/test_rotation_unlocked.ts
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KERF = 4;
const TRIM = 15;
const RANDOM_STARTS = 100; // more random starts for thorough search
const LOCAL_IMPROVE_PASSES = 500; // more passes for deeper improvement

const SHEET_SIZES: Record<string, [number, number]> = {
  mdf_18: [2800, 1220], mdf_16: [2800, 1220], mdf_22: [2800, 1220], mdf_10: [2800, 1220],
  back_hdf_5: [2440, 1220], back_hdf_3: [2440, 1220], back_mdf_8: [2440, 1220],
  stratifie_18: [2800, 1220], stratifie_16: [2800, 1220],
  melamine_anthracite: [2800, 1220], melamine_blanc: [2800, 1220],
  melamine_chene: [2800, 1220], melamine_noyer: [2800, 1220],
};

interface IPart {
  id: string; label: string; w: number; h: number; area: number;
  canRotate: boolean; grain: string;
  eT: boolean; eB: boolean; eL: boolean; eR: boolean;
}
interface FreeRect { x: number; y: number; w: number; h: number; }
interface Placement { part: IPart; x: number; y: number; placedW: number; placedH: number; rotated: boolean; }
interface PackedSheet { placements: Placement[]; freeRects: FreeRect[]; usedArea: number; placedIds: Set<string>; }
type Heuristic = 'best-area' | 'best-short-side' | 'best-long-side' | 'worst-fit';
type Candidate = { sheets: PackedSheet[]; strategy: string; waste: number; yieldPct: number; score: number; balance: number; minYield: number; maxYield: number };

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Core Guillotine (identical to v4) ─────────────────────────
function fitScore(fr: FreeRect, pw: number, ph: number, h: Heuristic): number {
  const lw = fr.w - pw, lh = fr.h - ph;
  if (h === 'best-area') return fr.w * fr.h - pw * ph;
  if (h === 'best-short-side') return Math.min(lw, lh);
  if (h === 'best-long-side') return Math.max(lw, lh);
  return -(fr.w * fr.h);
}

function findBestRect(freeRects: FreeRect[], pw: number, ph: number, canRot: boolean, heuristic: Heuristic): { idx: number; rotated: boolean } | null {
  let bestIdx = -1, bestRot = false, bestScore = Infinity;
  for (let i = 0; i < freeRects.length; i++) {
    const fr = freeRects[i];
    if (pw <= fr.w && ph <= fr.h) {
      const s = fitScore(fr, pw, ph, heuristic);
      if (s < bestScore) { bestScore = s; bestIdx = i; bestRot = false; }
    }
    if (canRot && ph <= fr.w && pw <= fr.h && (pw !== ph)) {
      const s = fitScore(fr, ph, pw, heuristic);
      if (s < bestScore) { bestScore = s; bestIdx = i; bestRot = true; }
    }
  }
  return bestIdx < 0 ? null : { idx: bestIdx, rotated: bestRot };
}

function guillotineSplit(fr: FreeRect, pw: number, ph: number, kerf: number): FreeRect[] {
  const res: FreeRect[] = [];
  const kw = Math.min(kerf, fr.w - pw);
  const kh = Math.min(kerf, fr.h - ph);
  const rA = { x: fr.x + pw + kw, y: fr.y, w: fr.w - pw - kw, h: fr.h };
  const bA = { x: fr.x, y: fr.y + ph + kh, w: pw, h: fr.h - ph - kh };
  const aA = Math.max(rA.w, 0) * Math.max(rA.h, 0) + Math.max(bA.w, 0) * Math.max(bA.h, 0);
  const rB = { x: fr.x + pw + kw, y: fr.y, w: fr.w - pw - kw, h: ph };
  const bB = { x: fr.x, y: fr.y + ph + kh, w: fr.w, h: fr.h - ph - kh };
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

function packSheet(parts: IPart[], sw: number, sh: number, kerf: number, heuristic: Heuristic, already: Set<string>): PackedSheet {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: sw, h: sh }];
  const placements: Placement[] = [];
  const placedIds = new Set<string>();
  let usedArea = 0;

  for (const p of parts) {
    if (already.has(p.id) || placedIds.has(p.id)) continue;
    const fit = findBestRect(freeRects, p.w, p.h, p.canRotate, heuristic);
    if (!fit) continue;

    const fr = freeRects[fit.idx];
    const pw = fit.rotated ? p.h : p.w;
    const ph = fit.rotated ? p.w : p.h;
    placements.push({ part: p, x: fr.x, y: fr.y, placedW: pw, placedH: ph, rotated: fit.rotated });
    usedArea += pw * ph;
    placedIds.add(p.id);
    const newFree = guillotineSplit(fr, pw, ph, kerf);
    freeRects.splice(fit.idx, 1, ...newFree);
    for (let i = freeRects.length - 1; i >= 0; i--) {
      if (freeRects[i].w < 30 || freeRects[i].h < 30) freeRects.splice(i, 1);
    }
  }
  return { placements, freeRects, usedArea, placedIds };
}

function greedyMultiSheet(parts: IPart[], sw: number, sh: number, kerf: number, h: Heuristic): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  const placed = new Set<string>();
  let safety = 0;
  while (placed.size < parts.length && safety++ < 100) {
    const s = packSheet(parts, sw, sh, kerf, h, placed);
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
    const s = packSheet(sheetParts[i], sw, sh, kerf, h, new Set());
    sheets.push(s);
    for (const id of s.placedIds) globalPlaced.add(id);
  }

  const overflow = parts.filter(p => !globalPlaced.has(p.id));
  for (const p of overflow) {
    if (globalPlaced.has(p.id)) continue;
    for (const s of sheets) {
      const fit = findBestRect(s.freeRects, p.w, p.h, p.canRotate, h);
      if (fit) {
        const fr = s.freeRects[fit.idx];
        const pw = fit.rotated ? p.h : p.w;
        const ph = fit.rotated ? p.w : p.h;
        s.placements.push({ part: p, x: fr.x, y: fr.y, placedW: pw, placedH: ph, rotated: fit.rotated });
        s.usedArea += pw * ph;
        s.placedIds.add(p.id);
        globalPlaced.add(p.id);
        const nf = guillotineSplit(fr, pw, ph, kerf);
        s.freeRects.splice(fit.idx, 1, ...nf);
        break;
      }
    }
  }

  const still = parts.filter(p => !globalPlaced.has(p.id));
  if (still.length > 0) {
    let safety = 0;
    while (globalPlaced.size < parts.length && safety++ < 50) {
      const s = packSheet(still, sw, sh, kerf, h, globalPlaced);
      if (s.placedIds.size === 0) break;
      sheets.push(s);
      for (const id of s.placedIds) globalPlaced.add(id);
    }
  }
  return sheets;
}

// ── Local Improvement ─────────────────────────────────────────
function repackSheet(parts: IPart[], sw: number, sh: number, kerf: number, h: Heuristic): PackedSheet {
  return packSheet(parts, sw, sh, kerf, h, new Set());
}

function scoreSolution(sheets: PackedSheet[], sw: number, sh: number): { score: number; balance: number; minYield: number; maxYield: number } {
  const sa = sw * sh;
  const totalUsed = sheets.reduce((s, x) => s + x.usedArea, 0);
  const totalArea = sheets.length * sa;
  const wastePct = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
  const yields = sheets.map(x => x.usedArea / sa * 100);
  const avg = yields.reduce((s, y) => s + y, 0) / yields.length;
  const stdDev = Math.sqrt(yields.reduce((s, y) => s + (y - avg) ** 2, 0) / yields.length);
  const minY = Math.min(...yields);
  const maxY = Math.max(...yields);
  const below45 = yields.filter(y => y < 45).length;
  const below35 = yields.filter(y => y < 35).length;
  const minSheets = Math.ceil(totalUsed / sa);
  const ratio = sheets.length / Math.max(1, minSheets);
  const score = wastePct * 0.35 + (ratio - 1) * 100 * 0.20 + stdDev * 0.25 + below45 * 12 * 0.15 + below35 * 25 * 0.05;
  return { score, balance: stdDev, minYield: minY, maxYield: maxY };
}

function localImprove(sheets: PackedSheet[], sw: number, sh: number, kerf: number, passes: number): PackedSheet[] {
  if (sheets.length <= 1) return sheets;
  let best = sheets;
  let bestScore = scoreSolution(best, sw, sh).score;
  const heuristics: Heuristic[] = ['best-area', 'best-short-side', 'best-long-side'];

  for (let pass = 0; pass < passes; pass++) {
    const improved = tryImproveOnce(best, sw, sh, kerf, heuristics, pass);
    if (!improved) continue;
    const newScore = scoreSolution(improved, sw, sh).score;
    if (newScore < bestScore - 0.01) {
      bestScore = newScore;
      best = improved;
    }
  }
  best = compactSheets(best, sw, sh, kerf);
  return best;
}

function tryImproveOnce(sheets: PackedSheet[], sw: number, sh: number, kerf: number, heuristics: Heuristic[], pass: number): PackedSheet[] | null {
  const sa = sw * sh;
  const yields = sheets.map(s => s.usedArea / sa);
  const strat = pass % 3;

  if (strat === 0) {
    const sortedIdxs = yields.map((y, i) => ({ y, i })).sort((a, b) => b.y - a.y);
    if (sortedIdxs.length < 2) return null;
    const fullIdx = sortedIdxs[0].i;
    const emptyIdx = sortedIdxs[sortedIdxs.length - 1].i;
    if (fullIdx === emptyIdx) return null;

    for (const pl of sheets[fullIdx].placements) {
      const h = heuristics[pass % heuristics.length];
      const fit = findBestRect(sheets[emptyIdx].freeRects, pl.part.w, pl.part.h, pl.part.canRotate, h);
      if (!fit) continue;

      const fullParts = sheets[fullIdx].placements.filter(p => p.part.id !== pl.part.id).map(p => p.part);
      const emptyParts = [...sheets[emptyIdx].placements.map(p => p.part), pl.part];
      const newFull = repackSheet(fullParts, sw, sh, kerf, h);
      const newEmpty = repackSheet(emptyParts, sw, sh, kerf, h);

      if (newFull.placedIds.size === fullParts.length && newEmpty.placedIds.size === emptyParts.length) {
        const result = [...sheets];
        result[fullIdx] = newFull;
        result[emptyIdx] = newEmpty;
        return result;
      }
    }
  } else if (strat === 1) {
    if (sheets.length < 2) return null;
    const i = Math.floor(Math.random() * sheets.length);
    let j = Math.floor(Math.random() * sheets.length);
    if (i === j) j = (j + 1) % sheets.length;
    const si = sheets[i], sj = sheets[j];
    if (!si.placements.length || !sj.placements.length) return null;

    const pi = si.placements[Math.floor(Math.random() * si.placements.length)];
    const pj = sj.placements[Math.floor(Math.random() * sj.placements.length)];

    const partsI = si.placements.filter(p => p.part.id !== pi.part.id).map(p => p.part);
    partsI.push(pj.part);
    const partsJ = sj.placements.filter(p => p.part.id !== pj.part.id).map(p => p.part);
    partsJ.push(pi.part);

    const h = heuristics[pass % heuristics.length];
    const newI = repackSheet(partsI, sw, sh, kerf, h);
    const newJ = repackSheet(partsJ, sw, sh, kerf, h);

    if (newI.placedIds.size === partsI.length && newJ.placedIds.size === partsJ.length) {
      const result = [...sheets];
      result[i] = newI;
      result[j] = newJ;
      return result;
    }
  } else {
    if (sheets.length < 2) return null;
    const sortedIdxs = yields.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    const idx1 = sortedIdxs[0].i;
    const idx2 = sortedIdxs[1].i;
    const combinedParts = [...sheets[idx1].placements.map(p => p.part), ...sheets[idx2].placements.map(p => p.part)];
    const combinedArea = combinedParts.reduce((s, p) => s + p.area, 0);
    if (combinedArea > sw * sh * 0.95) return null;

    const h = heuristics[pass % heuristics.length];
    const merged = repackSheet(combinedParts, sw, sh, kerf, h);
    if (merged.placedIds.size === combinedParts.length) {
      const result = sheets.filter((_, i) => i !== idx1 && i !== idx2);
      result.push(merged);
      return result;
    }
  }
  return null;
}

function compactSheets(sheets: PackedSheet[], sw: number, sh: number, kerf: number): PackedSheet[] {
  let result = sheets.filter(s => s.placements.length > 0);
  const sa = sw * sh;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (result.length <= 1) break;
    const yields = result.map(s => s.usedArea / sa);
    const minIdx = yields.indexOf(Math.min(...yields));
    const sparseSheet = result[minIdx];
    const otherSheets = result.filter((_, i) => i !== minIdx);
    let allFit = true;

    const sparseParts = [...sparseSheet.placements].sort((a, b) => a.part.area - b.part.area);
    for (const pl of sparseParts) {
      let placed = false;
      for (const other of otherSheets) {
        for (const h of ['best-area', 'best-short-side', 'best-long-side'] as Heuristic[]) {
          const fit = findBestRect(other.freeRects, pl.part.w, pl.part.h, pl.part.canRotate, h);
          if (fit) {
            const fr = other.freeRects[fit.idx];
            const pw = fit.rotated ? pl.part.h : pl.part.w;
            const ph = fit.rotated ? pl.part.w : pl.part.h;
            other.placements.push({ part: pl.part, x: fr.x, y: fr.y, placedW: pw, placedH: ph, rotated: fit.rotated });
            other.usedArea += pw * ph;
            other.placedIds.add(pl.part.id);
            const newFree = guillotineSplit(fr, pw, ph, kerf);
            other.freeRects.splice(fit.idx, 1, ...newFree);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) { allFit = false; break; }
    }
    if (allFit) result = otherSheets; else break;
  }
  return result;
}

// ── Main Optimizer ────────────────────────────────────────────
function optimizeGroup(parts: IPart[], rawSW: number, rawSH: number): { winner: Candidate; all: Candidate[] } {
  const sw = rawSW - TRIM * 2;
  const sh = rawSH - TRIM * 2;
  const sheetArea = rawSW * rawSH;
  const totalArea = parts.reduce((s, p) => s + p.area, 0);
  const all: Candidate[] = [];
  const heuristics: Heuristic[] = ['best-area', 'best-short-side', 'best-long-side', 'worst-fit'];

  const sorts: { name: string; fn: (a: IPart, b: IPart) => number }[] = [
    { name: 'area-desc', fn: (a, b) => b.area - a.area },
    { name: 'height-desc', fn: (a, b) => b.h - a.h || b.w - a.w },
    { name: 'width-desc', fn: (a, b) => b.w - a.w || b.h - a.h },
    { name: 'perimeter-desc', fn: (a, b) => (b.w + b.h) - (a.w + a.h) },
    { name: 'max-dim', fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) },
    // Additional sorts for rotation scenarios
    { name: 'min-dim-desc', fn: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) },
    { name: 'ratio-desc', fn: (a, b) => (Math.max(b.w, b.h) / Math.min(b.w, b.h)) - (Math.max(a.w, a.h) / Math.min(a.w, a.h)) },
  ];

  function evaluate(sheets: PackedSheet[], strategy: string) {
    const totalUsed = sheets.reduce((s, x) => s + x.usedArea, 0);
    const totalA = sheets.length * sheetArea;
    const waste = totalA > 0 ? (1 - totalUsed / totalA) * 100 : 100;
    const sc = scoreSolution(sheets, sw, sh);
    all.push({ sheets, strategy, waste, yieldPct: 100 - waste, ...sc });
  }

  // Greedy
  for (const sort of sorts) {
    const sorted = [...parts].sort(sort.fn);
    for (const h of heuristics) {
      evaluate(greedyMultiSheet(sorted, sw, sh, KERF, h), `greedy:${sort.name}+${h}`);
    }
  }

  // Distributed
  const minN = Math.ceil(totalArea / (sw * sh));
  for (let n = Math.max(1, minN); n <= minN + 3; n++) {
    for (const h of heuristics) {
      evaluate(distributedPacking(parts, sw, sh, KERF, h, n), `dist:${n}s+${h}`);
    }
  }

  // Random — 100 starts
  for (let r = 0; r < RANDOM_STARTS; r++) {
    const shuffled = shuffleArray(parts);
    const h = heuristics[Math.floor(Math.random() * heuristics.length)];
    if (r % 2 === 0) {
      evaluate(greedyMultiSheet(shuffled, sw, sh, KERF, h), `rng-greedy-${r}`);
    } else {
      const n = Math.max(1, minN + Math.floor(Math.random() * 3));
      evaluate(distributedPacking(shuffled, sw, sh, KERF, h, n), `rng-dist-${r}`);
    }
  }

  // Local improvement on top 8
  all.sort((a, b) => a.score - b.score);
  const top = all.slice(0, 8);
  for (const c of top) {
    const improved = localImprove(c.sheets, sw, sh, KERF, LOCAL_IMPROVE_PASSES);
    const totalUsed = improved.reduce((s, x) => s + x.usedArea, 0);
    const totalA = improved.length * sheetArea;
    const waste = totalA > 0 ? (1 - totalUsed / totalA) * 100 : 100;
    const sc = scoreSolution(improved, sw, sh);
    all.push({ sheets: improved, strategy: c.strategy + '+local', waste, yieldPct: 100 - waste, ...sc });
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

// v4 grain-locked results for comparison
const V4_LOCKED: Record<string, Record<string, { waste: number; sheets: number; yield: number }>> = {
  'a5e2d220': { mdf_18: { waste: 33.0, sheets: 5, yield: 67.0 }, back_hdf_5: { waste: 34.1, sheets: 2, yield: 65.9 } },
  '5f411604': { mdf_18: { waste: 44.2, sheets: 2, yield: 55.8 }, back_hdf_5: { waste: 59.3, sheets: 1, yield: 40.7 } },
};

async function benchmark() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  SAW OPTIMIZER v4 — ROTATION UNLOCKED BENCHMARK                             ║');
  console.log('║  ALL GRAIN CONSTRAINTS DISABLED — Every part can rotate 0°/90°              ║');
  console.log('║  Kerf: ' + KERF + 'mm | Trim: ' + TRIM + 'mm/edge | Random: ' + RANDOM_STARTS + ' | Local: ' + LOCAL_IMPROVE_PASSES + ' passes            ║');
  console.log('║  Date: ' + new Date().toISOString().slice(0, 19) + '                                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝\n');

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
      for (let qi = 0; qi < qty; qi++) {
        groups[p.material_type].push({
          id: qty > 1 ? p.id + '-' + qi : p.id,
          label: p.part_code || p.part_name || 'Part',
          w: Math.round(Number(p.width_mm)),
          h: Math.round(Number(p.height_mm)),
          area: Math.round(Number(p.width_mm)) * Math.round(Number(p.height_mm)),
          canRotate: true, // ← FORCED TRUE — the key change
          grain: 'none',   // ← grain disabled
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
      const areaMinSheets = Math.ceil(totalPartArea / usableArea);

      // Part dimension analysis (both orientations now available)
      const allDims: { w: number; h: number; label: string }[] = matParts.map(p => ({
        w: p.w, h: p.h, label: p.label,
      }));

      console.log('\n  ┌── ' + mat.toUpperCase() + ' (' + matParts.length + ' pieces, ROTATION=ON) ──');
      console.log('  │ Raw sheet: ' + rawSW + '×' + rawSH + 'mm (' + (sheetArea / 1e6).toFixed(3) + ' m²)');
      console.log('  │ Usable: ' + usableW + '×' + usableH + 'mm (' + (usableArea / 1e6).toFixed(3) + ' m²)');
      console.log('  │ Total part area: ' + (totalPartArea / 1e6).toFixed(3) + ' m²');
      console.log('  │ Fill ratio (parts / usable): ' + ((totalPartArea / usableArea) * 100).toFixed(1) + '%');
      console.log('  │ Area-based min sheets: ' + areaMinSheets);
      console.log('  │ Theoretical max yield at ' + areaMinSheets + ' sheets: ' + ((totalPartArea / (areaMinSheets * sheetArea)) * 100).toFixed(1) + '%');

      // Unique dimensions
      const dimSet = new Map<string, number>();
      for (const p of matParts) {
        const key = Math.min(p.w, p.h) + '×' + Math.max(p.w, p.h);
        dimSet.set(key, (dimSet.get(key) || 0) + 1);
      }
      console.log('  │ Unique part sizes (normalized): ' + dimSet.size);
      for (const [dim, count] of [...dimSet.entries()].sort()) {
        console.log('  │   ' + dim + 'mm  ×' + count);
      }

      const t0 = Date.now();
      const { winner, all } = optimizeGroup(matParts, rawSW, rawSH);
      const elapsed = Date.now() - t0;

      console.log('  │');
      console.log('  │ Ran ' + all.length + ' strategies in ' + elapsed + 'ms');

      // Top unique
      const uniq = new Map<string, Candidate>();
      for (const c of all) {
        const k = c.sheets.length + '-' + c.waste.toFixed(0) + '-' + c.balance.toFixed(0);
        if (!uniq.has(k) || c.score < uniq.get(k)!.score) uniq.set(k, c);
      }
      const topList = [...uniq.values()].sort((a, b) => a.score - b.score).slice(0, 8);
      console.log('  │ Top strategies:');
      for (const c of topList) {
        console.log('  │   ' + c.strategy.padEnd(42) + 'yield=' + c.yieldPct.toFixed(1) + '% waste=' + c.waste.toFixed(1) + '% sheets=' + c.sheets.length + ' σ=' + c.balance.toFixed(1) + ' [' + c.minYield.toFixed(0) + '%–' + c.maxYield.toFixed(0) + '%]');
      }

      const locked = V4_LOCKED[oldKey]?.[mat];
      const wasteDelta = locked ? locked.waste - winner.waste : 0;
      const sheetDelta = locked ? locked.sheets - winner.sheets.length : 0;

      console.log('  │');
      console.log('  │ ╔═══════════════════════ WINNER ════════════════════════════╗');
      console.log('  │ ║ Strategy:  ' + winner.strategy.padEnd(47) + '║');
      console.log('  │ ║ Sheets:    ' + String(winner.sheets.length).padEnd(47) + '║');
      console.log('  │ ║ Waste:     ' + (winner.waste.toFixed(1) + '%').padEnd(47) + '║');
      console.log('  │ ║ Yield:     ' + (winner.yieldPct.toFixed(1) + '%').padEnd(47) + '║');
      console.log('  │ ║ Balance:   σ=' + winner.balance.toFixed(1) + '  [' + winner.minYield.toFixed(1) + '%–' + winner.maxYield.toFixed(1) + '%]'.padEnd(33) + '║');
      if (locked) {
        console.log('  │ ║────────────────────────────────────────────────────────────║');
        console.log('  │ ║ vs GRAIN-LOCKED (v4):                                      ║');
        console.log('  │ ║   Locked waste:   ' + (locked.waste.toFixed(1) + '% → Unlocked: ' + winner.waste.toFixed(1) + '%').padEnd(39) + '║');
        console.log('  │ ║   Locked sheets:  ' + (locked.sheets + ' → Unlocked: ' + winner.sheets.length).padEnd(39) + '║');
        console.log('  │ ║   Waste reduction: ' + (wasteDelta >= 0 ? '↓' : '↑') + Math.abs(wasteDelta).toFixed(1) + 'pp from rotation alone'.padEnd(36) + '║');
        console.log('  │ ║   Sheet savings:   ' + (sheetDelta >= 0 ? sheetDelta + ' fewer sheets' : Math.abs(sheetDelta) + ' more sheets').padEnd(37) + '║');
      }
      console.log('  │ ╚════════════════════════════════════════════════════════════╝');

      // Per-sheet details with rotation indicators
      let totalRotated = 0;
      let totalNonRotated = 0;
      for (let si = 0; si < winner.sheets.length; si++) {
        const s = winner.sheets[si];
        const yld = s.usedArea / sheetArea * 100;
        const freeArea = s.freeRects.reduce((sum, fr) => sum + fr.w * fr.h, 0);
        const rotCount = s.placements.filter(p => p.rotated).length;
        totalRotated += rotCount;
        totalNonRotated += s.placements.length - rotCount;

        console.log('  │');
        console.log('  │ Sheet #' + (si + 1) + ': ' + s.placements.length + ' parts (↻' + rotCount + ' rotated), yield=' + yld.toFixed(1) + '%, free=' + (freeArea / 1e6).toFixed(3) + 'm²');

        // Sort placements by Y then X for readable layout
        const sorted = [...s.placements].sort((a, b) => a.y - b.y || a.x - b.x);
        for (const pl of sorted) {
          const rotMarker = pl.rotated ? ' ↻ROT' : '';
          const origDim = pl.part.w + '×' + pl.part.h;
          const placedDim = pl.placedW + '×' + pl.placedH;
          console.log('  │   ' + pl.part.label.padEnd(24) + placedDim.padEnd(12) + '@(' + pl.x + ',' + pl.y + ')'.padEnd(14) + (pl.rotated ? '↻ was ' + origDim : ''));
        }

        // Show large free rects
        const bigFree = s.freeRects.filter(fr => fr.w * fr.h > 50000).sort((a, b) => b.w * b.h - a.w * a.h);
        if (bigFree.length > 0) {
          console.log('  │   Unused areas:');
          for (const fr of bigFree.slice(0, 4)) {
            console.log('  │     ' + fr.w + '×' + fr.h + 'mm @(' + fr.x + ',' + fr.y + ') = ' + (fr.w * fr.h / 1e6).toFixed(3) + 'm²');
          }
        }
      }
      console.log('  │');
      console.log('  │ Rotation stats: ' + totalRotated + '/' + (totalRotated + totalNonRotated) + ' parts rotated (' + ((totalRotated / (totalRotated + totalNonRotated)) * 100).toFixed(0) + '%)');

      // Waste breakdown
      const totalUsed = winner.sheets.reduce((s, x) => s + x.usedArea, 0);
      const totalSheetArea = winner.sheets.length * sheetArea;
      const totalTrimArea = winner.sheets.length * (rawSW * rawSH - usableW * usableH);
      const totalFreeArea = winner.sheets.reduce((s, x) => s + x.freeRects.reduce((ss, fr) => ss + fr.w * fr.h, 0), 0);
      const kerfArea = totalSheetArea - totalUsed - totalTrimArea - totalFreeArea;
      console.log('  │');
      console.log('  │ WASTE BREAKDOWN:');
      console.log('  │   Total sheet area:    ' + (totalSheetArea / 1e6).toFixed(3) + ' m² (' + winner.sheets.length + ' sheets)');
      console.log('  │   Part area:           ' + (totalUsed / 1e6).toFixed(3) + ' m² (' + winner.yieldPct.toFixed(1) + '%)');
      console.log('  │   Trim margins:        ' + (totalTrimArea / 1e6).toFixed(3) + ' m² (' + ((totalTrimArea / totalSheetArea) * 100).toFixed(1) + '%)');
      console.log('  │   Kerf + fragmentation:' + (Math.max(0, kerfArea) / 1e6).toFixed(3) + ' m² (' + (Math.max(0, kerfArea / totalSheetArea) * 100).toFixed(1) + '%)');
      console.log('  │   Usable waste (gaps): ' + (totalFreeArea / 1e6).toFixed(3) + ' m² (' + ((totalFreeArea / totalSheetArea) * 100).toFixed(1) + '%)');

      const isOptimal = winner.sheets.length === areaMinSheets;
      const nearOptimal = winner.sheets.length <= areaMinSheets + 1 && winner.yieldPct >= (totalPartArea / (winner.sheets.length * sheetArea)) * 100 * 0.95;

      console.log('  │');
      if (isOptimal) {
        console.log('  │ ✅ OPTIMAL: Achieved area-based minimum sheet count (' + areaMinSheets + ')');
      } else if (nearOptimal) {
        console.log('  │ ⚠️  NEAR-OPTIMAL: ' + winner.sheets.length + ' sheets (area min=' + areaMinSheets + '). Guillotine cuts prevent reaching minimum.');
      } else {
        console.log('  │ ❌ SUBOPTIMAL: ' + winner.sheets.length + ' sheets vs area min ' + areaMinSheets + '. Optimizer may have room for improvement.');
      }
      console.log('  └' + '─'.repeat(80));

      summaryRows.push(
        '  ' + proj.code.padEnd(16) + mat.padEnd(14) +
        String(matParts.length).padEnd(6) +
        (locked ? locked.waste.toFixed(1) + '% / ' + locked.sheets + 's' : 'N/A').padEnd(16) +
        winner.waste.toFixed(1) + '% / ' + winner.sheets.length + 's'.padEnd(2) + '  '.padEnd(4) +
        (locked ? (wasteDelta >= 0 ? '↓' : '↑') + Math.abs(wasteDelta).toFixed(1) + 'pp / ' + (sheetDelta >= 0 ? '-' : '+') + Math.abs(sheetDelta) + 's' : '').padEnd(16) +
        winner.yieldPct.toFixed(1) + '%  '.padEnd(2) +
        totalRotated + '/' + (totalRotated + totalNonRotated) + ' rot  ' +
        (isOptimal ? '✅ OPT' : nearOptimal ? '⚠️  NEAR' : '❌ SUB')
      );
    }
  }

  // Summary
  console.log('\n\n' + '═'.repeat(85));
  console.log('  SUMMARY: GRAIN-LOCKED vs ROTATION-UNLOCKED');
  console.log('═'.repeat(85));
  console.log('  ' + 'Project'.padEnd(16) + 'Material'.padEnd(14) + 'Parts'.padEnd(6) + 'Grain-Locked'.padEnd(16) + 'Rotation-Free'.padEnd(16) + 'Δ (rotation)'.padEnd(16) + 'Yield'.padEnd(8) + 'Rotated'.padEnd(12) + 'Status');
  console.log('  ' + '─'.repeat(110));
  for (const row of summaryRows) console.log(row);
  console.log('  ' + '─'.repeat(110));

  console.log('\n' + '═'.repeat(85));
  console.log('  ANALYSIS: IMPACT OF GRAIN CONSTRAINTS ON WASTE');
  console.log('═'.repeat(85));
  console.log('  Rotation unlocks height pairing that was impossible under grain lock.');
  console.log('  Example: 720mm part rotated to 720→width means its HEIGHT becomes the');
  console.log('  original WIDTH (e.g., 560mm), which CAN pair with other heights.');
  console.log('');
  console.log('  Key: if waste is STILL >25-30% even with full rotation,');
  console.log('  the optimizer has algorithmic room for improvement.');
  console.log('  If waste drops to ~15-20%, the optimizer is near-professional quality.');
  console.log('═'.repeat(85));
}

benchmark().catch(e => console.error('Fatal:', e));
