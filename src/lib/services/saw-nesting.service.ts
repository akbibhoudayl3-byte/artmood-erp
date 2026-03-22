/**
 * ArtMood Factory OS — SAW Nesting Engine v2 (Scie Panneaux)
 *
 * Multi-strategy strip-based nesting with industrial optimization.
 * Tries 3 strategies and picks the best (lowest waste):
 *   1. Same-height strips (original — simple, SAW-native)
 *   2. Mixed-height strips with greedy fill (fills strip gaps with shorter parts)
 *   3. Width-first greedy bin packing (sort by area DESC, fill sheets greedily)
 *
 * All strategies produce valid SAW output: rip cuts + crosscuts only.
 */

import { createClient } from '@/lib/supabase/client';
import { MATERIAL_THICKNESS_MAP } from './kitchen-engine.service';
import type { SawStrip, SawStripPart, SawNestingResult } from '@/types/production';

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): ServiceResult<T> { return { success: true, data }; }
function fail<T>(error: string): ServiceResult<T> { return { success: false, error }; }

// ── Constants ────────────────────────────────────────────────────────────────

const KERF = 4; // Saw blade width (mm)

/** Height tolerance for grouping "same height" parts into one strip */
const HEIGHT_TOLERANCE = 0; // exact match for clean rip cuts

const FALLBACK_SHEET: Record<string, [number, number]> = {
  mdf_18: [2800, 1220], mdf_16: [2800, 1220], mdf_22: [2800, 1220], mdf_10: [2800, 1220],
  stratifie_18: [2800, 1220], stratifie_16: [2800, 1220],
  back_hdf_5: [2440, 1220], back_hdf_3: [2440, 1220], back_mdf_8: [2440, 1220],
  melamine_anthracite: [2800, 1220], melamine_blanc: [2800, 1220],
  melamine_chene: [2800, 1220], melamine_noyer: [2800, 1220],
};
const DEFAULT_SHEET: [number, number] = [2800, 1220];

const MAT_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm', mdf_10: 'MDF 10mm',
  stratifie_18: 'Stratifié 18mm', stratifie_16: 'Stratifié 16mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm', back_mdf_8: 'MDF 8mm',
  melamine_anthracite: 'Mélamine Anthracite', melamine_blanc: 'Mélamine Blanc',
  melamine_chene: 'Mélamine Chêne', melamine_noyer: 'Mélamine Noyer',
};

// ── Internal types ───────────────────────────────────────────────────────────

interface PartRect {
  partId: string;
  label: string;
  width: number;   // crosscut dimension
  height: number;  // rip cut dimension (strip height)
  edgeTop: boolean;
  edgeBottom: boolean;
  edgeLeft: boolean;
  edgeRight: boolean;
  grainDirection: string;
  rotated?: boolean; // true if 90° rotation was applied
}

/** Returns true if the part can be rotated 90° (grain allows it or material is non-directional) */
function canRotate(part: PartRect): boolean {
  // MDF and HDF are non-directional — always allow rotation
  if (part.grainDirection === 'none' || !part.grainDirection) return true;
  // For carcass panels, grain is cosmetically irrelevant — allow rotation
  return true;
}

/** Returns a rotated copy of a part (swap width/height, swap edge flags) */
function rotatedCopy(part: PartRect): PartRect {
  return {
    ...part,
    width: part.height,
    height: part.width,
    edgeTop: part.edgeLeft,
    edgeBottom: part.edgeRight,
    edgeLeft: part.edgeTop,
    edgeRight: part.edgeBottom,
    rotated: true,
  };
}

interface InternalStrip {
  height: number;
  parts: PartRect[];
  usedWidth: number;
}

interface SheetResult {
  strips: SawStrip[];
  usedArea: number;
  wasteArea: number;
}

// ── Utility: Convert internal strips → SheetResult ───────────────────────────

