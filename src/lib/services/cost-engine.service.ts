/**
 * Cost Engine Service — Calculates project costs from BOM, generates auto-quotes.
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type { CostBreakdown, CostSettings, MarginCheck, ProjectRealCost } from '@/types/finance';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[cost-engine]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Cost Calculation ───────────────────────────────────────────────────────

/**
 * Calculate project costs from BOM + settings, store in project_costs.
 * Replaces any previous BOM-generated costs (tagged with "BOM:" prefix).
 */
export async function calculateAndStoreCosts(
  projectId: string,
  userId: string,
): Promise<ServiceResult<CostBreakdown>> {
  if (!projectId) return fail('Project ID is required.');

  // 1. Call SQL function
  const { data, error } = await supabase().rpc('calculate_project_cost', {
    p_project_id: projectId,
  });
  if (error) return fail('Cost calculation failed: ' + error.message);
  if (!data) return fail('No cost data returned.');

  const breakdown = data as CostBreakdown;

  // 2. Delete old BOM-generated cost entries
  await supabase()
    .from('project_costs')
    .delete()
    .eq('project_id', projectId)
    .like('description', 'BOM:%');

  // 3. Insert new cost entries
  const costRows = [
    { cost_type: 'material', description: 'BOM: Materials (panels, backs)', amount: breakdown.material_cost },
    { cost_type: 'material', description: 'BOM: Hardware (hinges, slides, etc.)', amount: breakdown.hardware_cost },
    { cost_type: 'labor', description: 'BOM: Labor estimate', amount: breakdown.labor_cost },
    { cost_type: 'overhead', description: 'BOM: Machine cost', amount: breakdown.machine_cost },
    { cost_type: 'transport', description: 'BOM: Transport', amount: breakdown.transport_cost },
  ].filter(r => r.amount > 0).map(r => ({
    ...r,
    project_id: projectId,
    quantity: 1,
    unit_price: r.amount,
    created_by: userId,
  }));

  if (costRows.length > 0) {
    const { error: insErr } = await supabase().from('project_costs').insert(costRows);
    if (insErr) return fail('Failed to store costs: ' + insErr.message);
  }

  return ok(breakdown);
}

// ── Auto Quote Generation ──────────────────────────────────────────────────

/**
 * Generate a draft quote from BOM cost breakdown.
 * Creates line items from BOM material groups + hardware + labor + transport.
 */
export async function generateAutoQuote(
  projectId: string,
  userId: string,
  breakdown: CostBreakdown,
): Promise<ServiceResult<{ id: string; version: number }>> {
  if (!projectId) return fail('Project ID is required.');

  const margin = breakdown.recommended_margin_percent;
  const marginMultiplier = 1 / (1 - margin / 100);

  // 1. Get next version number
  const { data: maxVer } = await supabase()
    .from('quotes')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (maxVer?.version ?? 0) + 1;

  // 2. Build line items from BOM material groups
  const lines: { description: string; quantity: number; unit: string; unit_price: number; total_price: number; sort_order: number }[] = [];
  let sortOrder = 1;

  // Material lines from BOM
  const { data: bomRows } = await supabase()
    .from('project_material_requirements_bom')
    .select('material_type, panels_required, net_area_m2, total_cost, edge_banding_ml')
    .eq('project_id', projectId);

  // Lookup human-readable names from materials catalog
  const materialNames: Record<string, string> = {};
  if (bomRows && bomRows.length > 0) {
    const matCodes = bomRows.map(r => r.material_type);
    const { data: mats } = await supabase()
      .from('materials')
      .select('code, name')
      .in('code', matCodes);
    for (const m of (mats || [])) materialNames[m.code] = m.name;
  }

  if (bomRows && bomRows.length > 0) {
    for (const row of bomRows) {
      const matLabel = materialNames[row.material_type] || row.material_type;
      const costWithMargin = Math.round((row.total_cost || 0) * marginMultiplier * 100) / 100;
      lines.push({
        description: `${matLabel} — ${row.panels_required} panneaux (${row.net_area_m2} m²)`,
        quantity: row.panels_required || 1,
        unit: 'm²',
        unit_price: row.panels_required > 0 ? Math.round(costWithMargin / row.panels_required * 100) / 100 : costWithMargin,
        total_price: costWithMargin,
        sort_order: sortOrder++,
      });

      // Edge banding line (if applicable)
      if (row.edge_banding_ml && row.edge_banding_ml > 0) {
        // Edge banding cost is small — include as separate line
        const edgeCostPerMl = 5; // Average — will be refined from materials catalog later
        const edgeCost = Math.round(row.edge_banding_ml / 1000 * edgeCostPerMl * marginMultiplier * 100) / 100;
        if (edgeCost > 0) {
          lines.push({
            description: `Chant (${matLabel}) — ${Math.round(row.edge_banding_ml / 1000 * 10) / 10} ml`,
            quantity: 1,
            unit: 'ml',
            unit_price: edgeCost,
            total_price: edgeCost,
            sort_order: sortOrder++,
          });
        }
      }
    }
  }

  // Hardware line
  if (breakdown.hardware_cost > 0) {
    const hwPrice = Math.round(breakdown.hardware_cost * marginMultiplier * 100) / 100;
    lines.push({
      description: 'Quincaillerie (charnières, coulisses, supports)',
      quantity: 1,
      unit: 'lot',
      unit_price: hwPrice,
      total_price: hwPrice,
      sort_order: sortOrder++,
    });
  }

  // Labor line
  if (breakdown.labor_cost > 0) {
    const laborPrice = Math.round(breakdown.labor_cost * marginMultiplier * 100) / 100;
    lines.push({
      description: 'Main d\'œuvre',
      quantity: 1,
      unit: 'forfait',
      unit_price: laborPrice,
      total_price: laborPrice,
      sort_order: sortOrder++,
    });
  }

  // Machine line
  if (breakdown.machine_cost > 0) {
    const machinePrice = Math.round(breakdown.machine_cost * marginMultiplier * 100) / 100;
    lines.push({
      description: 'Usinage CNC & découpe',
      quantity: 1,
      unit: 'forfait',
      unit_price: machinePrice,
      total_price: machinePrice,
      sort_order: sortOrder++,
    });
  }

  // Transport line
  if (breakdown.transport_cost > 0) {
    const transportPrice = Math.round(breakdown.transport_cost * marginMultiplier * 100) / 100;
    lines.push({
      description: 'Transport & livraison',
      quantity: 1,
      unit: 'forfait',
      unit_price: transportPrice,
      total_price: transportPrice,
      sort_order: sortOrder++,
    });
  }

  // 3. Calculate totals
  const subtotal = lines.reduce((sum, l) => sum + l.total_price, 0);

  // 4. Insert quote
  const { data: quote, error: qErr } = await supabase()
    .from('quotes')
    .insert({
      project_id: projectId,
      version: nextVersion,
      status: 'draft',
      subtotal: Math.round(subtotal * 100) / 100,
      discount_percent: 0,
      discount_amount: 0,
      total_amount: Math.round(subtotal * 100) / 100,
      is_auto_generated: true,
      cost_snapshot: breakdown,
      created_by: userId,
      notes: `Auto-generated from BOM. Cost: ${breakdown.total_cost} MAD. Margin: ${margin}%.`,
    })
    .select('id, version')
    .single();

  if (qErr) return fail('Failed to create quote: ' + qErr.message);
  if (!quote) return fail('Quote created but no ID returned.');

  // 5. Insert quote lines
  const lineRows = lines.map(l => ({ ...l, quote_id: quote.id }));
  if (lineRows.length > 0) {
    const { error: lErr } = await supabase().from('quote_lines').insert(lineRows);
    if (lErr) return fail('Quote created but lines failed: ' + lErr.message);
  }

  return ok({ id: quote.id, version: quote.version });
}

