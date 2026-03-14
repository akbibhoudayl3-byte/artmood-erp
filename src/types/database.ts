// ============================================================
// ArtMood Factory OS — TypeScript Types
// ============================================================

export type UserRole =
  // Original roles (kept for backward compatibility)
  | 'ceo'
  | 'commercial_manager'
  | 'designer'
  | 'workshop_manager'
  | 'workshop_worker'
  | 'installer'
  | 'hr_manager'
  | 'community_manager'
  // New operational roles
  | 'owner_admin'        // Full system access
  | 'operations_manager' // Nadia: CRM + Ops + HR (no finance)
  | 'logistics'          // Jamal: Deliveries + errands only
  | 'worker';            // Generic workshop worker (like workshop_worker)

export type LeadStatus = 'new' | 'contacted' | 'visit_scheduled' | 'quote_sent' | 'won' | 'lost';
export type LeadSource = 'instagram' | 'facebook' | 'google' | 'architect' | 'referral' | 'walk_in' | 'website' | 'other';

export type ProjectStatus = 'measurements' | 'design' | 'client_validation' | 'production' | 'installation' | 'delivered' | 'cancelled';
export type ProjectType = 'kitchen' | 'dressing' | 'furniture' | 'other';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'revised';

export type ProductionStation = 'pending' | 'saw' | 'cnc' | 'edge' | 'assembly' | 'qc' | 'packing';
export type ProductionOrderStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';

export type InstallationStatus = 'scheduled' | 'in_progress' | 'completed' | 'issue_reported' | 'rescheduled';

export type PaymentType = 'deposit' | 'pre_installation' | 'final' | 'other';
export type PaymentMethod = 'cash' | 'cheque' | 'bank_transfer' | 'card' | 'other';

export type ChequeType = 'received' | 'issued';
export type ChequeStatus = 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';

export type ExpenseCategory =
  | 'rent' | 'internet' | 'phones' | 'insurance' | 'software' | 'subscriptions' | 'utilities'
  | 'fuel' | 'transport' | 'maintenance' | 'tools' | 'spare_parts' | 'consumables' | 'raw_materials'
  | 'salary' | 'bonus' | 'tax' | 'other';

export type StockCategory = 'panels' | 'edge_banding' | 'hardware' | 'consumables' | 'workshop_supplies' | 'packaging' | 'outsourced_components' | 'other';
export type StockMovementType = 'in' | 'out' | 'transfer' | 'reserve' | 'consume' | 'adjust' | 'purchase_in' | 'adjustment' | 'waste_out' | 'production_out' | 'production_use' | 'production_waste';

export type LedgerType = 'income' | 'expense';

// ============================================================
// Table Types
// ============================================================

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  source: LeadSource | null;
  status: LeadStatus;
  notes: string | null;
  lost_reason: string | null;
  next_follow_up: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assigned_profile?: Profile;
  lead_photos?: LeadPhoto[];
  lead_activities?: LeadActivity[];
}

export interface LeadPhoto {
  id: string;
  lead_id: string;
  file_url: string;
  caption: string | null;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id: string | null;
  activity_type: string | null;
  description: string | null;
  created_at: string;
  user?: Profile;
}

export interface Project {
  id: string;
  reference_code: string | null;
  lead_id: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_address: string | null;
  client_city: string | null;
  client_latitude:        number | null;
  client_longitude:       number | null;
  client_gps_accuracy:    number | null;
  client_gps_captured_at: string | null;
  client_gps_captured_by: string | null;
  client_gps_validated:   boolean;
  project_type: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  measurement_notes: string | null;
  measurement_date: string | null;
  measured_by: string | null;
  designer_id: string | null;
  design_validated: boolean;
  design_validated_at: string | null;
  total_amount: number;
  paid_amount: number;
  deposit_paid: boolean;
  pre_install_paid: boolean;
  final_paid: boolean;
  estimated_production_start: string | null;
  estimated_production_end: string | null;
  estimated_installation_date: string | null;
  actual_delivery_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  designer?: Profile;
  payments?: Payment[];
  quotes?: Quote[];
}

export interface ProjectEvent {
  id: string;
  project_id: string;
  user_id: string | null;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: Profile;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  project_id: string;
  version: number;
  status: QuoteStatus;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  valid_until: string | null;
  pdf_url: string | null;
  created_by: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  quote_lines?: QuoteLine[];
  project?: Project;
}

export interface QuoteLine {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  sort_order: number;
}

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

export interface ProductionOrder {
  id: string;
  project_id: string;
  name: string | null;
  status: ProductionOrderStatus;
  notes: string | null;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  project?: Project;
  parts?: ProductionPart[];
}