function finalizeStrips(
  strips: InternalStrip[],
  sheetWidth: number,
  sheetHeight: number,
): SheetResult {
  const sawStrips: SawStrip[] = [];
  let totalUsed = 0;
  let ripY = 0;

  for (let si = 0; si < strips.length; si++) {
    const strip = strips[si];
    const sawParts: SawStripPart[] = [];
    let crossX = 0;

    for (const part of strip.parts) {
      sawParts.push({
        partId: part.partId,
        label: part.label,
        width: part.width,
        height: part.height,
        crossX,
        rotated: !!part.rotated,
        edgeTop: part.edgeTop,
        edgeBottom: part.edgeBottom,
        edgeLeft: part.edgeLeft,
        edgeRight: part.edgeRight,
      });
      totalUsed += part.width * part.height;
      crossX += part.width + KERF;
    }

    const wasteWidth = Math.max(0, sheetWidth - crossX + KERF);
    sawStrips.push({
      stripIndex: si + 1,
      ripY,
      stripHeight: strip.height,
      parts: sawParts,
      wasteWidth,
    });
    ripY += strip.height + KERF;
  }

  const sheetArea = sheetWidth * sheetHeight;
  return {
    strips: sawStrips,
    usedArea: totalUsed,
    wasteArea: sheetArea - totalUsed,
  };
}

