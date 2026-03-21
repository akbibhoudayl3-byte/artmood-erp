import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type AuditAction =
  | "create" | "update" | "delete" | "view_sensitive"
  | "financial_edit" | "status_change" | "login" | "logout"
  | "export" | "print" | "upload" | "user_management"
  | "stock_change" | "production_change" | "setting_change"
  | "consume" | "refund" | "lead_transition" | "station_transition"
  | "installation_complete" | "project_lock" | "workflow_violation";

export interface AuditPayload {
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  notes?: string;
  user_id: string;
}

/**
 * Write an audit log entry. Maps to existing audit_log schema.
 * Silent — never throws.
 */
export async function writeAuditLog(payload: AuditPayload): Promise<void> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
    );

    await supabase.from("audit_log").insert({
      user_id: payload.user_id,
      action: payload.action,
      // Map to existing columns
      table_name: payload.entity_type,
      record_id: payload.entity_id ?? null,
      old_data: payload.old_value ?? null,
      new_data: payload.new_value ?? null,
      reason: payload.notes ?? null,
      // Also store in new columns for richer querying
      entity_type: payload.entity_type,
      entity_id: payload.entity_id ?? null,
      old_value: payload.old_value ?? null,
      new_value: payload.new_value ?? null,
      notes: payload.notes ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    console.error("[AuditLog] Failed to write audit entry");
  }
}

export async function clientAudit(payload: Omit<AuditPayload, "user_id">): Promise<void> {
  try {
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* silent */ }
}
