// ============================================================
// ArtMood Factory OS — HR Types
// ============================================================

import type { Profile, UserRole } from './common';

export type LeaveType = 'vacation' | 'sick' | 'personal' | 'maternity' | 'unpaid' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

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
// Pointage (Attendance) Constants
// ============================================================

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
