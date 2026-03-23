import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

/**
 * POST /api/stock/items — Create a new stock item.
 * PATCH /api/stock/items — Update an existing stock item (requires id in body).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = sanitizeString(body.name, 200);
  if (!name) {
    return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
  }

  const payload: Record<string, any> = {
    name,
    sku: sanitizeString(body.sku, 100),
    category: sanitizeString(body.category, 50) || 'panels',
    subcategory: sanitizeString(body.subcategory, 100),
    unit: sanitizeString(body.unit, 20) || 'pcs',
    minimum_quantity: sanitizeNumber(body.minimum_quantity, { min: 0 }) ?? 0,
    low_stock_threshold: sanitizeNumber(body.minimum_quantity, { min: 0 }) ?? 0,
    cost_per_unit: sanitizeNumber(body.cost_per_unit, { min: 0 }),
    thickness_mm: sanitizeNumber(body.thickness_mm, { min: 0 }),
    sheet_length_mm: sanitizeNumber(body.sheet_length_mm, { min: 0 }),
    sheet_width_mm: sanitizeNumber(body.sheet_width_mm, { min: 0 }),
    roll_length_m: sanitizeNumber(body.roll_length_m, { min: 0 }),
    location: sanitizeString(body.location, 200),
    notes: sanitizeString(body.notes, 2000),
  };

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  const { data: item, error } = await supabase
    .from('stock_items')
    .insert({ ...payload, current_quantity: 0 })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create stock item', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isValidUUID(body.id)) {
    return NextResponse.json({ error: 'Valid item id is required' }, { status: 400 });
  }

  const name = sanitizeString(body.name, 200);
  if (!name) {
    return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
  }

  const payload: Record<string, any> = {
    name,
    sku: sanitizeString(body.sku, 100),
    category: sanitizeString(body.category, 50) || 'panels',
    subcategory: sanitizeString(body.subcategory, 100),
    unit: sanitizeString(body.unit, 20) || 'pcs',
    minimum_quantity: sanitizeNumber(body.minimum_quantity, { min: 0 }) ?? 0,
    low_stock_threshold: sanitizeNumber(body.minimum_quantity, { min: 0 }) ?? 0,
    cost_per_unit: sanitizeNumber(body.cost_per_unit, { min: 0 }),
    thickness_mm: sanitizeNumber(body.thickness_mm, { min: 0 }),
    sheet_length_mm: sanitizeNumber(body.sheet_length_mm, { min: 0 }),
    sheet_width_mm: sanitizeNumber(body.sheet_width_mm, { min: 0 }),
    roll_length_m: sanitizeNumber(body.roll_length_m, { min: 0 }),
    location: sanitizeString(body.location, 200),
    notes: sanitizeString(body.notes, 2000),
  };

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  const { error } = await supabase
    .from('stock_items')
    .update(payload)
    .eq('id', body.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update stock item', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
