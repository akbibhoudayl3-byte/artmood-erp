/**
 * ArtMood Factory OS — Nesting Engine Service
 * Real 2D bin-packing using MaxRects algorithm for panel optimization.
 */

import { MaxRectsPacker } from 'maxrects-packer';
import { createClient } from '@/lib/supabase/client';
import { MATERIAL_THICKNESS_MAP } from '@/lib/services/kitchen-engine.service';
import type { CuttingJob, CuttingPanel, PanelPlacement } from '@/types/production';

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

function fail<T>(error: string): ServiceResult<T> {
  return { success: false, error };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  partCount: number;
}

interface NestingResult {
  job: CuttingJob;
  panels: CuttingPanel[];
  totalParts: number;
  totalPanels: number;
  avgWaste: number;
}

interface PartRow {
  id: string;
  part_code: string;
  part_name: string;
  material_type: string;
  thickness_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  grain_direction: string;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
}

interface MaterialInfo {
  code: string;
  sheet_width_mm: number;
  sheet_height_mm: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Saw blade kerf / CNC tool offset padding (mm) */
const KERF_PADDING = 4;

/** Fallback sheet dimensions if material not found in catalog */
const FALLBACK_SHEET: Record<string, [number, number]> = {
  mdf_18:       [2800, 1220],
  mdf_16:       [2800, 1220],
  mdf_22:       [2800, 1220],
  stratifie_18: [2550, 1830],
  stratifie_16: [2550, 1830],
  back_hdf_5:   [2440, 1220],
  back_hdf_3:   [2440, 1220],
  back_mdf_8:   [2440, 1220],
  melamine_anthracite: [2800, 1220],
  melamine_blanc:      [2800, 1220],
  melamine_chene:      [2800, 1220],
  melamine_noyer:      [2800, 1220],
};
const DEFAULT_SHEET: [number, number] = [2800, 1220];

// ── Validation ───────────────────────────────────────────────────────────────

export async function validateCuttingReadiness(
  projectId: string,
): Promise<ServiceResult<ValidationResult>> {
  const supabase = createClient();
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check parts exist
  const { data: parts, error: partsErr } = await supabase
    .from('project_parts')
    .select('id, material_type, width_mm, height_mm, thickness_mm, quantity')
    .eq('project_id', projectId);

  if (partsErr) return fail('Failed to fetch project parts: ' + partsErr.message);
  if (!parts || parts.length === 0) {
    errors.push('No project parts found. Generate parts from the Kitchen Configurator first.');
    return ok({ valid: false, errors, warnings, partCount: 0 });
  }

  // 2. Filter out hardware parts (material_type = 'hardware') — they don't need nesting
  const panelParts = parts.filter((p: any) => p.material_type !== 'hardware');
  if (panelParts.length === 0) {
    errors.push('No panel parts found (only hardware). Nothing to nest.');
    return ok({ valid: false, errors, warnings, partCount: 0 });
  }

  // 3. Check dimensions + material/thickness consistency
  for (const p of panelParts) {
    if (!p.material_type) {
      errors.push(`Part ${p.id} has no material_type.`);
    }
    if (!p.width_mm || p.width_mm <= 0 || !p.height_mm || p.height_mm <= 0) {
      errors.push(`Part ${p.id} has invalid dimensions (${p.width_mm}x${p.height_mm}).`);
    }
    // Enforce material ↔ thickness consistency
    if (p.material_type && p.thickness_mm) {
      const expected = MATERIAL_THICKNESS_MAP[p.material_type];
      if (expected !== undefined && p.thickness_mm !== expected) {
        errors.push(
          `Part ${p.id} (${p.material_type}) has thickness ${p.thickness_mm}mm but should be ${expected}mm. Fix data before nesting.`,
        );
      }
    }
  }

  // 4. Check materials catalog for sheet dimensions
  const materialTypes = [...new Set(panelParts.map((p: any) => p.material_type))];
  const { data: materials } = await supabase
    .from('materials')
    .select('code, sheet_width_mm, sheet_height_mm')
    .in('code', materialTypes);

  const matMap = new Map((materials || []).map((m: any) => [m.code, m]));
  for (const mt of materialTypes) {
    if (!matMap.has(mt)) {
      const fb = FALLBACK_SHEET[mt];
      if (fb) {
        warnings.push(`Material "${mt}" not in catalog — using fallback ${fb[0]}x${fb[1]}mm.`);
      } else {
        warnings.push(`Material "${mt}" not in catalog — using default ${DEFAULT_SHEET[0]}x${DEFAULT_SHEET[1]}mm.`);
      }
    } else {
      const m = matMap.get(mt)!;
      if (!m.sheet_width_mm || !m.sheet_height_mm) {
        warnings.push(`Material "${mt}" has no sheet dimensions in catalog — using fallback.`);
      }
    }
  }

  return ok({
    valid: errors.length === 0,
    errors,
    warnings,
    partCount: panelParts.length,
  });
}

// ── Get sheet dimensions for a material ──────────────────────────────────────

function getSheetDims(
  materialCode: string,
  matMap: Map<string, MaterialInfo>,
): [number, number] {
  const mat = matMap.get(materialCode);
  if (mat && mat.sheet_width_mm > 0 && mat.sheet_height_mm > 0) {
    // materials table stores width and length; we use length as maxWidth, width as maxHeight
    return [mat.sheet_height_mm, mat.sheet_width_mm];
  }
  const fb = FALLBACK_SHEET[materialCode];
  return fb || DEFAULT_SHEET;
}

// ── Create & Nest Job ────────────────────────────────────────────────────────

export async function createAndNestJob(
  projectId: string,
  userId: string,
): Promise<ServiceResult<NestingResult>> {
  const supabase = createClient();

  // 1. Validate
  const validation = await validateCuttingReadiness(projectId);
  if (!validation.success) return fail(validation.error || 'Validation failed');
  if (!validation.data!.valid) {
    return fail('Validation failed:\n' + validation.data!.errors.join('\n'));
  }

  // 2. Fetch all panel parts (exclude hardware)
  const { data: parts, error: partsErr } = await supabase
    .from('project_parts')
    .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right')
    .eq('project_id', projectId)
    .neq('material_type', 'hardware');

  if (partsErr || !parts?.length) {
    return fail('Failed to fetch parts: ' + (partsErr?.message || 'No parts'));
  }

  // 3. Fetch materials catalog for sheet dimensions
  const materialTypes = [...new Set(parts.map((p: PartRow) => p.material_type))];
  const { data: materials } = await supabase
    .from('materials')
    .select('code, sheet_width_mm, sheet_height_mm')
    .in('code', materialTypes);

  const matMap = new Map<string, MaterialInfo>(
    (materials || []).map((m: any) => [m.code, m]),
  );

  // 4. Delete existing cutting jobs for this project
  await supabase.from('cutting_jobs').delete().eq('project_id', projectId);

  // 5. Create cutting job
  const { data: job, error: jobErr } = await supabase
    .from('cutting_jobs')
    .insert({
      project_id: projectId,
      status: 'nesting',
      created_by: userId,
    })
    .select()
    .single();

  if (jobErr || !job) {
    return fail('Failed to create cutting job: ' + (jobErr?.message || 'Unknown'));
  }

  // 6. Group parts by material_type + thickness_mm
  const groups = new Map<string, PartRow[]>();
  for (const p of parts as PartRow[]) {
    const key = `${p.material_type}__${p.thickness_mm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // 7. Run nesting for each group
  const allPanels: any[] = [];
  const allPlacements: any[] = [];
  let totalPlacedParts = 0;

  for (const [groupKey, groupParts] of groups.entries()) {
    const [matCode, thicknessStr] = groupKey.split('__');
    const thickness = parseInt(thicknessStr, 10) || 18;
    const [sheetW, sheetH] = getSheetDims(matCode, matMap);

    // Determine if rotation is allowed for this group
    // If ALL parts have grain_direction 'none', rotation is allowed
    const allGrainNone = groupParts.every(p => p.grain_direction === 'none');

    // Expand parts by quantity into individual rects
    const rects: Array<{
      width: number;
      height: number;
      data: { partId: string; partLabel: string; partCode: string };
    }> = [];

    for (const part of groupParts) {
      for (let q = 0; q < part.quantity; q++) {
        rects.push({
          width: Math.round(Number(part.width_mm)),
          height: Math.round(Number(part.height_mm)),
          data: {
            partId: part.id,
            partLabel: part.part_name,
            partCode: part.part_code,
          },
        });
      }
    }

    // MaxRects packing
    const packer = new MaxRectsPacker(sheetW, sheetH, KERF_PADDING, {
      smart: true,
      pot: false,
      square: false,
      allowRotation: allGrainNone,
    });

    packer.addArray(rects as any);

    // Process bins (each bin = one physical panel/sheet)
    for (let binIdx = 0; binIdx < packer.bins.length; binIdx++) {
      const bin = packer.bins[binIdx];
      const panelIndex = binIdx + 1;

      let usedArea = 0;
      const binPlacements: any[] = [];

      for (const rect of bin.rects) {
        const rd = (rect as any).data || {};
        const isRotated = !!(rect as any).rot;
        const placedW = isRotated ? rect.height : rect.width;
        const placedH = isRotated ? rect.width : rect.height;

        usedArea += placedW * placedH;
        totalPlacedParts++;

        binPlacements.push({
          project_part_id: rd.partId || null,
          x_mm: rect.x,
          y_mm: rect.y,
          width_mm: placedW,
          height_mm: placedH,
          rotated: isRotated,
          part_label: rd.partCode || rd.partLabel || 'Unknown',
        });
      }

      const sheetArea = sheetW * sheetH;
      const wasteArea = sheetArea - usedArea;
      const wastePct = sheetArea > 0 ? Math.round((wasteArea / sheetArea) * 10000) / 100 : 0;

      allPanels.push({
        cutting_job_id: job.id,
        material_code: matCode,
        thickness_mm: thickness,
        sheet_width_mm: sheetW,
        sheet_height_mm: sheetH,
        panel_index: panelIndex,
        used_area_mm2: usedArea,
        waste_area_mm2: wasteArea,
        waste_percent: wastePct,
        _placements: binPlacements,
      });
    }
  }

  // 8. Insert panels
  if (allPanels.length > 0) {
    const panelRows = allPanels.map(p => ({
      cutting_job_id: p.cutting_job_id,
      material_code: p.material_code,
      thickness_mm: p.thickness_mm,
      sheet_width_mm: p.sheet_width_mm,
      sheet_height_mm: p.sheet_height_mm,
      panel_index: p.panel_index,
      used_area_mm2: p.used_area_mm2,
      waste_area_mm2: p.waste_area_mm2,
      waste_percent: p.waste_percent,
    }));

    const { data: insertedPanels, error: panelsErr } = await supabase
      .from('cutting_panels')
      .insert(panelRows)
      .select('id');

    if (panelsErr || !insertedPanels) {
      return fail('Failed to insert panels: ' + (panelsErr?.message || 'Unknown'));
    }

    // 9. Insert placements with their panel IDs
    const placementRows: any[] = [];
    for (let i = 0; i < insertedPanels.length; i++) {
      const panelId = insertedPanels[i].id;
      const panelData = allPanels[i];
      for (const pl of panelData._placements) {
        placementRows.push({
          cutting_panel_id: panelId,
          project_part_id: pl.project_part_id,
          x_mm: pl.x_mm,
          y_mm: pl.y_mm,
          width_mm: pl.width_mm,
          height_mm: pl.height_mm,
          rotated: pl.rotated,
          part_label: pl.part_label,
        });
      }
    }

    if (placementRows.length > 0) {
      // Insert in batches of 200 to avoid payload limits
      for (let i = 0; i < placementRows.length; i += 200) {
        const batch = placementRows.slice(i, i + 200);
        const { error: plErr } = await supabase.from('panel_placements').insert(batch);
        if (plErr) {
          console.error('[nesting] Placement insert error:', plErr);
        }
      }
    }
  }

  // 10. Compute average waste
  const avgWaste = allPanels.length > 0
    ? Math.round(allPanels.reduce((s, p) => s + p.waste_percent, 0) / allPanels.length * 100) / 100
    : 0;

  // 11. Update job with stats
  const { error: updateErr } = await supabase
    .from('cutting_jobs')
    .update({
      status: 'nested',
      total_parts: totalPlacedParts,
      total_panels: allPanels.length,
      total_waste_pct: avgWaste,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  if (updateErr) {
    console.error('[nesting] Job update error:', updateErr);
  }

  return ok({
    job: { ...job, status: 'nested', total_parts: totalPlacedParts, total_panels: allPanels.length, total_waste_pct: avgWaste },
    panels: allPanels,
    totalParts: totalPlacedParts,
    totalPanels: allPanels.length,
    avgWaste,
  });
}

// ── Re-Nest ──────────────────────────────────────────────────────────────────

export async function reNestJob(
  jobId: string,
): Promise<ServiceResult<NestingResult>> {
  const supabase = createClient();

  // Get the job to find project_id
  const { data: job, error: jobErr } = await supabase
    .from('cutting_jobs')
    .select('id, project_id, created_by')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) return fail('Cutting job not found');

  // Delete existing panels (CASCADE deletes placements)
  await supabase.from('cutting_panels').delete().eq('cutting_job_id', jobId);
  // Delete existing G-code
  await supabase.from('cnc_programs').delete().eq('cutting_job_id', jobId);

  // Re-run nesting
  return createAndNestJob(job.project_id, job.created_by || '');
}

// ── Get Nesting Result ───────────────────────────────────────────────────────

export async function getNestingResult(
  jobId: string,
): Promise<ServiceResult<{ job: CuttingJob; panels: CuttingPanel[] }>> {
  const supabase = createClient();

  const { data: job, error: jobErr } = await supabase
    .from('cutting_jobs')
    .select('*, project:projects(reference_code, client_name)')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) return fail('Cutting job not found');

  const { data: panels } = await supabase
    .from('cutting_panels')
    .select('*, placements:panel_placements(*)')
    .eq('cutting_job_id', jobId)
    .order('material_code, panel_index');

  // Get CNC program count
  const { count: cncCount } = await supabase
    .from('cnc_programs')
    .select('id', { count: 'exact', head: true })
    .eq('cutting_job_id', jobId);

  return ok({
    job: { ...job, cnc_count: cncCount || 0 } as CuttingJob,
    panels: (panels || []) as CuttingPanel[],
  });
}

// ── Update Job Status ────────────────────────────────────────────────────────

export async function updateJobStatus(
  jobId: string,
  status: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const { error } = await supabase
    .from('cutting_jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) return fail('Failed to update status: ' + error.message);
  return ok(null);
}

// ── Delete Job ───────────────────────────────────────────────────────────────

export async function deleteCuttingJob(
  jobId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const { error } = await supabase.from('cutting_jobs').delete().eq('id', jobId);
  if (error) return fail('Failed to delete: ' + error.message);
  return ok(null);
}
