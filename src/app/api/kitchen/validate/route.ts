import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole } from '@/lib/auth/server';
import { validateKitchen } from '@/lib/services/kitchen-validation-engine';
import { detectFillers } from '@/lib/services/kitchen-filler-engine';
import type {
  KitchenProject,
  KitchenWall,
  KitchenModuleInstance,
  ProductModule,
} from '@/types/kitchen';

/** POST /api/kitchen/validate — Validate kitchen + detect fillers */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  let body: { kitchen_id: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.kitchen_id) {
    return NextResponse.json({ error: 'kitchen_id is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const [kitchenRes, wallsRes, modulesRes] = await Promise.all([
    supabase.from('kitchen_projects').select('*').eq('id', body.kitchen_id).single(),
    supabase.from('kitchen_walls').select('*').eq('kitchen_id', body.kitchen_id).order('sort_order'),
    supabase.from('kitchen_modules').select('*, product_modules(*)').eq('kitchen_id', body.kitchen_id).order('sort_order'),
  ]);

  if (kitchenRes.error) return NextResponse.json({ error: 'Kitchen not found' }, { status: 404 });

  const kitchen = kitchenRes.data as KitchenProject;
  const walls = (wallsRes.data ?? []) as KitchenWall[];
  const rawModules = (modulesRes.data ?? []) as (KitchenModuleInstance & { product_modules: ProductModule })[];

  const modulesWithProducts = rawModules.map(m => ({
    instance: m,
    module: m.product_modules,
  }));

  const validation = validateKitchen(kitchen, walls, modulesWithProducts);
  const fillerSuggestions = detectFillers(walls, rawModules);

  return NextResponse.json({ validation, fillerSuggestions });
}
