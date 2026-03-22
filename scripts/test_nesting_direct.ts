// Direct nesting test with service role key (bypasses RLS)
import { createClient } from '@supabase/supabase-js';
import type { SawNestingResult, SawStrip, SawStripPart } from '@/types/production';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROJECT_ID = 'a5e2d220-2759-44d3-abff-daa4dae6d9f7';
const KERF = 4;

const MATERIAL_THICKNESS_MAP: Record<string, number> = {
  mdf_18: 18, mdf_16: 16, mdf_22: 22, mdf_10: 10,
  back_hdf_5: 5, melamine_18: 18, melamine_16: 16,
  plywood_18: 18, plywood_12: 12, compact_12: 12
};

const FALLBACK_SHEET: Record<string, [number, number]> = {
  mdf_18: [2800, 1220], mdf_16: [2800, 1220], mdf_22: [2800, 1220], mdf_10: [2800, 1220],
  back_hdf_5: [2440, 1220], melamine_18: [2800, 1220], melamine_16: [2800, 1220],
  plywood_18: [2440, 1220], plywood_12: [2440, 1220], compact_12: [2440, 1220]
};

interface Rect { id: string; label: string; w: number; h: number; eT: boolean; eB: boolean; eL: boolean; eR: boolean; }

function makePart(r: Rect, x: number): SawStripPart {
  return { partId: r.id, label: r.label, width: r.w, height: r.h, crossX: x, rotated: false, edgeTop: r.eT, edgeBottom: r.eB, edgeLeft: r.eL, edgeRight: r.eR };
}

function makeSheet(sheetW: number, sheetH: number, idx: number): SawNestingResult {
  return { id: '', project_id: PROJECT_ID, material_code: '', thickness_mm: 0, sheet_width_mm: sheetW, sheet_height_mm: sheetH, sheet_index: idx, strips: [], used_area_mm2: 0, waste_area_mm2: 0, waste_percent: 0, created_at: '' };
}

function stripUsedW(strip: SawStrip): number {
  return strip.parts.reduce((s, p) => s + p.width + KERF, 0);
}

// Strategy 1: Same-height strips
function strategySameHeight(rects: Rect[], sheetW: number, sheetH: number) {
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  const sheets: SawNestingResult[] = [];
  let sheetIdx = 0;
  let cur = { strips: [] as SawStrip[], usedH: 0 };

  function startSheet() {
    sheetIdx++;
    const s = makeSheet(sheetW, sheetH, sheetIdx);
    sheets.push(s);
    cur = { strips: s.strips, usedH: 0 };
  }
  startSheet();

  for (const r of sorted) {
    let placed = false;
    for (const strip of cur.strips) {
      if (strip.stripHeight === r.h && stripUsedW(strip) + r.w <= sheetW) {
        strip.parts.push(makePart(r, stripUsedW(strip)));
        placed = true; break;
      }
    }
    if (!placed && cur.usedH + r.h + KERF <= sheetH) {
      const strip: SawStrip = { stripIndex: cur.strips.length + 1, ripY: cur.usedH, stripHeight: r.h, parts: [makePart(r, 0)], wasteWidth: 0 };
      cur.strips.push(strip);
      cur.usedH += r.h + KERF;
      placed = true;
    }
    if (!placed) {
      startSheet();
      const strip: SawStrip = { stripIndex: 1, ripY: 0, stripHeight: r.h, parts: [makePart(r, 0)], wasteWidth: 0 };
      cur.strips.push(strip);
      cur.usedH = r.h + KERF;
    }
  }
  return sheets;
}

// Strategy 2: Mixed-height (shorter parts fit into taller strips)
function strategyMixedHeight(rects: Rect[], sheetW: number, sheetH: number) {
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  const sheets: SawNestingResult[] = [];
  let sheetIdx = 0;
  let cur = { strips: [] as SawStrip[], usedH: 0 };

  function startSheet() {
    sheetIdx++;
    const s = makeSheet(sheetW, sheetH, sheetIdx);
    sheets.push(s);
    cur = { strips: s.strips, usedH: 0 };
  }
  startSheet();

  for (const r of sorted) {
    let placed = false;
    let bestStrip: SawStrip | null = null;
    let bestWaste = Infinity;
    for (const strip of cur.strips) {
      if (r.h <= strip.stripHeight && stripUsedW(strip) + r.w <= sheetW) {
        const waste = strip.stripHeight - r.h;
        if (waste < bestWaste) { bestStrip = strip; bestWaste = waste; }
      }
    }
    if (bestStrip) {
      bestStrip.parts.push(makePart(r, stripUsedW(bestStrip)));
      placed = true;
    }
    if (!placed && cur.usedH + r.h + KERF <= sheetH) {
      const strip: SawStrip = { stripIndex: cur.strips.length + 1, ripY: cur.usedH, stripHeight: r.h, parts: [makePart(r, 0)], wasteWidth: 0 };
      cur.strips.push(strip);
      cur.usedH += r.h + KERF;
      placed = true;
    }
    if (!placed) {
      startSheet();
      const strip: SawStrip = { stripIndex: 1, ripY: 0, stripHeight: r.h, parts: [makePart(r, 0)], wasteWidth: 0 };
      cur.strips.push(strip);
      cur.usedH = r.h + KERF;
    }
  }
  return sheets;
}

