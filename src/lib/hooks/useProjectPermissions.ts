'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import type { Project } from '@/types/crm';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ProjectPermissions {
  /** Can edit project details (client info, amount, priority, notes) */
  canEdit: boolean;
  /** Can change project status via the pipeline */
  canChangeStatus: boolean;
  /** Can view cost / profitability / P&L data */
  canViewCosts: boolean;
  /** Can view performance & health dashboards */
  canViewPerformance: boolean;
  /** Can manage production workflow (start/complete/block stages) */
  canManageProduction: boolean;
  /** Current user is a designer */
  isDesigner: boolean;
  /** Current user is a workshop role (manager or worker) */
  isWorkshop: boolean;
  /** Current user is the CEO */
  isCeo: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Derives the current user's permissions for a specific project.
 *
 * These checks are extracted from the repeated `profile?.role` guard patterns
 * found across project detail, costs, performance, and workflow pages.
 *
 * Usage:
 * ```ts
 * const perms = useProjectPermissions(project);
 * if (perms.canEdit) { ... }
 * ```
 */
export function useProjectPermissions(project: Project | null): ProjectPermissions {
  const { profile } = useAuth();

  return useMemo(() => {
    const role = profile?.role ?? '';

    const isCeo = role === 'ceo';
    const isDesigner = role === 'designer';
    const isCommercial = role === 'commercial_manager';
    const isWorkshopManager = role === 'workshop_manager';
    const isWorkshopWorker = role === 'workshop_worker';
    const isWorkshop = isWorkshopManager || isWorkshopWorker;

    // Mirrors the guards used in projects/[id]/page.tsx (edit button)
    const canEdit = isCeo || isCommercial;

    // Mirrors the status pipeline guard in projects/[id]/page.tsx
    const canChangeStatus = isCeo || isCommercial || isWorkshopManager;

    // Mirrors the canViewFinance check used in costs & performance pages
    const canViewCosts = isCeo || isCommercial;

    // Performance page uses the same RoleGuard as costs + designer + workshop_manager
    const canViewPerformance = isCeo || isCommercial || isDesigner || isWorkshopManager;

    // Workflow page: workshop_manager and workshop_worker can act
    const canManageProduction = isWorkshopManager || isWorkshopWorker;

    return {
      canEdit,
      canChangeStatus,
      canViewCosts,
      canViewPerformance,
      canManageProduction,
      isDesigner,
      isWorkshop,
      isCeo,
    };
  }, [profile?.role]);
}
