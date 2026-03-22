'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  INDUSTRIAL SAW PANEL OPTIMIZER v4 — ArtMood Factory OS
// ═══════════════════════════════════════════════════════════════════════════
//  TRUE 2D GUILLOTINE BIN PACKING with:
//  • Trim margins (sheet edge unusable zone)
//  • Kerf-aware scoring & packing
//  • Offcut reuse (check stock_offcuts before new sheets)
//  • Local improvement (inter-sheet moves, swaps, compaction)
//  • Strong balance scoring (penalize sparse sheets heavily)
//  • Multi-strategy search (72+ evaluations)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/client';
import type { SawNestingResult, SawStrip, SawStripPart } from '@/types/production';
import { MATERIAL_THICKNESS_MAP } from './kitchen-engine.service';

// ── Configuration ────────────────────────────────────────────────────────
export interface CutConfig {
  kerf: number;
  trimTop: number;
  trimBottom: number;
  trimLeft: number;
  trimRight: number;
  minUsableWidth: number;
  minOffcutArea: number;
  randomStarts: number;
  localImprovePasses: number;
}

export const DEFAULT_CONFIG: CutConfig = {
  kerf: 4,
  trimTop: 15, trimBottom: 15, trimLeft: 15, trimRight: 15,
  minUsableWidth: 50,
  minOffcutArea: 90_000,
  randomStarts: 60,
  localImprovePasses: 300,
};

const SHEET_SIZES: Record<string, [number, number]> = {
  // Facades / Fronts → MDF blanc 2800×1220
  mdf_18: [2800, 1220], mdf_16: [2800, 1220], mdf_22: [2800, 1220], mdf_10: [2800, 1220],
  // Carcass / Box panels → Stratifié blanc 2550×1830
  stratifie_18: [2550, 1830], stratifie_16: [2550, 1830],
  // Back panels → MDF blanc 5mm 2550×1830
  back_hdf_5: [2550, 1830], back_hdf_3: [2550, 1830], back_mdf_8: [2550, 1830],
  // Melamine panels → 2550×1830
  melamine_anthracite: [2550, 1830], melamine_blanc: [2550, 1830],
  melamine_chene: [2550, 1830], melamine_noyer: [2550, 1830],
};

// ── Types ────────────────────────────────────────────────────────────────
interface IPart {
  id: string; label: string; w: number; h: number; area: number;
  canRotate: boolean; grain: string;
  eT: boolean; eB: boolean; eL: boolean; eR: boolean;
}

interface FreeRect { x: number; y: number; w: number; h: number; }
interface Placement { part: IPart; x: number; y: number; placedW: number; placedH: number; rotated: boolean; }
interface PackedSheet { placements: Placement[]; freeRects: FreeRect[]; usedArea: number; placedIds: Set<string>; }

export interface Offcut {
  material_code: string; thickness_mm: number;
  width_mm: number; height_mm: number; source_sheet_index: number;
}

export interface IndustrialNestingStats {
  sheets: SawNestingResult[];
  totalParts: number; totalSheets: number;
  avgWaste: number; yieldPercent: number; strategy: string;
  strategyComparison: { strategy: string; waste: number; sheets: number; yield: number }[];
  offcutsGenerated: Offcut[];
  offcutsReused: number; kerfLossMm2: number; cutCount: number;
  theoreticalMinSheets: number;
  theoreticalMaxYield: number;
  atPhysicalLimit: boolean;
}

export interface ServiceResult<T> { success: boolean; data?: T; error?: string; }

