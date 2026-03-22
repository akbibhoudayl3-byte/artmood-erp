
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
  melamine_anthracite: 'Mél. Anthracite', melamine_blanc: 'Mél. Blanc',
  melamine_chene: 'Mél. Chêne', melamine_noyer: 'Mél. Noyer',
};

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

  const ref = esc(project.reference_code || 'N/A');

  // Collect all labels
  let labelsHtml = '';
  let labelCount = 0;

  for (const sheet of sheets) {
    const matLabel = esc(MAT_LABELS[sheet.material_code] || sheet.material_code);
    const strips = (sheet.strips || []) as any[];

    for (const strip of strips) {
      for (const part of (strip.parts || [])) {
        labelCount++;

        // Edge indicators
        const edges: string[] = [];
        if (part.edgeTop) edges.push('<span style="display:inline-block;width:18px;height:3px;background:#f97316;border-radius:2px;vertical-align:middle;" title="Top"></span> T');
        if (part.edgeBottom) edges.push('<span style="display:inline-block;width:18px;height:3px;background:#f97316;border-radius:2px;vertical-align:middle;" title="Bottom"></span> B');
        if (part.edgeLeft) edges.push('<span style="display:inline-block;width:3px;height:18px;background:#f97316;border-radius:2px;vertical-align:middle;" title="Left"></span> L');
        if (part.edgeRight) edges.push('<span style="display:inline-block;width:3px;height:18px;background:#f97316;border-radius:2px;vertical-align:middle;" title="Right"></span> R');

        labelsHtml += `
          <div class="label">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
              <span style="font-size:14px;font-weight:800;color:#C9956B;">${ref}</span>
              <span style="font-size:9px;color:#9ca3af;">S${sheet.sheet_index}/St${strip.stripIndex}</span>
            </div>
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${esc(part.label)}
            </div>
            <div style="font-size:16px;font-weight:800;color:#2563eb;margin-bottom:3px;">
              ${part.width} × ${part.height} × ${sheet.thickness_mm} mm
            </div>
            <div style="font-size:10px;color:#64748b;margin-bottom:3px;">
              ${matLabel}
            </div>
            ${edges.length > 0
              ? `<div style="font-size:10px;display:flex;gap:6px;align-items:center;">${edges.join(' ')}</div>`
              : '<div style="font-size:9px;color:#d1d5db;">No edges</div>'
            }
            <div style="font-size:8px;color:#d1d5db;margin-top:auto;text-align:right;">
              ${esc(part.partId?.slice(0, 8) || '')}
            </div>
          </div>
        `;
      }
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SAW Labels — ${ref}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 8px;
    }
    .labels-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }
    .label {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 8px 10px;
      height: 110px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      page-break-inside: avoid;
      background: white;
    }
    .label:hover {
      border-color: #C9956B;
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding:12px;text-align:center;background:#f8fafc;border-bottom:1px solid #e5e7eb;margin-bottom:8px;">
    <button onclick="window.print()" style="padding:8px 24px;background:#C9956B;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">
      🖨️ Print Labels (${labelCount} labels)
    </button>
  </div>
  <div class="labels-grid">
    ${labelsHtml}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
