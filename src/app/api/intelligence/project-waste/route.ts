import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';

export async function GET(request: Request) {
  const ctx = await guard(['ceo', 'commercial_manager', 'workshop_manager']);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project_id');

  let query = ctx.supabase
    .from('v_project_material_waste')
    .select('project_id,reference_code,client_name,expected_qty,actual_qty,waste_qty,waste_pct,waste_health,consumption_records');

  if (projectId) {
    query = query.eq('project_id', projectId);
  } else {
    query = query
      .gt('consumption_records', 0)
      .order('waste_pct', { ascending: false });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(projectId ? (data?.[0] ?? null) : data);
}
