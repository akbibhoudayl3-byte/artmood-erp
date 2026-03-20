import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole, sanitizeNumber } from '@/lib/auth/server';

/** POST /api/kitchen/walls — Save walls for a kitchen */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  let body: { kitchen_id: string; walls: { wall_name: string; wall_length_mm: number }[] };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.kitchen_id || !Array.isArray(body.walls) || body.walls.length === 0) {
    return NextResponse.json({ error: 'kitchen_id and walls[] required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  // Delete existing walls (cascade deletes modules/fillers on that wall)
  await supabase.from('kitchen_walls').delete().eq('kitchen_id', body.kitchen_id);

  const wallRecords = body.walls.map((w, i) => ({
    kitchen_id: body.kitchen_id,
    wall_name: w.wall_name || String.fromCharCode(65 + i), // A, B, C
    wall_length_mm: sanitizeNumber(w.wall_length_mm, { min: 300, max: 20000 }) ?? 3000,
    sort_order: i,
  }));

  const { data, error } = await supabase
    .from('kitchen_walls')
    .insert(wallRecords)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ walls: data }, { status: 201 });
}
