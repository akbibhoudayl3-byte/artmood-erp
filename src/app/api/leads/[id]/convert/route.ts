/**
 * Data Integrity Engine — Lead → Project Conversion Endpoint
 *
 * POST /api/leads/[id]/convert
 *
 * Converts a WON lead into a project using an ATOMIC database transaction (RPC).
 * The RPC function `convert_lead_to_project` wraps everything in a single transaction:
 *   1. Validates lead status = "won" and not already converted
 *   2. Generates auto-reference ART-YYYY-XXXX
 *   3. Creates the project (status = "measurements_confirmed")
 *   4. Locks the lead (project_id + converted_at)
 *   5. If anything fails → full rollback
 *
 * RULES:
 *   - ONLY "won" leads can be converted
 *   - Double conversion is blocked (project_id already set)
 *   - Lead becomes READ-ONLY after conversion
 *   - Audit log: "lead_converted_to_project"
 */

import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await guard(['ceo', 'commercial_manager', 'operations_manager', 'owner_admin']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: leadId } = await params;

  if (!isValidUUID(leadId)) {
    return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
  }

  let body: {
    client_name?: string;
    client_phone?: string;
    client_email?: string;
    client_city?: string;
    budget?: number | string;
    notes?: string;
    project_type?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clientName = sanitizeString(body.client_name ?? '', 200);
  const clientPhone = sanitizeString(body.client_phone ?? '', 30);

  if (!clientName || !clientPhone) {
    return NextResponse.json(
      { error: 'Le nom et le téléphone client sont obligatoires' },
      { status: 400 },
    );
  }

  // ── ATOMIC CONVERSION via Supabase RPC ────────────────────────────────────
  // The RPC function `convert_lead_to_project` wraps everything in ONE transaction:
  //   - Validates lead status + not already converted (with row lock)
  //   - Generates ART-YYYY-XXXX reference
  //   - Creates project
  //   - Locks lead (project_id + converted_at)
  //   - Rolls back everything on any failure

  const { data: rpcResult, error: rpcError } = await ctx.supabase.rpc(
    'convert_lead_to_project',
    {
      p_lead_id: leadId,
      p_client_name: clientName,
      p_client_phone: clientPhone,
      p_client_email: sanitizeString(body.client_email ?? '', 200) || null,
      p_client_city: sanitizeString(body.client_city ?? '', 100) || null,
      p_budget: sanitizeNumber(body.budget, { min: 0 }) || 0,
      p_notes: sanitizeString(body.notes ?? '', 2000) || null,
      p_created_by: ctx.userId,
      p_project_type: body.project_type || 'kitchen',
    },
  );

  if (rpcError) {
    return NextResponse.json(
      { error: 'Conversion failed', message: rpcError.message },
      { status: 500 },
    );
  }

  // RPC returns JSONB with { ok, error?, project_id?, ... }
  if (!rpcResult?.ok) {
    const statusCode = rpcResult?.error?.includes('déjà été converti') ? 409
      : rpcResult?.error?.includes('statut') ? 422
      : 400;
    return NextResponse.json(
      {
        error: rpcResult?.error || 'Conversion failed',
        current_status: rpcResult?.current_status,
        project_id: rpcResult?.project_id,
      },
      { status: statusCode },
    );
  }

  // ── Fetch created project for response ──────────────────────────────────
  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id, reference_code, client_name, status, lead_id')
    .eq('id', rpcResult.project_id)
    .single();

  // ── Log activity on lead ────────────────────────────────────────────────
  await ctx.supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: ctx.userId,
    activity_type: 'conversion',
    description: `Lead converti en projet ${rpcResult.project_reference}. Le lead est désormais verrouillé.`,
  });

  // ── Audit log: dedicated action ─────────────────────────────────────────
  await ctx.audit({
    action: 'lead_converted_to_project',
    entity_type: 'lead',
    entity_id: leadId,
    old_value: { status: 'won' },
    new_value: {
      project_id: rpcResult.project_id,
      project_reference: rpcResult.project_reference,
      converted_at: rpcResult.converted_at,
    },
    notes: `Lead converted to project ${rpcResult.project_reference}. Atomic transaction. Lead is now locked/read-only.`,
  });

  return NextResponse.json(
    {
      ok: true,
      lead_id: leadId,
      project: project || { id: rpcResult.project_id, reference_code: rpcResult.project_reference },
      converted_at: rpcResult.converted_at,
      message: `Lead converti en projet ${rpcResult.project_reference}. Le lead est verrouillé.`,
    },
    { status: 201 },
  );
}
