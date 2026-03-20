import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole, sanitizeNumber } from '@/lib/auth/server';

/** POST /api/kitchen/place-modules — Save placed modules for a kitchen */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  let body: {
    kitchen_id: string;
    modules: {
      wall_id: string;
      module_id: string;
      width_mm: number;
      height_mm: number;
      depth_mm: number;
      facade_override?: string | null;
    }[];
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.kitchen_id || !Array.isArray(body.modules)) {
    return NextResponse.json({ error: 'kitchen_id and modules[] required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  // Delete existing modules
  await supabase.from('kitchen_modules').delete().eq('kitchen_id', body.kitchen_id);

  let posX = 0;
  let currentWall = '';
  const records = body.modules.map((m, i) => {
    if (m.wall_id !== currentWall) {
      posX = 0;
      currentWall = m.wall_id;
    }
    const rec = {
      kitchen_id: body.kitchen_id,
      wall_id: m.wall_id,
      module_id: m.module_id,
      position_x_mm: posX,
      width_mm: sanitizeNumber(m.width_mm, { min: 100, max: 2000 }) ?? 600,
      height_mm: sanitizeNumber(m.height_mm, { min: 200, max: 2500 }) ?? 700,
      depth_mm: sanitizeNumber(m.depth_mm, { min: 200, max: 800 }) ?? 560,
      facade_override: m.facade_override || null,
      sort_order: i,
    };
    posX += rec.width_mm;
    return rec;
  });

  const { data, error } = await supabase
    .from('kitchen_modules')
    .insert(records)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modules: data }, { status: 201 });
}
