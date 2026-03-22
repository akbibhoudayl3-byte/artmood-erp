/**
 * Test: Run nesting for a real project (server-side equivalent of createAndNestJob)
 */
const { createClient } = require('@supabase/supabase-js');
const { MaxRectsPacker } = require('maxrects-packer');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const KERF_PADDING = 4;
const FALLBACK_SHEET = {
  mdf_18: [2800, 1220],
  mdf_16: [2800, 1220],
  mdf_22: [2800, 1220],
  back_hdf_5: [2440, 1220],
  back_hdf_3: [2440, 1220],
};
const DEFAULT_SHEET = [2800, 1220];

const PROJECT_ID = 'a5e2d220-2759-44d3-abff-daa4dae6d9f7'; // ART-2026-0004

async function main() {
  console.log('=== NESTING TEST: ART-2026-0004 (Laila Benkirane) ===\n');

  // Get a CEO user for created_by
  const { data: ceoProfile } = await sb.from('profiles')
    .select('id').eq('role', 'ceo').limit(1).single();
  const userId = ceoProfile ? ceoProfile.id : null;

  // 1. Fetch parts
  const { data: parts, error: partsErr } = await sb.from('project_parts')
    .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right')
    .eq('project_id', PROJECT_ID)
    .neq('material_type', 'hardware');

  if (partsErr || !parts || parts.length === 0) {
    console.error('FAIL: Could not fetch parts:', partsErr ? partsErr.message : 'No parts');
    process.exit(1);
  }

  console.log('Parts fetched:', parts.length, 'rows');
  const totalQty = parts.reduce((s, p) => s + p.quantity, 0);
  console.log('Total parts (expanded by quantity):', totalQty);

  // 2. Group by material+thickness
  const groups = new Map();
  for (const p of parts) {
    const key = p.material_type + '__' + p.thickness_mm;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  console.log('Material groups:', [...groups.keys()].join(', '));

  // 3. Delete existing cutting jobs for this project
  const { error: delErr } = await sb.from('cutting_jobs').delete().eq('project_id', PROJECT_ID);
  if (delErr) console.log('Delete old jobs warning:', delErr.message);

  // 4. Create cutting job
  const { data: job, error: jobErr } = await sb.from('cutting_jobs')
    .insert({ project_id: PROJECT_ID, status: 'nesting', created_by: userId })
    .select().single();

  if (jobErr || !job) {
    console.error('FAIL: Could not create cutting job:', jobErr ? jobErr.message : 'unknown');
    process.exit(1);
  }
  console.log('\nCutting job created:', job.id);

  // 5. Run nesting per group
  const allPanels = [];
  let totalPlaced = 0;

  for (const [groupKey, groupParts] of groups.entries()) {
    const [matCode, thicknessStr] = groupKey.split('__');
    const thickness = parseInt(thicknessStr, 10) || 18;
    const fb = FALLBACK_SHEET[matCode] || DEFAULT_SHEET;
    const [sheetW, sheetH] = fb;

    console.log('\n--- Group: ' + matCode + ' (' + thickness + 'mm) | Sheet: ' + sheetW + 'x' + sheetH + 'mm ---');

    const allGrainNone = groupParts.every(function(p) { return p.grain_direction === 'none'; });
    console.log('  Rotation allowed:', allGrainNone);

    // Expand by quantity
    const rects = [];
    for (const part of groupParts) {
      for (let q = 0; q < part.quantity; q++) {
        rects.push({
          width: Math.round(Number(part.width_mm)),
          height: Math.round(Number(part.height_mm)),
          data: { partId: part.id, partLabel: part.part_name, partCode: part.part_code }
        });
      }
    }
    console.log('  Rects to pack:', rects.length);

    const packer = new MaxRectsPacker(sheetW, sheetH, KERF_PADDING, {
      smart: true, pot: false, square: false, allowRotation: allGrainNone
    });
    packer.addArray(rects);

    console.log('  Bins used:', packer.bins.length);

    for (let binIdx = 0; binIdx < packer.bins.length; binIdx++) {
      const bin = packer.bins[binIdx];
      let usedArea = 0;
      const placements = [];

      for (const rect of bin.rects) {
        const rd = rect.data || {};
        const isRotated = !!rect.rot;
        const placedW = isRotated ? rect.height : rect.width;
        const placedH = isRotated ? rect.width : rect.height;
        usedArea += placedW * placedH;
        totalPlaced++;
        placements.push({
          project_part_id: rd.partId || null,
          x_mm: rect.x, y_mm: rect.y,
          width_mm: placedW, height_mm: placedH,
          rotated: isRotated,
          part_label: rd.partCode || rd.partLabel || 'Unknown'
        });
      }

      const sheetArea = sheetW * sheetH;
      const wasteArea = sheetArea - usedArea;
      const wastePct = Math.round((wasteArea / sheetArea) * 10000) / 100;

      console.log('  Panel ' + (binIdx+1) + ': ' + bin.rects.length + ' parts | Used: ' + (usedArea/1e6).toFixed(3) + 'm2 | Waste: ' + wastePct + '%');

      allPanels.push({
        cutting_job_id: job.id,
        material_code: matCode,
        thickness_mm: thickness,
        sheet_width_mm: sheetW,
        sheet_height_mm: sheetH,
        panel_index: binIdx + 1,
        used_area_mm2: usedArea,
        waste_area_mm2: wasteArea,
        waste_percent: wastePct,
        _placements: placements
      });
    }
  }

  // 6. Check for unplaced parts
  const unplaced = totalQty - totalPlaced;
  console.log('\n=== NESTING RESULTS ===');
  console.log('Total parts placed:', totalPlaced);
  console.log('Total parts expected:', totalQty);
  console.log('UNPLACED PARTS:', unplaced);
  console.log('Total panels (sheets):', allPanels.length);

  // 7. Insert panels
  const panelRows = allPanels.map(function(p) {
    return {
      cutting_job_id: p.cutting_job_id,
      material_code: p.material_code,
      thickness_mm: p.thickness_mm,
      sheet_width_mm: p.sheet_width_mm,
      sheet_height_mm: p.sheet_height_mm,
      panel_index: p.panel_index,
      used_area_mm2: p.used_area_mm2,
      waste_area_mm2: p.waste_area_mm2,
      waste_percent: p.waste_percent,
    };
  });

  const { data: insertedPanels, error: panelsErr } = await sb.from('cutting_panels')
    .insert(panelRows).select('id');

  if (panelsErr) {
    console.error('FAIL: Insert panels:', panelsErr.message);
    process.exit(1);
  }
  console.log('Panels inserted:', insertedPanels.length);

  // 8. Insert placements
  let totalPlacements = 0;
  for (let i = 0; i < insertedPanels.length; i++) {
    const panelId = insertedPanels[i].id;
    const panelData = allPanels[i];
    const pRows = panelData._placements.map(function(pl) {
      return {
        cutting_panel_id: panelId,
        project_part_id: pl.project_part_id,
        x_mm: pl.x_mm, y_mm: pl.y_mm,
        width_mm: pl.width_mm, height_mm: pl.height_mm,
        rotated: pl.rotated, part_label: pl.part_label
      };
    });
    const { error: plErr } = await sb.from('panel_placements').insert(pRows);
    if (plErr) {
      console.error('FAIL: Insert placements for panel', i, ':', plErr.message);
    } else {
      totalPlacements += pRows.length;
    }
  }
  console.log('Total placements inserted:', totalPlacements);

  // 9. Update job stats
  const avgWaste = allPanels.length > 0
    ? Math.round(allPanels.reduce(function(s, p) { return s + p.waste_percent; }, 0) / allPanels.length * 100) / 100
    : 0;

  await sb.from('cutting_jobs').update({
    status: 'nested',
    total_parts: totalPlaced,
    total_panels: allPanels.length,
    total_waste_pct: avgWaste,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);

  console.log('\n=== FINAL SUMMARY ===');
  console.log('Job ID:', job.id);
  console.log('Status: nested');
  console.log('Parts:', totalPlaced);
  console.log('Panels:', allPanels.length);
  console.log('Avg Waste:', avgWaste, '%');
  console.log('Placements:', totalPlacements);
  console.log('Unplaced:', unplaced);
  console.log('\nSUCCESS: Nesting complete');
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
