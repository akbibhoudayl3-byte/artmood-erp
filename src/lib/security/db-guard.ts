/**
 * Security Guardian Layer — Safe Database Operations
 *
 * Wrappers around Supabase insert/update that add:
 *   - Duplicate detection (uniqueCheck before insert)
 *   - Foreign key validation (fkCheck before insert)
 *   - Automatic before/after audit logging
 *
 * USAGE — Insert:
 *   import { safeInsert } from '@/lib/security';
 *
 *   const result = await safeInsert({
 *     supabase: ctx.supabase,
 *     userId: ctx.userId,
 *     table: 'payments',
 *     data: { project_id, amount, payment_type },
 *     fkCheck: [{ table: 'projects', column: 'id', value: project_id }],
 *     auditAction: 'financial_edit',
 *     auditEntityType: 'payment',
 *   });
 *   if (!result.ok) return result.response;
 *   // result.data = inserted row
 *
 * USAGE — Update:
 *   const result = await safeUpdate({
 *     supabase: ctx.supabase,
 *     userId: ctx.userId,
 *     table: 'projects',
 *     data: { status: 'completed' },
 *     where: { column: 'id', value: projectId },
 *     auditSelectColumns: 'id, status',
 *     auditAction: 'status_change',
 *     auditEntityType: 'project',
 *   });
 *   if (!result.ok) return result.response;
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeAuditLog } from '@/lib/security/audit';
import type { AuditAction } from '@/lib/security/audit';

// ── Types ────────────────────────────────────────────────────────────────────

export type DbGuardResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export interface UniqueCheck {
  /** Column name to check for uniqueness */
  column: string;
  /** Value that must not already exist in that column */
  value: unknown;
}

export interface FkCheck {
  /** Table containing the referenced row */
  table: string;
  /** Column to match against */
  column: string;
  /** Value that must exist in that column */
  value: unknown;
}

// ── safeInsert ────────────────────────────────────────────────────────────────

/**
 * Safe insert with optional duplicate + FK checks and automatic audit logging.
 *
 * Checks are run in order:
 *   1. uniqueCheck — abort if any matching row already exists
 *   2. fkCheck — abort if referenced row does not exist
 *   3. INSERT
 *   4. Audit log (silent on failure)
 */
export async function safeInsert<T = Record<string, unknown>>(opts: {
  supabase: SupabaseClient;
  userId: string;
  table: string;
  data: Record<string, unknown>;
  /** If provided, rejects if a row matching ALL of these column=value pairs already exists */
  uniqueCheck?: UniqueCheck[];
  /** If provided, verifies that each referenced row exists before inserting */
  fkCheck?: FkCheck[];
  auditAction?: AuditAction;
  auditEntityType?: string;
}): Promise<DbGuardResult<T>> {
  const {
    supabase, userId, table, data,
    uniqueCheck, fkCheck,
    auditAction = 'create',
    auditEntityType,
  } = opts;

  // ── 1. Duplicate check ────────────────────────────────────────────────
  if (uniqueCheck?.length) {
    // Build a query that checks ALL conditions simultaneously (AND semantics)
    let query = supabase.from(table).select('id');
    for (const c of uniqueCheck) {
      if (c.value != null) {
        query = query.eq(c.column, c.value as string);
      }
    }
    const { data: existing, error: checkErr } = await query.maybeSingle();

    if (checkErr) {
      console.error('[safeInsert] uniqueCheck failed:', checkErr.message);
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Database error during duplicate check' },
          { status: 500 }
        ),
      };
    }

    if (existing) {
      const fields = uniqueCheck.map(c => c.column).join(', ');
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'Duplicate entry',
            message: `A record with the same ${fields} already exists`,
          },
          { status: 409 }
        ),
      };
    }
  }

  // ── 2. Foreign key validation ─────────────────────────────────────────
  if (fkCheck?.length) {
    for (const fk of fkCheck) {
      if (fk.value == null) continue; // nullable FK — skip

      const { data: refRow, error: fkErr } = await supabase
        .from(fk.table)
        .select('id')
        .eq(fk.column, fk.value as string)
        .maybeSingle();

      if (fkErr) {
        console.error('[safeInsert] fkCheck failed:', fkErr.message);
        return {
          ok: false,
          response: NextResponse.json(
            { error: 'Database error during reference check' },
            { status: 500 }
          ),
        };
      }

      if (!refRow) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: 'Invalid reference',
              message: `Referenced ${fk.table} (${fk.column} = "${fk.value}") does not exist`,
            },
            { status: 422 }
          ),
        };
      }
    }
  }

  // ── 3. Perform the insert ─────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from(table)
    .insert(data)
    .select()
    .single();

  if (insertErr || !inserted) {
    console.error('[safeInsert] Insert failed:', insertErr?.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Insert failed', message: insertErr?.message ?? 'Unknown database error' },
        { status: 500 }
      ),
    };
  }

  // ── 4. Audit log (silent) ─────────────────────────────────────────────
  try {
    await writeAuditLog({
      user_id: userId,
      action: auditAction,
      entity_type: auditEntityType ?? table,
      entity_id: (inserted as Record<string, unknown>).id as string | undefined,
      new_value: data,
    });
  } catch { /* silent */ }

  return { ok: true, data: inserted as T };
}

// ── safeUpdate ────────────────────────────────────────────────────────────────

/**
 * Safe update that fetches the old value for audit diff, then updates.
 * Logs old_value / new_value automatically.
 */
export async function safeUpdate<T = Record<string, unknown>>(opts: {
  supabase: SupabaseClient;
  userId: string;
  table: string;
  data: Record<string, unknown>;
  /** WHERE clause: a single column=value condition */
  where: { column: string; value: unknown };
  /** Columns to SELECT for the before-snapshot (used in audit diff) */
  auditSelectColumns?: string;
  auditAction?: AuditAction;
  auditEntityType?: string;
}): Promise<DbGuardResult<T>> {
  const {
    supabase, userId, table, data, where,
    auditSelectColumns,
    auditAction = 'update',
    auditEntityType,
  } = opts;

  // ── 1. Fetch old value for audit diff ─────────────────────────────────
  let oldValue: Record<string, unknown> | undefined;
  if (auditSelectColumns) {
    const { data: old } = await supabase
      .from(table)
      .select(auditSelectColumns)
      .eq(where.column, where.value as string)
      .maybeSingle();
    if (old) oldValue = old as unknown as Record<string, unknown>;
  }

  // ── 2. Perform the update ─────────────────────────────────────────────
  const { data: updated, error: updateErr } = await supabase
    .from(table)
    .update(data)
    .eq(where.column, where.value as string)
    .select()
    .single();

  if (updateErr || !updated) {
    console.error('[safeUpdate] Update failed:', updateErr?.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Update failed', message: updateErr?.message ?? 'Unknown database error' },
        { status: 500 }
      ),
    };
  }

  // ── 3. Audit log (silent) ─────────────────────────────────────────────
  try {
    await writeAuditLog({
      user_id: userId,
      action: auditAction,
      entity_type: auditEntityType ?? table,
      entity_id: (updated as Record<string, unknown>).id as string | undefined,
      old_value: oldValue,
      new_value: data,
    });
  } catch { /* silent */ }

  return { ok: true, data: updated as T };
}
