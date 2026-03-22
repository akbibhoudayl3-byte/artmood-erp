
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
  '/settings/cost-engine':         ['ceo', 'commercial_manager'],
  '/settings/recurring-expenses': ['ceo', 'commercial_manager'],
  '/settings/social-media':     ['ceo', 'community_manager'],
  '/settings':                  ['ceo', 'commercial_manager', 'workshop_manager', 'hr_manager'],

  // Kitchen Configurator
  '/kitchen/modules':    ['ceo', 'commercial_manager', 'designer', 'workshop_manager'],
  '/kitchen/presets':    ['ceo', 'commercial_manager', 'designer'],
  '/kitchen':            ['ceo', 'commercial_manager', 'designer', 'workshop_manager'],

  // CRM
  '/leads':              ['ceo', 'commercial_manager', 'community_manager'],
  '/quotes':             ['ceo', 'commercial_manager', 'designer'],
  '/surveys':            ['ceo', 'commercial_manager'],

  // Projects — many roles can view
  '/projects':           ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'installer'],

  // Cutting / CNC
  '/cutting':            ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],

  // SAW Cutting
  '/saw':                ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],

  // Factory
  '/production/tasks':   ['ceo', 'workshop_manager', 'workshop_worker', 'worker'],
  '/production/my-tasks':['ceo', 'workshop_manager', 'workshop_worker', 'worker'],
  '/production/stations':['ceo', 'workshop_manager'],
  '/production':         ['ceo', 'workshop_manager', 'workshop_worker', 'worker'],
  '/installation':       ['ceo', 'workshop_manager', 'installer'],
  '/documents':          ['ceo', 'workshop_manager', 'commercial_manager', 'designer'],

  // Inventory
  '/stock':              ['ceo', 'workshop_manager'],
  '/suppliers':          ['ceo', 'workshop_manager'],
  '/purchase-orders':    ['ceo', 'workshop_manager'],

  // SAV
  '/sav':                ['ceo', 'commercial_manager', 'installer', 'workshop_manager', 'operations_manager', 'owner_admin'],

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
  // Admin — CEO only
  '/api/admin':                        ['ceo'],
  '/api/guardian':                     ['ceo'],

  // Audit log — CEO + HR
  '/api/audit':                        ['ceo', 'hr_manager', 'workshop_manager', 'commercial_manager', 'designer', 'installer', 'workshop_worker', 'community_manager'],

  // Auth callback — public (handled separately, but listed for completeness)
  '/api/auth':                         ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'],

  // AI context — CEO + managers
  '/api/ai':                           ['ceo', 'commercial_manager', 'workshop_manager'],

  // Finance intelligence — CEO only
  '/api/finance/intelligence':         ['ceo'],

  // Integrity engine — CEO + workshop
  '/api/integrity':                    ['ceo', 'workshop_manager'],

  // Intelligence (factory brain) — CEO + managers
  '/api/intelligence':                 ['ceo', 'commercial_manager', 'workshop_manager'],

  // Installation geo-gate — installers + managers
  '/api/installation':                 ['ceo', 'workshop_manager', 'installer'],

  // Leads API
  '/api/leads':                        ['ceo', 'commercial_manager', 'community_manager'],

  // Print routes
  '/api/print/delivery-note':          ['ceo', 'commercial_manager'],
  '/api/print/production-order':       ['ceo', 'workshop_manager', 'commercial_manager'],
  '/api/print/saw-instructions':       ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
  '/api/print/saw-labels':             ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],

  // Export routes
  '/api/export/panels-csv':            ['ceo', 'workshop_manager'],
  '/api/export':                       ['ceo', 'commercial_manager', 'workshop_manager'],

  // Production orders
  '/api/production-orders':            ['ceo', 'workshop_manager'],

  // Projects
  '/api/projects':                     ['ceo', 'commercial_manager', 'workshop_manager', 'designer'],

  // Quotes PDF
  '/api/quotes':                       ['ceo', 'commercial_manager', 'designer'],
  '/api/quote-pdf':                    ['ceo', 'commercial_manager', 'designer'],

  // Social media
  '/api/social':                       ['ceo', 'community_manager'],

  // File upload — most roles
  '/api/upload':                       ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'installer'],

  // Work time — all employees (everyone clocks in/out)
  '/api/work-time':                    ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'],

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

  // DENY by default — if no rule matches, block access
  if (!match) return false;
  return match[1].includes(role);
}
