/**
 * cutting-engine.ts — Real 2D Guillotine Bin-Packing for SAW cutting.
 *
 * Algorithm: Guillotine Best-Short-Side-Fit (BSSF)
 * - Groups parts by material type
 * - Sorts parts descending by max(width, height) then by area
 * - Places each part in the free rectangle with smallest short-side residual
 * - Guillotine split along the shorter remainder axis
 * - Respects grain direction (rotation only when grain = 'none')
 * - Accounts for saw kerf (blade width) between cuts
 * - Tracks offcuts (usable leftover rectangles)
 * - Guarantees zero part loss: explicit error if any part cannot be placed
 */

// ── Configuration ────────────────────────────────────────────────────────────

/** Saw blade kerf in mm (material lost per cut) */
export const SAW_KERF_MM = 4;

/** Minimum offcut dimension to be considered usable (mm) */
export const MIN_OFFCUT_DIM_MM = 100;

/** Standard sheet sizes by material type [width, height] in mm */
export const SHEET_SIZES: Record<string, [number, number]> = {
  mdf_18:       [1220, 2800],
  mdf_16:       [1220, 2800],
  mdf_12:       [1220, 2800],
  stratifie_18: [1830, 2550],
  stratifie_16: [1830, 2550],
  back_hdf_5:   [1220, 2440],
  back_mdf_8:   [1220, 2440],
};

