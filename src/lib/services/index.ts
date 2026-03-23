/**
 * ARTMOOD — Reusable Service Layer
 *
 * Centralizes all business logic that was previously embedded in page components.
 * Both current web UI and a future mobile app can import from here.
 *
 * Deploy to: src/lib/services/index.ts
 */

import { createClient } from '@/lib/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ServiceResult<T = void> {
  data?: T;
  error?: string;
  success: boolean;
}

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[artmood-service]', error);
  return { success: false, error };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function supabase() {
  return createClient();
}

// ════════════════════════════════════════════════════════════════════════════
// SUPPLIERS
// ════════════════════════════════════════════════════════════════════════════

export interface SupplierPayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  category?: string | null;
  notes?: string | null;
}

export async function createSupplier(payload: SupplierPayload): Promise<ServiceResult<{ id: string }>> {
  if (!payload.name?.trim()) return fail('Supplier name is required.');

  const { data, error } = await supabase()
    .from('suppliers')
    .insert({ ...payload, name: payload.name.trim() })
    .select('id')
    .single();

  if (error) return fail('Failed to create supplier: ' + error.message);
  return ok({ id: data.id });
}

export async function updateSupplier(id: string, payload: Partial<SupplierPayload>): Promise<ServiceResult> {
  if (!id) return fail('Supplier ID is required.');

  const { error } = await supabase()
    .from('suppliers')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return fail('Failed to update supplier: ' + error.message);
  return ok();
}

