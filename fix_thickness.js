/**
 * Audit & fix: material_type vs thickness_mm consistency in project_parts
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Ground truth: what thickness each material_type MUST have
const EXPECTED_THICKNESS = {
  mdf_18: 18,
  mdf_16: 16,
  mdf_22: 22,
  mdf_10: 10,
  back_hdf_5: 5,
  back_hdf_3: 3,
  back_mdf_8: 8,
  stratifie_18: 18,
  stratifie_16: 16,
  melamine_anthracite: 18,
  melamine_blanc: 18,
  melamine_chene: 18,
  melamine_noyer: 18,
};

async function main() {
  console.log('=== AUDIT: material_type vs thickness_mm ===\n');

  // 1. Fetch ALL project_parts with material_type set
  const { data: parts, error } = await sb.from('project_parts')
    .select('id, project_id, part_name, part_code, material_type, thickness_mm')
    .not('material_type', 'is', null)
    .not('material_type', 'eq', 'hardware');

  if (error) {
    console.error('FAIL:', error.message);
    process.exit(1);
  }

  console.log('Total panel parts:', parts.length);

  // 2. Group by material_type + thickness_mm to see all combinations
  const combos = {};
  for (const p of parts) {
    const key = p.material_type + ' @ ' + p.thickness_mm + 'mm';
    if (!combos[key]) combos[key] = [];
    combos[key].push(p);
  }

  console.log('\nAll material_type / thickness_mm combinations:');
  for (const [key, rows] of Object.entries(combos)) {
    console.log('  ' + key + ': ' + rows.length + ' rows');
  }

  // 3. Find mismatches
  const mismatches = [];
  for (const p of parts) {
    const expected = EXPECTED_THICKNESS[p.material_type];
    if (expected !== undefined && p.thickness_mm !== expected) {
      mismatches.push(p);
    }
  }

  console.log('\n=== MISMATCHES FOUND: ' + mismatches.length + ' ===');
  if (mismatches.length === 0) {
    console.log('No mismatches. All clean.');
    return;
  }

  for (const m of mismatches) {
    const expected = EXPECTED_THICKNESS[m.material_type];
    console.log('  ID: ' + m.id);
    console.log('    project_id: ' + m.project_id);
    console.log('    part: ' + (m.part_code || m.part_name));
    console.log('    material_type: ' + m.material_type);
    console.log('    thickness_mm: ' + m.thickness_mm + ' (WRONG) -> should be ' + expected);
    console.log('');
  }

  // 4. Fix mismatches
  console.log('=== FIXING ' + mismatches.length + ' rows ===\n');

  // Group by material_type for batch updates
  const byMaterial = {};
  for (const m of mismatches) {
    if (!byMaterial[m.material_type]) byMaterial[m.material_type] = [];
    byMaterial[m.material_type].push(m.id);
  }

  for (const [matType, ids] of Object.entries(byMaterial)) {
    const correctThickness = EXPECTED_THICKNESS[matType];
    console.log('Updating ' + ids.length + ' rows: ' + matType + ' -> thickness_mm = ' + correctThickness);

    const { error: updateErr } = await sb.from('project_parts')
      .update({ thickness_mm: correctThickness })
      .in('id', ids);

    if (updateErr) {
      console.error('  FAIL:', updateErr.message);
    } else {
      console.log('  OK');
    }
  }

  // 5. Verify
  console.log('\n=== VERIFICATION ===');
  const { data: verify } = await sb.from('project_parts')
    .select('id, material_type, thickness_mm')
    .not('material_type', 'is', null)
    .not('material_type', 'eq', 'hardware');

  let remaining = 0;
  for (const p of (verify || [])) {
    const expected = EXPECTED_THICKNESS[p.material_type];
    if (expected !== undefined && p.thickness_mm !== expected) {
      remaining++;
    }
  }
  console.log('Remaining mismatches: ' + remaining);
  if (remaining === 0) {
    console.log('ALL CLEAN. Data integrity verified.');
  } else {
    console.log('WARNING: ' + remaining + ' mismatches still exist.');
  }
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
