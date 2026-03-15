// ============================================================
// ArtMood Factory OS — Common / Shared Types
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
  extracted_data: Record<string, unknown>;
  tags: string[];
  status: ScanStatus;
  created_at: string;
  updated_at: string;
  // Joined
  project?: { name: string };
  sheet?: { sheet_number: string };
  uploader?: { full_name: string };
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

// Health status derived from BusinessHealth
export type HealthStatus = 'green' | 'yellow' | 'red';
