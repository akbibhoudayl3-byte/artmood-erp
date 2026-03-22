import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString } from '@/lib/auth/server';
import { findStockItem } from '@/lib/utils/stock-match';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected'],
};

/**
 * PATCH /api/quotes/[id]/status — Update quote status (draft→sent→accepted/rejected).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const newStatus = sanitizeString(body.status, 30);
  if (!newStatus || !['sent', 'accepted', 'rejected'].includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status. Must be: sent, accepted, or rejected' }, { status: 400 });
  }

  // ── Server-side Supabase ────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Fetch current quote
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select('id, status, project_id, total_amount, version')
    .eq('id', id)
    .single();

  if (fetchErr || !quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[quote.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${quote.status}' to '${newStatus}'` },
      { status: 400 },
    );
  }

  // Build update payload
  const updatePayload: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === 'sent') {
    updatePayload.sent_at = new Date().toISOString();
  }
  if (newStatus === 'accepted' || newStatus === 'rejected') {
    updatePayload.responded_at = new Date().toISOString();
  }

  // Update quote
  const { error: updateErr } = await supabase
    .from('quotes')
    .update(updatePayload)
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json(
      { error: 'Failed to update quote status', detail: updateErr.message },
      { status: 500 },
    );
  }

  // When accepted: sync total_amount + auto-create production order from BOM
  let productionOrderId: string | null = null;
  let productionWarning: string | null = null;

  if (newStatus === 'accepted' && quote.project_id && quote.total_amount != null) {
    // A. Sync total_amount to project
    const { error: projErr } = await supabase
      .from('projects')
      .update({
        total_amount: quote.total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quote.project_id);

    if (projErr) {
      return NextResponse.json(
        { status: newStatus, warning: 'Quote accepted but project total sync failed: ' + projErr.message },
        { status: 200 },
      );
    }

    // B. Auto-create production order from BOM (if BOM exists)
    const { data: bomParts } = await supabase
      .from('project_parts')
      .select('*')
      .eq('project_id', quote.project_id);

    if (bomParts && bomParts.length > 0) {
      // Get project info
      const { data: project } = await supabase
        .from('projects')
        .select('reference_code')
        .eq('id', quote.project_id)
        .single();

      const orderName = `Production ${project?.reference_code || ''} — ${bomParts.length} pièces`;

      // Create production order
      const { data: order, error: orderErr } = await supabase
        .from('production_orders')
        .insert({
          project_id: quote.project_id,
          name: orderName,
          notes: `Auto-créé à l'acceptation du devis v${quote.version || '?'}. ${bomParts.length} pièces.`,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!orderErr && order) {
        productionOrderId = order.id;

        // Create production_parts from BOM snapshot
        const prodParts = bomParts.map((p: any, idx: number) => ({
          production_order_id: order.id,
          part_name: p.part_name || p.part_code || `Pièce ${idx + 1}`,
          part_code: p.part_code || `P-${String(idx + 1).padStart(3, '0')}`,
          current_station: 'cutting',
          notes: `${p.material_type} | ${p.width_mm}x${p.height_mm}mm | Qté: ${p.quantity}`,
        }));

        for (let i = 0; i < prodParts.length; i += 500) {
          await supabase.from('production_parts').insert(prodParts.slice(i, i + 500));
        }

        // Create material requirements from BOM
        const PANEL_SIZES: Record<string, [number, number]> = {
          mdf_18: [1220, 2800], mdf_16: [1220, 2800], mdf_12: [1220, 2800],
          stratifie_18: [1830, 2550], stratifie_16: [1830, 2550],
          back_hdf_5: [1220, 2440], back_mdf_8: [1220, 2440],
        };

        const matGroups: Record<string, { area_mm2: number; count: number }> = {};
        for (const p of bomParts) {
          const key = (p as any).material_type || 'other';
          if (!matGroups[key]) matGroups[key] = { area_mm2: 0, count: 0 };
          matGroups[key].area_mm2 += ((p as any).width_mm * (p as any).height_mm * ((p as any).quantity || 1));
          matGroups[key].count += ((p as any).quantity || 1);
        }

        // Match materials to stock and create requirements
        const { data: stockItems } = await supabase
          .from('stock_items')
          .select('id, name, material_type, reserved_quantity')
          .eq('is_active', true)
          .eq('stock_tracking', true);

        for (const [matType, group] of Object.entries(matGroups)) {
          const [panelW, panelH] = PANEL_SIZES[matType] || [1220, 2800];
          const sheetsNeeded = Math.ceil((group.area_mm2 / (panelW * panelH)) * 1.15);
          const areaM2 = group.area_mm2 / 1e6;

          const match = findStockItem((stockItems || []) as any[], matType);

          if (match) {
            await supabase.from('stock_items')
              .update({ reserved_quantity: (match as any).reserved_quantity + sheetsNeeded })
              .eq('id', (match as any).id);

            await supabase.from('production_material_requirements').insert({
              production_order_id: order.id,
              material_id: (match as any).id,
              planned_qty: sheetsNeeded,
              unit: 'panel',
              status: 'reserved',
              notes: `BOM auto: ${matType} — ${group.count} pièces (${areaM2.toFixed(2)} m²)`,
            });
          }
        }
      } else {
        productionWarning = 'Quote accepted but production order creation failed: ' + (orderErr?.message || 'Unknown');
      }
    } else {
      productionWarning = 'Quote accepted but no BOM parts found — production order not created.';
    }
  }

  return NextResponse.json({
    status: newStatus,
    quote_id: id,
    production_order_id: productionOrderId,
    ...(productionWarning ? { warning: productionWarning } : {}),
  }, { status: 200 });
}
