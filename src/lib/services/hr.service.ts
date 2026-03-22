/**
 * HR Service — Domain logic for attendance check-in/out and stats.
 *
 * Extracts Supabase queries from src/app/(app)/hr/page.tsx
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { Attendance, Profile } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[hr-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export type AttendanceWithUser = Attendance & {
  user?: Profile;
};

export interface WeeklyStats {
  present: number;
  late: number;
  totalHours: number;
  overtime: number;
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Load today's attendance records with user profile joined.
 */
export async function loadAttendance(
  date: string,
): Promise<ServiceResult<AttendanceWithUser[]>> {
  const { data, error } = await supabase()
    .from('attendance')
    .select('*, user:profiles(full_name, role)')
    .eq('date', date);

  if (error) return fail('Failed to load attendance: ' + error.message);
  return ok((data as AttendanceWithUser[]) || []);
}

/**
 * Load attendance records for a date range (e.g. weekly or monthly view).
 */
export async function loadAttendanceRange(
  startDate: string,
  endDate: string,
): Promise<ServiceResult<Attendance[]>> {
  const { data, error } = await supabase()
    .from('attendance')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) return fail('Failed to load attendance range: ' + error.message);
  return ok((data as Attendance[]) || []);
}

/**
 * Load all active employees (profiles).
 */
export async function loadEmployees(): Promise<ServiceResult<Profile[]>> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('*')
    .eq('is_active', true);

  if (error) return fail('Failed to load employees: ' + error.message);
  return ok((data as Profile[]) || []);
}

/**
 * Check in an employee for today.
 * If the employee already has an attendance record (checked in), this performs a check-out.
 */
export async function checkIn(
  userId: string,
  existingAttendance?: Attendance | null,
): Promise<ServiceResult> {
  if (!userId) return fail('User ID is required.');

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (existingAttendance) {
    // Check out — update existing record
    const { error } = await supabase()
      .from('attendance')
      .update({ check_out: now.toISOString() })
      .eq('id', existingAttendance.id);

    if (error) return fail('Failed to check out: ' + error.message);
  } else {
    // Check in — create new record
    const isLate = now.getHours() >= 9;

    const { error } = await supabase()
      .from('attendance')
      .insert({
        user_id: userId,
        date: today,
        check_in: now.toISOString(),
        status: isLate ? 'late' : 'present',
      });

    if (error) return fail('Failed to check in: ' + error.message);
  }

  return ok();
}

/**
 * Check out an employee (update existing attendance with check_out time).
 */
export async function checkOut(
  userId: string,
  attendanceId: string,
): Promise<ServiceResult> {
  if (!userId) return fail('User ID is required.');
  if (!attendanceId) return fail('Attendance record ID is required.');

  const { error } = await supabase()
    .from('attendance')
    .update({ check_out: new Date().toISOString() })
    .eq('id', attendanceId);

  if (error) return fail('Failed to check out: ' + error.message);
  return ok();
}

/**
 * Bulk check-in multiple employees at once.
 */
export async function bulkCheckIn(
  userIds: string[],
): Promise<ServiceResult> {
  if (!userIds.length) return fail('No employees to check in.');

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const isLate = now.getHours() >= 9;

  const { error } = await supabase()
    .from('attendance')
    .insert(
      userIds.map((id) => ({
        user_id: id,
        date: today,
        check_in: now.toISOString(),
        status: isLate ? 'late' : 'present',
      })),
    );

  if (error) return fail('Failed to bulk check in: ' + error.message);
  return ok();
}

/**
 * Calculate weekly stats for a specific user from attendance records.
 * This is a pure computation function — no DB call.
 */
export function computeWeeklyStats(
  userId: string,
  records: Attendance[],
): WeeklyStats {
  const userRecords = records.filter((a) => a.user_id === userId);
  const present = userRecords.filter(
    (a) => a.status === 'present' || a.status === 'late',
  ).length;
  const late = userRecords.filter((a) => a.status === 'late').length;
  const totalHours = userRecords.reduce((sum, a) => {
    if (a.check_in && a.check_out) {
      return (
        sum +
        (new Date(a.check_out).getTime() - new Date(a.check_in).getTime()) /
          3600000
      );
    }
    return sum;
  }, 0);
  const overtime = Math.max(0, totalHours - present * 8);

  return { present, late, totalHours, overtime };
}

/**
 * Load expiring employee documents (within 30 days).
 */
export async function loadExpiringDocuments(): Promise<ServiceResult<any[]>> {
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .split('T')[0];

  const { data, error } = await supabase()
    .from('employee_documents')
    .select('*, user:profiles!employee_documents_user_id_fkey(full_name)')
    .not('expiry_date', 'is', null)
    .lte('expiry_date', thirtyDaysFromNow);

  if (error) return fail('Failed to load expiring documents: ' + error.message);
  return ok(data || []);
}
