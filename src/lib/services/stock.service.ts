/**
 * Stock Service — Domain logic for stock items and movements.
 *
 * Extracts Supabase queries from src/app/(app)/stock/page.tsx
 * so the same logic can be reused by a future mobile app or API routes.
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { StockItem, StockMovement } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[stock-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface StockLoadParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}

export interface StockSummary {
  lowStockCount: number;
  totalValue: number;
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Load stock items with server-side pagination, search, and category filter.
 */
export async function loadStockItems(
  params: StockLoadParams = {},
): Promise<ServiceResult<{ items: StockItem[]; total: number }>> {
  const { page = 0, limit = 50, search = '', category = 'all' } = params;

  let query = supabase()
    .from('stock_items')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  if (category !== 'all') {
    query = query.eq('category', category);
  }

  if (search.trim()) {
    const term = search.trim();
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const from = page * limit;
  const to = from + limit - 1;
  query = query.order('name').range(from, to);

  const { data, count, error } = await query;

  if (error) return fail('Failed to load stock: ' + error.message);
  return ok({ items: (data as StockItem[]) || [], total: count || 0 });
}

/**
 * Load summary stats (low stock count + total inventory value).
 * Not paginated — reads all active items.
 */
export async function loadStockSummary(): Promise<ServiceResult<StockSummary>> {
  const { data, error } = await supabase()
    .from('stock_items')
    .select('current_quantity, minimum_quantity, cost_per_unit')
    .eq('is_active', true);

  if (error) return fail('Failed to load stock summary: ' + error.message);

  const items = data || [];
  const lowStockCount = items.filter(
    (i) => i.current_quantity <= i.minimum_quantity,
  ).length;
  const totalValue = items.reduce(
    (s, i) => s + (i.cost_per_unit || 0) * i.current_quantity,
    0,
  );

  return ok({ lowStockCount, totalValue });
}

/**
 * Add a new stock item.
 */
export async function addStockItem(
  data: Record<string, unknown>,
): Promise<ServiceResult<{ id: string }>> {
  const name = data.name as string | undefined;
  if (!name?.trim()) return fail('Item name is required.');

  const payload = {
    name: (name as string).trim(),
    sku: (data.sku as string)?.trim() || null,
    category: data.category || 'other',
    subcategory: (data.subcategory as string)?.trim() || null,
    unit: (data.unit as string)?.trim() || 'pcs',
    minimum_quantity: Number(data.minimum_quantity) || 0,
    low_stock_threshold: Number(data.minimum_quantity) || 0,
    cost_per_unit: data.cost_per_unit ? Number(data.cost_per_unit) : null,
    thickness_mm: data.thickness_mm ? Number(data.thickness_mm) : null,
    sheet_length_mm: data.sheet_length_mm ? Number(data.sheet_length_mm) : null,
    sheet_width_mm: data.sheet_width_mm ? Number(data.sheet_width_mm) : null,
    roll_length_m: data.roll_length_m ? Number(data.roll_length_m) : null,
    location: (data.location as string)?.trim() || null,
    notes: (data.notes as string)?.trim() || null,
    current_quantity: 0,
  };

  const { data: inserted, error } = await supabase()
    .from('stock_items')
    .insert(payload)
    .select('id')
    .single();

  if (error) return fail('Error adding item: ' + error.message);
  return ok({ id: inserted.id });
}

/**
 * Update an existing stock item.
 */
export async function updateStockItem(
  id: string,
  data: Record<string, unknown>,
): Promise<ServiceResult> {
  if (!id) return fail('Stock item ID is required.');

  const name = data.name as string | undefined;
  if (!name?.trim()) return fail('Item name is required.');

  const payload = {
    name: (name as string).trim(),
    sku: (data.sku as string)?.trim() || null,
    category: data.category || 'other',
    subcategory: (data.subcategory as string)?.trim() || null,
    unit: (data.unit as string)?.trim() || 'pcs',
    minimum_quantity: Number(data.minimum_quantity) || 0,
    low_stock_threshold: Number(data.minimum_quantity) || 0,
    cost_per_unit: data.cost_per_unit ? Number(data.cost_per_unit) : null,
    thickness_mm: data.thickness_mm ? Number(data.thickness_mm) : null,
    sheet_length_mm: data.sheet_length_mm ? Number(data.sheet_length_mm) : null,
    sheet_width_mm: data.sheet_width_mm ? Number(data.sheet_width_mm) : null,
    roll_length_m: data.roll_length_m ? Number(data.roll_length_m) : null,
    location: (data.location as string)?.trim() || null,
    notes: (data.notes as string)?.trim() || null,
  };

  const { error } = await supabase()
    .from('stock_items')
    .update(payload)
    .eq('id', id);

  if (error) return fail('Error updating item: ' + error.message);
  return ok();
}

/**
 * Soft-delete (deactivate) a stock item.
 */
export async function deleteStockItem(id: string): Promise<ServiceResult> {
  if (!id) return fail('Stock item ID is required.');

  const { error } = await supabase()
    .from('stock_items')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return fail('Failed to deactivate: ' + error.message);
  return ok();
}

// recordStockMovement has been consolidated into src/lib/services/index.ts
// Import from there: import { recordStockMovement } from '@/lib/services/index';

/**
 * Load movement history for a specific stock item.
 */
export async function loadStockMovements(
  stockItemId: string,
): Promise<ServiceResult<(StockMovement & { creator?: { full_name: string } })[]>> {
  if (!stockItemId) return fail('Stock item ID is required.');

  const { data, error } = await supabase()
    .from('stock_movements')
    .select(
      '*, creator:profiles!stock_movements_created_by_fkey(full_name)',
    )
    .eq('stock_item_id', stockItemId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return fail('Failed to load history: ' + error.message);
  return ok((data as any[]) || []);
}
