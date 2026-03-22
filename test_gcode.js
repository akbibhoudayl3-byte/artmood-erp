/**
 * Test: Generate G-code for the cutting job we just created
 */
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SAFE_Z = 5.0;
const FEED_RATE = 3000;
const PLUNGE_FEED = 1000;
const SPINDLE_RPM = 18000;
const TOOL_DIAMETER = 6;
const OFFSET = TOOL_DIAMETER / 2;

const MAT_LABELS = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm',
};

const JOB_ID = 'ea982239-32b4-433d-9275-c4eec86be111';
const PROJECT_ID = 'a5e2d220-2759-44d3-abff-daa4dae6d9f7';

async function main() {
  console.log('=== G-CODE GENERATION TEST ===\n');

  // 1. Get project reference
  const { data: project } = await sb.from('projects')
    .select('reference_code').eq('id', PROJECT_ID).single();
  const refCode = project ? project.reference_code : 'PROJ';
  console.log('Project:', refCode);

  // 2. Fetch panels with placements
  const { data: panels, error: panelsErr } = await sb.from('cutting_panels')
    .select('*, placements:panel_placements(*)')
    .eq('cutting_job_id', JOB_ID)
    .order('material_code, panel_index');

  if (panelsErr || !panels || panels.length === 0) {
    console.error('FAIL: No panels found:', panelsErr ? panelsErr.message : 'empty');
    process.exit(1);
  }
  console.log('Panels found:', panels.length);

  // 3. Delete existing G-code
  await sb.from('cnc_programs').delete().eq('cutting_job_id', JOB_ID);

  // 4. Generate G-code for each panel
  const programs = [];
  const dateStr = new Date().toISOString().split('T')[0];

  for (const panel of panels) {
    const placements = panel.placements || [];
    if (placements.length === 0) continue;

    const matLabel = MAT_LABELS[panel.material_code] || panel.material_code;
    const fileName = 'CNC_' + refCode + '_' + panel.material_code + '_' + panel.thickness_mm + 'mm_P' + panel.panel_index + '.nc';
    const depth = panel.thickness_mm + 1;

    const lines = [
      '(==============================================)',
      '( ArtMood Factory OS - CNC Program )',
      '( Project: ' + refCode + ' )',
      '( Material: ' + matLabel + ' )',
      '( Panel: #' + panel.panel_index + ' )',
      '( Sheet: ' + panel.sheet_width_mm + ' x ' + panel.sheet_height_mm + ' mm )',
      '( Parts: ' + placements.length + ' )',
      '( Date: ' + dateStr + ' )',
      '(==============================================)',
      '',
      'G90 G21          (Absolute positioning, millimeters)',
      'G17              (XY plane selection)',
      'G00 Z' + SAFE_Z.toFixed(1) + '       (Rapid to safe height)',
      'M03 S' + SPINDLE_RPM + '      (Spindle ON CW)',
      'G04 P2           (Dwell 2s for spindle ramp-up)',
      '',
    ];

    for (var i = 0; i < placements.length; i++) {
      var pl = placements[i];
      var x = Number(pl.x_mm);
      var y = Number(pl.y_mm);
      var w = Number(pl.width_mm);
      var h = Number(pl.height_mm);

      var x0 = (x + OFFSET).toFixed(2);
      var y0 = (y + OFFSET).toFixed(2);
      var x1 = (x + w - OFFSET).toFixed(2);
      var y1 = (y + h - OFFSET).toFixed(2);

      lines.push('(--- Part ' + (i+1) + ': ' + (pl.part_label || 'Part') + ' [' + w + 'x' + h + 'mm]' + (pl.rotated ? ' ROTATED' : '') + ' ---)');
      lines.push('G00 X' + x0 + ' Y' + y0 + '                (Rapid to start)');
      lines.push('G01 Z-' + depth.toFixed(1) + ' F' + PLUNGE_FEED + '    (Plunge cut)');
      lines.push('G01 X' + x1 + ' F' + FEED_RATE + '          (Cut right)');
      lines.push('G01 Y' + y1 + '                        (Cut up)');
      lines.push('G01 X' + x0 + '                        (Cut left)');
      lines.push('G01 Y' + y0 + '                        (Cut down - close)');
      lines.push('G00 Z' + SAFE_Z.toFixed(1) + '                    (Retract)');
      lines.push('');
    }

    lines.push('(==============================================)');
    lines.push('( End of program )');
    lines.push('(==============================================)');
    lines.push('M05              (Spindle OFF)');
    lines.push('G00 Z' + SAFE_Z.toFixed(1) + '       (Final retract)');
    lines.push('G00 X0 Y0        (Home)');
    lines.push('M30              (Program end)');
    lines.push('%');

    var fileContent = lines.join('\n');

    programs.push({
      project_id: PROJECT_ID,
      cutting_job_id: JOB_ID,
      cutting_panel_id: panel.id,
      file_name: fileName,
      file_content: fileContent,
      format: 'gcode',
    });
  }

  // 5. Insert all programs
  if (programs.length > 0) {
    const { error: insertErr } = await sb.from('cnc_programs').insert(programs);
    if (insertErr) {
      console.error('FAIL: Insert G-code:', insertErr.message);
      process.exit(1);
    }
  }

  console.log('\n=== G-CODE RESULTS ===');
  console.log('Files generated:', programs.length);
  console.log('');
  for (var j = 0; j < programs.length; j++) {
    var p = programs[j];
    var lineCount = p.file_content.split('\n').length;
    var sizeKb = (p.file_content.length / 1024).toFixed(1);
    console.log((j+1) + '. ' + p.file_name + ' (' + lineCount + ' lines, ' + sizeKb + ' KB)');
  }

  // 6. Print sample snippet from first file
  console.log('\n=== SAMPLE G-CODE SNIPPET (first 30 lines of first file) ===');
  var firstLines = programs[0].file_content.split('\n').slice(0, 30);
  for (var k = 0; k < firstLines.length; k++) {
    console.log(firstLines[k]);
  }

  // 7. Verify non-empty content
  var allNonEmpty = programs.every(function(p) { return p.file_content.length > 100; });
  console.log('\nAll files non-empty:', allNonEmpty);
  console.log('\nSUCCESS: G-code generation complete');
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