// ── Cost Settings ──────────────────────────────────────────────────────────

export async function getCostSettings(): Promise<ServiceResult<CostSettings>> {
  const { data, error } = await supabase()
    .from('cost_settings')
    .select('*')
    .limit(1)
    .single();

  if (error) return fail('Failed to load cost settings: ' + error.message);
  return ok(data as CostSettings);
}

export async function updateCostSettings(
  settings: Partial<CostSettings>,
  userId: string,
): Promise<ServiceResult> {
  // Get the single row ID
  const { data: existing } = await supabase()
    .from('cost_settings')
    .select('id')
    .limit(1)
    .single();

  if (!existing) return fail('Cost settings not found.');

  const { error } = await supabase()
    .from('cost_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', existing.id);

  if (error) return fail('Failed to update cost settings: ' + error.message);
  return ok();
}

// ── Margin Check ───────────────────────────────────────────────────────────

/**
 * Check if a quote amount complies with margin rules.
 */
export async function checkMarginCompliance(
  quoteTotal: number,
  projectId: string,
): Promise<ServiceResult<MarginCheck>> {
  // Get real cost
  const { data: costData, error: costErr } = await supabase()
    .from('v_project_real_cost')
    .select('real_cost')
    .eq('project_id', projectId)
    .maybeSingle();

  if (costErr) return fail('Failed to check margin: ' + costErr.message);

  const realCost = costData?.real_cost ?? 0;

  // Get settings
  const { data: settings, error: setErr } = await supabase()
    .from('cost_settings')
    .select('min_margin_percent, recommended_margin_percent')
    .limit(1)
    .single();

  if (setErr) return fail('Failed to load margin settings: ' + setErr.message);

  const marginPercent = quoteTotal > 0
    ? Math.round(((quoteTotal - realCost) / quoteTotal) * 1000) / 10
    : 0;

  const minMargin = settings?.min_margin_percent ?? 15;
  const recommendedMargin = settings?.recommended_margin_percent ?? 30;

  return ok({
    compliant: marginPercent >= minMargin,
    marginPercent,
    minMargin,
    recommendedMargin,
    requiresOverride: marginPercent < minMargin,
  });
}

// ── Project Real Cost ──────────────────────────────────────────────────────

export async function getProjectRealCost(
  projectId: string,
): Promise<ServiceResult<ProjectRealCost>> {
  const { data, error } = await supabase()
    .from('v_project_real_cost')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) return fail('Failed to load real cost: ' + error.message);
  return ok(data as ProjectRealCost);
}
