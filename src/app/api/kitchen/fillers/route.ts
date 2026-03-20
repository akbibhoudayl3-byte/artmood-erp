import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole, sanitizeNumber } from '@/lib/auth/server';

/** POST /api/kitchen/fillers — Save fillers for a kitchen */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  let body: {
    kitchen_id: string;
    fillers: {
      wall_id: string;
      side: 'left' | 'right';
      width_mm: number;
      height_mm: number;
      depth_mm: number;
    }[];
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.kitchen_id) {
    return NextResponse.json({ error: 'kitchen_id required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  // Delete existing fillers
  await supabase.from('kitchen_fillers').delete().eq('kitchen_id', body.kitchen_id);

  if (!body.fillers || body.fillers.length === 0) {
    return NextResponse.json({ fillers: [] });
  }

  const records = body.fillers
    .filter(f => f.width_mm > 0)
    .map(f => ({
      kitchen_id: body.kitchen_id,
      wall_id: f.wall_id,
      side: f.side,
      width_mm: sanitizeNumber(f.width_mm, { min: 1, max: 500 }) ?? 50,
      height_mm: sanitizeNumber(f.height_mm, { min: 200, max: 2500 }) ?? 700,
      depth_mm: sanitizeNumber(f.depth_mm, { min: 200, max: 800 }) ?? 560,
    }));

  if (records.length === 0) return NextResponse.json({ fillers: [] });

  const { data, error } = await supabase
    .from('kitchen_fillers')
    .insert(records)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fillers: data }, { status: 201 });
}
