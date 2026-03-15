/**
 * Expense Service — Domain logic for expense CRUD.
 *
 * Extracts Supabase queries from src/app/(app)/finance/expenses/page.tsx
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { Expense, ExpenseCategory, PaymentMethod } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[expense-service]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreateExpenseData {
  amount: number;
  category: ExpenseCategory;
  description?: string;
  date: string;
  payment_method?: PaymentMethod;
  reference_number?: string;
  project_id?: string;
  created_by?: string;
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Load all expenses, ordered by most recent date. Limited to 200 rows.
 */
export async function loadExpenses(): Promise<ServiceResult<Expense[]>> {
  const { data, error } = await supabase()
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .limit(200);

  if (error) return fail('Failed to load expenses: ' + error.message);
  return ok((data as Expense[]) || []);
}

/**
 * Create a new expense.
 * Returns the newly created expense ID for ledger entry linking.
 */
export async function createExpense(
  data: CreateExpenseData,
): Promise<ServiceResult<{ id: string }>> {
  if (!data.date) return fail('Date is required.');
  if (!data.amount || data.amount <= 0)
    return fail('Amount must be greater than 0.');

  const { data: newExpense, error } = await supabase()
    .from('expenses')
    .insert({
      date: data.date,
      category: data.category,
      amount: data.amount,
      description: data.description?.trim() || null,
      payment_method: data.payment_method || 'cash',
      reference_number: data.reference_number?.trim() || null,
      project_id: data.project_id || null,
      created_by: data.created_by || null,
      is_recurring: false,
    })
    .select('id')
    .single();

  if (error) return fail('Failed to save expense: ' + error.message);
  return ok({ id: newExpense.id });
}

/**
 * Update an existing expense.
 */
export async function updateExpense(
  id: string,
  data: Record<string, unknown>,
): Promise<ServiceResult> {
  if (!id) return fail('Expense ID is required.');

  const { error } = await supabase()
    .from('expenses')
    .update({
      date: data.date,
      category: data.category,
      amount: data.amount ? Number(data.amount) : undefined,
      description: (data.description as string)?.trim() || null,
      payment_method: data.payment_method || undefined,
      reference_number: (data.reference_number as string)?.trim() || null,
    })
    .eq('id', id);

  if (error) return fail('Failed to update expense: ' + error.message);
  return ok();
}

/**
 * Delete an expense.
 */
export async function deleteExpense(id: string): Promise<ServiceResult> {
  if (!id) return fail('Expense ID is required.');

  const { error } = await supabase()
    .from('expenses')
    .delete()
    .eq('id', id);

  if (error) return fail('Failed to delete expense: ' + error.message);
  return ok();
}
