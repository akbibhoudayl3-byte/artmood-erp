/**
 * Production Station Transition Endpoint
 *
 * POST /api/production-orders/station-transition
 *
 * Validates and applies a production part station transition through the Station FSM.
 * Parts must follow sequential station flow: pending → saw → cnc → edge → assembly → qc → packing
 *
 * RULES:
 *   - Cannot skip stations
 *   - Operator must be identified
 *   - Each transition is logged with timestamp
 *   - QC can send back to assembly for rework
 *
 * Request body:
 *   { part_id: string, to_station: ProductionStation }
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID } from '@/lib/auth/server';
import { guardStationTransition, validateStationTransition } from '@/lib/integrity/production-station-fsm';
import type { ProductionStation } from '@/types/database';

export async function POST(request: Request) {
  const ctx = await guard(['ceo', 'workshop_manager', 'workshop_worker']);
  if (ctx instanceof NextResponse) return ctx;

  let body: { part_id?: string; to_station?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { part_id, to_station } = body;

  if (!part_id || !isValidUUID(part_id)) {
    return NextResponse.json({ error: 'Valid part_id is required' }, { status: 400 });
  }

  if (!to_station) {
    return NextResponse.json({ error: 'to_station is required' }, { status: 400 });
  }

  // ── Fetch current part ──────────────────────────────────────────────────
  const { data: part, error: partErr } = await ctx.supabase
    .from('production_parts')
    .select('id, current_station, production_order_id, part_name')
    .eq('id', part_id)
    .single();

  if (partErr || !part) {
    return NextResponse.json({ error: 'Production part not found' }, { status: 404 });
  }

  const fromStation = part.current_station as ProductionStation;
  const toStation = to_station as ProductionStation;

  // ── Station FSM Validation ──────────────────────────────────────────────
  const fsmResult = guardStationTransition({
    from: fromStation,
    to: toStation,
    operatorId: ctx.userId,
  });
  if (fsmResult !== null) return fsmResult;

  const validation = validateStationTransition({
    from: fromStation,
    to: toStation,
    operatorId: ctx.userId,
  });

  // ── Apply the transition ──────────────────────────────────────────────
  const { error: updateErr } = await ctx.supabase
    .from('production_parts')
    .update({
      current_station: toStation,
      assigned_worker: ctx.userId,
      last_scan_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', part_id);

  if (updateErr) {
    return NextResponse.json(
      { error: 'Station update failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  // ── Record scan log ────────────────────────────────────────────────────
  await ctx.supabase.from('production_scans').insert({
    part_id,
    station: toStation,
    scanned_by: ctx.userId,
    scanned_at: new Date().toISOString(),
    is_offline_sync: false,
  });

  // ── Update production order progress ───────────────────────────────────
  const { data: orderParts } = await ctx.supabase
    .from('production_parts')
    .select('id, current_station')
    .eq('production_order_id', part.production_order_id);

  if (orderParts) {
    const total = orderParts.length;
    const packed = orderParts.filter(p =>
      p.id === part_id ? toStation === 'packing' : (p.current_station === 'packing'),
    ).length;

    const orderUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Auto-transition order status
    if (packed === total && total > 0) {
      orderUpdate.status = 'completed';
      orderUpdate.completed_at = new Date().toISOString();
    } else if (packed > 0 || orderParts.some(p => p.current_station !== 'pending')) {
      orderUpdate.status = 'in_progress';
      if (!orderUpdate.started_at) {
        orderUpdate.started_at = new Date().toISOString();
      }
    }

    await ctx.supabase
      .from('production_orders')
      .update(orderUpdate)
      .eq('id', part.production_order_id);
  }

  // ── Audit log ─────────────────────────────────────────────────────────
  const isRework = validation.allowed && 'isRework' in validation && validation.isRework;
  await ctx.audit({
    action: 'production_change',
    entity_type: 'production_part',
    entity_id: part_id,
    old_value: { station: fromStation },
    new_value: { station: toStation, operator: ctx.userId, is_rework: isRework },
    notes: `Part "${part.part_name}" station: ${fromStation} → ${toStation}${isRework ? ' (REWORK)' : ''}`,
  });

  return NextResponse.json({
    ok: true,
    part_id,
    from: fromStation,
    to: toStation,
    is_rework: isRework,
    message: `Part "${part.part_name}" moved to ${toStation}`,
  });
}
