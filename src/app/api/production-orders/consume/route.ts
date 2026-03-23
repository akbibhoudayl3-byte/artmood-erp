import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

/**
 * POST /api/production-orders/consume — Record material consumption for a production order.
 *
 * Creates: stock_movement (production_out), production_material_usage, waste_record (if waste),
 * audit waste marker, and updates requirement status + releases reservation.
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

  const {
    requirement_id,
    production_order_id,
    project_id,
    material_id,
    used_qty: rawUsed,
    waste_qty: rawWaste,
    unit,
    stage,
    notes,
    order_name,
    material_name,
    planned_qty: rawPlanned,
    reserved_quantity: rawReserved,
    current_quantity: rawCurrent,
  } = body;

  // ── Validate ────────────────────────────────────────────────────────────
  if (!isValidUUID(requirement_id)) {
    return NextResponse.json({ error: 'Valid requirement_id is required' }, { status: 400 });
  }
  if (!isValidUUID(production_order_id)) {
    return NextResponse.json({ error: 'Valid production_order_id is required' }, { status: 400 });
  }
  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const usedQty = sanitizeNumber(rawUsed, { min: 0.001 });
  if (usedQty === null) {
    return NextResponse.json({ error: 'Valid used_qty > 0 is required' }, { status: 400 });
  }

  const wasteQty = sanitizeNumber(rawWaste, { min: 0 }) ?? 0;
  const sanitizedUnit = sanitizeString(unit, 50) || 'unit';
  const sanitizedStage = sanitizeString(stage, 50) || 'assembly';
  const sanitizedNotes = sanitizeString(notes, 2000);
  const sanitizedOrderName = sanitizeString(order_name, 200) || '';
  const sanitizedMaterialName = sanitizeString(material_name, 200) || 'unknown';
  const plannedQty = sanitizeNumber(rawPlanned, { min: 0 }) ?? 0;
  const reservedQuantity = sanitizeNumber(rawReserved, { min: 0 }) ?? 0;

  // ── Server-side Supabase ────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Pre-check stock
  if (material_id && isValidUUID(material_id)) {
    const { data: item } = await supabase
      .from('stock_items')
      .select('current_quantity, unit')
      .eq('id', material_id)
      .single();

    if (item && usedQty > item.current_quantity) {
      return NextResponse.json(
        { error: 'Insufficient stock', available: item.current_quantity, unit: item.unit },
        { status: 400 },
      );
    }
  }

  // 1. Insert stock_movement (production_out)
  const { data: movement, error: movErr } = await supabase
    .from('stock_movements')
    .insert({
      stock_item_id: material_id,
      movement_type: 'production_out',
      quantity: -usedQty,
      reference_type: 'production_order',
      reference_id: production_order_id,
      project_id,
      notes: `Production: ${sanitizedOrderName} | Stage: ${sanitizedStage}${sanitizedNotes ? ' | ' + sanitizedNotes : ''}`,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (movErr) {
    if (movErr.message?.includes('negative')) {
      return NextResponse.json({ error: 'Insufficient stock — movement rejected by database' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Stock movement failed', detail: movErr.message }, { status: 500 });
  }

  // 2. Create usage record
  const { error: useErr } = await supabase
    .from('production_material_usage')
    .insert({
      production_order_id,
      requirement_id,
      material_id,
      used_qty: usedQty,
      waste_qty: wasteQty,
      unit: sanitizedUnit,
      stage: sanitizedStage,
      worker_id: auth.userId,
      movement_id: movement?.id || null,
      notes: sanitizedNotes,
    });

  if (useErr) {
    return NextResponse.json({ error: 'Usage record failed', detail: useErr.message }, { status: 500 });
  }

  // 3. Waste record (if any)
  if (wasteQty > 0) {
    await supabase.from('waste_records').insert({
      sheet_id: null,
      production_order_id,
      project_id,
      material: sanitizedMaterialName,
      length_mm: 1000,
      width_mm: Math.round(wasteQty * 1000),
      is_reusable: false,
      notes: `Production waste: ${wasteQty} ${sanitizedUnit} | Order: ${sanitizedOrderName} | Stage: ${sanitizedStage}`,
      created_by: auth.userId,
    });

    // Audit marker for waste in stock_movements (no additional deduction)
    await supabase.from('stock_movements').insert({
      stock_item_id: material_id,
      movement_type: 'production_waste',
      quantity: 0,
      reference_type: 'production_order',
      reference_id: production_order_id,
      project_id,
      notes: `Waste: ${wasteQty} ${sanitizedUnit} from ${sanitizedMaterialName} | Stage: ${sanitizedStage}`,
      created_by: auth.userId,
    });
  }

  // 4. Update requirement status + release reservation
  if (material_id && isValidUUID(material_id)) {
    await Promise.all([
      supabase.from('production_material_requirements')
        .update({ status: 'consumed' })
        .eq('id', requirement_id),
      supabase.from('stock_items')
        .update({ reserved_quantity: Math.max(0, reservedQuantity - plannedQty) })
        .eq('id', material_id),
    ]);
  }

  return NextResponse.json({ success: true, movement_id: movement?.id }, { status: 201 });
}
