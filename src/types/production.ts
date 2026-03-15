// ============================================================
// ArtMood Factory OS — Production Types
// ============================================================

import type { Profile } from './common';
import type { Project } from './crm';

export type ProductionStation = 'pending' | 'saw' | 'cnc' | 'edge' | 'assembly' | 'qc' | 'packing';
export type ProductionOrderStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';

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
  accessories: Record<string, unknown>[];
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
  panel_template: Record<string, unknown>[];
  accessory_template: Record<string, unknown>[];
  thumbnail_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
// Waste Records
// ============================================================

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
