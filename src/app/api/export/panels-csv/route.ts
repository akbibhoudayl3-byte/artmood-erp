
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

export async function GET(req: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager']);
  if (auth instanceof NextResponse) return auth;

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid project_id' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: panels, error } = await supabase
    .from('production_sheet_panels')
    .select('*, production_sheet:production_sheets!inner(project_id)')
    .eq('production_sheet.project_id', projectId)
    .order('sort_order');

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  await writeAuditLog({
    user_id: auth.userId,
    action: 'export',
    entity_type: 'panels',
    entity_id: projectId,
    notes: 'CSV export',
  });

  const rows = (panels || []).map((p: any) => [
    p.panel_code, p.description, p.width, p.height, p.thickness,
    p.material, p.edge_top, p.edge_bottom, p.edge_left, p.edge_right,
    p.current_station, p.is_completed ? 'oui' : 'non',
  ].map(v => JSON.stringify(v ?? '')).join(','));

  const csv = [
    'Code,Description,Largeur,Hauteur,Épaisseur,Matière,BdT,BdB,BdG,BdD,Station,Terminé',
    ...rows,
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="panels-${projectId}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
