/**
 * Data Integrity Engine — Production Consumption Tracker
 *
 * Tracks expected vs actual material consumption per production sheet.
 * Enables:
 *   - Pre-production material planning (plan phase)
 *   - Post-production actual recording (consume phase)
 *   - Waste analysis (waste_quantity + waste_percent are DB-computed columns)
 *
 * All consumption is linked to stock_movements (movement_type='consume')
 * so the guardian layer's auto-log trigger fires as well.
 *
 * USAGE — Plan consumption before production:
 *   const result = await planConsumption({
 *     supabase: ctx.supabase,
 *     userId: ctx.userId,
 *     projectId,
 *     sheetId,
 *     items: [{ stockItemId: 'uuid', expectedQuantity: 12.5 }],
 *   });
 *   if (!result.ok) return result.response;
 *
 * USAGE — Record actual consumption after production:
 *   const result = await recordActualConsumption({
 *     supabase: ctx.supabase,
 *     userId: ctx.userId,
 *     consumptionId: 'uuid',
 *     actualQuantity: 14.2,
 *   });
 *   if (!result.ok) return result.response;
 */

import { NextResponse }         from 'next/server';
import type { SupabaseClient }  from '@supabase/supabase-js';
import { writeAuditLog }        from '@/lib/security/audit';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsumptionPlanItem {
  stockItemId: string;
  expectedQuantity: number;
}

