import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

interface RequirementInput {
  production_order_id: string;
  material_id: string;
  planned_qty: number;
  unit: string;
  notes?: string | null;
  // For stock reservation
  current_reserved_quantity: number;
}

/**
 * POST /api/production-orders/requirements — Add material requirement(s) with stock reservation.
 *
 * Accepts a single requirement or an array of requirements (for BOM import).
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

  const { project_id } = body;
  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  // Normalize to array
  const items: RequirementInput[] = Array.isArray(body.requirements) ? body.requirements : [body];

  // Validate each requirement
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isValidUUID(item.production_order_id)) {
      return NextResponse.json({ error: `Item ${i + 1}: valid production_order_id is required` }, { status: 400 });
    }
    if (!isValidUUID(item.material_id)) {
      return NextResponse.json({ error: `Item ${i + 1}: valid material_id is required` }, { status: 400 });
    }
    const qty = sanitizeNumber(item.planned_qty, { min: 0.001 });
    if (qty === null) {
      return NextResponse.json({ error: `Item ${i + 1}: valid planned_qty > 0 is required` }, { status: 400 });
    }
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Track running reserved_quantity per item within this batch
  const reservedAccumulator: Record<string, number> = {};
  const results: Array<{ material_id: string; status: string }> = [];

  for (const item of items) {
    const qty = sanitizeNumber(item.planned_qty, { min: 0.001 })!;
    const unit = sanitizeString(item.unit, 50) || 'unit';
    const notes = sanitizeString(item.notes as string, 2000);

    // Get current reserved if not in accumulator
    if (reservedAccumulator[item.material_id] === undefined) {
      const { data: stockItem } = await supabase
        .from('stock_items')
        .select('reserved_quantity, name')
        .eq('id', item.material_id)
        .single();
      reservedAccumulator[item.material_id] = stockItem?.reserved_quantity ?? 0;
    }

    const currentReserved = reservedAccumulator[item.material_id];
    const newReserved = currentReserved + qty;
    reservedAccumulator[item.material_id] = newReserved;

    // Reserve stock
    const { error: reserveErr } = await supabase
      .from('stock_items')
      .update({ reserved_quantity: newReserved })
      .eq('id', item.material_id);

    if (reserveErr) {
      return NextResponse.json(
        { error: `Stock reservation failed for material ${item.material_id}`, detail: reserveErr.message },
        { status: 500 },
      );
    }

    // Create reserve stock movement for audit trail
    await supabase.from('stock_movements').insert({
      stock_item_id: item.material_id,
      movement_type: 'reserve',
      quantity: 0,
      reference_type: 'production_order',
      reference_id: item.production_order_id,
      project_id,
      notes: `Réservation: ${qty} ${unit}${notes ? ' | ' + notes : ''}`,
      created_by: auth.userId,
    });

    // Create requirement
    const { error: reqErr } = await supabase
      .from('production_material_requirements')
      .insert({
        production_order_id: item.production_order_id,
        material_id: item.material_id,
        planned_qty: qty,
        unit,
        status: 'reserved',
        notes,
      });

    if (reqErr) {
      return NextResponse.json(
        { error: `Requirement creation failed`, detail: reqErr.message },
        { status: 500 },
      );
    }

    results.push({ material_id: item.material_id, status: 'reserved' });
  }

  return NextResponse.json({ created: results.length, results }, { status: 201 });
}
