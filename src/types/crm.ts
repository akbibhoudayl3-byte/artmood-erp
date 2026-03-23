// ============================================================
// ArtMood Factory OS — CRM Types (Leads, Projects, Quotes)
// ============================================================

import type { Profile } from './common';
import type { Payment } from './finance';

export type LeadStatus = 'new' | 'contacted' | 'visit_scheduled' | 'quote_sent' | 'won' | 'lost';
export type LeadSource = 'instagram' | 'facebook' | 'google' | 'architect' | 'referral' | 'walk_in' | 'website' | 'other';

export type ProjectStatus = 'measurements' | 'measurements_confirmed' | 'design' | 'client_validation' | 'production' | 'installation' | 'delivered' | 'cancelled';
export type ProjectType = 'kitchen' | 'dressing' | 'furniture' | 'other';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'revised';

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
  cutting_method?: 'saw' | 'cnc';
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
  // Cost Engine fields
  margin_override?: boolean;
  margin_override_by?: string | null;
  margin_override_reason?: string | null;
  is_auto_generated?: boolean;
  cost_snapshot?: Record<string, number> | null;
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
