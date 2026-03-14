/**
 * Security Guardian Layer — Stock Integrity Module
 *
 * Pre-flight check for all stock deduction operations.
 * Prevents negative stock at the application level (DB trigger is a belt-and-suspenders).
 *
 * USAGE:
 *   import { guardStock } from '@/lib/security';
 *
 *   const stockCheck = await guardStock({
 *     supabase: ctx.supabase,
 *     userId: ctx.userId,
 *     stockItemId: body.stock_item_id,
 *     quantity: body.quantity_used,
 *     notes: `Consumed for production sheet ${sheetId}`,
 *   });
 *   if (!stockCheck.ok) return stockCheck.response;
 *
 *   // Safe to deduct — guardStock confirmed availability
 *   await ctx.supabase
 *     .from('stock_items')
 *     .update({ current_quantity: stockCheck.currentQuantity - body.quantity_used })
 *     .eq('id', body.stock_item_id);
 *
 * DESIGN NOTES:
 *   - Does NOT perform the deduction itself (caller owns the DB write)
 *   - This preserves the ability to include the update in a larger atomic operation
 *   - DB trigger `trg_prevent_negative_stock` acts as a final safety net
 *   - All denied attempts are logged to audit_log (silent on audit failure)
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeAuditLog } from '@/lib/security/audit';

// ── Result Types ──────────────────────────────────────────────────────────────

export type StockGuardResult =
  | { ok: true; currentQuantity: number }
  | { ok: false; response: NextResponse };

// ── Main Guard Function ───────────────────────────────────────────────────────

/**
 * Pre-flight check before any stock deduction.
 *
 * @param supabase      Supabase client (from GuardContext)
 * @param userId        Authenticated user's UUID (for audit log)
 * @param stockItemId   UUID of the stock_items row to deduct from
 * @param quantity      Amount to deduct (must be > 0)
 * @param notes         Optional context for the audit log entry
 */
export async function guardStock(params: {
  supabase: SupabaseClient;
  userId: string;
  stockItemId: string;
  quantity: number;
  notes?: string;
}): Promise<StockGuardResult> {
  const { supabase, userId, stockItemId, quantity, notes } = params;

  // ── 1. Validate quantity is a positive finite number ──────────────────
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid quantity', message: 'Quantity must be a positive finite number' },
        { status: 400 }
      ),
    };
  }

  // ── 2. Fetch current stock — verifies item exists and gets quantity ────
  // stock_items uses `current_quantity` column (not `quantity`)
  const { data: item, error } = await supabase
    .from('stock_items')
    .select('id, name, current_quantity, minimum_quantity')
    .eq('id', stockItemId)
    .single();

  if (error || !item) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Stock item not found', message: `No stock item with id ${stockItemId}` },
        { status: 404 }
      ),
    };
  }

  const currentQuantity = Number(item.current_quantity ?? 0);

  // ── 3. Sufficiency check — prevent negative stock at app level ────────
  if (currentQuantity < quantity) {
    // Log the denied attempt (silent on failure)
    try {
      await writeAuditLog({
        user_id: userId,
        action: 'stock_change',
        entity_type: 'stock_items',
        entity_id: stockItemId,
        old_value: { current_quantity: currentQuantity },
        new_value: { requested_deduction: quantity },
        notes: `DENIED: insufficient stock for "${item.name}". Available: ${currentQuantity}, Requested: ${quantity}`,
      });
    } catch { /* silent */ }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Insufficient stock',
          message: `Cannot deduct ${quantity} units of "${item.name}". Available: ${currentQuantity} units.`,
          available: currentQuantity,
          requested: quantity,
          item_id: stockItemId,
        },
        { status: 422 }
      ),
    };
  }

  // ── 4. Warn if deduction would go below minimum_quantity ─────────────
  // (Not a hard block — just informational in the audit log)
  const minimumQuantity = Number(item.minimum_quantity ?? 0);
  const willGoBelowMinimum = (currentQuantity - quantity) < minimumQuantity;

  // Log the pending deduction approval (before value, for traceability)
  try {
    await writeAuditLog({
      user_id: userId,
      action: 'stock_change',
      entity_type: 'stock_items',
      entity_id: stockItemId,
      old_value: { current_quantity: currentQuantity },
      new_value: {
        after_deduction: currentQuantity - quantity,
        below_minimum: willGoBelowMinimum,
      },
      notes: notes ?? `Stock deduction approved: ${quantity} units from "${item.name}"`,
    });
  } catch { /* silent */ }

  return { ok: true, currentQuantity };
}
