// ============================================================
// ArtMood Factory OS — Finance Types
// ============================================================

import type { HealthStatus } from './common';
import type { Project } from './crm';
import type { ProductionStation } from './production';

export type PaymentType = 'deposit' | 'pre_installation' | 'final' | 'other';
export type PaymentMethod = 'cash' | 'cheque' | 'bank_transfer' | 'card' | 'other';

export type ChequeType = 'received' | 'issued';
export type ChequeStatus = 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';

export type ExpenseCategory =
  | 'rent' | 'internet' | 'phones' | 'insurance' | 'software' | 'subscriptions' | 'utilities'
  | 'fuel' | 'transport' | 'maintenance' | 'tools' | 'spare_parts' | 'consumables' | 'raw_materials'
  | 'salary' | 'bonus' | 'tax' | 'other';

export type LedgerType = 'income' | 'expense';

export interface Payment {
  id: string;
  project_id: string;
  amount: number;
  payment_type: PaymentType;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  received_at: string;
  created_at: string;
  project?: Project;
}

export interface Cheque {
  id: string;
  type: ChequeType;
  amount: number;
  due_date: string;
  status: ChequeStatus;
  cheque_number: string | null;
  bank_name: string | null;
  client_name: string | null;
  supplier_name: string | null;
  project_id: string | null;
  photo_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  is_recurring: boolean;
  recurring_day: number | null;
  project_id: string | null;
  supplier_id: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerType;
  category: string;
  amount: number;
  description: string | null;
  project_id: string | null;
  source_module: string;
  source_id: string | null;
  payment_method: PaymentMethod | null;
  created_by: string | null;
  created_at: string;
}

export interface MonthlyCashflow {
  month: string;
  total_income: number;
  total_expenses: number;
  net_cashflow: number;
}

// ============================================================
// Dashboard Types (Finance-related)
// ============================================================

export interface BusinessHealth {
  cashflow_30d: number;
  overdue_deposits: number;
  critical_stock_items: number;
  delayed_production: number;
  cheques_due_7d: number;
}

export interface StationWorkload {
  station: ProductionStation;
  part_count: number;
  order_count: number;
}

export function calculateHealthStatus(health: BusinessHealth): HealthStatus {
  const issues = [
    health.overdue_deposits > 0,
    health.critical_stock_items > 2,
    health.delayed_production > 0,
    health.cheques_due_7d > 3,
    health.cashflow_30d < 0,
  ].filter(Boolean).length;

  if (issues >= 3) return 'red';
  if (issues >= 1) return 'yellow';
  return 'green';
}
