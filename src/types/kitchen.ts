// ============================================================
// Kitchen Cabinet ERP Types
// ============================================================

export type ModuleType = 'base' | 'wall' | 'tall' | 'sink' | 'drawer' | 'hotte' | 'corner';
export type ConstructionType = 'standard' | 'sink' | 'column' | 'hotte' | 'drawer' | 'corner';
export type LayoutType = 'I' | 'L' | 'U';
export type OpeningSystem = 'handles' | 'gola' | 'push';
export type ClientType = 'standard' | 'promoteur' | 'revendeur' | 'architecte' | 'urgent';
export type FacadeOverride = 'mdf' | 'glass' | 'semi_glass';
export type KitchenStatus = 'draft' | 'validated' | 'quoted' | 'production' | 'completed';
export type FillerSide = 'left' | 'right';
export type PartName = 'side' | 'bottom' | 'top' | 'shelf' | 'back' | 'facade' | 'drawer_facade' | 'drawer_bottom';
export type MaterialType = 'structure' | 'back' | 'facade' | 'aluminium';
export type BOMCategory = 'panel' | 'edge_banding' | 'hardware' | 'accessory' | 'filler';

export type ValidationSeverity = 'green' | 'orange' | 'red';

// ── Database Records ──

export interface ProductModule {
  id: string;
  code: string;
  label: string;
  type: ModuleType;
  default_width: number;
  default_height: number;
  default_depth: number;
  sort_order: number;
  is_active: boolean;
}

export interface ModuleRule {
  id: string;
  module_id: string;
  has_top: boolean;
  has_bottom: boolean;
  has_back: boolean;
  has_shelf: boolean;
  shelf_count: number;
  construction_type: ConstructionType;
}

export interface ModuleHardwareRule {
  id: string;
  module_id: string;
  hinges_count: number;
  drawer_system: string | null;
  spider_required: boolean;
  spider_count: number;
  rail_shared: boolean;
}

export interface ModuleOption {
  id: string;
  module_id: string;
  allow_glass: boolean;
  allow_semi_glass: boolean;
  allow_gola: boolean;
  allow_push: boolean;
}

export interface KitchenProject {
  id: string;
  project_id: string | null;
  client_name: string;
  client_type: ClientType;
  kitchen_type: string;
  layout_type: LayoutType;
  full_height: boolean;
  opening_system: OpeningSystem;
  structure_material: string;
  facade_material: string;
  back_thickness: number;
  edge_caisson_mm: number;
  edge_facade_mm: number;
  status: KitchenStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KitchenWall {
  id: string;
  kitchen_id: string;
  wall_name: string;
  wall_length_mm: number;
  sort_order: number;
}

export interface KitchenModuleInstance {
  id: string;
  kitchen_id: string;
  wall_id: string;
  module_id: string;
  position_x_mm: number;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  facade_override: FacadeOverride | null;
  sort_order: number;
  // joined
  module?: ProductModule;
}

export interface KitchenFiller {
  id: string;
  kitchen_id: string;
  wall_id: string;
  side: FillerSide;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
}

// ── BOM Engine Types ──

export interface BOMPanel {
  module_instance_id: string | null;
  part_name: string;
  description: string;
  material: MaterialType;
  width_mm: number;
  height_mm: number;
  thickness_mm: number;
  qty: number;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
}

export interface BOMEdgeBanding {
  module_instance_id: string | null;
  description: string;
  thickness_mm: number;
  length_m: number;
}

export interface BOMHardware {
  module_instance_id: string | null;
  description: string;
  qty: number;
  unit_cost: number;
}

export interface BOMResult {
  panels: BOMPanel[];
  edge_banding: BOMEdgeBanding[];
  hardware: BOMHardware[];
  accessories: BOMHardware[];
  fillers: BOMPanel[];
}

// ── Filler Types ──

export interface FillerSuggestion {
  wall_id: string;
  wall_name: string;
  wall_length_mm: number;
  total_modules_width: number;
  gap_mm: number;
  suggestion: 'ok' | 'filler_needed' | 'too_small' | 'add_module' | 'overflow';
  message: string;
}

// ── Validation Types ──

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: 'width' | 'layout' | 'technical' | 'compatibility';
  message: string;
  module_instance_id?: string;
  wall_id?: string;
}

export interface ValidationResult {
  overall: ValidationSeverity;
  issues: ValidationIssue[];
  can_generate_quote: boolean;
}

// ── Cost Types ──

export interface CostBreakdown {
  materials: number;
  hardware: number;
  accessories: number;
  labour: number;
  fixed_charges: number;
  transport: number;
  installation: number;
  subtotal: number;
  margin_percent: number;
  margin_amount: number;
  total_ht: number;
  vat_amount: number;
  total_ttc: number;
}

// ── Pipeline Step State ──

export interface KitchenPipelineState {
  step: number;
  kitchen: KitchenProject | null;
  walls: KitchenWall[];
  modules: KitchenModuleInstance[];
  fillers: KitchenFiller[];
  bom: BOMResult | null;
  validation: ValidationResult | null;
  cost: CostBreakdown | null;
}
