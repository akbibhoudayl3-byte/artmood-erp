import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { findStockItem } from '@/lib/utils/stock-match';
import { writeAuditLog } from '@/lib/security/audit';

/**
 * POST /api/bom/generate-production — Generate production order + parts from BOM.
 *
 * Reads:
 *   - project_parts (individual pieces from BOM)
 *   - project_material_requirements_bom (aggregated material data)
 *
 * Creates:
 *   - production_order
 *   - production_parts (one per project_part)
 *   - production_material_requirements (one per material type, with stock reservation)
 *
 * Body: { project_id }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id } = body;
  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // 1. Verify project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, reference_code, client_name')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // 2. Read project_parts (BOM = source of truth)
  const { data: parts, error: partsErr } = await supabase
    .from('project_parts')
    .select('*')
    .eq('project_id', project_id);

  if (partsErr || !parts || parts.length === 0) {
    return NextResponse.json(
      { error: 'No BOM parts found. Generate BOM from Modules tab first.' },
      { status: 400 },
    );
  }

  // 3. Read BOM material requirements
  const { data: bomMaterials } = await supabase
    .from('project_material_requirements_bom')
    .select('*')
    .eq('project_id', project_id);

  // 4. Read stock items for matching
  const { data: stockItems } = await supabase
    .from('stock_items')
    .select('id, name, material_type, unit, current_quantity, reserved_quantity, cost_per_unit, category')
    .eq('is_active', true)
    .eq('stock_tracking', true);

  // ── Create production order ─────────────────────────────────────────────
  const orderName = `Production ${project.reference_code} — ${parts.length} pièces`;

  const { data: order, error: orderErr } = await supabase
    .from('production_orders')
    .insert({
      project_id,
      name: orderName,
      notes: `Généré automatiquement depuis BOM. ${parts.length} pièces, ${bomMaterials?.length || 0} matériaux.`,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: 'Failed to create production order', detail: orderErr?.message },
      { status: 500 },
    );
  }

  // ── Create production_parts from project_parts (BOM snapshot) ───────────
  const prodParts = parts.map((p: any, idx: number) => ({
    production_order_id: order.id,
    part_name: p.part_name || p.part_code || `Pièce ${idx + 1}`,
    part_code: p.part_code || `P-${String(idx + 1).padStart(3, '0')}`,
    current_station: 'cutting',
    notes: `${p.material_type} | ${p.width_mm}x${p.height_mm}mm | Qté: ${p.quantity}`,
  }));

  // Batch insert (max 500 per batch)
  for (let i = 0; i < prodParts.length; i += 500) {
    const batch = prodParts.slice(i, i + 500);
    const { error: batchErr } = await supabase.from('production_parts').insert(batch);
    if (batchErr) {
      return NextResponse.json(
        { error: 'Failed to create production parts', detail: batchErr.message },
        { status: 500 },
      );
    }
  }

  // ── Create material requirements from BOM (with stock reservation) ──────
  const PANEL_SIZES: Record<string, [number, number]> = {
    mdf_18: [1220, 2800], mdf_16: [1220, 2800], mdf_12: [1220, 2800],
    stratifie_18: [1830, 2550], stratifie_16: [1830, 2550],
    back_hdf_5: [1220, 2440], back_mdf_8: [1220, 2440],
  };

  // Group parts by material to compute sheets needed
  const matGroups: Record<string, { area_mm2: number; count: number }> = {};
  for (const p of parts) {
    const key = (p as any).material_type || 'other';
    if (!matGroups[key]) matGroups[key] = { area_mm2: 0, count: 0 };
    matGroups[key].area_mm2 += ((p as any).width_mm * (p as any).height_mm * ((p as any).quantity || 1));
    matGroups[key].count += ((p as any).quantity || 1);
  }

  let requirementsCreated = 0;

  for (const [matType, group] of Object.entries(matGroups)) {
    const [panelW, panelH] = PANEL_SIZES[matType] || [1220, 2800];
    const panelAreaMm2 = panelW * panelH;
    const areaM2 = group.area_mm2 / 1e6;
    const sheetsNeeded = Math.ceil((group.area_mm2 / panelAreaMm2) * 1.15);

    // Find matching stock item (exact material_type, fallback to name)
    const match = findStockItem((stockItems || []) as any[], matType);

    if (match) {
      // Reserve stock
      await supabase
        .from('stock_items')
        .update({ reserved_quantity: (match as any).reserved_quantity + sheetsNeeded })
        .eq('id', (match as any).id);

      // Audit trail
      await supabase.from('stock_movements').insert({
        stock_item_id: (match as any).id,
        movement_type: 'reserve',
        quantity: 0,
        reference_type: 'production_order',
        reference_id: order.id,
        project_id,
        notes: `BOM auto: ${matType} — ${group.count} pièces (${areaM2.toFixed(2)} m²)`,
        created_by: auth.userId,
      });

      // Create requirement
      await supabase.from('production_material_requirements').insert({
        production_order_id: order.id,
        material_id: (match as any).id,
        planned_qty: sheetsNeeded,
        unit: 'panel',
        status: 'reserved',
        notes: `BOM auto: ${matType} — ${group.count} pièces (${areaM2.toFixed(2)} m²)`,
      });

      requirementsCreated++;
    }
  }

  await writeAuditLog({
    action: 'create',
    entity_type: 'production_order',
    entity_id: order.id,
    user_id: auth.userId,
    notes: `Production order generated from BOM for project ${project.reference_code} — ${prodParts.length} parts`,
  });

  return NextResponse.json({
    order,
    summary: {
      parts_created: prodParts.length,
      materials: Object.keys(matGroups).length,
      requirements_created: requirementsCreated,
    },
  }, { status: 201 });
}