// Strategy 3: Greedy fill (area-sorted, best-fit strip)
function strategyGreedyFill(rects: Rect[], sheetW: number, sheetH: number) {
  const sorted = [...rects].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const sheets: SawNestingResult[] = [];
  let sheetIdx = 0;
  let cur = { strips: [] as SawStrip[], usedH: 0 };

  function startSheet() {
    sheetIdx++;
    const s = makeSheet(sheetW, sheetH, sheetIdx);
    sheets.push(s);
    cur = { strips: s.strips, usedH: 0 };
  }
  startSheet();

  for (const r of sorted) {
    let placed = false;
    let bestStrip: SawStrip | null = null;
    let bestRemaining = Infinity;
    for (const strip of cur.strips) {
      if (r.h <= strip.stripHeight) {
        const remaining = sheetW - stripUsedW(strip) - r.w;
        if (remaining >= 0 && remaining < bestRemaining) {
          bestStrip = strip; bestRemaining = remaining;
        }
      }
    }
    if (bestStrip) {
      bestStrip.parts.push(makePart(r, stripUsedW(bestStrip)));
      placed = true;
    }
    if (!placed && cur.usedH + r.h + KERF <= sheetH) {
      const strip: SawStrip = { stripIndex: cur.strips.length + 1, ripY: cur.usedH, stripHeight: r.h, parts: [makePart(r, 0)], wasteWidth: 0 };
      cur.strips.push(strip);
      cur.usedH += r.h + KERF;
      placed = true;
    }
    if (!placed) {
      startSheet();
      const strip: SawStrip = { stripIndex: 1, ripY: 0, stripHeight: r.h, parts: [makePart(r, 0)], wasteWidth: 0 };
      cur.strips.push(strip);
      cur.usedH = r.h + KERF;
    }
  }
  return sheets;
}

function calcWaste(sheets: SawNestingResult[], sheetW: number, sheetH: number) {
  const sheetArea = sheetW * sheetH;
  let totalUsed = 0;
  for (const s of sheets) {
    for (const strip of s.strips) {
      for (const p of strip.parts) totalUsed += p.width * p.height;
    }
  }
  const totalArea = sheets.length * sheetArea;
  return { waste: totalArea > 0 ? (totalArea - totalUsed) / totalArea * 100 : 0, sheets: sheets.length, totalUsed };
}

