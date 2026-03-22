
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';

/** Escape HTML */
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MAT_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm', mdf_10: 'MDF 10mm',
  stratifie_18: 'Stratifié 18mm', stratifie_16: 'Stratifié 16mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm', back_mdf_8: 'MDF 8mm',
  melamine_anthracite: 'Mélamine Anthracite', melamine_blanc: 'Mélamine Blanc',
  melamine_chene: 'Mélamine Chêne', melamine_noyer: 'Mélamine Noyer',
};

const KERF = 4;

export async function GET(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker']);
  if (auth instanceof NextResponse) return auth;

  const projectId = request.nextUrl.searchParams.get('projectId');
  const materialFilter = request.nextUrl.searchParams.get('material');

  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  // Fetch project
  const { data: project } = await supabase.from('projects')
    .select('reference_code, client_name')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Fetch nesting results
  let query = supabase.from('saw_nesting_results')
    .select('*')
    .eq('project_id', projectId)
    .order('material_code, sheet_index');

  if (materialFilter) {
    query = query.eq('material_code', materialFilter);
  }

  const { data: sheets } = await query;
  if (!sheets?.length) {
    return NextResponse.json({ error: 'No nesting results. Generate nesting first.' }, { status: 404 });
  }

  const dateStr = new Date().toLocaleDateString('fr-FR');
  const ref = esc(project.reference_code || 'N/A');
  const client = esc(project.client_name);

  // Build HTML
  let sheetsHtml = '';

  for (const sheet of sheets) {
    const matLabel = esc(MAT_LABELS[sheet.material_code] || sheet.material_code);
    const strips = (sheet.strips || []) as any[];

    // Rip cut instructions
    let ripInstructions = '';
    let currentY = 0;
    for (let si = 0; si < strips.length; si++) {
      const strip = strips[si];
      if (si > 0) {
        currentY += KERF;
      }
      ripInstructions += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${si + 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">Rip cut at Y = ${currentY}mm</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${strip.stripHeight}mm strip height</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${strip.parts?.length || 0} parts</td>
      </tr>`;
      currentY += strip.stripHeight;
    }

    // Crosscut instructions per strip
    let crosscutHtml = '';
    for (const strip of strips) {
      const parts = strip.parts || [];
      let crossRows = '';
      let crossX = 0;
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const edgeStr = [
          part.edgeTop ? '▬T' : '',
          part.edgeBottom ? '▬B' : '',
          part.edgeLeft ? '|L' : '',
          part.edgeRight ? '|R' : '',
        ].filter(Boolean).join(' ') || '—';

        crossRows += `<tr>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">${pi + 1}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-weight:600;">${esc(part.label)}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">${part.width} × ${part.height} mm</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">X = ${crossX}mm</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">${edgeStr}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:center;">☐</td>
        </tr>`;
        crossX += part.width + KERF;
      }

      crosscutHtml += `
        <div style="margin-top:12px;">
          <h4 style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:6px;">
            Strip ${strip.stripIndex} — Height: ${strip.stripHeight}mm
            ${strip.wasteWidth > 0 ? `<span style="color:#d97706;font-weight:400;"> (waste: ${strip.wasteWidth}mm)</span>` : ''}
          </h4>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#f3f4f6;font-weight:600;">
              <th style="padding:5px 8px;text-align:left;">#</th>
              <th style="padding:5px 8px;text-align:left;">Part</th>
              <th style="padding:5px 8px;text-align:left;">Dimensions</th>
              <th style="padding:5px 8px;text-align:left;">Crosscut</th>
              <th style="padding:5px 8px;text-align:left;">Edges</th>
              <th style="padding:5px 8px;text-align:center;">✓</th>
            </tr></thead>
            <tbody>${crossRows}</tbody>
          </table>
        </div>
      `;
    }

    sheetsHtml += `
      <div class="sheet-page" style="page-break-before:${sheetsHtml ? 'always' : 'auto'};padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C9956B;padding-bottom:12px;margin-bottom:16px;">
          <div>
            <h1 style="font-size:20px;font-weight:800;color:#1e293b;margin:0;">ArtMood — SAW Cutting Instructions</h1>
            <p style="font-size:14px;color:#64748b;margin:4px 0 0;">Project: <strong>${ref}</strong> — ${client}</p>
          </div>
          <div style="text-align:right;font-size:12px;color:#64748b;">
            <p style="margin:0;">${dateStr}</p>
            <p style="margin:2px 0 0;font-weight:600;color:#1e293b;">${matLabel}</p>
            <p style="margin:2px 0 0;">Sheet #${sheet.sheet_index} (${sheet.sheet_width_mm} × ${sheet.sheet_height_mm} mm)</p>
          </div>
        </div>

        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:8px;">1. Rip Cuts (Y axis)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
          <thead><tr style="background:#fef3c7;font-weight:600;">
            <th style="padding:6px 10px;text-align:left;">Step</th>
            <th style="padding:6px 10px;text-align:left;">Action</th>
            <th style="padding:6px 10px;text-align:left;">Result</th>
            <th style="padding:6px 10px;text-align:left;">Parts</th>
          </tr></thead>
          <tbody>${ripInstructions}</tbody>
        </table>

        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:8px;">2. Crosscuts (X axis) per Strip</h3>
        ${crosscutHtml}

        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
          <span>Waste: ${sheet.waste_percent}% | Parts: ${strips.reduce((s: number, st: any) => s + (st.parts?.length || 0), 0)}</span>
          <span>Operator: _______________________ Date: _____________</span>
        </div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SAW Instructions — ${ref}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    @media print {
      body { margin: 0; padding: 0; }
      .sheet-page { page-break-inside: avoid; }
      .no-print { display: none !important; }
    }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; line-height: 1.4; }
    table { border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; }
    th, td { text-align: left; }
  </style>
</head>
<body>
  <div class="no-print" style="padding:12px;text-align:center;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
    <button onclick="window.print()" style="padding:8px 24px;background:#C9956B;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">
      🖨️ Print Instructions
    </button>
  </div>
  ${sheetsHtml}
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