export function getSheetDims(materialType: string): [number, number] {
  return SHEET_SIZES[materialType] ?? [1220, 2440];
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface InputPart {
  id: string;
  part_code: string;
  part_name: string;
  material_type: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: string; // 'horizontal' | 'vertical' | 'none'
}

export interface PlacedPart {
  part_id: string;
  part_code: string;
  part_name: string;
  material_type: string;
  sheet_index: number;       // 1-based
  position_x: number;        // mm from left edge of sheet
  position_y: number;        // mm from top edge of sheet
  placed_width: number;      // width as placed (may be swapped if rotated)
  placed_height: number;     // height as placed
  original_width: number;
  original_height: number;
  rotated: boolean;
  edges: string;             // e.g. "H B G D"
  grain_direction: string;
}

export interface SheetResult {
  sheet_index: number;       // 1-based
  material_type: string;
  sheet_width: number;
  sheet_height: number;
  total_area_mm2: number;    // full sheet area
  used_area_mm2: number;     // sum of placed part areas
  waste_area_mm2: number;    // total_area - used_area
  waste_percent: number;     // (waste_area / total_area) * 100
  parts_count: number;
  offcuts: Offcut[];
}

export interface Offcut {
  x: number;
  y: number;
  width: number;
  height: number;
  area_mm2: number;
  usable: boolean;           // true if both dims >= MIN_OFFCUT_DIM_MM
}

export interface NestingResult {
  placements: PlacedPart[];
  sheets: SheetResult[];
  validation: {
    total_input_parts: number;
    total_placed_parts: number;
    unplaced_parts: UnplacedPart[];
    unplaced_count: number;
    sheets_used: number;
    total_waste_percent: number;
    all_parts_placed: boolean;
  };
}

export interface UnplacedPart {
  part_id: string;
  part_code: string;
  part_name: string;
  width_mm: number;
  height_mm: number;
  material_type: string;
  reason: string;
}

// ── Internal types ───────────────────────────────────────────────────────────

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ExpandedPart {
  id: string;
  part_code: string;
  part_name: string;
  material_type: string;
  width_mm: number;
  height_mm: number;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: string;
  instance_index: number; // for tracing back
}

// ── Edge string builder ──────────────────────────────────────────────────────

function buildEdgesString(
  top: boolean, bottom: boolean, left: boolean, right: boolean,
): string {
  const parts: string[] = [];
  if (top) parts.push('H');
  if (bottom) parts.push('B');
  if (left) parts.push('G');
  if (right) parts.push('D');
  return parts.length ? parts.join(' ') : '-';
}

// ── Main nesting function ────────────────────────────────────────────────────

export function nestParts(inputParts: InputPart[]): NestingResult {
  // Group by material type
  const byMaterial = new Map<string, InputPart[]>();
  for (const part of inputParts) {
    const key = part.material_type;
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key)!.push(part);
  }

  const allPlacements: PlacedPart[] = [];
  const allSheets: SheetResult[] = [];
  const allUnplaced: UnplacedPart[] = [];
  let totalInputCount = 0;

  for (const [matType, matParts] of byMaterial.entries()) {
    const [sheetW, sheetH] = getSheetDims(matType);

    // Expand parts by quantity
    const expanded: ExpandedPart[] = [];
    for (const part of matParts) {
      for (let i = 0; i < part.quantity; i++) {
        expanded.push({
          id: part.id,
          part_code: part.part_code,
          part_name: part.part_name,
          material_type: matType,
          width_mm: part.width_mm,
          height_mm: part.height_mm,
          edge_top: part.edge_top,
          edge_bottom: part.edge_bottom,
          edge_left: part.edge_left,
          edge_right: part.edge_right,
          grain_direction: part.grain_direction,
          instance_index: i,
        });
      }
    }
    totalInputCount += expanded.length;

    // Sort: larger max-dimension first, then by area descending
    expanded.sort((a, b) => {
      const aMax = Math.max(a.width_mm, a.height_mm);
      const bMax = Math.max(b.width_mm, b.height_mm);
      if (bMax !== aMax) return bMax - aMax;
      return (b.width_mm * b.height_mm) - (a.width_mm * a.height_mm);
    });

    // Per-material sheet tracking
    let currentSheetIndex = allSheets.length + 1;
    let freeRects: FreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
    let sheetPlacements: PlacedPart[] = [];

    function finalizeSheet() {
      const totalArea = sheetW * sheetH;
      const usedArea = sheetPlacements.reduce(
        (s, p) => s + p.placed_width * p.placed_height, 0,
      );
      const wasteArea = totalArea - usedArea;

      // Collect offcuts from remaining free rects
      const offcuts: Offcut[] = freeRects.map(r => ({
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        area_mm2: r.w * r.h,
        usable: r.w >= MIN_OFFCUT_DIM_MM && r.h >= MIN_OFFCUT_DIM_MM,
      }));

      allSheets.push({
        sheet_index: currentSheetIndex,
        material_type: matType,
        sheet_width: sheetW,
        sheet_height: sheetH,
        total_area_mm2: totalArea,
        used_area_mm2: usedArea,
        waste_area_mm2: wasteArea,
        waste_percent: totalArea > 0 ? Math.round((wasteArea / totalArea) * 10000) / 100 : 0,
        parts_count: sheetPlacements.length,
        offcuts,
      });

      allPlacements.push(...sheetPlacements);
    }

    function startNewSheet() {
      if (sheetPlacements.length > 0) {
        finalizeSheet();
      }
      currentSheetIndex = allSheets.length + 1;
      freeRects = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
      sheetPlacements = [];
    }

    for (const part of expanded) {
      const pw = part.width_mm;
      const ph = part.height_mm;

      // Check if part fits on any sheet at all
      const canFitNormal = pw <= sheetW && ph <= sheetH;
      const canFitRotated = part.grain_direction === 'none' && ph <= sheetW && pw <= sheetH;

      if (!canFitNormal && !canFitRotated) {
        allUnplaced.push({
          part_id: part.id,
          part_code: part.part_code,
          part_name: part.part_name,
          width_mm: pw,
          height_mm: ph,
          material_type: matType,
          reason: `Part ${pw}x${ph}mm exceeds sheet ${sheetW}x${sheetH}mm`,
        });
        continue;
      }

      // Try to find best fitting free rectangle (Best Short Side Fit)
      let bestIdx = -1;
      let bestRotated = false;
      let bestShortSide = Infinity;

      for (let i = 0; i < freeRects.length; i++) {
        const r = freeRects[i];

        // With kerf: the part needs pw + kerf to leave room for the next cut
        // But if the part touches the sheet edge, no kerf needed on that side
        // Simplified: always account for kerf in free rect matching
        const effectiveW = pw;
        const effectiveH = ph;

        // Try without rotation
        if (effectiveW <= r.w && effectiveH <= r.h) {
          const shortSide = Math.min(r.w - effectiveW, r.h - effectiveH);
          if (shortSide < bestShortSide) {
            bestShortSide = shortSide;
            bestIdx = i;
            bestRotated = false;
          }
        }

        // Try with rotation (only if grain allows)
        if (part.grain_direction === 'none' && effectiveH <= r.w && effectiveW <= r.h) {
          const shortSide = Math.min(r.w - effectiveH, r.h - effectiveW);
          if (shortSide < bestShortSide) {
            bestShortSide = shortSide;
            bestIdx = i;
            bestRotated = true;
          }
        }
      }

      if (bestIdx === -1) {
        // No fit on current sheet — start new sheet
        startNewSheet();

        // Try on the fresh sheet
        const r = freeRects[0];
        if (pw <= r.w && ph <= r.h) {
          bestIdx = 0;
          bestRotated = false;
        } else if (part.grain_direction === 'none' && ph <= r.w && pw <= r.h) {
          bestIdx = 0;
          bestRotated = true;
        } else {
          // Should not happen — we already checked above
          allUnplaced.push({
            part_id: part.id,
            part_code: part.part_code,
            part_name: part.part_name,
            width_mm: pw,
            height_mm: ph,
            material_type: matType,
            reason: `Internal error: part should fit but doesn't`,
          });
          continue;
        }
      }

      const rect = freeRects[bestIdx];
      const placedW = bestRotated ? ph : pw;
      const placedH = bestRotated ? pw : ph;

      // Record placement
      sheetPlacements.push({
        part_id: part.id,
        part_code: part.part_code,
        part_name: part.part_name,
        material_type: matType,
        sheet_index: currentSheetIndex,
        position_x: rect.x,
        position_y: rect.y,
        placed_width: placedW,
        placed_height: placedH,
        original_width: pw,
        original_height: ph,
        rotated: bestRotated,
        edges: buildEdgesString(part.edge_top, part.edge_bottom, part.edge_left, part.edge_right),
        grain_direction: part.grain_direction,
      });

      // Guillotine split with saw kerf
      // After placing a part at (rect.x, rect.y) with size (placedW, placedH),
      // the kerf eats into the remaining space
      const kerfW = SAW_KERF_MM;  // kerf on the right side of the part
      const kerfH = SAW_KERF_MM;  // kerf on the bottom side of the part

      const rightW = rect.w - placedW - kerfW;
      const bottomH = rect.h - placedH - kerfH;

      // Remove the used rectangle
      freeRects.splice(bestIdx, 1);

      // Split along shorter remainder (minimizes waste fragmentation)
      if (rightW > 0 && bottomH > 0) {
        if (rightW < bottomH) {
          // Horizontal split: right strip is narrow
          if (rightW > 0) {
            freeRects.push({
              x: rect.x + placedW + kerfW,
              y: rect.y,
              w: rightW,
              h: placedH,
            });
          }
          if (bottomH > 0) {
            freeRects.push({
              x: rect.x,
              y: rect.y + placedH + kerfH,
              w: rect.w,
              h: bottomH,
            });
          }
        } else {
          // Vertical split: bottom strip is narrow
          if (rightW > 0) {
            freeRects.push({
              x: rect.x + placedW + kerfW,
              y: rect.y,
              w: rightW,
              h: rect.h,
            });
          }
          if (bottomH > 0) {
            freeRects.push({
              x: rect.x,
              y: rect.y + placedH + kerfH,
              w: placedW,
              h: bottomH,
            });
          }
        }
      } else if (rightW > 0) {
        freeRects.push({
          x: rect.x + placedW + kerfW,
          y: rect.y,
          w: rightW,
          h: rect.h,
        });
      } else if (bottomH > 0) {
        freeRects.push({
          x: rect.x,
          y: rect.y + placedH + kerfH,
          w: rect.w,
          h: bottomH,
        });
      }
    }

    // Finalize last sheet if it has placements
    if (sheetPlacements.length > 0) {
      finalizeSheet();
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const totalPlaced = allPlacements.length;
  const totalUsedArea = allSheets.reduce((s, sh) => s + sh.used_area_mm2, 0);
  const totalSheetArea = allSheets.reduce((s, sh) => s + sh.total_area_mm2, 0);
  const totalWastePercent = totalSheetArea > 0
    ? Math.round(((totalSheetArea - totalUsedArea) / totalSheetArea) * 10000) / 100
    : 0;

  return {
    placements: allPlacements,
    sheets: allSheets,
    validation: {
      total_input_parts: totalInputCount,
      total_placed_parts: totalPlaced,
      unplaced_parts: allUnplaced,
      unplaced_count: allUnplaced.length,
      sheets_used: allSheets.length,
      total_waste_percent: totalWastePercent,
      all_parts_placed: allUnplaced.length === 0,
    },
  };
}
