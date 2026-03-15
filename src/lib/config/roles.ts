import type { UserRole } from '@/types/database';

// ============================================================
// Role Display Names & Colors
// ============================================================
export const ROLE_LABELS: Record<UserRole, string> = {
  // Original roles
  ceo:               'CEO / Admin',
  commercial_manager:'Commercial Manager',
  designer:          'Interior Designer',
  workshop_manager:  'Workshop Manager',
  workshop_worker:   'Workshop Worker',
  installer:         'Installation Team',
  hr_manager:        'HR Manager',
  community_manager: 'Community Manager',
  // New roles
  owner_admin:        'Owner / Admin',
  operations_manager: 'Operations Manager',
  logistics:          'Logistics',
  worker:             'Workshop Worker',
};
