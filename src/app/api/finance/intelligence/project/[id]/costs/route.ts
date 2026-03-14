/**
 * Financial Intelligence Layer — Project Cost Entry API
 *
 * POST /api/finance/intelligence/project/[id]/costs
 *   Adds a manual cost entry to a project.
 *   Auto-audited via DB trigger on project_costs.
 *
 * DELETE /api/finance/intelligence/project/[id]/costs?costId=uuid
 *   CEO only. Removes a cost entry (rare, fully audited).
 *
 * Allowed roles for POST: CEO, workshop_manager
 * Allowed roles for DELETE: CEO only
 */

import { NextResponse }     from 'next/server';
import { guard }            from '@/lib/security/guardian';
import { isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';
import { addProjectCost }   from '@/lib/finance/intelligence/calculator';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await guard(['ceo', 'workshop_manager']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;

  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const costType    = String(body?.cost_type ?? '');
  const description = sanitizeString(String(body?.description ?? ''), 500);
  const amount      = sanitizeNumber(body?.amount, { min: 0, max: 10_000_000 });
  const quantity    = sanitizeNumber(body?.quantity, { min: 0, max: 999999 }) ?? 1;
  const unitPrice   = body?.unit_price != null ? sanitizeNumber(body.unit_price, { min: 0, max: 10_000_000 }) : null;
  const supplierId  = body?.supplier_id ? sanitizeString(String(body.supplier_id), 36) : null;
  const stockItemId = body?.stock_item_id ? sanitizeString(String(body.stock_item_id), 36) : null;

  // Validate required fields
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (amount === null || amount === undefined) {
    return NextResponse.json({ error: 'amount is required' }, { status: 400 });
  }

  // Validate FK references if provided
  if (supplierId && !isValidUUID(supplierId)) {
    return NextResponse.json({ error: 'Invalid supplier_id' }, { status: 400 });
  }
  if (stockItemId && !isValidUUID(stockItemId)) {
    return NextResponse.json({ error: 'Invalid stock_item_id' }, { status: 400 });
  }

  // Verify project exists
  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id, client_name, status')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Cannot add costs to a cancelled project' },
      { status: 422 },
    );
  }

  const result = await addProjectCost(ctx.supabase, ctx.userId, {
    projectId,
    costType:    costType as 'material' | 'labor' | 'transport' | 'installation' | 'subcontract' | 'overhead' | 'other',
    description,
    amount,
    quantity:    quantity ?? 1,
    unitPrice:   unitPrice ?? undefined,
    supplierId,
    stockItemId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Failed to add cost', message: result.error },
      { status: 422 },
    );
  }

  await ctx.audit({
    action:      'financial_edit',
    entity_type: 'project_cost',
    entity_id:   projectId,
    new_value:   { cost_type: costType, amount, description },
    notes:       `Cost added to project "${project.client_name}": ${costType} — ${amount} MAD`,
  });

  return NextResponse.json({ ok: true, cost: result.data }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // CEO only for deletion
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const costId = searchParams.get('costId');

  if (!isValidUUID(projectId) || !costId || !isValidUUID(costId)) {
    return NextResponse.json(
      { error: 'Invalid project ID or costId parameter' },
      { status: 400 },
    );
  }

  // Verify the cost belongs to this project
  const { data: cost } = await ctx.supabase
    .from('project_costs')
    .select('id, cost_type, amount')
    .eq('id', costId)
    .eq('project_id', projectId)
    .single();

  if (!cost) {
    return NextResponse.json(
      { error: 'Cost entry not found for this project' },
      { status: 404 },
    );
  }

  const { error } = await ctx.supabase
    .from('project_costs')
    .delete()
    .eq('id', costId);

  if (error) {
    return NextResponse.json(
      { error: 'Delete failed', message: error.message },
      { status: 500 },
    );
  }

  await ctx.audit({
    action:      'delete',
    entity_type: 'project_cost',
    entity_id:   costId,
    old_value:   { cost_type: cost.cost_type, amount: cost.amount },
    notes:       `Cost entry deleted from project ${projectId}: ${cost.cost_type} — ${cost.amount} MAD`,
  });

  return NextResponse.json({ ok: true });
}
