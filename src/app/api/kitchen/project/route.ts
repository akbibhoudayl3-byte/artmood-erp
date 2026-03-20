import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole, sanitizeString } from '@/lib/auth/server';

/** POST /api/kitchen/project — Create or update a kitchen project */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clientName = sanitizeString(body.client_name, 200);
  if (!clientName) {
    return NextResponse.json({ error: 'client_name is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const kitchenId = body.id as string | undefined;

  const record = {
    client_name: clientName,
    client_type: body.client_type ?? 'standard',
    kitchen_type: body.kitchen_type ?? 'modern',
    layout_type: body.layout_type ?? 'I',
    full_height: body.full_height ?? false,
    opening_system: body.opening_system ?? 'handles',
    structure_material: body.structure_material ?? 'stratifie',
    facade_material: body.facade_material ?? 'mdf_18_uv',
    back_thickness: body.back_thickness ?? 5,
    edge_caisson_mm: body.edge_caisson_mm ?? 0.8,
    edge_facade_mm: body.edge_facade_mm ?? 1.0,
    notes: sanitizeString(body.notes, 2000),
    created_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  if (kitchenId) {
    // Update
    const { data, error } = await supabase
      .from('kitchen_projects')
      .update(record)
      .eq('id', kitchenId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ kitchen: data });
  } else {
    // Create
    const { data, error } = await supabase
      .from('kitchen_projects')
      .insert(record)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ kitchen: data }, { status: 201 });
  }
}

/** GET /api/kitchen/project?id=xxx — Get kitchen project with all related data */
export async function GET(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  const id = request.nextUrl.searchParams.get('id');

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  if (id) {
    // Single project with all data
    const [kitchenRes, wallsRes, modulesRes, fillersRes] = await Promise.all([
      supabase.from('kitchen_projects').select('*').eq('id', id).single(),
      supabase.from('kitchen_walls').select('*').eq('kitchen_id', id).order('sort_order'),
      supabase.from('kitchen_modules').select('*, product_modules(*)').eq('kitchen_id', id).order('sort_order'),
      supabase.from('kitchen_fillers').select('*').eq('kitchen_id', id),
    ]);

    if (kitchenRes.error) return NextResponse.json({ error: kitchenRes.error.message }, { status: 404 });

    return NextResponse.json({
      kitchen: kitchenRes.data,
      walls: wallsRes.data ?? [],
      modules: modulesRes.data ?? [],
      fillers: fillersRes.data ?? [],
    });
  }

  // List all kitchen projects
  const { data, error } = await supabase
    .from('kitchen_projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kitchens: data });
}
