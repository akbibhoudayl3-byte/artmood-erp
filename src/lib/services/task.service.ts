/**
 * Task Service — Production Workflow Engine
 * Manages station-based tasks for production orders.
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { ProductionStationRow, TaskBoardItem, QCResult } from '@/types/production';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[task-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Load Stations ─────────────────────────────────────────────────────────

export async function loadStations(): Promise<ServiceResult<ProductionStationRow[]>> {
  const { data, error } = await supabase()
    .from('production_stations')
    .select('*')
    .eq('is_active', true)
    .order('order_index');
  if (error) return fail('Failed to load stations: ' + error.message);
  return ok(data || []);
}

// ── Generate Tasks for Order ──────────────────────────────────────────────

export async function generateTasksForOrder(
  orderId: string,
  projectId: string | null,
): Promise<ServiceResult<{ count: number }>> {
  if (!orderId) return fail('Order ID is required');

  // Check if tasks already exist
  const { count } = await supabase()
    .from('production_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('production_order_id', orderId);
  if (count && count > 0) return ok({ count: 0 }); // Already generated

  // Get all stations
  const stationsRes = await loadStations();
  if (!stationsRes.success || !stationsRes.data?.length) {
    return fail('No stations found');
  }

  const tasks = stationsRes.data.map((s) => ({
    production_order_id: orderId,
    project_id: projectId,
    station_id: s.id,
    status: 'pending',
  }));

  const { error } = await supabase().from('production_tasks').insert(tasks);
  if (error) return fail('Failed to generate tasks: ' + error.message);
  return ok({ count: tasks.length });
}

// ── Load Tasks ────────────────────────────────────────────────────────────

export async function loadOrderTasks(
  orderId: string,
): Promise<ServiceResult<TaskBoardItem[]>> {
  const { data, error } = await supabase()
    .from('v_production_task_board')
    .select('*')
    .eq('production_order_id', orderId)
    .order('order_index');
  if (error) return fail('Failed to load order tasks: ' + error.message);
  return ok((data as TaskBoardItem[]) || []);
}

export async function loadMyTasks(
  userId: string,
): Promise<ServiceResult<TaskBoardItem[]>> {
  const { data, error } = await supabase()
    .from('v_production_task_board')
    .select('*')
    .eq('assigned_to', userId)
    .in('status', ['pending', 'in_progress', 'paused', 'blocked'])
    .order('order_index');
  if (error) return fail('Failed to load my tasks: ' + error.message);
  // Sort: in_progress first, then paused, then pending
  const priority: Record<string, number> = { in_progress: 0, paused: 1, blocked: 2, pending: 3 };
  const sorted = (data as TaskBoardItem[] || []).sort((a, b) => {
    const pa = priority[a.status] ?? 9;
    const pb = priority[b.status] ?? 9;
    return pa !== pb ? pa - pb : a.order_index - b.order_index;
  });
  return ok(sorted);
}

export async function loadAllTasks(
  stationCode?: string,
): Promise<ServiceResult<TaskBoardItem[]>> {
  let query = supabase()
    .from('v_production_task_board')
    .select('*')
    .in('status', ['pending', 'in_progress', 'paused', 'blocked']);
  if (stationCode) {
    query = query.eq('station_code', stationCode);
  }
  const { data, error } = await query.order('order_index').limit(200);
  if (error) return fail('Failed to load tasks: ' + error.message);
  return ok((data as TaskBoardItem[]) || []);
}

// ── Task Actions ──────────────────────────────────────────────────────────

export async function startTask(
  taskId: string,
  userId: string,
): Promise<ServiceResult> {
  if (!taskId || !userId) return fail('Task ID and User ID are required');

  // Fetch the task
  const { data: task, error: tErr } = await supabase()
    .from('v_production_task_board')
    .select('*')
    .eq('id', taskId)
    .single();
  if (tErr || !task) return fail('Task not found');
  if (task.status !== 'pending' && task.status !== 'paused') {
    return fail('Task cannot be started (current status: ' + task.status + ')');
  }

  // Check previous station is completed (except first station)
  if (task.order_index > 1) {
    const { data: prevTasks } = await supabase()
      .from('v_production_task_board')
      .select('status')
      .eq('production_order_id', task.production_order_id)
      .eq('order_index', task.order_index - 1);

    const prevDone = prevTasks?.every((t: any) => t.status === 'completed' || t.status === 'rework_sent');
    if (!prevDone) {
      return fail('Previous station must be completed first');
    }
  }

  const { error } = await supabase()
    .from('production_tasks')
    .update({
      status: 'in_progress',
      assigned_to: userId,
      started_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) return fail('Failed to start task: ' + error.message);
  return ok();
}

export async function completeTask(
  taskId: string,
  userId: string,
): Promise<ServiceResult> {
  if (!taskId) return fail('Task ID is required');

  const { data: task, error: tErr } = await supabase()
    .from('v_production_task_board')
    .select('*')
    .eq('id', taskId)
    .single();
  if (tErr || !task) return fail('Task not found');
  if (task.status !== 'in_progress') {
    return fail('Only in-progress tasks can be completed');
  }

  // Calculate duration
  let durationMinutes: number | null = null;
  if (task.started_at) {
    durationMinutes = Math.round(
      (Date.now() - new Date(task.started_at).getTime()) / 60000,
    );
  }

  const { error } = await supabase()
    .from('production_tasks')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq('id', taskId);
  if (error) return fail('Failed to complete task: ' + error.message);

  // Notify on key stations
  if (task.station_code === 'PACKAGING' || task.station_code === 'READY_FOR_INSTALL') {
    await notifyStationReached(task as TaskBoardItem, task.station_code);
  }

  // If last station completed, mark order as completed
  if (task.station_code === 'READY_FOR_INSTALL') {
    await supabase()
      .from('production_orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.production_order_id);
  }

  return ok();
}

export async function pauseTask(taskId: string): Promise<ServiceResult> {
  const { error } = await supabase()
    .from('production_tasks')
    .update({ status: 'paused' })
    .eq('id', taskId);
  if (error) return fail('Failed to pause task: ' + error.message);
  return ok();
}

export async function resumeTask(
  taskId: string,
  userId: string,
): Promise<ServiceResult> {
  const { error } = await supabase()
    .from('production_tasks')
    .update({
      status: 'in_progress',
      assigned_to: userId,
    })
    .eq('id', taskId);
  if (error) return fail('Failed to resume task: ' + error.message);
  return ok();
}

export async function assignTask(
  taskId: string,
  workerId: string | null,
): Promise<ServiceResult> {
  const { error } = await supabase()
    .from('production_tasks')
    .update({ assigned_to: workerId })
    .eq('id', taskId);
  if (error) return fail('Failed to assign task: ' + error.message);
  return ok();
}

// ── QC Result ─────────────────────────────────────────────────────────────

export async function submitQCResult(
  taskId: string,
  result: QCResult,
  reworkStationCode?: string,
  notes?: string,
): Promise<ServiceResult> {
  if (!taskId || !result) return fail('Task ID and result required');

  const { data: task, error: tErr } = await supabase()
    .from('v_production_task_board')
    .select('*')
    .eq('id', taskId)
    .single();
  if (tErr || !task) return fail('Task not found');

  if (result === 'approved') {
    // Complete the QC task normally
    let durationMinutes: number | null = null;
    if (task.started_at) {
      durationMinutes = Math.round(
        (Date.now() - new Date(task.started_at).getTime()) / 60000,
      );
    }
    const { error } = await supabase()
      .from('production_tasks')
      .update({
        status: 'completed',
        qc_result: 'approved',
        ended_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        notes: notes || null,
      })
      .eq('id', taskId);
    if (error) return fail('Failed to approve: ' + error.message);
    return ok();
  }

  if (result === 'rework_required' && reworkStationCode) {
    // Mark QC task as rework_sent
    const { error: upErr } = await supabase()
      .from('production_tasks')
      .update({
        status: 'rework_sent',
        qc_result: 'rework_required',
        notes: notes || null,
      })
      .eq('id', taskId);
    if (upErr) return fail('Failed to update QC task: ' + upErr.message);

    // Find target station ID
    const { data: targetStation } = await supabase()
      .from('production_stations')
      .select('id')
      .eq('code', reworkStationCode)
      .single();
    if (!targetStation) return fail('Rework station not found');

    // Create new task at rework station
    const { error: insErr } = await supabase()
      .from('production_tasks')
      .insert({
        production_order_id: task.production_order_id,
        project_id: task.project_id,
        station_id: targetStation.id,
        status: 'pending',
        rework_from_task_id: taskId,
        rework_target_station_id: targetStation.id,
        rework_count: (task.rework_count || 0) + 1,
        notes: `Rework from QC: ${notes || 'no details'}`,
      });
    if (insErr) return fail('Failed to create rework task: ' + insErr.message);
    return ok();
  }

  if (result === 'rejected') {
    const { error } = await supabase()
      .from('production_tasks')
      .update({
        status: 'blocked',
        qc_result: 'rejected',
        notes: notes || null,
      })
      .eq('id', taskId);
    if (error) return fail('Failed to reject: ' + error.message);
    return ok();
  }

  return fail('Invalid QC result');
}

// ── Notifications ─────────────────────────────────────────────────────────

async function notifyStationReached(
  task: TaskBoardItem,
  stationCode: string,
): Promise<void> {
  try {
    const rolesToNotify =
      stationCode === 'READY_FOR_INSTALL'
        ? ['installer', 'commercial_manager', 'ceo']
        : ['installer', 'ceo'];

    const { data: users } = await supabase()
      .from('profiles')
      .select('id')
      .in('role', rolesToNotify)
      .eq('is_active', true);

    if (!users?.length) return;

    const label = stationCode === 'READY_FOR_INSTALL' ? 'ready for installation' : 'packaging';
    const notifications = users.map((u: any) => ({
      user_id: u.id,
      type: 'production_milestone',
      title: `${task.reference_code || 'Order'} — ${label}`,
      message: `Project ${task.client_name || ''} (${task.reference_code || ''}) is at ${task.station_name}`,
      link: '/production/tasks',
      is_read: false,
    }));

    await supabase().from('notifications').insert(notifications);
  } catch (e) {
    console.warn('[task-service] Notification failed:', e);
  }
}

// ── Load Workers (for assign dropdown) ────────────────────────────────────

export async function loadWorkers(): Promise<ServiceResult<{ id: string; full_name: string }[]>> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('id, full_name')
    .in('role', ['workshop_worker', 'worker', 'workshop_manager'])
    .eq('is_active', true)
    .order('full_name');
  if (error) return fail('Failed to load workers: ' + error.message);
  return ok(data || []);
}
