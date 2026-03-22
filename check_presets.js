const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await sb.from('cabinet_material_presets').select('*');
  if (error) { console.error(error.message); process.exit(1); }
  console.log('=== CABINET MATERIAL PRESETS ===\n');
  for (const p of (data || [])) {
    console.log('Name:', p.name, '(id:', p.id + ')');
    console.log('  carcass:', p.carcass_material, '@', p.carcass_thickness_mm + 'mm');
    console.log('  facade:', p.facade_material, '@', p.facade_thickness_mm + 'mm');
    console.log('  back_panel:', p.back_panel_material, '@', p.back_panel_thickness_mm + 'mm');
    const backExpected = p.back_panel_material === 'back_hdf_5' ? 5 :
                         p.back_panel_material === 'back_hdf_3' ? 3 :
                         p.back_panel_material === 'back_mdf_8' ? 8 : null;
    if (backExpected && p.back_panel_thickness_mm !== backExpected) {
      console.log('  *** MISMATCH: back_panel_thickness_mm should be', backExpected);
    }
    console.log('');
  }
}
main().catch(function(e) { console.error(e); process.exit(1); });
