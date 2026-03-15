// ============================================================
// ArtMood Factory OS — Stock & Inventory Types
// ============================================================

export type StockCategory = 'panels' | 'edge_banding' | 'hardware' | 'consumables' | 'workshop_supplies' | 'packaging' | 'outsourced_components' | 'other';
export type StockMovementType = 'in' | 'out' | 'transfer' | 'reserve' | 'consume' | 'adjust' | 'purchase_in' | 'adjustment' | 'waste_out' | 'production_out' | 'production_use' | 'production_waste';

export type StockReservationStatus = 'reserved' | 'consumed' | 'released';

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