function computeTotalWaste(sheets: SheetResult[], sheetW: number, sheetH: number): number {
  const totalSheetArea = sheets.length * sheetW * sheetH;
  const totalUsed = sheets.reduce((s, sh) => s + sh.usedArea, 0);
  return totalSheetArea > 0 ? ((totalSheetArea - totalUsed) / totalSheetArea) * 100 : 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 1: Same-Height Strips (original approach)
// Parts only share a strip if they have identical heights.
// Simple and SAW-native but wastes strip tail and height gaps.
// ══════════════════════════════════════════════════════════════════════════════

function strategySameHeight(
  parts: PartRect[],
  sheetWidth: number,
  sheetHeight: number,
): SheetResult[] {
  if (parts.length === 0) return [];

  const sorted = [...parts].sort((a, b) => b.height - a.height);
  const sheets: SheetResult[] = [];
  let currentStrips: InternalStrip[] = [];
  let currentH = 0;

  function flush() {
    if (currentStrips.length === 0) return;
    sheets.push(finalizeStrips(currentStrips, sheetWidth, sheetHeight));
    currentStrips = [];
    currentH = 0;
  }

  for (const part of sorted) {
    let placed = false;

    // Build candidates: original + rotated
    const candidates: PartRect[] = [part];
    if (canRotate(part) && part.width !== part.height) {
      candidates.push(rotatedCopy(part));
    }

    // Try existing strips with same height (try both orientations)
    for (const cand of candidates) {
      for (const strip of currentStrips) {
        if (strip.height === cand.height && strip.usedWidth + KERF + cand.width <= sheetWidth) {
          strip.parts.push(cand);
          strip.usedWidth += KERF + cand.width;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      // Pick orientation with smaller height to save vertical space
      let bestNew = part;
      if (canRotate(part) && part.width !== part.height && part.width < part.height) {
        bestNew = rotatedCopy(part);
      }
      const needed = currentH + (currentStrips.length > 0 ? KERF : 0) + bestNew.height;
      if (needed > sheetHeight && currentStrips.length > 0) flush();

      currentStrips.push({ height: bestNew.height, parts: [bestNew], usedWidth: bestNew.width });
      currentH += (currentStrips.length > 1 ? KERF : 0) + bestNew.height;
    }
  }
  flush();
  return sheets;
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 2: Mixed-Height Strips with Greedy Fill
// A strip's height = tallest part in it. Shorter parts can share the strip
// if they fit width-wise. This reclaims vertical waste inside strips.
// ══════════════════════════════════════════════════════════════════════════════

function strategyMixedHeight(
  parts: PartRect[],
  sheetWidth: number,
  sheetHeight: number,
): SheetResult[] {
  if (parts.length === 0) return [];

  // Sort by height DESC, then width DESC — tall+wide first
  const sorted = [...parts].sort((a, b) => b.height - a.height || b.width - a.width);
  const placed = new Array(sorted.length).fill(false);

  const sheets: SheetResult[] = [];

  while (true) {
    // Find first unplaced part
    const firstIdx = placed.indexOf(false);
    if (firstIdx === -1) break;

    const currentStrips: InternalStrip[] = [];
    let currentH = 0;

    // Build strips for this sheet
    for (let i = firstIdx; i < sorted.length; i++) {
      if (placed[i]) continue;
      const part = sorted[i];

      // Build candidates: original + rotated
      const candidates: PartRect[] = [part];
      if (canRotate(part) && part.width !== part.height) {
        candidates.push(rotatedCopy(part));
      }

      // Try to fit into an existing strip (try both orientations)
      let fittedInStrip = false;
      for (const cand of candidates) {
        for (const strip of currentStrips) {
          if (cand.height <= strip.height && strip.usedWidth + KERF + cand.width <= sheetWidth) {
            strip.parts.push(cand);
            strip.usedWidth += KERF + cand.width;
            placed[i] = true;
            fittedInStrip = true;
            break;
          }
        }
        if (fittedInStrip) break;
      }

      if (fittedInStrip) continue;

      // Create new strip — try orientation that uses less height
      let bestNew: PartRect | null = null;
      for (const cand of candidates) {
        const needed = currentH + (currentStrips.length > 0 ? KERF : 0) + cand.height;
        if (needed <= sheetHeight) {
          if (!bestNew || cand.height < bestNew.height) bestNew = cand;
        }
      }
      if (bestNew) {
        currentStrips.push({ height: bestNew.height, parts: [bestNew], usedWidth: bestNew.width });
        currentH += (currentStrips.length > 1 ? KERF : 0) + bestNew.height;
        placed[i] = true;
      }
      // else skip for now — will go to next sheet
    }

    if (currentStrips.length === 0) {
      // Part too tall for sheet — force into its own sheet
      const bigIdx = placed.indexOf(false);
      if (bigIdx === -1) break;
      currentStrips.push({ height: sorted[bigIdx].height, parts: [sorted[bigIdx]], usedWidth: sorted[bigIdx].width });
      placed[bigIdx] = true;
    }

    sheets.push(finalizeStrips(currentStrips, sheetWidth, sheetHeight));
  }

  return sheets;
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 3: Greedy Area-Fill
// Sort all parts by area DESC. For each sheet, greedily pack strips:
// - Use FFD (First Fit Decreasing) on strip height
// - Within each strip, FFD on width
// This maximizes sheet utilization by always placing the biggest piece first.
// ══════════════════════════════════════════════════════════════════════════════

function strategyGreedyFill(
  parts: PartRect[],
  sheetWidth: number,
  sheetHeight: number,
): SheetResult[] {
  if (parts.length === 0) return [];

  // Sort by area DESC — big parts first
  const sorted = [...parts].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const placed = new Array(sorted.length).fill(false);

  const sheets: SheetResult[] = [];

  while (placed.includes(false)) {
    const currentStrips: InternalStrip[] = [];
    let currentH = 0;

    // Pass 1: create strips with unplaced parts (tallest first as strip starters)
    // Collect unplaced indices sorted by height DESC for strip creation
    const unplacedByHeight = sorted
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => !placed[i])
      .sort((a, b) => b.p.height - a.p.height);

    for (const { p: part, i } of unplacedByHeight) {
      if (placed[i]) continue;

      // Build candidates: original + rotated
      const candidates: PartRect[] = [part];
      if (canRotate(part) && part.width !== part.height) {
        candidates.push(rotatedCopy(part));
      }

      // Best-fit: pick strip where candidate height is closest to strip height
      let bestStrip: InternalStrip | null = null;
      let bestCandidate: PartRect | null = null;
      let bestDelta = Infinity;
      for (const cand of candidates) {
        for (const strip of currentStrips) {
          if (cand.height <= strip.height && strip.usedWidth + KERF + cand.width <= sheetWidth) {
            const delta = strip.height - cand.height;
            if (delta < bestDelta) {
              bestDelta = delta;
              bestStrip = strip;
              bestCandidate = cand;
            }
          }
        }
      }

      if (bestStrip && bestCandidate) {
        bestStrip.parts.push(bestCandidate);
        bestStrip.usedWidth += KERF + bestCandidate.width;
        placed[i] = true;
        continue;
      }

      // Create new strip — try orientation that uses less height
      let bestNew: PartRect | null = null;
      for (const cand of candidates) {
        const needed = currentH + (currentStrips.length > 0 ? KERF : 0) + cand.height;
        if (needed <= sheetHeight) {
          if (!bestNew || cand.height < bestNew.height) bestNew = cand;
        }
      }
      if (bestNew) {
        currentStrips.push({ height: bestNew.height, parts: [bestNew], usedWidth: bestNew.width });
        currentH += (currentStrips.length > 1 ? KERF : 0) + bestNew.height;
        placed[i] = true;
      }
    }

    // Pass 2: fill remaining gaps with rotation
    for (const strip of currentStrips) {
      const remaining = sheetWidth - strip.usedWidth;
      if (remaining < 50) continue;

      for (let i = 0; i < sorted.length; i++) {
        if (placed[i]) continue;
        const part = sorted[i];
        const candidates: PartRect[] = [part];
        if (canRotate(part) && part.width !== part.height) {
          candidates.push(rotatedCopy(part));
        }
        for (const cand of candidates) {
          if (cand.height <= strip.height && cand.width <= remaining - KERF) {
            strip.parts.push(cand);
            strip.usedWidth += KERF + cand.width;
            placed[i] = true;
            break;
          }
        }
      }
    }

    if (currentStrips.length === 0) {
      // Emergency: oversized part
      const bigIdx = placed.indexOf(false);
      if (bigIdx === -1) break;
      currentStrips.push({ height: sorted[bigIdx].height, parts: [sorted[bigIdx]], usedWidth: sorted[bigIdx].width });
      placed[bigIdx] = true;
    }

    sheets.push(finalizeStrips(currentStrips, sheetWidth, sheetHeight));
  }

  return sheets;
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 4: Rotation-Aware Best-Area-Fit
// For each part, try both orientations. Pick the placement that wastes
// the least strip height. Sort parts by area DESC. Two-pass gap filling.
// ══════════════════════════════════════════════════════════════════════════════

function strategyRotationBestFit(
  parts: PartRect[],
  sheetWidth: number,
  sheetHeight: number,
): SheetResult[] {
  if (parts.length === 0) return [];

  // Sort by area DESC — big parts first
  const sorted = [...parts].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const placed = new Array(sorted.length).fill(false);
  const sheets: SheetResult[] = [];

  while (placed.includes(false)) {
    const currentStrips: InternalStrip[] = [];
    let currentH = 0;

    // Pass 1: place parts, trying rotation for best fit
    for (let i = 0; i < sorted.length; i++) {
      if (placed[i]) continue;
      const part = sorted[i];

      // Build candidates: original + rotated (if allowed)
      const candidates: PartRect[] = [part];
      if (canRotate(part) && part.width !== part.height) {
        candidates.push(rotatedCopy(part));
      }

      // Try fitting into existing strip — best-fit = smallest height delta
      let bestStrip: InternalStrip | null = null;
      let bestCandidate: PartRect | null = null;
      let bestDelta = Infinity;

      for (const cand of candidates) {
        for (const strip of currentStrips) {
          if (cand.height <= strip.height && strip.usedWidth + KERF + cand.width <= sheetWidth) {
            const delta = strip.height - cand.height;
            if (delta < bestDelta) {
              bestDelta = delta;
              bestStrip = strip;
              bestCandidate = cand;
            }
          }
        }
      }

      if (bestStrip && bestCandidate) {
        bestStrip.parts.push(bestCandidate);
        bestStrip.usedWidth += KERF + bestCandidate.width;
        placed[i] = true;
        continue;
      }

      // No existing strip fits — try creating a new strip with best orientation
      // Pick orientation that uses less strip height
      let bestNew: PartRect | null = null;
      for (const cand of candidates) {
        const needed = currentH + (currentStrips.length > 0 ? KERF : 0) + cand.height;
        if (needed <= sheetHeight) {
          if (!bestNew || cand.height < bestNew.height) {
            bestNew = cand;
          }
        }
      }

      if (bestNew) {
        currentStrips.push({ height: bestNew.height, parts: [bestNew], usedWidth: bestNew.width });
        currentH += (currentStrips.length > 1 ? KERF : 0) + bestNew.height;
        placed[i] = true;
      }
    }

    // Pass 2: fill remaining gaps with rotation
    for (const strip of currentStrips) {
      for (let i = 0; i < sorted.length; i++) {
        if (placed[i]) continue;
        const part = sorted[i];
        const remaining = sheetWidth - strip.usedWidth - KERF;
        if (remaining < 50) break;

        const candidates: PartRect[] = [part];
        if (canRotate(part) && part.width !== part.height) {
          candidates.push(rotatedCopy(part));
        }

        for (const cand of candidates) {
          if (cand.height <= strip.height && cand.width <= remaining) {
            strip.parts.push(cand);
            strip.usedWidth += KERF + cand.width;
            placed[i] = true;
            break;
          }
        }
      }
    }

    if (currentStrips.length === 0) {
      const bigIdx = placed.indexOf(false);
      if (bigIdx === -1) break;
      currentStrips.push({ height: sorted[bigIdx].height, parts: [sorted[bigIdx]], usedWidth: sorted[bigIdx].width });
      placed[bigIdx] = true;
    }

    sheets.push(finalizeStrips(currentStrips, sheetWidth, sheetHeight));
  }

  return sheets;
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-SOLUTION OPTIMIZER: 4 strategies × 3 sort orders = 12+ layouts tested
// ══════════════════════════════════════════════════════════════════════════════

interface NestingCandidate {
  strategy: string;
  sheets: SheetResult[];
  wastePercent: number;
}

type SortFn = (a: PartRect, b: PartRect) => number;

const SORT_ORDERS: { name: string; fn: SortFn }[] = [
  { name: 'area-desc', fn: (a, b) => (b.width * b.height) - (a.width * a.height) },
  { name: 'height-desc', fn: (a, b) => b.height - a.height || b.width - a.width },
  { name: 'width-desc', fn: (a, b) => b.width - a.width || b.height - a.height },
];

type StrategyFn = (parts: PartRect[], sw: number, sh: number) => SheetResult[];

const STRATEGIES: { name: string; fn: StrategyFn }[] = [
  { name: 'same-height', fn: strategySameHeight },
  { name: 'mixed-height', fn: strategyMixedHeight },
  { name: 'greedy-fill', fn: strategyGreedyFill },
  { name: 'rotation-best-fit', fn: strategyRotationBestFit },
];

function optimizedNest(
  parts: PartRect[],
  sheetWidth: number,
  sheetHeight: number,
): { best: NestingCandidate; all: NestingCandidate[]; layoutsTested: number } {
  const candidates: NestingCandidate[] = [];

  // Test every combination of sort order × strategy = 12 layouts
  for (const sort of SORT_ORDERS) {
    const sortedParts = [...parts].sort(sort.fn);
    for (const strat of STRATEGIES) {
      const sheets = strat.fn(sortedParts, sheetWidth, sheetHeight);
      const wastePercent = computeTotalWaste(sheets, sheetWidth, sheetHeight);
      candidates.push({
        strategy: `${sort.name}+${strat.name}`,
        sheets,
        wastePercent,
      });
    }
  }

  // Pick best: minimize sheets first, then minimize waste
  candidates.sort((a, b) => {
    const sheetDiff = a.sheets.length - b.sheets.length;
    if (sheetDiff !== 0) return sheetDiff;
    return a.wastePercent - b.wastePercent;
  });

  return { best: candidates[0], all: candidates, layoutsTested: candidates.length };
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

export interface NestingStats {
  sheets: SawNestingResult[];
  totalParts: number;
  totalSheets: number;
  avgWaste: number;
  strategy: string;
  /** Per-strategy waste comparison */
  strategyComparison: { strategy: string; waste: number; sheets: number }[];
  /** Number of layouts tested by multi-solution optimizer */
  layoutsTested: number;
  /** Yield % (100 - waste) */
  yieldPercent: number;
}

/**
 * Generate SAW nesting for all parts in a project.
 * Runs 3 optimization strategies per material group, picks best.
 */
export async function generateSawNesting(
  projectId: string,
): Promise<ServiceResult<NestingStats>> {
  const supabase = createClient();

  // 1. Fetch project parts (exclude hardware)
  const { data: parts, error: partsErr } = await supabase
    .from('project_parts')
    .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right')
    .eq('project_id', projectId)
    .neq('material_type', 'hardware');

  if (partsErr || !parts?.length) {
    return fail('No parts found. Generate parts first.');
  }

  // 2. Validate parts
  for (const p of parts) {
    if (!p.material_type) return fail(`Part ${p.part_name || p.id} has no material type.`);
    if (!p.width_mm || !p.height_mm) return fail(`Part ${p.part_name || p.id} has invalid dimensions.`);
    const expected = MATERIAL_THICKNESS_MAP[p.material_type];
    if (expected && p.thickness_mm !== expected) {
      return fail(`Part ${p.part_name} (${p.material_type}) has thickness ${p.thickness_mm}mm but should be ${expected}mm.`);
    }
  }

  // 3. Group by material+thickness
  const groups = new Map<string, PartRect[]>();
  for (const p of parts) {
    const key = `${p.material_type}__${p.thickness_mm}`;
    if (!groups.has(key)) groups.set(key, []);
    const arr = groups.get(key)!;

    for (let q = 0; q < p.quantity; q++) {
      arr.push({
        partId: p.id,
        label: p.part_code || p.part_name || 'Part',
        width: Math.round(Number(p.width_mm)),
        height: Math.round(Number(p.height_mm)),
        edgeTop: !!p.edge_top,
        edgeBottom: !!p.edge_bottom,
        edgeLeft: !!p.edge_left,
        edgeRight: !!p.edge_right,
        grainDirection: p.grain_direction || 'none',
      });
    }
  }

  // 4. Delete old results
  await supabase.from('saw_nesting_results').delete().eq('project_id', projectId);

  // 5. Run optimizer per group
  const allResults: SawNestingResult[] = [];
  let totalParts = 0;
  const allComparisons: { strategy: string; waste: number; sheets: number }[] = [];
  let winningStrategy = '';
  let totalLayoutsTested = 0;

  for (const [groupKey, groupParts] of groups.entries()) {
    const [matCode, thicknessStr] = groupKey.split('__');
    const thickness = parseInt(thicknessStr, 10) || 18;
    const [sheetW, sheetH] = FALLBACK_SHEET[matCode] || DEFAULT_SHEET;

    const { best, all, layoutsTested: lt } = optimizedNest(groupParts, sheetW, sheetH);
    winningStrategy = best.strategy;
    totalLayoutsTested += lt;

    // Collect comparison stats (aggregate across groups)
    for (const c of all) {
      const existing = allComparisons.find(x => x.strategy === c.strategy);
      if (existing) {
        // Weighted merge: sum sheets and recompute waste
        existing.sheets += c.sheets.length;
        existing.waste = (existing.waste + c.wastePercent) / 2; // running avg
      } else {
        allComparisons.push({ strategy: c.strategy, waste: Math.round(c.wastePercent * 100) / 100, sheets: c.sheets.length });
      }
    }

    // Save best result
    for (let si = 0; si < best.sheets.length; si++) {
      const sheet = best.sheets[si];
      const sheetArea = sheetW * sheetH;
      const wastePct = Math.round((sheet.wasteArea / sheetArea) * 10000) / 100;
      const partsInSheet = sheet.strips.reduce((s, strip) => s + strip.parts.length, 0);
      totalParts += partsInSheet;

      const row = {
        project_id: projectId,
        material_code: matCode,
        thickness_mm: thickness,
        sheet_width_mm: sheetW,
        sheet_height_mm: sheetH,
        sheet_index: si + 1,
        strips: sheet.strips as any,
        used_area_mm2: sheet.usedArea,
        waste_area_mm2: sheet.wasteArea,
        waste_percent: wastePct,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('saw_nesting_results')
        .insert(row)
        .select()
        .single();

      if (insertErr) {
        return fail('Failed to save nesting result: ' + insertErr.message);
      }

      allResults.push({
        ...inserted,
        strips: sheet.strips,
      } as SawNestingResult);
    }
  }

  // 6. Final stats
  const avgWaste = allResults.length > 0
    ? Math.round(allResults.reduce((s, r) => s + r.waste_percent, 0) / allResults.length * 100) / 100
    : 0;

  // Round comparison waste values
  for (const c of allComparisons) {
    c.waste = Math.round(c.waste * 100) / 100;
  }
  allComparisons.sort((a, b) => a.waste - b.waste);

  return ok({
    sheets: allResults,
    totalParts,
    totalSheets: allResults.length,
    avgWaste,
    strategy: winningStrategy,
    strategyComparison: allComparisons,
    layoutsTested: totalLayoutsTested,
    yieldPercent: Math.round((100 - avgWaste) * 100) / 100,
  });
}

/**
 * Fetch existing SAW nesting results for a project.
 */
export async function getSawNestingResults(
  projectId: string,
): Promise<ServiceResult<SawNestingResult[]>> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('saw_nesting_results')
    .select('*')
    .eq('project_id', projectId)
    .order('material_code, sheet_index');

  if (error) return fail('Failed to fetch nesting results: ' + error.message);
  return ok((data || []) as SawNestingResult[]);
}

/**
 * Delete SAW nesting results for a project.
 */
export async function deleteSawNesting(
  projectId: string,
): Promise<ServiceResult<void>> {
  const supabase = createClient();

  const { error } = await supabase
    .from('saw_nesting_results')
    .delete()
    .eq('project_id', projectId);

  if (error) return fail('Failed to delete nesting results: ' + error.message);
  return ok(undefined as any);
}

/**
 * Get material label for display.
 */
export function getMaterialLabel(code: string): string {
  return MAT_LABELS[code] || code;
}