async function main() {
  // 1. Fetch parts
  const { data: parts, error } = await supabase.from('project_parts')
    .select('id, part_code, part_name, material_type, thickness_mm, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right')
    .eq('project_id', PROJECT_ID);

  if (error || !parts?.length) { console.log('Error:', error?.message || 'No parts'); return; }
  console.log('Parts fetched:', parts.length);

  // 2. Group by material, exclude hardware
  const groups: Record<string, { material: string; thickness: number; rects: Rect[] }> = {};
  let totalPieces = 0;

  for (const p of parts) {
    if (!p.material_type || p.material_type.startsWith('hardware') || !p.width_mm || !p.height_mm) continue;
    const key = p.material_type;
    if (!groups[key]) groups[key] = { material: p.material_type, thickness: p.thickness_mm || MATERIAL_THICKNESS_MAP[p.material_type] || 18, rects: [] };
    const qty = p.quantity || 1;
    for (let i = 0; i < qty; i++) {
      totalPieces++;
      groups[key].rects.push({
        id: p.id + (qty > 1 ? '-' + i : ''),
        label: p.part_code || p.part_name || 'Part',
        w: Math.round(Number(p.width_mm)),
        h: Math.round(Number(p.height_mm)),
        eT: !!p.edge_top, eB: !!p.edge_bottom, eL: !!p.edge_left, eR: !!p.edge_right
      });
    }
  }

  console.log('Total cuttable pieces:', totalPieces);
  console.log('Material groups:', Object.keys(groups).join(', '));
  console.log('');

  // 3. Run all 3 strategies per group and pick best
  const allStrategies = [
    { name: 'same-height', fn: strategySameHeight },
    { name: 'mixed-height', fn: strategyMixedHeight },
    { name: 'greedy-fill', fn: strategyGreedyFill },
  ];

  let grandTotalParts = 0;
  const allResults: SawNestingResult[] = [];
  const globalComparison: { strategy: string; waste: number; sheets: number }[] = [
    { strategy: 'same-height', waste: 0, sheets: 0 },
    { strategy: 'mixed-height', waste: 0, sheets: 0 },
    { strategy: 'greedy-fill', waste: 0, sheets: 0 },
  ];

  for (const [matKey, grp] of Object.entries(groups)) {
    const [sheetW, sheetH] = FALLBACK_SHEET[grp.material] || [2800, 1220];
    console.log('=== ' + matKey + ' (' + grp.rects.length + ' pcs) | Sheet: ' + sheetW + 'x' + sheetH + ' ===');

    let bestWaste = Infinity;
    let bestSheets: SawNestingResult[] = [];
    let bestName = '';

    for (let si = 0; si < allStrategies.length; si++) {
      const strat = allStrategies[si];
      const sheets = strat.fn(grp.rects, sheetW, sheetH);
      const { waste, sheets: count } = calcWaste(sheets, sheetW, sheetH);
      console.log('  ' + strat.name + ': waste=' + waste.toFixed(1) + '%, sheets=' + count);

      globalComparison[si].waste += waste * count;
      globalComparison[si].sheets += count;

      if (waste < bestWaste || (waste === bestWaste && count < bestSheets.length)) {
        bestWaste = waste;
        bestSheets = sheets;
        bestName = strat.name;
      }
    }

    console.log('  >> Winner: ' + bestName + ' (' + bestWaste.toFixed(1) + '%)');

    // Finalize sheets
    for (const s of bestSheets) {
      s.material_code = matKey;
      s.thickness_mm = grp.thickness;
      let used = 0;
      for (const strip of s.strips) {
        for (const p of strip.parts) used += p.width * p.height;
        strip.wasteWidth = sheetW - stripUsedW(strip) + KERF;
        grandTotalParts += strip.parts.length;
      }
      s.used_area_mm2 = used;
      s.waste_area_mm2 = sheetW * sheetH - used;
      s.waste_percent = Number(((sheetW * sheetH - used) / (sheetW * sheetH) * 100).toFixed(2));
    }

    allResults.push(...bestSheets);
    console.log('');
  }

  // 4. Persist to DB
  console.log('=== Persisting to database ===');
  await supabase.from('saw_nesting_results').delete().eq('project_id', PROJECT_ID);

  for (const sheet of allResults) {
    const { error: insertErr } = await supabase.from('saw_nesting_results').insert({
      project_id: PROJECT_ID,
      material_code: sheet.material_code,
      thickness_mm: sheet.thickness_mm,
      sheet_width_mm: sheet.sheet_width_mm,
      sheet_height_mm: sheet.sheet_height_mm,
      sheet_index: sheet.sheet_index,
      strips: sheet.strips,
      used_area_mm2: sheet.used_area_mm2,
      waste_area_mm2: sheet.waste_area_mm2,
      waste_percent: sheet.waste_percent,
    });
    if (insertErr) console.log('Insert error:', insertErr.message);
  }

  // 5. Global strategy comparison
  for (const c of globalComparison) {
    c.waste = c.sheets > 0 ? c.waste / c.sheets : 0;
  }

  // 6. Summary
  const avgWaste = allResults.length > 0
    ? allResults.reduce((s, r) => s + Number(r.waste_percent), 0) / allResults.length
    : 0;

  console.log('');
  console.log('===================================================');
  console.log('     SAW NESTING OPTIMIZER — LIVE RESULTS');
  console.log('===================================================');
  console.log(' Total cuttable parts: ' + grandTotalParts);
  console.log(' Total sheets:         ' + allResults.length);
  console.log(' Average waste:        ' + avgWaste.toFixed(1) + '%');
  console.log('');
  console.log(' Strategy Comparison (weighted avg waste):');
  for (const c of globalComparison) {
    console.log('   ' + c.strategy.padEnd(15) + ': ' + c.waste.toFixed(1) + '% waste, ' + c.sheets + ' sheets');
  }
  console.log('===================================================');

  // 7. Verify persistence
  const { data: stored } = await supabase.from('saw_nesting_results')
    .select('id, material_code, sheet_index, waste_percent, strips')
    .eq('project_id', PROJECT_ID)
    .order('material_code').order('sheet_index');
  console.log('\nPersisted sheets:', (stored || []).length);
  for (const s of (stored || [])) {
    const stripCount = Array.isArray(s.strips) ? s.strips.length : 0;
    const partCount = Array.isArray(s.strips) ? s.strips.reduce((sum: number, st: any) => sum + (st.parts?.length || 0), 0) : 0;
    console.log('  ' + s.material_code + ' #' + s.sheet_index + ' | waste=' + Number(s.waste_percent).toFixed(1) + '% | strips=' + stripCount + ' | parts=' + partCount);
  }
}

main().catch(e => console.error('Fatal:', e));