export interface ProductionPart {
  id: string;
  production_order_id: string;
  part_name: string;
  part_code: string | null;
  current_station: ProductionStation;
  assigned_worker: string | null;
  last_scan_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionScan {
  id: string;
  part_id: string;
  station: string;
  scanned_by: string | null;
  scanned_at: string;
  is_offline_sync: boolean;
}

export interface Installation {
  id: string;
  project_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  estimated_duration_hours: number | null;
  status: InstallationStatus;
  team_lead_id: string | null;
  client_address: string | null;
  client_phone: string | null;
  notes: string | null;
  checkin_at: string | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkin_photo_url: string | null;
  checkout_at: string | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  checkout_photo_url: string | null;
  completion_report: string | null;
  client_signature_url: string | null;
  client_satisfaction: number | null;
  created_at: string;
  updated_at: string;
  project?: Project;
  team_lead?: Profile;
}

export type InstallationPhotoType = 'before' | 'during' | 'after' | 'issue';

export interface InstallationPhoto {
  id: string;
  installation_id: string;
  photo_url: string;
  photo_type: InstallationPhotoType;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
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

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  balance: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockItem {
  id: string;
  name: string;
  sku: string | null;
  category: StockCategory;
  subcategory: string | null;
  unit: string;
  unit_secondary: string | null;
  conversion_factor: number | null;
  thickness_mm: number | null;
  sheet_length_mm: number | null;
  sheet_width_mm: number | null;
  roll_length_m: number | null;
  current_quantity: number;
  reserved_quantity: number;
  minimum_quantity: number;
  low_stock_threshold: number;
  cost_per_unit: number | null;
  location: string | null;
  supplier_id: string | null;
  notes: string | null;
  stock_tracking: boolean;
  is_active: boolean;
  normalized_name: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
}

export interface StockMovement {
  id: string;
  stock_item_id: string;
  movement_type: StockMovementType;
  quantity: number;
  unit: string | null;
  reference_type: string | null;
  reference_id: string | null;
  project_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string;
  event_time: string | null;
  is_all_day: boolean;
  reference_type: string | null;
  reference_id: string | null;
  assigned_to: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string | null;
  severity: 'info' | 'warning' | 'critical';
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'absent' | 'late' | 'half_day' | 'holiday';
  notes: string | null;
  created_at: string;
  user?: Profile;
}

// ============================================================
// Employee Documents
// ============================================================

export type EmployeeDocumentType = 'contract' | 'cin' | 'cnss' | 'certificate' | 'diploma' | 'work_permit' | 'medical' | 'insurance' | 'other';

export interface EmployeeDocument {
  id: string;
  user_id: string;
  document_type: EmployeeDocumentType;
  document_name: string;
  file_url: string;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ============================================================
// Employee Leaves
// ============================================================

export type LeaveType = 'vacation' | 'sick' | 'personal' | 'maternity' | 'unpaid' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface EmployeeLeave {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  user?: Profile;
  approver?: Profile;
}

// ============================================================
// Production Issues
// ============================================================

export type ProductionIssueType = 'missing_material' | 'wrong_dimension' | 'machine_problem' | 'client_change' | 'quality_defect' | 'other';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ProductionIssue {
  id: string;
  production_order_id: string | null;
  part_id: string | null;
  reported_by: string | null;
  issue_type: ProductionIssueType;
  description: string;
  severity: IssueSeverity;
  photo_url: string | null;
  station: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  reporter?: Profile;
  resolver?: Profile;
  part?: ProductionPart;
  production_order?: ProductionOrder;
}

// ============================================================
// Cabinet Template System
// ============================================================

export type CabinetType = 'base_cabinet' | 'wall_cabinet' | 'tall_cabinet' | 'drawer_unit' | 'wardrobe' | 'shelf_unit' | 'corner_cabinet' | 'other';

export interface CabinetTemplate {
  id: string;
  name: string;
  cabinet_type: CabinetType;
  description: string | null;
  default_width: number | null;
  default_height: number | null;
  default_depth: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CabinetSpec {
  id: string;
  project_id: string;
  template_id: string | null;
  cabinet_name: string;
  cabinet_type: string;
  width: number;
  height: number;
  depth: number;
  material: string;
  edge_band_type: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  panels?: PanelListItem[];
  accessories?: CabinetAccessory[];
}

export interface PanelListItem {
  id: string;
  cabinet_spec_id: string;
  panel_name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: 'length' | 'width' | 'none';
  notes: string | null;
  sort_order: number;
}

export interface CabinetAccessory {
  id: string;
  cabinet_spec_id: string;
  accessory_name: string;
  quantity: number;
  unit_price: number | null;
  notes: string | null;
}

// ============================================================
// Project Cost Tracking
// ============================================================

export type CostType = 'material' | 'labor' | 'transport' | 'installation' | 'subcontract' | 'overhead' | 'other';

export interface ProjectCost {
  id: string;
  project_id: string;
  cost_type: CostType;
  description: string;
  amount: number;
  quantity: number;
  unit_price: number | null;
  supplier_id: string | null;
  stock_item_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProjectProfitability {
  id: string;
  reference_code: string;
  client_name: string;
  status: ProjectStatus;
  revenue: number;
  total_cost: number;
  profit: number;
  margin_percent: number;
  paid_amount: number;
  deposit_paid: boolean;
  created_at: string;
  estimated_production_end: string | null;
  actual_delivery_date: string | null;
}

export interface ProjectPerformance {
  id: string;
  reference_code: string;
  client_name: string;
  status: ProjectStatus;
  total_amount: number;
  paid_amount: number;
  total_cost: number;
  cost_status: 'green' | 'yellow' | 'red' | 'gray';
  schedule_status: 'green' | 'yellow' | 'red' | 'gray';
  payment_status: 'green' | 'yellow' | 'red';
  overall_health: 'green' | 'yellow' | 'red' | 'gray';
}

// ============================================================
// Dashboard Types
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

export interface MonthlyCashflow {
  month: string;
  total_income: number;
  total_expenses: number;
  net_cashflow: number;
}

// Health status derived from BusinessHealth
export type HealthStatus = 'green' | 'yellow' | 'red';

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

// ============================================================
// Production Validation
// ============================================================

export interface ProductionValidation {
  id: string;
  project_id: string;
  deposit_check: boolean;
  measurements_validated: boolean;
  design_validated: boolean;
  materials_available: boolean;
  accessories_available: boolean;
  installer_validated: boolean;
  installer_validated_by: string | null;
  installer_validated_at: string | null;
  workshop_manager_validated: boolean;
  workshop_manager_validated_by: string | null;
  workshop_manager_validated_at: string | null;
  ceo_override: boolean;
  ceo_override_by: string | null;
  ceo_override_at: string | null;
  ceo_override_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Production Sheet System
// ============================================================

export type ProductionSheetStatus = 'draft' | 'pending_approval' | 'approved' | 'in_production' | 'completed' | 'cancelled';

export interface ProductionSheet {
  id: string;
  project_id: string;
  sheet_number: string;
  status: ProductionSheetStatus;
  client_name: string | null;
  client_phone: string | null;
  delivery_address: string | null;
  project_type: string;
  filled_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  total_panels: number;
  total_area_m2: number;
  total_edge_meters: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  project?: { reference_code: string; client_name: string };
  filler?: { full_name: string };
  approver?: { full_name: string };
  modules?: ProductionSheetModule[];
}

export interface ProductionSheetModule {
  id: string;
  sheet_id: string;
  module_name: string;
  module_type: string;
  width: number;
  height: number;
  depth: number;
  material: string;
  edge_band_type: string;
  has_back_panel: boolean;
  has_doors: boolean;
  door_count: number;
  has_drawers: boolean;
  drawer_count: number;
  has_shelves: boolean;
  shelf_count: number;
  color: string | null;
  accessories: any[];
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  panels?: ProductionSheetPanel[];
}

export interface ProductionSheetPanel {
  id: string;
  sheet_id: string;
  module_id: string;
  panel_name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: 'length' | 'width' | 'none';
  current_station: ProductionStation;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionSheetAccessory {
  id: string;
  sheet_id: string;
  module_id: string | null;
  accessory_name: string;
  quantity: number;
  unit: string;
  stock_item_id: string | null;
  is_available: boolean;
  notes: string | null;
  created_at: string;
}

export interface StationScan {
  id: string;
  panel_id: string;
  station: string;
  scanned_by: string | null;
  time_at_station: number | null;
  scanned_at: string;
}

// ============================================================
// Module Library (Templates)
// ============================================================

export interface ModuleLibrary {
  id: string;
  name_en: string;
  name_fr: string | null;
  name_ar: string | null;
  category: string;
  module_type: string;
  default_width: number;
  default_height: number;
  default_depth: number;
  default_material: string;
  default_edge_band: string;
  has_back_panel: boolean;
  has_doors: boolean;
  default_door_count: number;
  has_drawers: boolean;
  default_drawer_count: number;
  has_shelves: boolean;
  default_shelf_count: number;
  panel_template: any[];
  accessory_template: any[];
  thumbnail_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Stock Reservations
// ============================================================

export type StockReservationStatus = 'reserved' | 'consumed' | 'released';

export interface StockReservation {
  id: string;
  stock_item_id: string;
  sheet_id: string;
  quantity: number;
  status: StockReservationStatus;
  reserved_by: string | null;
  reserved_at: string;
  consumed_at: string | null;
  released_at: string | null;
  notes: string | null;
  // Joined
  stock_item?: { item_name: string; sku: string; unit: string };
  sheet?: { sheet_number: string };
  reserver?: { full_name: string };
}

export interface StockAvailability {
  id: string;
  item_name: string;
  sku: string;
  category: string;
  subcategory: string;
  unit: string;
  thickness_mm: number | null;
  sheet_length_mm: number | null;
  sheet_width_mm: number | null;
  roll_length_m: number | null;
  total_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  low_stock_threshold: number;
  total_area_m2: number | null;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  cost_per_unit: number;
  stock_value: number;
  supplier_id: string | null;
  location: string | null;
  is_active: boolean;
}

export interface WasteRecord {
  id: string;
  sheet_id: string;
  project_id: string | null;
  material: string;
  length_mm: number;
  width_mm: number;
  area_m2: number;
  is_reusable: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}


export type DocumentType = 'invoice' | 'delivery_note' | 'purchase_order' | 'technical_drawing' | 'photo' | 'contract' | 'other';
export type ScanStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ScannedDocument {
  id: string;
  project_id: string | null;
  production_sheet_id: string | null;
  uploaded_by: string | null;
  document_type: DocumentType;
  title: string;
  description: string | null;
  original_filename: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_language: string;
  extracted_data: Record<string, any>;
  tags: string[];
  status: ScanStatus;
  created_at: string;
  updated_at: string;
  // Joined
  project?: { name: string };
  sheet?: { sheet_number: string };
  uploader?: { full_name: string };
}
// ============================================================
// Production Material Consumption Engine
// ============================================================

export type MaterialRequirementStatus = 'planned' | 'reserved' | 'consumed' | 'cancelled';
export type ProductionStageType = 'cutting' | 'edge_banding' | 'assembly' | 'ready';

export interface ProductionMaterialRequirement {
  id: string;
  production_order_id: string;
  material_id: string | null;
  planned_qty: number;
  unit: string;
  status: MaterialRequirementStatus;
  notes: string | null;
  created_at: string;
  // Joined
  material?: {
    name: string;
    unit: string;
    current_quantity: number;
    reserved_quantity: number;
    cost_per_unit: number | null;
    category: string;
  };
  usage?: ProductionMaterialUsage[];
  order?: { name: string | null; project_id: string };
}

export interface ProductionMaterialUsage {
  id: string;
  production_order_id: string;
  requirement_id: string | null;
  material_id: string | null;
  used_qty: number;
  waste_qty: number;
  unit: string;
  stage: ProductionStageType | null;
  worker_id: string | null;
  movement_id: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  material?: { name: string; unit: string; cost_per_unit: number | null };
  worker?: { full_name: string };
}

// ============================================================
// Geolocation & RBAC Interfaces (Phase RBAC)
// ============================================================

export interface InstallationLocationLog {
  id: string;
  installation_id: string | null;
  project_id: string;
  user_id: string;
  action_type: 'checkin' | 'checkout' | 'start_installation' | 'finish_installation' | 'report_issue';
  user_latitude: number;
  user_longitude: number;
  user_accuracy_m: number | null;
  client_latitude: number;
  client_longitude: number;
  distance_meters: number;
  radius_meters: number;
  is_within_radius: boolean;
  action_blocked: boolean;
  block_reason: string | null;
  device_info: string | null;
  created_at: string;
}

export interface RoleConfig {
  role: string;
  display_name: string;
  pointage_required: boolean;
  can_access_finance: boolean;
  can_access_crm: boolean;
  can_access_hr: boolean;
  can_access_stock: boolean;
  can_access_production: boolean;
  geo_check_required: boolean;
  description: string | null;
  updated_at: string;
}

/** Roles that require attendance (pointage) */
export const POINTAGE_REQUIRED_ROLES: UserRole[] = [
  'operations_manager', 'designer', 'workshop_manager',
  'workshop_worker', 'worker', 'installer',
];

/** Roles that do NOT require attendance */
export const POINTAGE_EXEMPT_ROLES: UserRole[] = [
  'owner_admin', 'ceo', 'commercial_manager',
  'logistics', 'hr_manager', 'community_manager',
];

/** Default installer geolocation radius in metres */
export const INSTALLER_GEO_RADIUS_M = 150;
