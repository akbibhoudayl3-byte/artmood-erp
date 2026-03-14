/**
 * Security Guardian Layer — Central Entry Point
 *
 * This module is the single entry point for all protected API routes.
 * It wraps the existing requireRole() + writeAuditLog() primitives and
 * returns an enriched GuardContext that routes use for all security operations.
 *
 * USAGE:
 *   import { guard } from '@/lib/security';
 *
 *   export async function GET(req: NextRequest) {
 *     const ctx = await guard(['ceo', 'commercial_manager']);
 *     if (ctx instanceof NextResponse) return ctx;
 *     // ctx.userId, ctx.role, ctx.supabase, ctx.audit() available
 *   }
 *
 * DESIGN PRINCIPLES:
 *   - Does NOT duplicate requireRole() logic — calls it internally
 *   - Safe default = DENY (returns NextResponse on any failure)
 *   - audit() is pre-bound and silent — never throws
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/auth/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/security/audit';
import type { AuditPayload, AuditAction } from '@/lib/security/audit';
import type { UserRole } from '@/types/database';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GuardContext {
  /** Authenticated user's UUID */
  userId: string;
  /** User's current role */
  role: UserRole;
  /** Profile ID (same as userId in Supabase, kept for explicitness) */
  profileId: string;
  /** Pre-built Supabase client — reuse in route, don't build another */
  supabase: SupabaseClient;
  /**
   * Pre-bound audit logger. User ID is already filled in.
   * Silent — never throws, never blocks the primary operation.
   *
   * @example
   * await ctx.audit({
   *   action: 'financial_edit',
   *   entity_type: 'payment',
   *   entity_id: paymentId,
   *   new_value: { amount, payment_type },
   *   notes: 'Payment created',
   * });
   */
  audit: (payload: Omit<AuditPayload, 'user_id'>) => Promise<void>;
}

// ── Main Guard Function ───────────────────────────────────────────────────────

/**
 * Security Guardian — primary entry point for all protected API routes.
 *
 * Combines authentication + RBAC + audit context in one call.
 * Returns GuardContext on success, NextResponse (error) on failure.
 *
 * The safe default is DENY — any unexpected error returns 500.
 */
export async function guard(
  allowedRoles: UserRole[]
): Promise<GuardContext | NextResponse> {
  try {
    // ── Auth + RBAC: delegate entirely to requireRole() ───────────────────
    const authResult = await requireRole(allowedRoles);
    if (authResult instanceof NextResponse) return authResult;

    const { userId, role, profileId } = authResult;

    // ── Supabase client: built once, shared across the route ─────────────
    // Using createServerSupabase() avoids duplicating cookie setup boilerplate.
    const supabase = await createServerSupabase() as unknown as SupabaseClient;

    // ── Audit: pre-bound with user_id so routes write less boilerplate ────
    const audit = async (payload: Omit<AuditPayload, 'user_id'>): Promise<void> => {
      try {
        await writeAuditLog({ ...payload, user_id: userId });
      } catch {
        // Silent — audit failure must never break the primary operation
        console.error('[SecurityGuardian] audit() failed silently for user', userId);
      }
    };

    return { userId, role, profileId, supabase, audit };
  } catch (error) {
    // Safe default: DENY on unexpected errors
    console.error('[SecurityGuardian] Unexpected error in guard():', error);
    return NextResponse.json(
      { error: 'Internal security error', message: 'Access denied' },
      { status: 500 }
    );
  }
}

// ── Convenience re-export of AuditAction for routes that import from guardian ─
export type { AuditAction };
