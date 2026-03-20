import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { nestParts, getSheetDims, type InputPart, type NestingResult } from '@/lib/services/cutting-engine';

/**
 * POST /api/cutting/generate — Generate real SAW cutting plan from BOM.
 *
 * Reads project_parts, runs 2D guillotine bin-packing, stores:
 *   - cutting_list (part placements with real coordinates)
 *   - Returns full validation + sheet stats + offcuts
 *
 * Body: { project_id }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager', 'workshop_worker']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id } = body;
  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // 1. Verify project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, reference_code, client_name')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // 2. Fetch all project_parts (BOM source of truth)
  const { data: parts, error: partsErr } = await supabase
    .from('project_parts')
    .select('id, part_code, part_name, material_type, width_mm, height_mm, quantity, edge_top, edge_bottom, edge_left, edge_right, grain_direction')
    .eq('project_id', project_id);

  if (partsErr || !parts || parts.length === 0) {
    return NextResponse.json(
      { error: 'No BOM parts found. Generate BOM from Modules tab first.' },
      { status: 400 },
    );
  }

  // 3. Run the nesting engine
  const result: NestingResult = nestParts(parts as InputPart[]);

  // 4. ZERO PART LOSS check — refuse to save if parts are dropped
  if (!result.validation.all_parts_placed) {
    return NextResponse.json({
      error: `${result.validation.unplaced_count} part(s) could not be placed on standard sheets.`,
      unplaced_parts: result.validation.unplaced_parts,
      validation: result.validation,
    }, { status: 422 });
  }

  // 5. Delete existing cutting list for this project
  const { error: delErr } = await supabase
    .from('cutting_list')
    .delete()
    .eq('project_id', project_id);

  if (delErr) {
    return NextResponse.json(
      { error: 'Failed to clear old cutting list', detail: delErr.message },
      { status: 500 },
    );
  }

  // 6. Build insert rows from placements
  const insertRows = result.placements.map(p => ({
    project_id,
    project_part_id: p.part_id,
    panel_type: p.material_type,
    panel_width_mm: getSheetDims(p.material_type)[0],
    panel_height_mm: getSheetDims(p.material_type)[1],
    part_label: p.part_code || p.part_name,
    cut_width_mm: p.placed_width,
    cut_height_mm: p.placed_height,
    quantity: 1,
    edges: p.edges,
    grain_direction: p.grain_direction,
    sheet_number: p.sheet_index,
    position_x: p.position_x,
    position_y: p.position_y,
    cnc_program: null,
    is_exported: false,
  }));

  // 7. Batch insert
  for (let i = 0; i < insertRows.length; i += 500) {
    const batch = insertRows.slice(i, i + 500);
    const { error: batchErr } = await supabase.from('cutting_list').insert(batch);
    if (batchErr) {
      return NextResponse.json(
        { error: 'Failed to save cutting list', detail: batchErr.message },
        { status: 500 },
      );
    }
  }

  // 8. Store offcuts as separate records (if table exists — upsert pattern)
  for (const sheet of result.sheets) {
    const usableOffcuts = sheet.offcuts.filter(o => o.usable);
    if (usableOffcuts.length > 0) {
      // Try to insert offcuts — ignore if table doesn't exist yet
      await supabase.from('cutting_offcuts').insert(
        usableOffcuts.map(o => ({
          project_id,
          material_type: sheet.material_type,
          sheet_index: sheet.sheet_index,
          x: o.x,
          y: o.y,
          width_mm: o.width,
          height_mm: o.height,
          area_mm2: o.area_mm2,
          is_usable: true,
        })),
      ).then(() => {/* ignore errors — table may not exist yet */});
    }
  }

  // 9. Return full result
  return NextResponse.json({
    project_id,
    reference_code: project.reference_code,
    validation: result.validation,
    sheets: result.sheets.map(s => ({
      sheet_index: s.sheet_index,
      material_type: s.material_type,
      sheet_width: s.sheet_width,
      sheet_height: s.sheet_height,
      parts_count: s.parts_count,
      used_area_mm2: s.used_area_mm2,
      waste_area_mm2: s.waste_area_mm2,
      waste_percent: s.waste_percent,
      offcuts_count: s.offcuts.filter(o => o.usable).length,
      offcuts: s.offcuts.filter(o => o.usable),
    })),
    // Proof: sample of first 5 placements showing real coordinates
    sample_placements: result.placements.slice(0, 5).map(p => ({
      part_code: p.part_code,
      sheet: p.sheet_index,
      x: p.position_x,
      y: p.position_y,
      w: p.placed_width,
      h: p.placed_height,
      rotated: p.rotated,
    })),
  }, { status: 201 });
}
