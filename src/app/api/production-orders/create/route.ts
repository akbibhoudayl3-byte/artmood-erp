import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString } from '@/lib/auth/server';

/**
 * POST /api/production-orders/create — Create a new production order.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager', 'workshop_worker']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id, name, notes } = body;

  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const sanitizedName = sanitizeString(name, 200);
  if (!sanitizedName) {
    return NextResponse.json({ error: 'Order name is required' }, { status: 400 });
  }

  const sanitizedNotes = sanitizeString(notes, 2000);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Verify project exists
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Create production order
  const { data: order, error: orderErr } = await supabase
    .from('production_orders')
    .insert({
      project_id,
      name: sanitizedName,
      notes: sanitizedNotes,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: 'Failed to create production order', detail: orderErr?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ order }, { status: 201 });
}