export async function deactivateSupplier(id: string): Promise<ServiceResult> {
  const { error } = await supabase()
    .from('suppliers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return fail('Failed to deactivate supplier: ' + error.message);
  return ok();
}

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY / STOCK
// ════════════════════════════════════════════════════════════════════════════

export interface StockMovementPayload {
  stock_item_id: string;
  direction: 'in' | 'out' | 'adjust';
  quantity: number;           // always positive from caller
  target_quantity?: number;   // used when direction = 'adjust'
  notes?: string | null;
  created_by?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  project_id?: string | null;
  movement_type?: string;     // override DB movement_type label
}

export async function recordStockMovement(payload: StockMovementPayload): Promise<ServiceResult> {
  if (!payload.stock_item_id) return fail('stock_item_id is required.');
  if (payload.quantity <= 0 && payload.direction !== 'adjust') return fail('Quantity must be greater than zero.');

  // Load current stock to compute signed delta
  const { data: item, error: itemErr } = await supabase()
    .from('stock_items')
    .select('current_quantity, name, unit')
    .eq('id', payload.stock_item_id)
    .single();

  if (itemErr || !item) return fail('Stock item not found: ' + (itemErr?.message || ''));

  // Signed quantity: DB trigger adds NEW.quantity to current_quantity
  let signedQty: number;
  let dbMovType: string;

  switch (payload.direction) {
    case 'in':
      signedQty = payload.quantity;
      dbMovType = payload.movement_type || 'in';
      break;
    case 'out':
      signedQty = -payload.quantity;
      dbMovType = payload.movement_type || 'out';
      if (item.current_quantity + signedQty < 0) {
        return fail(`Insufficient stock for ${item.name}. Available: ${item.current_quantity} ${item.unit}, requested: ${payload.quantity}.`);
      }
      break;
    case 'adjust': {
      const target = payload.target_quantity ?? payload.quantity;
      signedQty = target - item.current_quantity;
      dbMovType = payload.movement_type || 'adjustment';
      break;
    }
    default:
      return fail('Invalid movement direction.');
  }

  const { error } = await supabase().from('stock_movements').insert({
    stock_item_id: payload.stock_item_id,
    movement_type: dbMovType,
    quantity: signedQty,
    unit: item.unit || 'unit',
    notes: payload.notes || null,
    created_by: payload.created_by || null,
    reference_type: payload.reference_type || null,
    reference_id: payload.reference_id || null,
    project_id: payload.project_id || null,
  });

  // DB trigger (update_stock_quantity) handles current_quantity update — do NOT update manually

  if (error) {
    if (error.message?.toLowerCase().includes('negative')) {
      return fail(`Stock would go negative. Available: ${item.current_quantity} ${item.unit}.`);
    }
    return fail('Stock movement failed: ' + error.message);
  }

  return ok();
}

export async function reserveStock(
  stockItemId: string,
  quantity: number,
  productionOrderId: string,
  projectId: string,
  createdBy?: string,
): Promise<ServiceResult> {
  if (!stockItemId || quantity <= 0) return fail('Invalid reservation parameters.');

  const { data: item, error: itemErr } = await supabase()
    .from('stock_items')
    .select('reserved_quantity, current_quantity, name, unit')
    .eq('id', stockItemId)
    .single();

  if (itemErr || !item) return fail('Stock item not found.');

  const available = item.current_quantity - item.reserved_quantity;
  if (quantity > available) {
    return fail(`Insufficient stock: available=${available} ${item.unit || 'units'}, requested=${quantity} for "${item.name}".`);
  }

  // Update reserved_quantity
  const { error: reserveErr } = await supabase()
    .from('stock_items')
    .update({ reserved_quantity: item.reserved_quantity + quantity })
    .eq('id', stockItemId);

  if (reserveErr) return fail('Failed to reserve stock: ' + reserveErr.message);

  // Audit movement (quantity: 0 — does not change current_quantity via trigger)
  await supabase().from('stock_movements').insert({
    stock_item_id: stockItemId,
    movement_type: 'reserve',
    quantity: 0,
    reference_type: 'production_order',
    reference_id: productionOrderId,
    project_id: projectId,
    notes: `Reserved for production order`,
    created_by: createdBy || null,
  });

  return ok();
}

export async function releaseStockReservation(
  stockItemId: string,
  quantity: number,
  createdBy?: string,
): Promise<ServiceResult> {
  const { data: item, error: itemErr } = await supabase()
    .from('stock_items')
    .select('reserved_quantity')
    .eq('id', stockItemId)
    .single();

  if (itemErr || !item) return fail('Stock item not found.');

  const { error } = await supabase()
    .from('stock_items')
    .update({ reserved_quantity: Math.max(0, item.reserved_quantity - quantity) })
    .eq('id', stockItemId);

  if (error) return fail('Failed to release reservation: ' + error.message);
  return ok();
}

// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ════════════════════════════════════════════════════════════════════════════

export interface PaymentPayload {
  project_id: string;
  amount: number;
  payment_type: 'deposit' | 'pre_installation' | 'final' | 'other';
  payment_method: 'cash' | 'cheque' | 'bank_transfer' | 'card' | 'other';
  received_at: string;  // ISO string
  reference_number?: string | null;
  notes?: string | null;
  received_by?: string | null;
}

export async function recordPayment(payload: PaymentPayload): Promise<ServiceResult<{ id: string }>> {
  if (!payload.project_id) return fail('Project ID is required.');
  if (!payload.amount || payload.amount <= 0) return fail('Payment amount must be greater than zero.');
  if (!payload.received_at) return fail('Payment date is required.');

  // Atomic: insert payment + update project paid_amount in one SQL transaction
  const { data, error } = await supabase()
    .rpc('record_payment_atomic', {
      p_project_id:  payload.project_id,
      p_amount:      payload.amount,
      p_method:      payload.payment_method,
      p_type:        payload.payment_type,
      p_reference:   payload.reference_number || null,
      p_notes:       payload.notes || null,
      p_received_by: payload.received_by || null,
      p_received_at: new Date(payload.received_at).toISOString(),
    });

  if (error) return fail('Failed to record payment: ' + error.message);

  return ok({ id: data.payment_id });
}

// ════════════════════════════════════════════════════════════════════════════
// PROJECTS
// ════════════════════════════════════════════════════════════════════════════

export type ProjectStatus =
  | 'measurements' | 'measurements_confirmed' | 'design' | 'client_validation'
  | 'production' | 'installation' | 'delivered' | 'cancelled';

export async function updateProjectStatus(
  projectId: string,
  newStatus: ProjectStatus,
  updatedBy?: string,
): Promise<ServiceResult> {
  if (!projectId) return fail('Project ID is required.');

  // Safety check: cannot move to production without deposit
  if (newStatus === 'production') {
    const { data: project } = await supabase()
      .from('projects')
      .select('deposit_paid, design_validated, total_amount')
      .eq('id', projectId)
      .single();

    if (!project?.deposit_paid) {
      return fail('Cannot move to production: 50% deposit has not been paid.');
    }
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  // production_started_at added by schema_fix_migrate.js
  if (newStatus === 'production') updates.production_started_at = new Date().toISOString();
  if (newStatus === 'delivered') updates.actual_delivery_date = new Date().toISOString();

  const { error } = await supabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) return fail('Failed to update project status: ' + error.message);

  // Log event (non-fatal)
  try {
    await supabase().from('project_events').insert({
      project_id: projectId,
      event_type: 'status_change',
      description: `Status changed to ${newStatus}`,
      new_value: newStatus,
      user_id: updatedBy || null,
    });
  } catch { /* ignore */ }

  return ok();
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCTION CONSUMPTION
// ════════════════════════════════════════════════════════════════════════════

export interface ProductionUsagePayload {
  production_order_id: string;
  requirement_id: string;
  material_id: string;
  used_qty: number;
  waste_qty: number;
  unit: string;
  stage: string;
  worker_id?: string | null;
  project_id: string;
  notes?: string | null;
  order_name?: string;
  material_name?: string;
  planned_qty?: number;
  reserved_quantity?: number;
}

export async function recordProductionUsage(payload: ProductionUsagePayload): Promise<ServiceResult> {
  if (payload.used_qty <= 0) return fail('Used quantity must be greater than zero.');
  if (payload.waste_qty < 0) return fail('Waste quantity cannot be negative.');

  // Atomic: all 6 steps in one SQL transaction
  const { data, error } = await supabase()
    .rpc('record_production_usage_atomic', {
      p_production_order_id: payload.production_order_id,
      p_requirement_id:     payload.requirement_id,
      p_material_id:        payload.material_id,
      p_project_id:         payload.project_id,
      p_used_qty:           payload.used_qty,
      p_waste_qty:          payload.waste_qty,
      p_unit:               payload.unit,
      p_stage:              payload.stage,
      p_worker_id:          payload.worker_id || null,
      p_notes:              payload.notes || null,
      p_order_name:         payload.order_name || null,
      p_material_name:      payload.material_name || null,
      p_planned_qty:        payload.planned_qty ?? null,
    });

  if (error) return fail('Production usage failed: ' + error.message);

  return ok();
}

// ════════════════════════════════════════════════════════════════════════════
// INSTALLATION
// ════════════════════════════════════════════════════════════════════════════

export async function updateInstallationStatus(
  installationId: string,
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
  updatedBy?: string,
): Promise<ServiceResult> {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // installations has checkin_at (= started_at) and checkout_at (= completed_at)
  // started_at / completed_at do not exist — code uses the actual column names
  if (status === 'in_progress') updates.checkin_at = new Date().toISOString();
  if (status === 'completed') updates.checkout_at = new Date().toISOString();

  const { error } = await createClient()
    .from('installations')
    .update(updates)
    .eq('id', installationId);

  if (error) return fail('Failed to update installation: ' + error.message);
  return ok();
}
