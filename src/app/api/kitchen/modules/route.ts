import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireRole } from '@/lib/auth/server';

/** GET /api/kitchen/modules — List all active product modules with rules */
export async function GET() {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: modules, error } = await supabase
    .from('product_modules')
    .select(`
      *,
      module_rules(*),
      module_hardware_rules(*),
      module_options(*)
    `)
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ modules });
}
