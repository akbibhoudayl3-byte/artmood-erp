import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString } from '@/lib/auth/server';
import { findStockItem } from '@/lib/utils/stock-match';
import { writeAuditLog } from '@/lib/security/audit';

/**
 * POST /api/cutting/consume-sheet — Deduct stock for a completed cutting sheet.
 *
 * Triggered when ALL parts on a sheet are marked as cut.
 * - Deducts exactly 1 panel from stock
 * - Releases 1 from reservation
 * - Links to project_id + production_order (if exists)
 * - Blocks double deduction via idempotency key
 * - Returns before/after stock quantities
 *
 * Body: { project_id, panel_type, sheet_index }
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

  const { project_id, panel_type, sheet_index } = body;

  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }
  const sanitizedPanelType = sanitizeString(panel_type, 50);
  if (!sanitizedPanelType) {
    return NextResponse.json({ error: 'panel_type is required' }, { status: 400 });
  }
  const sheetIdx = Number(sheet_index);
  if (!Number.isInteger(sheetIdx) || sheetIdx < 1) {
    return NextResponse.json({ error: 'sheet_index must be a positive integer' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // ── 1. Build idempotency key ────────────────────────────────────────────
  // Deterministic string: project + material + sheet number
  const idempotencyKey = `cutting_deduct:${project_id}:${sanitizedPanelType}:sheet_${sheetIdx}`;

  // ── 2. Check for existing deduction (BLOCK DOUBLE DEDUCTION) ────────────
  const { data: existingMovement } = await supabase
    .from('stock_movements')
    .select('id, created_at')
    .eq('reference_type', 'cutting_sheet')
    .eq('project_id', project_id)
    .eq('notes', idempotencyKey)
    .limit(1);

  if (existingMovement && existingMovement.length > 0) {
    return NextResponse.json({
      error: 'Stock already deducted for this sheet',
      already_deducted: true,
      movement_id: existingMovement[0].id,
      deducted_at: existingMovement[0].created_at,
      idempotency_key: idempotencyKey,
    }, { status: 409 }); // 409 Conflict
  }

  // ── 3. Find matching stock item ─────────────────────────────────────────
  const { data: stockItems } = await supabase
    .from('stock_items')
    .select('id, name, material_type, current_quantity, reserved_quantity, unit')
    .eq('is_active', true)
    .eq('stock_tracking', true);

  if (!stockItems || stockItems.length === 0) {
    return NextResponse.json({ error: 'No stock items found' }, { status: 404 });
  }

  const match = findStockItem(stockItems as any[], sanitizedPanelType);

  if (!match) {
    return NextResponse.json({
      error: `No stock item matches material type '${sanitizedPanelType}'`,
      panel_type: sanitizedPanelType,
    }, { status: 404 });
  }

  const beforeQty = match.current_quantity;
  const beforeReserved = match.reserved_quantity;

  // ── 4. Check sufficient stock ───────────────────────────────────────────
  if (match.current_quantity < 1) {
    return NextResponse.json({
      error: 'Insufficient stock to deduct 1 panel',
      stock_item: match.name,
      current_quantity: match.current_quantity,
    }, { status: 400 });
  }

  // ── 5. Find linked production order (if exists) ─────────────────────────
  const { data: prodOrder } = await supabase
    .from('production_orders')
    .select('id')
    .eq('project_id', project_id)
    .order('created_at', { ascending: false })
    .limit(1);

  const productionOrderId = prodOrder?.[0]?.id || null;

  // ── 6. Insert stock movement (the DB trigger auto-updates current_quantity) ──
  const { data: movement, error: movErr } = await supabase
    .from('stock_movements')
    .insert({
      stock_item_id: match.id,
      movement_type: 'production_out',
      quantity: -1, // 1 sheet consumed
      reference_type: 'cutting_sheet',
      reference_id: project_id,
      project_id,
      notes: idempotencyKey,
      created_by: auth.userId,
    })
    .select('id, created_at')
    .single();

  if (movErr) {
    if (movErr.message?.includes('negative')) {
      return NextResponse.json({
        error: 'Stock cannot go negative. Insufficient panels.',
        stock_item: match.name,
        current_quantity: match.current_quantity,
      }, { status: 400 });
    }
    return NextResponse.json({ error: 'Stock movement failed', detail: movErr.message }, { status: 500 });
  }

  // ── 7. Release 1 from reservation ──────────────────────────────────────
  const newReserved = Math.max(0, match.reserved_quantity - 1);
  await supabase
    .from('stock_items')
    .update({ reserved_quantity: newReserved })
    .eq('id', match.id);

  // ── 8. Read back final quantities ──────────────────────────────────────
  const { data: afterItem } = await supabase
    .from('stock_items')
    .select('current_quantity, reserved_quantity')
    .eq('id', match.id)
    .single();

  await writeAuditLog({
    action: 'consume',
    entity_type: 'stock_item',
    entity_id: match.id,
    user_id: auth.userId,
    notes: `Sheet consumed: ${sanitizedPanelType} sheet #${sheetIdx} for project ${project_id}`,
  });

  // ── 9. Return full proof ───────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    deduction: {
      movement_id: movement.id,
      deducted_at: movement.created_at,
      idempotency_key: idempotencyKey,
      stock_item_id: match.id,
      stock_item_name: match.name,
      quantity_deducted: 1,
      unit: match.unit,
    },
    source: {
      project_id,
      production_order_id: productionOrderId,
      panel_type: sanitizedPanelType,
      sheet_index: sheetIdx,
      trigger: 'cutting_sheet_completion',
    },
    stock_before: {
      current_quantity: beforeQty,
      reserved_quantity: beforeReserved,
    },
    stock_after: {
      current_quantity: afterItem?.current_quantity ?? (beforeQty - 1),
      reserved_quantity: afterItem?.reserved_quantity ?? newReserved,
    },
  }, { status: 201 });
}
