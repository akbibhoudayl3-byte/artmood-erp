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
// Cost Engine Types
// ============================================================

export interface CostBreakdown {
  material_cost: number;
  hardware_cost: number;
  labor_cost: number;
  machine_cost: number;
  transport_cost: number;
  total_cost: number;
  total_panels: number;
  min_margin_percent: number;
  recommended_margin_percent: number;
}

export interface CostSettings {
  id: string;
  labor_rate_per_hour: number;
  avg_hours_per_panel: number;
  machine_rate_per_hour: number;
  avg_machine_hours_per_panel: number;
  default_transport_cost: number;
  min_margin_percent: number;
  recommended_margin_percent: number;
  updated_at: string;
  updated_by: string | null;
}

export interface MarginCheck {
  compliant: boolean;
  marginPercent: number;
  minMargin: number;
  recommendedMargin: number;
  requiresOverride: boolean;
}

export interface ProjectRealCost {
  project_id: string;
  reference_code: string | null;
  client_name: string;
  revenue: number;
  real_cost: number;
  profit: number;
  margin_percent: number;
  margin_health: 'no_revenue' | 'loss' | 'critical' | 'warning' | 'healthy';
}

// ============================================================
// Kitchen Configurator Types
// ============================================================

export interface CabinetMaterialPreset {
  id: string;
  name: string;
  description: string | null;
  carcass_material: string;
  carcass_thickness_mm: number;
  facade_material: string;
  facade_thickness_mm: number;
  back_panel_material: string;
  back_panel_thickness_mm: number;
  edge_band_type: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CabinetHardwarePreset {
  id: string;
  name: string;
  tier: 'premium' | 'standard' | 'budget';
  description: string | null;
  hinge_type: string;
  hinge_unit_price: number;
  drawer_slide_type: string;
  drawer_slide_unit_price: number;
  handle_type: string;
  handle_unit_price: number;
  shelf_support_unit_price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface KitchenLayoutTemplate {
  id: string;
  name: string;
  layout_type: 'I' | 'L' | 'U' | 'parallel' | 'island';
  description: string | null;
  default_module_slots: ModuleSlot[];
  illustration_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ModuleSlot {
  position: number;
  category: string;
  label: string;
}

export type OpeningSystem = 'handle' | 'gola' | 'push_open';

export interface KitchenConfiguration {
  id: string;
  project_id: string;
  layout_template_id: string | null;
  material_preset_id: string | null;
  hardware_preset_id: string | null;
  opening_system: OpeningSystem;
  wall_length_mm: number | null;
  wall_length_b_mm: number | null;
  ceiling_height_mm: number | null;
  notes: string | null;
  generation_status: 'draft' | 'generated' | 'modified';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  layout_template?: KitchenLayoutTemplate;
  material_preset?: CabinetMaterialPreset;
  hardware_preset?: CabinetHardwarePreset;
}

export interface KitchenConfigModule {
  slot_position: number;
  slot_label: string;
  module_id: string;
  module_code: string;
  module_name: string;
  quantity: number;
  custom_width_mm: number | null;
  custom_height_mm: number | null;
  custom_depth_mm: number | null;
}

// ============================================================
// Config Table Types
// ============================================================

export interface PricingRule {
  id: string;
  rule_key: string;
  rule_value: number;
  unit: string;
  description: string | null;
  category: 'material' | 'margin' | 'production' | 'edge_banding' | 'installation' | 'bom' | 'edge' | 'validation' | 'general';
  created_at: string;
  updated_at: string;
}

export interface NestingConfig {
  id: string;
  config_key: string;
  config_value: number;
  unit: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  project_type: 'kitchen' | 'dressing' | 'furniture' | 'other';
  layout_type: 'I' | 'L' | 'U' | 'parallel' | 'island' | 'peninsula' | null;
  description: string | null;
  module_count: number;
  module_mix: ScenarioModuleEntry[];
  material_default: string;
  hardware_tier: 'eco' | 'standard' | 'premium';
  opening_system: 'handle' | 'gola' | 'push_open';
  edge_logic: string | null;
  approval_path: string | null;
  estimated_sheets: number | null;
  estimated_cost_range: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ScenarioModuleEntry {
  type: string;
  width: number;
  qty: number;
  label: string;
}

export type ColorSelectionMode = 'one_color' | 'body_and_door' | 'mixed';

export type OpeningSystemExtended = 'handle' | 'gola_lower' | 'gola_upper' | 'push_open' | 'handleless';

// ============================================================
// Price Protection Types
// ============================================================

export type PriceProtectionStatus = 'OK' | 'WARNING' | 'BLOCKED';

export interface PriceProtectionResult {
  status: PriceProtectionStatus;
  total_cost: number;
  selling_price: number;
  margin_amount: number;
  margin_percent: number;
  min_margin_percent: number;
  cost_breakdown: PriceProtectionCostBreakdown;
  requires_approval: boolean;
  approval_reason: string | null;
  blocked_reason: string | null;
}

export interface PriceProtectionCostBreakdown {
  material_cost: number;
  edge_cost: number;
  labor_cost: number;
  hardware_cost: number;
  machine_cost: number;
  transport_cost: number;
  waste_cost: number;
  facade_cost: number;
  total_cost: number;
}

export interface QuoteApprovalRecord {
  quote_id: string;
  project_id: string;
  total_cost: number;
  selling_price: number;
  margin_percent: number;
  protection_status: PriceProtectionStatus;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  cost_snapshot: PriceProtectionCostBreakdown;
}

// ============================================================
// Smart Pricing Types
// ============================================================

export interface RecommendedPrices {
  price_min: number;        // @ 20% margin (absolute floor)
  price_warning: number;    // @ 25% margin (below = needs approval)
  price_target: number;     // @ 30% margin (recommended)
  price_aggressive: number; // @ 40% margin (premium)
}

export interface SmartPricingResult extends PriceProtectionResult {
  warning_margin_percent: number;
  recommended_prices: RecommendedPrices;
}

export interface DiscountCheckResult {
  original_price: number;
  discount_percent: number;
  discount_amount: number;
  final_price: number;
  margin_after_discount: number;
  status: PriceProtectionStatus;
  blocked_reason: string | null;
  max_discount_percent: number;
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
