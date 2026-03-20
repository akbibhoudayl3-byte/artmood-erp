import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole } from '@/lib/auth/server';
import { generateBOM } from '@/lib/services/kitchen-bom-engine';
import { computeKitchenCost } from '@/lib/services/kitchen-cost-engine';
import type { ModuleWithRules } from '@/lib/services/kitchen-bom-engine';
import type {
  KitchenProject,
  KitchenModuleInstance,
  KitchenFiller,
  ProductModule,
  ModuleRule,
  ModuleHardwareRule,
} from '@/types/kitchen';

/** POST /api/kitchen/cost — Compute full cost breakdown */
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

  const [kitchenRes, modulesRes, fillersRes, productModulesRes] = await Promise.all([
    supabase.from('kitchen_projects').select('*').eq('id', body.kitchen_id).single(),
    supabase.from('kitchen_modules').select('*').eq('kitchen_id', body.kitchen_id).order('sort_order'),
    supabase.from('kitchen_fillers').select('*').eq('kitchen_id', body.kitchen_id),
    supabase.from('product_modules').select(`*, module_rules(*), module_hardware_rules(*)`).eq('is_active', true),
  ]);

  if (kitchenRes.error) return NextResponse.json({ error: 'Kitchen not found' }, { status: 404 });

  const kitchen = kitchenRes.data as KitchenProject;
  const instances = (modulesRes.data ?? []) as KitchenModuleInstance[];
  const fillers = (fillersRes.data ?? []) as KitchenFiller[];
  const products = (productModulesRes.data ?? []) as (ProductModule & {
    module_rules: ModuleRule[];
    module_hardware_rules: ModuleHardwareRule[];
  })[];

  const productMap = new Map(products.map(p => [p.id, p]));

  const modulesWithRules: ModuleWithRules[] = instances.map(inst => {
    const product = productMap.get(inst.module_id);
    if (!product) throw new Error(`Product module ${inst.module_id} not found`);
    return {
      instance: inst,
      module: product,
      rule: product.module_rules[0],
      hardware: product.module_hardware_rules[0],
    };
  });

  const bom = generateBOM(kitchen, modulesWithRules, fillers);
  const cost = computeKitchenCost(kitchen, instances, bom);

  return NextResponse.json({ cost, bom });
}
