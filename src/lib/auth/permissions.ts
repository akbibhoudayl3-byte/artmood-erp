
import type { UserRole } from '@/types/database';

/**
 * Route-level RBAC map.
 * Key = URL prefix. Value = roles that may access.
 * Checked in middleware (server-side, NOT client-side only).
 * More specific paths must come BEFORE generic ones.
 * CEO always has access and is handled separately.
 */
export const ROUTE_ROLES: Record<string, UserRole[]> = {
  // Finance — strictly restricted
  '/finance':            ['ceo', 'commercial_manager'],

  // HR — strictly restricted
  '/hr':                 ['ceo', 'hr_manager'],

  // Settings — tiered access
  '/settings/users':            ['ceo'],
  '/settings/audit-log':        ['ceo'],
  '/settings/recurring-expenses': ['ceo', 'commercial_manager'],
  '/settings/social-media':     ['ceo', 'community_manager'],
  '/settings':                  ['ceo', 'commercial_manager', 'workshop_manager', 'hr_manager'],

  // CRM
  '/leads':              ['ceo', 'commercial_manager', 'community_manager'],
  '/quotes':             ['ceo', 'commercial_manager', 'designer'],
  '/surveys':            ['ceo', 'commercial_manager'],

  // Projects — many roles can view
  '/projects':           ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'installer'],

  // Factory
  '/production':         ['ceo', 'workshop_manager', 'workshop_worker'],
  '/installation':       ['ceo', 'workshop_manager', 'installer'],
  '/documents':          ['ceo', 'workshop_manager', 'commercial_manager', 'designer'],

  // Inventory
  '/stock':              ['ceo', 'workshop_manager'],
  '/suppliers':          ['ceo', 'workshop_manager'],
  '/purchase-orders':    ['ceo', 'workshop_manager'],

  // Marketing
  '/marketing':          ['ceo', 'community_manager'],

  // Calendar — most roles
  '/calendar':           ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'hr_manager', 'installer'],

  // Dashboard — everyone
  '/dashboard':          ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'],

  // Offline fallback page — everyone
  '/offline':            ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'],
};

/**
 * API route RBAC map.
 * Key = API path prefix. Value = allowed roles.
 */
export const API_ROLES: Record<string, UserRole[]> = {
  '/api/guardian':             ['ceo'],  // Security Guardian dashboard — CEO only
  '/api/integrity':            ['ceo', 'workshop_manager'],  // Data Integrity Engine
  '/api/finance/intelligence': ['ceo'],                         // Financial Intelligence Layer
  '/api/admin':              ['ceo'],
  '/api/print/delivery-note': ['ceo', 'commercial_manager'],
  '/api/print/production-order': ['ceo', 'workshop_manager', 'commercial_manager'],
  '/api/export/panels-csv':  ['ceo', 'workshop_manager'],
  '/api/projects/validate-production': ['ceo', 'workshop_manager'],
  '/api/quote-pdf':          ['ceo', 'commercial_manager', 'designer'],
  '/api/social':             ['ceo', 'community_manager'],
  '/api/leads':              ['ceo', 'commercial_manager', 'community_manager'],
  '/api/upload':             ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'installer'],
  '/api/export':             ['ceo', 'commercial_manager', 'workshop_manager'],
};

/**
 * Check if a role has access to a route.
 * CEO always has access.
 */
export function canAccess(role: UserRole, pathname: string): boolean {
  if (role === 'ceo') return true;

  // Find the most specific matching rule
  const match = Object.entries(ROUTE_ROLES)
    .filter(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0];

  if (!match) return true; // No rule = allow (auth already required by middleware)
  return match[1].includes(role);
}

/**
 * Check if a role has access to an API route.
 */
export function canAccessApi(role: UserRole, pathname: string): boolean {
  if (role === 'ceo') return true;

  const match = Object.entries(API_ROLES)
    .filter(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0];

  if (!match) return true;
  return match[1].includes(role);
}
