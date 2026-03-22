/**
 * ArtMood Factory OS — G-Code Engine Service
 * Generates CNC-ready G-code files from nested panel layouts.
 */

import { createClient } from '@/lib/supabase/client';
import type { CncProgram } from '@/types/production';

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): ServiceResult<T> { return { success: true, data }; }
function fail<T>(error: string): ServiceResult<T> { return { success: false, error }; }

// ── CNC Constants ────────────────────────────────────────────────────────────

const SAFE_Z = 5.0;          // Safe retract height (mm)
const FEED_RATE = 3000;      // Cutting feed rate (mm/min)
const PLUNGE_FEED = 1000;    // Plunge feed rate (mm/min)
const SPINDLE_RPM = 18000;   // Spindle speed
const TOOL_DIAMETER = 6;     // Router bit diameter (mm)
const OFFSET = TOOL_DIAMETER / 2; // Tool radius compensation

// ── Material labels ──────────────────────────────────────────────────────────

const MAT_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm',
  stratifie_18: 'Stratifie 18mm', stratifie_16: 'Stratifie 16mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm', back_mdf_8: 'MDF 8mm',
  melamine_anthracite: 'Melamine Anthracite', melamine_blanc: 'Melamine Blanc',
  melamine_chene: 'Melamine Chene', melamine_noyer: 'Melamine Noyer',
};

// ── Generate G-Code for all panels in a job ──────────────────────────────────

export async function generateAllGcode(
  jobId: string,
  projectId: string,
): Promise<ServiceResult<{ count: number; files: CncProgram[] }>> {
  const supabase = createClient();

  // 1. Get project reference
  const { data: project } = await supabase
    .from('projects')
    .select('reference_code')
    .eq('id', projectId)
    .single();

  const refCode = project?.reference_code || 'PROJ';

  // 2. Fetch all panels with placements
  const { data: panels, error: panelsErr } = await supabase
    .from('cutting_panels')
    .select('*, placements:panel_placements(*)')
    .eq('cutting_job_id', jobId)
    .order('material_code, panel_index');

  if (panelsErr || !panels?.length) {
    return fail('No panels found. Run nesting first.');
  }

  // 3. Delete existing G-code for this job
  await supabase.from('cnc_programs').delete().eq('cutting_job_id', jobId);

  // 4. Generate G-code for each panel
  const programs: any[] = [];
  const dateStr = new Date().toISOString().split('T')[0];

  for (const panel of panels) {
    const placements = (panel as any).placements || [];
    if (placements.length === 0) continue;

    const matLabel = MAT_LABELS[panel.material_code] || panel.material_code;
    const fileName = `CNC_${refCode}_${panel.material_code}_${panel.thickness_mm}mm_P${panel.panel_index}.nc`;
    const depth = panel.thickness_mm + 1; // Cut through + 1mm into spoilboard

    const lines: string[] = [
      `(==============================================)`,
      `( ArtMood Factory OS - CNC Program )`,
      `( Project: ${refCode} )`,
      `( Material: ${matLabel} )`,
      `( Panel: #${panel.panel_index} )`,
      `( Sheet: ${panel.sheet_width_mm} x ${panel.sheet_height_mm} mm )`,
      `( Parts: ${placements.length} )`,
      `( Date: ${dateStr} )`,
      `(==============================================)`,
      ``,
      `G90 G21          (Absolute positioning, millimeters)`,
      `G17              (XY plane selection)`,
      `G00 Z${SAFE_Z.toFixed(1)}       (Rapid to safe height)`,
      `M03 S${SPINDLE_RPM}      (Spindle ON CW)`,
      `G04 P2           (Dwell 2s for spindle ramp-up)`,
      ``,
    ];

    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      const x = Number(pl.x_mm);
      const y = Number(pl.y_mm);
      const w = Number(pl.width_mm);
      const h = Number(pl.height_mm);

      // Offset inward by tool radius for inside-cut
      const x0 = (x + OFFSET).toFixed(2);
      const y0 = (y + OFFSET).toFixed(2);
      const x1 = (x + w - OFFSET).toFixed(2);
      const y1 = (y + h - OFFSET).toFixed(2);

      lines.push(`(--- Part ${i + 1}: ${pl.part_label || 'Part'} [${w}x${h}mm]${pl.rotated ? ' ROTATED' : ''} ---)`);
      lines.push(`G00 X${x0} Y${y0}                (Rapid to start)`);
      lines.push(`G01 Z-${depth.toFixed(1)} F${PLUNGE_FEED}    (Plunge cut)`);
      lines.push(`G01 X${x1} F${FEED_RATE}          (Cut right)`);
      lines.push(`G01 Y${y1}                        (Cut up)`);
      lines.push(`G01 X${x0}                        (Cut left)`);
      lines.push(`G01 Y${y0}                        (Cut down - close)`);
      lines.push(`G00 Z${SAFE_Z.toFixed(1)}                    (Retract)`);
      lines.push(``);
    }

    lines.push(`(==============================================)`);
    lines.push(`( End of program )`);
    lines.push(`(==============================================)`);
    lines.push(`M05              (Spindle OFF)`);
    lines.push(`G00 Z${SAFE_Z.toFixed(1)}       (Final retract)`);
    lines.push(`G00 X0 Y0        (Home)`);
    lines.push(`M30              (Program end)`);
    lines.push(`%`);

    const fileContent = lines.join('\n');

    programs.push({
      project_id: projectId,
      cutting_job_id: jobId,
      cutting_panel_id: panel.id,
      file_name: fileName,
      file_content: fileContent,
      format: 'gcode',
    });
  }

  // 5. Insert all programs
  if (programs.length > 0) {
    const { error: insertErr } = await supabase.from('cnc_programs').insert(programs);
    if (insertErr) {
      return fail('Failed to save G-code: ' + insertErr.message);
    }
  }

  // 6. Fetch inserted programs (to get IDs)
  const { data: saved } = await supabase
    .from('cnc_programs')
    .select('*')
    .eq('cutting_job_id', jobId)
    .order('file_name');

  return ok({
    count: programs.length,
    files: (saved || []) as CncProgram[],
  });
}

// ── Get G-code files for a job ───────────────────────────────────────────────

export async function getGcodeFiles(
  jobId: string,
): Promise<ServiceResult<CncProgram[]>> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('cnc_programs')
    .select('*')
    .eq('cutting_job_id', jobId)
    .order('file_name');

  if (error) return fail('Failed to fetch G-code files: ' + error.message);
  return ok((data || []) as CncProgram[]);
}

// ── Download helper (single file) ────────────────────────────────────────────

export function downloadGcodeFile(program: CncProgram): void {
  const blob = new Blob([program.file_content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = program.file_name;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Download all files for a job ─────────────────────────────────────────────

export function downloadAllGcodeFiles(programs: CncProgram[]): void {
  for (const prog of programs) {
    downloadGcodeFile(prog);
  }
}
