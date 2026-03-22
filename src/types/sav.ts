// ── SAV (After-Sales Service) Types ──────────────────────────────────────────

export type SavIssueType =
  | 'hinge_problem'
  | 'drawer_problem'
  | 'door_alignment'
  | 'damaged_panel'
  | 'installation_correction'
  | 'other';

export type SavPriority = 'low' | 'normal' | 'urgent';

export type SavTicketStatus = 'open' | 'planned' | 'in_progress' | 'resolved' | 'closed';

export type SavWarrantyStatus = 'under_warranty' | 'expired' | 'unknown';

export type SavInterventionStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export type SavPhotoType = 'issue' | 'before' | 'after' | 'evidence';

export interface SavTicket {
  id: string;
  ticket_number: string | null;
  project_id: string;
  issue_type: SavIssueType;
  issue_description: string;
  priority: SavPriority;
  status: SavTicketStatus;
  assigned_to: string | null;
  warranty_status: SavWarrantyStatus;
  warranty_expiry_date: string | null;
  resolution_report: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  project?: {
    id: string;
    reference_code: string;
    client_name: string;
    client_phone: string | null;
    client_email: string | null;
    client_address: string | null;
    actual_delivery_date: string | null;
    status: string;
  };
  assigned_profile?: { id: string; full_name: string } | null;
  created_profile?: { id: string; full_name: string } | null;
  sav_photos?: SavPhoto[];
  sav_interventions?: SavIntervention[];
}

export interface SavIntervention {
  id: string;
  ticket_id: string;
  technician_id: string | null;
  planned_date: string;
  planned_time: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: SavInterventionStatus;
  work_description: string | null;
  parts_used: string | null;
  notes: string | null;
  travel_cost: number;
  parts_cost: number;
  labor_cost: number;
  created_at: string;
  updated_at: string;
  // Joined
  technician?: { id: string; full_name: string } | null;
}

export interface SavPhoto {
  id: string;
  ticket_id: string;
  intervention_id: string | null;
  photo_url: string;
  photo_type: SavPhotoType;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface SavDashboardStats {
  open_tickets: number;
  urgent_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  avg_resolution_hours: number | null;
}
