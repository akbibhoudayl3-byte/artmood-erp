// ============================================================
// ArtMood Factory OS — Installation Types
// ============================================================

import type { Profile } from './common';
import type { Project } from './crm';

export type InstallationStatus = 'scheduled' | 'in_progress' | 'completed' | 'issue_reported' | 'rescheduled';

export type InstallationPhotoType = 'before' | 'during' | 'after' | 'issue';

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

export interface InstallationPhoto {
  id: string;
  installation_id: string;
  photo_url: string;
  photo_type: InstallationPhotoType;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ============================================================
// Geolocation / Installation Location Logging
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
