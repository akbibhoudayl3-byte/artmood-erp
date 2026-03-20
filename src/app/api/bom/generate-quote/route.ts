import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeNumber, sanitizeString } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

/**
 * POST /api/bom/generate-quote — Generate a quote deterministically from BOM.
 *
 * Reads:
 *   - project_material_requirements_bom (material costs, panels, edge banding)
 *   - project_hardware_requirements (hardware costs)
 *   - project_parts (piece count for verification)
 *
 * Generates:
 *   - quote with auto-computed lines (materials + hardware + labor)
 *   - quote_lines derived 100% from BOM data
 *
 * Body: { project_id, labor_cost?, transport_cost?, discount_percent?, valid_until?, notes? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer']);
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

  const laborCost = sanitizeNumber(body.labor_cost, { min: 0 }) ?? 0;
  const transportCost = sanitizeNumber(body.transport_cost, { min: 0 }) ?? 0;
  const discountPercent = sanitizeNumber(body.discount_percent, { min: 0, max: 100 }) ?? 0;
  const validUntil = sanitizeString(body.valid_until, 20);
  const notes = sanitizeString(body.notes, 2000);

  // ── Server-side Supabase ────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // 1. Verify project exists
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, reference_code, client_name')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // 2. Read BOM materials
  const { data: bomMaterials, error: bomErr } = await supabase
    .from('project_material_requirements_bom')
    .select('*')
    .eq('project_id', project_id)
    .order('material_type');

  if (bomErr) {
    return NextResponse.json({ error: 'Failed to read BOM materials', detail: bomErr.message }, { status: 500 });
  }

  if (!bomMaterials || bomMaterials.length === 0) {
    return NextResponse.json(
      { error: 'No BOM data found. Generate BOM from Modules tab first.' },
      { status: 400 },
    );
  }

  // 3. Read BOM hardware
  const { data: bomHardware } = await supabase
    .from('project_hardware_requirements')
    .select('*')
    .eq('project_id', project_id)
    .order('hardware_type');

  // 4. Read project_parts for piece count verification
  const { count: partCount } = await supabase
    .from('project_parts')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project_id);

  // ── Material labels ─────────────────────────────────────────────────────
  const MATERIAL_LABELS: Record<string, string> = {
    mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_12: 'MDF 12mm',
    stratifie_18: 'Stratifié 18mm', stratifie_16: 'Stratifié 16mm',
    back_hdf_5: 'Fond HDF 5mm', back_mdf_8: 'Fond MDF 8mm',
  };

  // ── Build quote lines from BOM ──────────────────────────────────────────
  const quoteLines: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
    sort_order: number;
  }> = [];

  let sortOrder = 0;

  // A. Material lines (from project_material_requirements_bom)
  for (const mat of bomMaterials) {
    const label = MATERIAL_LABELS[mat.material_type] || mat.material_type;
    const panelsWithWaste = mat.panels_with_waste ?? Math.ceil(mat.panels_required * (mat.waste_factor || 1.15));
    const unitCost = mat.unit_cost || 0;
    const totalCost = mat.total_cost || (panelsWithWaste * unitCost);

    quoteLines.push({
      description: `${label} — ${mat.net_area_m2?.toFixed(2) || '?'} m² net (${panelsWithWaste} panneaux incl. chutes)`,
      quantity: panelsWithWaste,
      unit: 'panneau',
      unit_price: unitCost,
      total_price: totalCost,
      sort_order: sortOrder++,
    });

    // Edge banding line (if any)
    if (mat.edge_banding_ml > 0) {
      const edgeMeters = Math.ceil(mat.edge_banding_ml);
      quoteLines.push({
        description: `Chant ${label} — ${edgeMeters} ml`,
        quantity: edgeMeters,
        unit: 'ml',
        unit_price: 0, // Priced per stock item if linked
        total_price: 0,
        sort_order: sortOrder++,
      });
    }
  }

  // B. Hardware lines (from project_hardware_requirements)
  if (bomHardware && bomHardware.length > 0) {
    for (const hw of bomHardware) {
      quoteLines.push({
        description: `${hw.name} (${hw.hardware_type})`,
        quantity: hw.quantity_required,
        unit: hw.unit || 'unité',
        unit_price: hw.unit_cost || 0,
        total_price: hw.total_cost || (hw.quantity_required * (hw.unit_cost || 0)),
        sort_order: sortOrder++,
      });
    }
  }

  // C. Labor line
  if (laborCost > 0) {
    quoteLines.push({
      description: 'Main d\'oeuvre — Fabrication',
      quantity: 1,
      unit: 'forfait',
      unit_price: laborCost,
      total_price: laborCost,
      sort_order: sortOrder++,
    });
  }

  // D. Transport/Installation line
  if (transportCost > 0) {
    quoteLines.push({
      description: 'Transport et Installation',
      quantity: 1,
      unit: 'forfait',
      unit_price: transportCost,
      total_price: transportCost,
      sort_order: sortOrder++,
    });
  }

  // ── Compute totals ──────────────────────────────────────────────────────
  const subtotal = quoteLines.reduce((sum, l) => sum + l.total_price, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const totalAmount = subtotal - discountAmount;

  // ── Get next version ────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('project_id', project_id)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version || 0) + 1;

  // ── Insert quote ────────────────────────────────────────────────────────
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .insert({
      project_id,
      version: nextVersion,
      status: 'draft',
      subtotal,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      notes: notes || `Devis auto-généré depuis BOM. ${partCount || 0} pièces, ${bomMaterials.length} matériaux.`,
      valid_until: validUntil,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (quoteErr || !quote) {
    return NextResponse.json(
      { error: 'Failed to create quote', detail: quoteErr?.message },
      { status: 500 },
    );
  }

  // ── Insert lines ────────────────────────────────────────────────────────
  const insertLines = quoteLines.map(l => ({ ...l, quote_id: quote.id }));
  const { error: linesErr } = await supabase.from('quote_lines').insert(insertLines);

  if (linesErr) {
    return NextResponse.json(
      { error: 'Quote created but lines failed', detail: linesErr.message },
      { status: 500 },
    );
  }

  await writeAuditLog({
    action: 'create',
    entity_type: 'quote',
    entity_id: quote.id,
    user_id: auth.userId,
    notes: `Quote v${nextVersion} generated from BOM for project ${project.reference_code}`,
  });

  return NextResponse.json({
    quote,
    summary: {
      materials: bomMaterials.length,
      hardware: bomHardware?.length || 0,
      parts: partCount || 0,
      lines: quoteLines.length,
      subtotal,
      discount_amount: discountAmount,
      total: totalAmount,
    },
  }, { status: 201 });
}