export interface ConsumptionRecord {
  id: string;
  project_id: string | null;
  sheet_id: string | null;
  stock_item_id: string | null;
  expected_quantity: number;
  actual_quantity: number | null;
  waste_quantity: number;
  waste_percent: number;
  status: 'planned' | 'consumed' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export interface ConsumptionReport {
  sheetId: string;
  totalItems: number;
  totalExpected: number;
  totalActual: number | null;
  totalWaste: number;
  averageWastePercent: number;
  highWasteItems: ConsumptionRecord[];
  records: ConsumptionRecord[];
}

export type ConsumptionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

// ── Plan Consumption ──────────────────────────────────────────────────────────

/**
 * Creates planned consumption records for a production sheet.
 * Call this before production starts to establish expected quantities.
 */
export async function planConsumption(opts: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  sheetId: string;
  items: ConsumptionPlanItem[];
  notes?: string;
}): Promise<ConsumptionResult<ConsumptionRecord[]>> {
  const { supabase, userId, projectId, sheetId, items, notes } = opts;

  if (!items || items.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No items provided', message: 'At least one consumption item is required' },
        { status: 400 },
      ),
    };
  }

  // Validate all quantities are positive
  const invalid = items.filter(i => !Number.isFinite(i.expectedQuantity) || i.expectedQuantity <= 0);
  if (invalid.length > 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid quantities', message: 'All expected quantities must be positive numbers' },
        { status: 400 },
      ),
    };
  }

  // Validate all stock items exist
  const stockIds = items.map(i => i.stockItemId);
  const { data: stockItems, error: stockErr } = await supabase
    .from('stock_items')
    .select('id, name')
    .in('id', stockIds)
    .eq('is_active', true);

  if (stockErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'DB error', message: 'Could not verify stock items' },
        { status: 500 },
      ),
    };
  }

  const foundIds = new Set((stockItems ?? []).map((s: { id: string }) => s.id));
  const missing = stockIds.filter(id => !foundIds.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Stock items not found',
          message: `${missing.length} stock item(s) not found or inactive`,
          missing_ids: missing,
        },
        { status: 422 },
      ),
    };
  }

  // Insert all consumption records
  const rows = items.map(item => ({
    project_id:        projectId,
    sheet_id:          sheetId,
    stock_item_id:     item.stockItemId,
    expected_quantity: item.expectedQuantity,
    status:            'planned',
    notes:             notes ?? null,
    recorded_by:       userId,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('production_consumption')
    .insert(rows)
    .select();

  if (insertErr || !inserted) {
    console.error('[planConsumption] Insert failed:', insertErr?.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to save consumption plan', message: insertErr?.message },
        { status: 500 },
      ),
    };
  }

  // Audit log (silent)
  try {
    await writeAuditLog({
      user_id:     userId,
      action:      'stock_change',
      entity_type: 'production_consumption',
      entity_id:   sheetId,
      new_value:   { planned_items: items.length, sheet_id: sheetId, project_id: projectId },
      notes:       `Consumption plan created for sheet ${sheetId}: ${items.length} items`,
    });
  } catch { /* silent */ }

  return { ok: true, data: inserted as ConsumptionRecord[] };
}

// ── Record Actual Consumption ─────────────────────────────────────────────────

/**
 * Records the actual quantity consumed for a planned consumption entry.
 * Also deducts from stock_items (if stock guard already ran, pass skipDeduction=true).
 * Marks status as 'consumed'.
 */
export async function recordActualConsumption(opts: {
  supabase: SupabaseClient;
  userId: string;
  consumptionId: string;
  actualQuantity: number;
  notes?: string;
  /** Set true if the caller already deducted stock via guardStock() */
  skipStockDeduction?: boolean;
}): Promise<ConsumptionResult<ConsumptionRecord>> {
  const { supabase, userId, consumptionId, actualQuantity, notes, skipStockDeduction } = opts;

  // Validate quantity
  if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid quantity', message: 'Actual quantity must be a non-negative number' },
        { status: 400 },
      ),
    };
  }

  // Fetch existing record
  const { data: record, error: fetchErr } = await supabase
    .from('production_consumption')
    .select('*')
    .eq('id', consumptionId)
    .single();

  if (fetchErr || !record) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Consumption record not found', message: `No record with id ${consumptionId}` },
        { status: 404 },
      ),
    };
  }

  if (record.status === 'consumed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Already consumed', message: 'This consumption record has already been marked as consumed' },
        { status: 409 },
      ),
    };
  }

  if (record.status === 'cancelled') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Record cancelled', message: 'Cannot record consumption for a cancelled record' },
        { status: 409 },
      ),
    };
  }

  // Update to consumed
  const { data: updated, error: updateErr } = await supabase
    .from('production_consumption')
    .update({
      actual_quantity: actualQuantity,
      status:          'consumed',
      notes:           notes ?? record.notes,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', consumptionId)
    .select()
    .single();

  if (updateErr || !updated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Update failed', message: updateErr?.message },
        { status: 500 },
      ),
    };
  }

  // Deduct from stock_items if not already done
  if (!skipStockDeduction && record.stock_item_id && actualQuantity > 0) {
    const { data: stockItem } = await supabase
      .from('stock_items')
      .select('current_quantity')
      .eq('id', record.stock_item_id)
      .single();

    if (stockItem) {
      const newQty = Number(stockItem.current_quantity) - actualQuantity;
      if (newQty >= 0) {
        await supabase
          .from('stock_items')
          .update({ current_quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', record.stock_item_id);
      }
    }
  }

  // Audit (silent)
  try {
    await writeAuditLog({
      user_id:     userId,
      action:      'stock_change',
      entity_type: 'production_consumption',
      entity_id:   consumptionId,
      old_value:   { status: 'planned', expected_quantity: record.expected_quantity },
      new_value:   { status: 'consumed', actual_quantity: actualQuantity },
      notes:       `Consumption recorded: expected ${record.expected_quantity}, actual ${actualQuantity}`,
    });
  } catch { /* silent */ }

  return { ok: true, data: updated as ConsumptionRecord };
}

// ── Consumption Report ────────────────────────────────────────────────────────

/**
 * Returns expected vs actual consumption summary for a production sheet.
 */
export async function getConsumptionReport(
  sheetId: string,
  supabase: SupabaseClient,
): Promise<ConsumptionReport | null> {
  const { data: records, error } = await supabase
    .from('production_consumption')
    .select('*')
    .eq('sheet_id', sheetId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (error || !records) return null;

  const typed = records as ConsumptionRecord[];

  const totalExpected = typed.reduce((s, r) => s + Number(r.expected_quantity), 0);
  const consumedRecords = typed.filter(r => r.actual_quantity != null);
  const totalActual = consumedRecords.length > 0
    ? consumedRecords.reduce((s, r) => s + Number(r.actual_quantity ?? 0), 0)
    : null;
  const totalWaste = typed.reduce((s, r) => s + Number(r.waste_quantity ?? 0), 0);

  const wastePercents = typed
    .filter(r => Number(r.waste_percent ?? 0) > 0)
    .map(r => Number(r.waste_percent));
  const averageWastePercent = wastePercents.length > 0
    ? wastePercents.reduce((s, v) => s + v, 0) / wastePercents.length
    : 0;

  const highWasteItems = typed.filter(r => Number(r.waste_percent ?? 0) > 20);

  return {
    sheetId,
    totalItems:           typed.length,
    totalExpected:        Math.round(totalExpected * 1000) / 1000,
    totalActual:          totalActual !== null ? Math.round(totalActual * 1000) / 1000 : null,
    totalWaste:           Math.round(totalWaste * 1000) / 1000,
    averageWastePercent:  Math.round(averageWastePercent * 100) / 100,
    highWasteItems,
    records:              typed,
  };
}
