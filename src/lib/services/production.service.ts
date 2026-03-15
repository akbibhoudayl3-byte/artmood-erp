/**
 * Production Service — Domain logic for production order management.
 *
 * Extracts Supabase queries from src/app/(app)/production/page.tsx
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { ProductionOrder, ProductionOrderStatus } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[production-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export type OrderWithProject = ProductionOrder & {
  project: {
    id: string;
    client_name: string;
    reference_code: string;
  } | null;
  part_count: number;
  packed_count: number;
};

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Load all production orders with project join and part counts.
 * Orders are sorted: in_progress first, then pending, then others.
 */
export async function loadProductionOrders(): Promise<
  ServiceResult<OrderWithProject[]>
> {
  // 1. Fetch all orders with project join
  const { data: ordersData, error } = await supabase()
    .from('production_orders')
    .select('*, project:projects(id, client_name, reference_code)')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return fail('Failed to load production orders: ' + error.message);
  if (!ordersData) return ok([]);

  // 2. Fetch part counts per order (single query, aggregate client-side)
  const orderIds = ordersData.map((o: any) => o.id);
  let partRows: { production_order_id: string; current_station: string }[] = [];

  if (orderIds.length > 0) {
    const { data } = await supabase()
      .from('production_parts')
      .select('production_order_id, current_station')
      .in('production_order_id', orderIds);
    partRows = data || [];
  }

  // 3. Aggregate part counts
  const countMap: Record<string, { total: number; packed: number }> = {};
  partRows.forEach((p) => {
    if (!countMap[p.production_order_id]) {
      countMap[p.production_order_id] = { total: 0, packed: 0 };
    }
    countMap[p.production_order_id].total += 1;
    if (p.current_station === 'packing') {
      countMap[p.production_order_id].packed += 1;
    }
  });

  // 4. Enrich orders with part counts and normalize project
  const enriched: OrderWithProject[] = ordersData.map((o: any) => {
    const proj = Array.isArray(o.project) ? o.project[0] : o.project;
    const counts = countMap[o.id] || { total: 0, packed: 0 };
    return {
      ...o,
      project: proj || null,
      part_count: counts.total,
      packed_count: counts.packed,
    };
  });

  // 5. Sort: in_progress first, then pending, then others
  const priority: Record<string, number> = {
    in_progress: 0,
    pending: 1,
    on_hold: 2,
    completed: 3,
    cancelled: 4,
  };

  enriched.sort((a, b) => {
    const pa = priority[a.status] ?? 5;
    const pb = priority[b.status] ?? 5;
    if (pa !== pb) return pa - pb;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  return ok(enriched);
}

/**
 * Update a production order's current station.
 */
export async function updateOrderStation(
  orderId: string,
  station: string,
): Promise<ServiceResult> {
  if (!orderId) return fail('Order ID is required.');
  if (!station) return fail('Station is required.');

  const { error } = await supabase()
    .from('production_orders')
    .update({
      current_station: station,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) return fail('Failed to update station: ' + error.message);
  return ok();
}

/**
 * Update a production order's status (pending, in_progress, completed, cancelled).
 * Automatically sets started_at and completed_at timestamps.
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<ServiceResult> {
  if (!orderId) return fail('Order ID is required.');
  if (!status) return fail('Status is required.');

  const updates: Record<string, unknown> = {
    status: status as ProductionOrderStatus,
    updated_at: new Date().toISOString(),
  };

  if (status === 'in_progress') {
    updates.started_at = new Date().toISOString();
  }
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase()
    .from('production_orders')
    .update(updates)
    .eq('id', orderId);

  if (error) return fail('Failed to update order status: ' + error.message);
  return ok();
}