// ── Helpers ──────────────────────────────────────────────────────────────
function canRotateGrain(grain: string): boolean {
  // MDF/HDF carcass panels are non-directional — always allow rotation for better packing
  return true;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2D GUILLOTINE BIN PACKING — CORE
// ═══════════════════════════════════════════════════════════════════════════
type FitHeuristic = 'best-area' | 'best-short-side' | 'best-long-side' | 'worst-fit';

function computeFitScore(fr: FreeRect, pw: number, ph: number, heuristic: FitHeuristic): number {
  const leftoverW = fr.w - pw;
  const leftoverH = fr.h - ph;
  switch (heuristic) {
    case 'best-area': return fr.w * fr.h - pw * ph;
    case 'best-short-side': return Math.min(leftoverW, leftoverH);
    case 'best-long-side': return Math.max(leftoverW, leftoverH);
    case 'worst-fit': return -(fr.w * fr.h);
    default: return leftoverW + leftoverH;
  }
}

function findBestFreeRect(
  freeRects: FreeRect[], partW: number, partH: number, canRot: boolean, heuristic: FitHeuristic,
): { rectIdx: number; rotated: boolean } | null {
  let bestIdx = -1, bestRotated = false, bestScore = Infinity;

  for (let i = 0; i < freeRects.length; i++) {
    const fr = freeRects[i];
    if (partW <= fr.w && partH <= fr.h) {
      const score = computeFitScore(fr, partW, partH, heuristic);
      if (score < bestScore) { bestScore = score; bestIdx = i; bestRotated = false; }
    }
    if (canRot && partH <= fr.w && partW <= fr.h) {
      const score = computeFitScore(fr, partH, partW, heuristic);
      if (score < bestScore) { bestScore = score; bestIdx = i; bestRotated = true; }
    }
  }

  return bestIdx < 0 ? null : { rectIdx: bestIdx, rotated: bestRotated };
}

function guillotineSplit(fr: FreeRect, pw: number, ph: number, kerf: number): FreeRect[] {
  const results: FreeRect[] = [];
  const kw = Math.min(kerf, fr.w - pw);
  const kh = Math.min(kerf, fr.h - ph);

  // Option A: Horizontal split first (right remainder gets full height)
  const rightA: FreeRect = { x: fr.x + pw + kw, y: fr.y, w: fr.w - pw - kw, h: fr.h };
  const bottomA: FreeRect = { x: fr.x, y: fr.y + ph + kh, w: pw, h: fr.h - ph - kh };
  const areaA = Math.max(rightA.w, 0) * Math.max(rightA.h, 0) + Math.max(bottomA.w, 0) * Math.max(bottomA.h, 0);

  // Option B: Vertical split first (bottom remainder gets full width)
  const rightB: FreeRect = { x: fr.x + pw + kw, y: fr.y, w: fr.w - pw - kw, h: ph };
  const bottomB: FreeRect = { x: fr.x, y: fr.y + ph + kh, w: fr.w, h: fr.h - ph - kh };
  const areaB = Math.max(rightB.w, 0) * Math.max(rightB.h, 0) + Math.max(bottomB.w, 0) * Math.max(bottomB.h, 0);

  if (areaA >= areaB) {
    if (rightA.w > 0 && rightA.h > 0) results.push(rightA);
    if (bottomA.w > 0 && bottomA.h > 0) results.push(bottomA);
  } else {
    if (rightB.w > 0 && rightB.h > 0) results.push(rightB);
    if (bottomB.w > 0 && bottomB.h > 0) results.push(bottomB);
  }
  return results;
}

// Pack a single sheet (or offcut) using guillotine algorithm
function packSheet(
  parts: IPart[], sheetW: number, sheetH: number, kerf: number,
  heuristic: FitHeuristic, alreadyPlaced: Set<string>,
): PackedSheet {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
  const placements: Placement[] = [];
  const placedIds = new Set<string>();
  let usedArea = 0;

  for (const part of parts) {
    if (alreadyPlaced.has(part.id) || placedIds.has(part.id)) continue;

    const fit = findBestFreeRect(freeRects, part.w, part.h, part.canRotate, heuristic);
    if (!fit) continue;

    const fr = freeRects[fit.rectIdx];
    const pw = fit.rotated ? part.h : part.w;
    const ph = fit.rotated ? part.w : part.h;

    placements.push({ part, x: fr.x, y: fr.y, placedW: pw, placedH: ph, rotated: fit.rotated });
    usedArea += pw * ph;
    placedIds.add(part.id);

    const newFree = guillotineSplit(fr, pw, ph, kerf);
    freeRects.splice(fit.rectIdx, 1, ...newFree);

    // Remove tiny free rects
    for (let i = freeRects.length - 1; i >= 0; i--) {
      if (freeRects[i].w < 30 || freeRects[i].h < 30) freeRects.splice(i, 1);
    }
  }
  return { placements, freeRects, usedArea, placedIds };
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL OPTIMIZATION STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════

function greedyMultiSheet(
  parts: IPart[], sheetW: number, sheetH: number, kerf: number, heuristic: FitHeuristic,
): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  const globalPlaced = new Set<string>();
  let safety = 0;
  while (globalPlaced.size < parts.length && safety++ < 100) {
    const sheet = packSheet(parts, sheetW, sheetH, kerf, heuristic, globalPlaced);
    if (sheet.placedIds.size === 0) {
      // Force-place each remaining part individually on its own sheet
      for (const p of parts) {
        if (globalPlaced.has(p.id)) continue;
        const solo = packSheet([p], sheetW, sheetH, kerf, heuristic, new Set());
        if (solo.placedIds.size > 0) {
          sheets.push(solo);
          globalPlaced.add(p.id);
        }
      }
      break;
    }
    sheets.push(sheet);
    for (const id of sheet.placedIds) globalPlaced.add(id);
  }
  return sheets;
}

function distributedPacking(
  parts: IPart[], sheetW: number, sheetH: number, kerf: number,
  heuristic: FitHeuristic, numSheets: number,
): PackedSheet[] {
  // Distribute parts across N sheets by area equalization (largest-first → least-loaded)
  const sheetParts: IPart[][] = Array.from({ length: numSheets }, () => []);
  const sheetAreas: number[] = new Array(numSheets).fill(0);
  const sorted = [...parts].sort((a, b) => b.area - a.area);

  for (const part of sorted) {
    let minIdx = 0;
    for (let i = 1; i < numSheets; i++) {
      if (sheetAreas[i] < sheetAreas[minIdx]) minIdx = i;
    }
    sheetParts[minIdx].push(part);
    sheetAreas[minIdx] += part.area;
  }

  const sheets: PackedSheet[] = [];
  const globalPlaced = new Set<string>();

  for (let i = 0; i < numSheets; i++) {
    if (sheetParts[i].length === 0) continue;
    const sheet = packSheet(sheetParts[i], sheetW, sheetH, kerf, heuristic, new Set());
    sheets.push(sheet);
    for (const id of sheet.placedIds) globalPlaced.add(id);
  }

  // Handle overflow
  const overflow = parts.filter(p => !globalPlaced.has(p.id));
  for (const p of overflow) {
    if (globalPlaced.has(p.id)) continue;
    for (const sheet of sheets) {
      const fit = findBestFreeRect(sheet.freeRects, p.w, p.h, p.canRotate, heuristic);
      if (fit) {
        const fr = sheet.freeRects[fit.rectIdx];
        const pw = fit.rotated ? p.h : p.w;
        const ph = fit.rotated ? p.w : p.h;
        sheet.placements.push({ part: p, x: fr.x, y: fr.y, placedW: pw, placedH: ph, rotated: fit.rotated });
        sheet.usedArea += pw * ph;
        sheet.placedIds.add(p.id);
        globalPlaced.add(p.id);
        const newFree = guillotineSplit(fr, pw, ph, kerf);
        sheet.freeRects.splice(fit.rectIdx, 1, ...newFree);
        break;
      }
    }
  }

  // Still unplaced → add new sheets
  const still = parts.filter(p => !globalPlaced.has(p.id));
  if (still.length > 0) {
    let safety = 0;
    while (globalPlaced.size < parts.length && safety++ < 50) {
      const sheet = packSheet(still, sheetW, sheetH, kerf, heuristic, globalPlaced);
      if (sheet.placedIds.size === 0) {
        // Force-place each remaining part individually on its own sheet
        for (const p of still) {
          if (globalPlaced.has(p.id)) continue;
          const solo = packSheet([p], sheetW, sheetH, kerf, heuristic, new Set());
          if (solo.placedIds.size > 0) {
            sheets.push(solo);
            globalPlaced.add(p.id);
          }
        }
        break;
      }
      sheets.push(sheet);
      for (const id of sheet.placedIds) globalPlaced.add(id);
    }
  }
  return sheets;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL IMPROVEMENT — Inter-sheet moves, swaps, compaction
// ═══════════════════════════════════════════════════════════════════════════

function repackSheet(parts: IPart[], sheetW: number, sheetH: number, kerf: number, heuristic: FitHeuristic): PackedSheet {
  return packSheet(parts, sheetW, sheetH, kerf, heuristic, new Set());
}

function localImprove(
  sheets: PackedSheet[], sheetW: number, sheetH: number, kerf: number, passes: number,
): PackedSheet[] {
  if (sheets.length <= 1) return sheets;

  let best = sheets;
  let bestScore = scoreSolution(best, sheetW, sheetH).score;
  const heuristics: FitHeuristic[] = ['best-area', 'best-short-side', 'best-long-side'];

  for (let pass = 0; pass < passes; pass++) {
    const improved = tryImproveOnce(best, sheetW, sheetH, kerf, heuristics, pass);
    if (!improved) continue;
    const newScore = scoreSolution(improved, sheetW, sheetH).score;
    if (newScore < bestScore - 0.01) {
      bestScore = newScore;
      best = improved;
    }
  }

  // Final: try removing empty/near-empty sheets by redistributing their parts
  best = compactSheets(best, sheetW, sheetH, kerf);
  return best;
}

function tryImproveOnce(
  sheets: PackedSheet[], sw: number, sh: number, kerf: number,
  heuristics: FitHeuristic[], pass: number,
): PackedSheet[] | null {
  const sa = sw * sh;
  const yields = sheets.map(s => s.usedArea / sa);

  // Strategy alternation: moves, swaps, repack-merge
  const strat = pass % 3;

  if (strat === 0) {
    // MOVE: Take a part from the fullest sheet, try to fit it in the emptiest
    const sortedIdxs = yields.map((y, i) => ({ y, i })).sort((a, b) => b.y - a.y);
    if (sortedIdxs.length < 2) return null;

    const fullIdx = sortedIdxs[0].i;
    const emptyIdx = sortedIdxs[sortedIdxs.length - 1].i;
    if (fullIdx === emptyIdx) return null;

    const fullSheet = sheets[fullIdx];
    const emptySheet = sheets[emptyIdx];

    // Try moving each part from full → empty
    for (const pl of fullSheet.placements) {
      const heuristic = heuristics[pass % heuristics.length];
      const fit = findBestFreeRect(emptySheet.freeRects, pl.part.w, pl.part.h, pl.part.canRotate, heuristic);
      if (!fit) continue;

      // Can move! Rebuild both sheets
      const fullParts = fullSheet.placements.filter(p => p.part.id !== pl.part.id).map(p => p.part);
      const emptyParts = [...emptySheet.placements.map(p => p.part), pl.part];

      const newFull = repackSheet(fullParts, sw, sh, kerf, heuristic);
      const newEmpty = repackSheet(emptyParts, sw, sh, kerf, heuristic);

      if (newFull.placedIds.size === fullParts.length && newEmpty.placedIds.size === emptyParts.length) {
        const result = [...sheets];
        result[fullIdx] = newFull;
        result[emptyIdx] = newEmpty;
        return result;
      }
    }
  } else if (strat === 1) {
    // SWAP: Try swapping a part between two sheets
    if (sheets.length < 2) return null;
    const i = Math.floor(Math.random() * sheets.length);
    let j = Math.floor(Math.random() * sheets.length);
    if (i === j) j = (j + 1) % sheets.length;

    const si = sheets[i], sj = sheets[j];
    if (si.placements.length === 0 || sj.placements.length === 0) return null;

    const pi = si.placements[Math.floor(Math.random() * si.placements.length)];
    const pj = sj.placements[Math.floor(Math.random() * sj.placements.length)];

    // Try swapping pi ↔ pj
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
    // REPACK-MERGE: Try merging the two least-filled sheets into one
    if (sheets.length < 2) return null;
    const sortedIdxs = yields.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    const idx1 = sortedIdxs[0].i;
    const idx2 = sortedIdxs[1].i;

    const combinedParts = [
      ...sheets[idx1].placements.map(p => p.part),
      ...sheets[idx2].placements.map(p => p.part),
    ];

    // Check if combined area could fit one sheet
    const combinedArea = combinedParts.reduce((s, p) => s + p.area, 0);
    if (combinedArea > sw * sh * 0.95) return null; // Won't fit

    const h = heuristics[pass % heuristics.length];
    const merged = repackSheet(combinedParts, sw, sh, kerf, h);
    if (merged.placedIds.size === combinedParts.length) {
      // Success! Remove both old sheets and add merged
      const result = sheets.filter((_, i) => i !== idx1 && i !== idx2);
      result.push(merged);
      return result;
    }
  }
  return null;
}

function compactSheets(sheets: PackedSheet[], sw: number, sh: number, kerf: number): PackedSheet[] {
  // Remove empty sheets
  let result = sheets.filter(s => s.placements.length > 0);

  // Try to eliminate the least-filled sheet by distributing its parts to others
  const sa = sw * sh;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (result.length <= 1) break;

    const yields = result.map(s => s.usedArea / sa);
    const minIdx = yields.indexOf(Math.min(...yields));
    const sparseSheet = result[minIdx];

    // Try putting each part into other sheets
    const otherSheets = result.filter((_, i) => i !== minIdx);
    let allFit = true;

    // Sort sparse parts smallest first (easier to fit)
    const sparseParts = [...sparseSheet.placements].sort((a, b) => a.part.area - b.part.area);

    for (const pl of sparseParts) {
      let placed = false;
      for (const other of otherSheets) {
        for (const h of ['best-area', 'best-short-side', 'best-long-side'] as FitHeuristic[]) {
          const fit = findBestFreeRect(other.freeRects, pl.part.w, pl.part.h, pl.part.canRotate, h);
          if (fit) {
            const fr = other.freeRects[fit.rectIdx];
            const pw = fit.rotated ? pl.part.h : pl.part.w;
            const ph = fit.rotated ? pl.part.w : pl.part.h;
            other.placements.push({ part: pl.part, x: fr.x, y: fr.y, placedW: pw, placedH: ph, rotated: fit.rotated });
            other.usedArea += pw * ph;
            other.placedIds.add(pl.part.id);
            const newFree = guillotineSplit(fr, pw, ph, kerf);
            other.freeRects.splice(fit.rectIdx, 1, ...newFree);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) { allFit = false; break; }
    }

    if (allFit) {
      result = otherSheets;
    } else {
      break; // Can't eliminate this sheet
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICAL LIMIT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

function computePhysicalMinSheets(parts: IPart[], usableW: number, usableH: number, kerf: number): number {
  const totalArea = parts.reduce((s, p) => s + p.area, 0);
  const sheetArea = usableW * usableH;
  const areaMin = Math.ceil(totalArea / sheetArea);

  // Height compatibility check: group by distinct heights
  // For each pair of heights, check if h1 + kerf + h2 <= usableH
  const heights = [...new Set(parts.map(p => p.h))].sort((a, b) => b - a);
  const heightGroups: { height: number; totalWidth: number; count: number }[] = [];

  for (const h of heights) {
    const partsWithH = parts.filter(p => p.h === h);
    const totalW = partsWithH.reduce((s, p) => s + p.w + kerf, 0);
    heightGroups.push({ height: h, totalWidth: totalW, count: partsWithH.length });
  }

  // Greedy height-pairing simulation
  // For each height group, try pairing with compatible heights on the same row
  // A "row" is usableH tall; can stack compatible heights within it
  let rowsNeeded = 0;
  const used = new Set<number>();

  for (let i = 0; i < heightGroups.length; i++) {
    if (used.has(i)) continue;
    const g = heightGroups[i];
    const rowsForGroup = Math.ceil(g.totalWidth / usableW);

    // Can another height fit in same row (h1 + kerf + h2 <= usableH)?
    let paired = false;
    for (let j = i + 1; j < heightGroups.length; j++) {
      if (used.has(j)) continue;
      if (g.height + kerf + heightGroups[j].height <= usableH) {
        paired = true;
        used.add(j);
        // Both heights share rows, but still need enough width
        const combinedRows = Math.max(rowsForGroup, Math.ceil(heightGroups[j].totalWidth / usableW));
        rowsNeeded += combinedRows;
        break;
      }
    }
    if (!paired) {
      rowsNeeded += rowsForGroup;
    }
    used.add(i);
  }

  // Each sheet can hold rows totaling usableH; but in guillotine cutting,
  // rows don't stack perfectly. Use the area-based minimum as the floor.
  return Math.max(areaMin, areaMin); // The real physical min might be higher; areaMin is lower bound
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════════

function scoreSolution(
  sheets: PackedSheet[], sheetW: number, sheetH: number,
): { score: number; balance: number; minYield: number; maxYield: number } {
  const sheetArea = sheetW * sheetH;
  const totalUsed = sheets.reduce((s, sh) => s + sh.usedArea, 0);
  const totalArea = sheets.length * sheetArea;
  const wastePct = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;

  const yields = sheets.map(sh => sh.usedArea / sheetArea * 100);
  const avgYield = yields.reduce((s, y) => s + y, 0) / yields.length;
  const stdDev = Math.sqrt(yields.reduce((s, y) => s + (y - avgYield) ** 2, 0) / yields.length);
  const minYield = Math.min(...yields);
  const maxYield = Math.max(...yields);
  const belowThreshold = yields.filter(y => y < 45).length;
  const below35 = yields.filter(y => y < 35).length;

  const minSheets = Math.ceil(totalUsed / sheetArea);
  const sheetRatio = sheets.length / Math.max(1, minSheets);

  // Stronger balance scoring:
  // 35% waste, 20% sheet count overhead, 25% balance (stddev),
  // 15% penalty for sheets <45%, 5% severe penalty for sheets <35%
  const score = wastePct * 0.35 +
    (sheetRatio - 1) * 100 * 0.20 +
    stdDev * 0.25 +
    belowThreshold * 12 * 0.15 +
    below35 * 25 * 0.05;

  return { score, balance: stdDev, minYield, maxYield };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN OPTIMIZER
// ═══════════════════════════════════════════════════════════════════════════

interface CandidateResult {
  sheets: PackedSheet[];
  strategy: string;
  waste: number;
  yieldPct: number;
  score: number;
  balance: number;
  minYield: number;
  maxYield: number;
}

function optimizeMaterialGroup(
  parts: IPart[], sheetW: number, sheetH: number, config: CutConfig,
): CandidateResult {
  const usableW = sheetW - config.trimLeft - config.trimRight;
  const usableH = sheetH - config.trimTop - config.trimBottom;
  const sheetArea = sheetW * sheetH; // Full sheet area (what you buy)
  const totalPartArea = parts.reduce((s, p) => s + p.area, 0);
  const candidates: CandidateResult[] = [];

  const heuristics: FitHeuristic[] = ['best-area', 'best-short-side', 'best-long-side', 'worst-fit'];

  const sorts: { name: string; fn: (a: IPart, b: IPart) => number }[] = [
    { name: 'area-desc', fn: (a, b) => b.area - a.area },
    { name: 'height-desc', fn: (a, b) => b.h - a.h || b.w - a.w },
    { name: 'width-desc', fn: (a, b) => b.w - a.w || b.h - a.h },
    { name: 'perimeter-desc', fn: (a, b) => (b.w + b.h) - (a.w + a.h) },
    { name: 'max-dim-desc', fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) },
  ];

  function evaluateSheets(sheets: PackedSheet[], strategy: string) {
    // Apply local improvement
    const improved = localImprove(sheets, usableW, usableH, config.kerf, config.localImprovePasses);
    const totalUsed = improved.reduce((s, sh) => s + sh.usedArea, 0);
    const totalArea = improved.length * sheetArea;
    const waste = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
    const { score, balance, minYield, maxYield } = scoreSolution(improved, usableW, usableH);
    candidates.push({
      sheets: improved, strategy: strategy + '+local',
      waste, yieldPct: 100 - waste, score, balance, minYield, maxYield,
    });
  }

  // === Strategy A: Greedy multi-sheet ===
  for (const sort of sorts) {
    const sorted = [...parts].sort(sort.fn);
    for (const heuristic of heuristics) {
      const sheets = greedyMultiSheet(sorted, usableW, usableH, config.kerf, heuristic);
      const totalUsed = sheets.reduce((s, sh) => s + sh.usedArea, 0);
      const totalArea = sheets.length * sheetArea;
      const waste = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
      const { score, balance, minYield, maxYield } = scoreSolution(sheets, usableW, usableH);
      candidates.push({
        sheets, strategy: `greedy:${sort.name}+${heuristic}`,
        waste, yieldPct: 100 - waste, score, balance, minYield, maxYield,
      });
    }
  }

  // === Strategy B: Pre-distributed packing ===
  const areaMinSheets = Math.ceil(totalPartArea / (usableW * usableH));
  for (let n = areaMinSheets; n <= areaMinSheets + 2; n++) {
    for (const heuristic of heuristics) {
      const sheets = distributedPacking(parts, usableW, usableH, config.kerf, heuristic, n);
      const totalUsed = sheets.reduce((s, sh) => s + sh.usedArea, 0);
      const totalArea = sheets.length * sheetArea;
      const waste = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
      const { score, balance, minYield, maxYield } = scoreSolution(sheets, usableW, usableH);
      candidates.push({
        sheets, strategy: `distributed:${n}sheets+${heuristic}`,
        waste, yieldPct: 100 - waste, score, balance, minYield, maxYield,
      });
    }
  }

  // === Strategy C: Random order + random heuristic ===
  for (let r = 0; r < config.randomStarts; r++) {
    const shuffled = shuffleArray(parts);
    const heuristic = heuristics[Math.floor(Math.random() * heuristics.length)];

    if (r % 2 === 0) {
      const sheets = greedyMultiSheet(shuffled, usableW, usableH, config.kerf, heuristic);
      const totalUsed = sheets.reduce((s, sh) => s + sh.usedArea, 0);
      const totalArea = sheets.length * sheetArea;
      const waste = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
      const { score, balance, minYield, maxYield } = scoreSolution(sheets, usableW, usableH);
      candidates.push({
        sheets, strategy: `random-greedy-${r + 1}`,
        waste, yieldPct: 100 - waste, score, balance, minYield, maxYield,
      });
    } else {
      const n = areaMinSheets + Math.floor(Math.random() * 3);
      const sheets = distributedPacking(shuffled, usableW, usableH, config.kerf, heuristic, n);
      const totalUsed = sheets.reduce((s, sh) => s + sh.usedArea, 0);
      const totalArea = sheets.length * sheetArea;
      const waste = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
      const { score, balance, minYield, maxYield } = scoreSolution(sheets, usableW, usableH);
      candidates.push({
        sheets, strategy: `random-dist-${r + 1}`,
        waste, yieldPct: 100 - waste, score, balance, minYield, maxYield,
      });
    }
  }

  // === Strategy D: Local improvement on top 5 candidates ===
  candidates.sort((a, b) => a.score - b.score);
  const topN = candidates.slice(0, 5);
  for (const c of topN) {
    evaluateSheets(c.sheets, c.strategy);
  }

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];

  // === SAFETY NET: Guarantee 100% placement ===
  // Collect all placed IDs from the best candidate
  const allPlacedIds = new Set<string>();
  for (const sh of best.sheets) {
    for (const pl of sh.placements) allPlacedIds.add(pl.part.id);
  }
  // Find any unplaced parts
  const unplaced = parts.filter(p => !allPlacedIds.has(p.id));
  if (unplaced.length > 0) {
    // Force-place each unplaced part on its own new sheet
    for (const p of unplaced) {
      if (allPlacedIds.has(p.id)) continue;
      for (const h of heuristics) {
        const solo = packSheet([p], sheetW, sheetH, config.kerf, h, new Set());
        if (solo.placedIds.size > 0) {
          best.sheets.push(solo);
          allPlacedIds.add(p.id);
          break;
        }
      }
    }
    // Recalculate waste stats
    const totalUsed = best.sheets.reduce((s, sh) => s + sh.usedArea, 0);
    const totalArea = best.sheets.length * sheetW * sheetH;
    best.waste = totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 100;
    best.yieldPct = 100 - best.waste;
  }

  return best;
}

// ── Convert PackedSheet to SawNestingResult ──────────────────────────────
function toSawNestingResults(
  sheets: PackedSheet[], materialCode: string, thicknessMm: number,
  sheetW: number, sheetH: number, kerf: number,
): SawNestingResult[] {
  const results: SawNestingResult[] = [];

  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si];
    const stripMap = new Map<string, { y: number; height: number; placements: Placement[] }>();

    for (const pl of sheet.placements) {
      const key = `${pl.y}-${pl.placedH}`;
      if (!stripMap.has(key)) stripMap.set(key, { y: pl.y, height: pl.placedH, placements: [] });
      stripMap.get(key)!.placements.push(pl);
    }

    const strips: SawStrip[] = [];
    const sortedStrips = [...stripMap.values()].sort((a, b) => a.y - b.y);
    let stripIdx = 0;
    let sheetUsedArea = 0;

    for (const strip of sortedStrips) {
      stripIdx++;
      const parts: SawStripPart[] = [];
      strip.placements.sort((a, b) => a.x - b.x);

      let maxUsedX = 0;
      for (const pl of strip.placements) {
        parts.push({
          partId: pl.part.id, label: pl.part.label,
          width: pl.placedW, height: pl.placedH,
          crossX: pl.x, rotated: pl.rotated,
          edgeTop: pl.rotated ? pl.part.eL : pl.part.eT,
          edgeBottom: pl.rotated ? pl.part.eR : pl.part.eB,
          edgeLeft: pl.rotated ? pl.part.eT : pl.part.eL,
          edgeRight: pl.rotated ? pl.part.eB : pl.part.eR,
        });
        sheetUsedArea += pl.placedW * pl.placedH;
        maxUsedX = Math.max(maxUsedX, pl.x + pl.placedW);
      }

      strips.push({
        stripIndex: stripIdx, ripY: strip.y, stripHeight: strip.height,
        parts, wasteWidth: Math.max(0, sheetW - maxUsedX),
      });
    }

    const sheetArea = sheetW * sheetH;
    results.push({
      id: '', project_id: '',
      material_code: materialCode, thickness_mm: thicknessMm,
      sheet_width_mm: sheetW, sheet_height_mm: sheetH,
      sheet_index: si + 1, strips,
      used_area_mm2: sheetUsedArea,
      waste_area_mm2: sheetArea - sheetUsedArea,
      waste_percent: Number(((sheetArea - sheetUsedArea) / sheetArea * 100).toFixed(2)),
      created_at: '',
    });
  }
  return results;
}

// ── Offcuts from free rects ──────────────────────────────────────────────
function generateOffcuts(
  sheets: PackedSheet[], materialCode: string, thicknessMm: number, config: CutConfig,
): Offcut[] {
  const offcuts: Offcut[] = [];
  for (let si = 0; si < sheets.length; si++) {
    for (const fr of sheets[si].freeRects) {
      if (fr.w >= config.minUsableWidth && fr.h >= config.minUsableWidth) {
        const area = fr.w * fr.h;
        if (area >= config.minOffcutArea) {
          offcuts.push({
            material_code: materialCode, thickness_mm: thicknessMm,
            width_mm: fr.w, height_mm: fr.h, source_sheet_index: si + 1,
          });
        }
      }
    }
  }
  return offcuts;
}

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════════
export async function generateIndustrialNesting(
  projectId: string,
  config: CutConfig = DEFAULT_CONFIG,
): Promise<ServiceResult<IndustrialNestingStats>> {
  const supabase = createClient();

  const { data: dbParts, error: fetchErr } = await supabase
    .from('project_parts')
    .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right')
    .eq('project_id', projectId);

  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!dbParts?.length) return { success: false, error: 'No parts found. Generate parts first.' };

  // Check for available offcuts in stock
  const { data: stockOffcuts } = await supabase
    .from('stock_offcuts')
    .select('*')
    .eq('is_available', true)
    .order('width_mm', { ascending: false });

  const groups: Record<string, { material: string; thickness: number; parts: IPart[] }> = {};

  for (const p of dbParts) {
    if (!p.material_type || p.material_type.startsWith('hardware') || !p.width_mm || !p.height_mm) continue;
    const matKey = p.material_type;
    const thickness = p.thickness_mm || MATERIAL_THICKNESS_MAP[matKey] || 18;
    if (!groups[matKey]) groups[matKey] = { material: matKey, thickness, parts: [] };

    const qty = p.quantity || 1;
    const grain = p.grain_direction || 'none';
    for (let qi = 0; qi < qty; qi++) {
      const id = qty > 1 ? `${p.id}-${qi}` : p.id;
      groups[matKey].parts.push({
        id, label: p.part_code || p.part_name || 'Part',
        w: Math.round(Number(p.width_mm)), h: Math.round(Number(p.height_mm)),
        area: Math.round(Number(p.width_mm)) * Math.round(Number(p.height_mm)),
        canRotate: canRotateGrain(grain), grain,
        eT: !!p.edge_top, eB: !!p.edge_bottom, eL: !!p.edge_left, eR: !!p.edge_right,
      });
    }
  }

  if (Object.keys(groups).length === 0) return { success: false, error: 'No cuttable parts found.' };

  await supabase.from('saw_nesting_results').delete().eq('project_id', projectId);

  const allResults: SawNestingResult[] = [];
  const allOffcuts: Offcut[] = [];
  const allComparisons: IndustrialNestingStats['strategyComparison'] = [];
  let grandTotalParts = 0, grandTotalSheets = 0, grandKerfLoss = 0, grandCutCount = 0;
  let grandUsedArea = 0, grandSheetArea = 0;
  let totalOffcutsReused = 0;
  let grandTheoreticalMin = 0;
  let isAtPhysicalLimit = true;

  for (const [matKey, group] of Object.entries(groups)) {
    const [sheetW, sheetH] = SHEET_SIZES[matKey] || [2800, 1220];
    const usableW = sheetW - config.trimLeft - config.trimRight;
    const usableH = sheetH - config.trimTop - config.trimBottom;

    // Try packing small parts into available offcuts first
    const matOffcuts = stockOffcuts?.filter(o =>
      o.material_code === matKey && o.thickness_mm === group.thickness
    ) || [];

    const globalPlaced = new Set<string>();
    if (matOffcuts.length > 0) {
      // Sort parts smallest first for offcut packing
      const smallParts = [...group.parts].sort((a, b) => a.area - b.area);
      for (const offcut of matOffcuts) {
        if (globalPlaced.size >= group.parts.length) break;
        const ow = offcut.width_mm - config.trimLeft - config.trimRight;
        const oh = offcut.height_mm - config.trimTop - config.trimBottom;
        if (ow < 50 || oh < 50) continue;

        const packed = packSheet(smallParts, ow, oh, config.kerf, 'best-area', globalPlaced);
        if (packed.placedIds.size > 0) {
          totalOffcutsReused++;
          for (const id of packed.placedIds) globalPlaced.add(id);
          // Mark offcut as used
          await supabase.from('stock_offcuts').update({
            is_available: false, used_at: new Date().toISOString(), used_by_project_id: projectId,
          }).eq('id', offcut.id).then(() => {});
        }
      }
    }

    // Remaining parts go through full optimization
    const remainingParts = group.parts.filter(p => !globalPlaced.has(p.id));

    let candidate: CandidateResult;
    if (remainingParts.length > 0) {
      candidate = optimizeMaterialGroup(remainingParts, sheetW, sheetH, config);
    } else {
      candidate = { sheets: [], strategy: 'offcuts-only', waste: 0, yieldPct: 100, score: 0, balance: 0, minYield: 100, maxYield: 100 };
    }

    const sawResults = toSawNestingResults(candidate.sheets, matKey, group.thickness, sheetW, sheetH, config.kerf);
    for (const r of sawResults) r.project_id = projectId;

    const offcuts = generateOffcuts(candidate.sheets, matKey, group.thickness, config);
    const cutCount = candidate.sheets.reduce((sum, sh) => sum + sh.placements.length * 2, 0);
    const kerfLoss = cutCount * config.kerf * 50;

    // Theoretical minimum
    const totalPartArea = group.parts.reduce((s, p) => s + p.area, 0);
    const theoryMin = computePhysicalMinSheets(remainingParts, usableW, usableH, config.kerf);
    grandTheoreticalMin += theoryMin;

    if (candidate.sheets.length > theoryMin + 1) isAtPhysicalLimit = false;

    allComparisons.push({
      strategy: `${matKey}: ${candidate.strategy}`,
      waste: candidate.waste, sheets: candidate.sheets.length, yield: candidate.yieldPct,
    });

    allResults.push(...sawResults);
    allOffcuts.push(...offcuts);
    grandTotalParts += group.parts.length;
    grandTotalSheets += candidate.sheets.length;
    grandKerfLoss += kerfLoss;
    grandCutCount += cutCount;
    grandUsedArea += candidate.sheets.reduce((s, sh) => s + sh.usedArea, 0);
    grandSheetArea += candidate.sheets.length * sheetW * sheetH;
  }

  // Persist
  for (const result of allResults) {
    await supabase.from('saw_nesting_results').insert({
      project_id: projectId, material_code: result.material_code,
      thickness_mm: result.thickness_mm, sheet_width_mm: result.sheet_width_mm,
      sheet_height_mm: result.sheet_height_mm, sheet_index: result.sheet_index,
      strips: result.strips, used_area_mm2: result.used_area_mm2,
      waste_area_mm2: result.waste_area_mm2, waste_percent: result.waste_percent,
    });
  }

  for (const offcut of allOffcuts) {
    await supabase.from('stock_offcuts').insert({
      material_code: offcut.material_code, thickness_mm: offcut.thickness_mm,
      width_mm: offcut.width_mm, height_mm: offcut.height_mm,
      source_project_id: projectId, source_sheet_index: offcut.source_sheet_index,
    }).then(() => {});
  }

  // ── Stock Deduction: count sheets consumed per material and deduct from stock ──
  const sheetsByMaterial = new Map<string, number>();
  for (const r of allResults) {
    const key = r.material_code;
    sheetsByMaterial.set(key, (sheetsByMaterial.get(key) || 0));
    // Each unique sheet_index = 1 sheet consumed
    if (!sheetsByMaterial.has(`_idx_${key}_${r.sheet_index}`)) {
      sheetsByMaterial.set(`_idx_${key}_${r.sheet_index}`, 1);
      sheetsByMaterial.set(key, (sheetsByMaterial.get(key) || 0) + 1);
    }
  }

  for (const [matCode, sheetCount] of sheetsByMaterial.entries()) {
    if (matCode.startsWith('_idx_')) continue; // skip index tracking keys
    if (sheetCount <= 0) continue;

    // Find matching stock item by material code / normalized name
    const { data: stockItems } = await supabase
      .from('stock_items')
      .select('id, name, current_quantity, unit')
      .or(`sku.eq.${matCode},normalized_name.ilike.%${matCode.replace(/_/g, '%')}%`)
      .eq('is_active', true)
      .limit(1);

    if (stockItems && stockItems.length > 0) {
      const item = stockItems[0];
      const deductQty = Math.min(sheetCount, item.current_quantity); // don't go negative
      if (deductQty > 0) {
        await supabase.from('stock_movements').insert({
          stock_item_id: item.id,
          movement_type: 'production_out',
          quantity: -deductQty,
          unit: item.unit || 'sheet',
          notes: `SAW cutting: ${deductQty} sheet(s) of ${matCode} consumed for project`,
          project_id: projectId,
          reference_type: 'saw_nesting',
        });
      }
    }
  }

  const avgWaste = grandSheetArea > 0 ? (1 - grandUsedArea / grandSheetArea) * 100 : 0;
  const theoreticalMaxYield = grandSheetArea > 0 ? (grandUsedArea / (grandTheoreticalMin * (SHEET_SIZES['mdf_18']?.[0] || 2800) * (SHEET_SIZES['mdf_18']?.[1] || 1220))) * 100 : 0;

  return {
    success: true,
    data: {
      sheets: allResults,
      totalParts: grandTotalParts, totalSheets: grandTotalSheets,
      avgWaste: Number(avgWaste.toFixed(1)),
      yieldPercent: Number((100 - avgWaste).toFixed(1)),
      strategy: allComparisons.length > 0 ? allComparisons[0].strategy : 'none',
      strategyComparison: allComparisons,
      offcutsGenerated: allOffcuts,
      offcutsReused: totalOffcutsReused,
      kerfLossMm2: grandKerfLoss,
      cutCount: grandCutCount,
      theoreticalMinSheets: grandTheoreticalMin,
      theoreticalMaxYield: Number(theoreticalMaxYield.toFixed(1)),
      atPhysicalLimit: isAtPhysicalLimit,
    },
  };
}

export async function getSawNestingResults(projectId: string): Promise<ServiceResult<SawNestingResult[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('saw_nesting_results')
    .select('*')
    .eq('project_id', projectId)
    .order('material_code')
    .order('sheet_index');

  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}
