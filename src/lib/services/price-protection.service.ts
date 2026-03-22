/**
 * Smart Pricing Engine — Price Protection + Auto Pricing + Discount Control
 *
 * Rules (updated):
 *   selling_price < total_cost         → BLOCKED (hard block, vente à perte)
 *   margin < 20%                       → BLOCKED (cannot validate at all)
 *   margin >= 20% and < 25%            → WARNING (requires manager approval)
 *   margin >= 25%                      → OK
 *
 * Margin tiers:
 *   min_margin      = 20% (absolute floor — BLOCKED below this)
 *   warning_margin  = 25% (needs approval between 20-25%)
 *   target_margin   = 30% (recommended default)
 *   aggressive_margin = 40% (premium pricing)
 *
 * Margin formula: (selling_price - cost) / selling_price × 100
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type {
  CostBreakdown,
  PriceProtectionResult,
  PriceProtectionCostBreakdown,
  PriceProtectionStatus,
  QuoteApprovalRecord,
} from '@/types/finance';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[smart-pricing]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Compute selling price from cost and target margin percent */
function priceFromMargin(cost: number, marginPct: number): number {
  if (marginPct >= 100) return cost * 10; // safety cap
  return round2(cost / (1 - marginPct / 100));
}

/** Compute margin percent from cost and selling price */
function marginFromPrice(cost: number, sellingPrice: number): number {
  if (sellingPrice <= 0) return -100;
  return round2(((sellingPrice - cost) / sellingPrice) * 100);
}

// ── Margin Tiers ───────────────────────────────────────────────────────────

const MARGIN_TIERS = {
  min: 20,         // absolute floor — BLOCKED below
  warning: 25,     // WARNING zone: 20-25% needs manager approval
  target: 30,      // recommended default pricing
  aggressive: 40,  // premium / high-value clients
} as const;

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecommendedPrices {
  price_min: number;        // @ 20% margin (absolute floor)
  price_warning: number;    // @ 25% margin (below = needs approval)
  price_target: number;     // @ 30% margin (recommended)
  price_aggressive: number; // @ 40% margin (premium)
}

export interface SmartPricingResult {
  status: PriceProtectionStatus;
  total_cost: number;
  selling_price: number;
  margin_amount: number;
  margin_percent: number;
  min_margin_percent: number;
  warning_margin_percent: number;
  cost_breakdown: PriceProtectionCostBreakdown;
  recommended_prices: RecommendedPrices;
  requires_approval: boolean;
  approval_reason: string | null;
  blocked_reason: string | null;
}

export interface DiscountCheckResult {
  original_price: number;
  discount_percent: number;
  discount_amount: number;
  final_price: number;
  margin_after_discount: number;
  status: PriceProtectionStatus;
  blocked_reason: string | null;
  max_discount_percent: number; // max discount before hitting 20% margin floor
}

// ── Core: Smart Pricing Evaluation ─────────────────────────────────────────

/**
 * Full smart pricing evaluation.
 * Returns status, cost breakdown, margin, AND recommended prices at all tiers.
 */
export async function evaluateSmartPricing(
  projectId: string,
  sellingPrice: number,
): Promise<ServiceResult<SmartPricingResult>> {
  if (!projectId) return fail('Project ID requis.');
  if (sellingPrice < 0) return fail('Le prix de vente ne peut pas être négatif.');

  // 1. Get cost breakdown
  const costResult = await getProjectCostBreakdown(projectId);
  if (!costResult.success || !costResult.data) {
    return fail(costResult.error || 'Impossible de calculer le coût du projet.');
  }

  const costBreakdown = costResult.data;
  const totalCost = costBreakdown.total_cost;

  // 2. Load margin settings from DB (override defaults if configured)
  const { data: settings } = await supabase()
    .from('cost_settings')
    .select('min_margin_percent, recommended_margin_percent')
    .limit(1)
    .maybeSingle();

  const minMargin = settings?.min_margin_percent ?? MARGIN_TIERS.min;
  const warningMargin = MARGIN_TIERS.warning; // 25% — always enforced
  const targetMargin = settings?.recommended_margin_percent ?? MARGIN_TIERS.target;

  // 3. Compute margin
  const marginAmount = round2(sellingPrice - totalCost);
  const marginPercent = marginFromPrice(totalCost, sellingPrice);

  // 4. Compute recommended prices
  const recommended_prices: RecommendedPrices = {
    price_min: priceFromMargin(totalCost, MARGIN_TIERS.min),
    price_warning: priceFromMargin(totalCost, MARGIN_TIERS.warning),
    price_target: priceFromMargin(totalCost, MARGIN_TIERS.target),
    price_aggressive: priceFromMargin(totalCost, MARGIN_TIERS.aggressive),
  };

  // 5. Determine status (updated rules)
  let status: PriceProtectionStatus;
  let requiresApproval = false;
  let approvalReason: string | null = null;
  let blockedReason: string | null = null;

  if (sellingPrice < totalCost) {
    // HARD BLOCK — selling below cost
    status = 'BLOCKED';
    blockedReason = `Vente à perte: prix ${round2(sellingPrice)} MAD < coût ${round2(totalCost)} MAD. Minimum: ${recommended_prices.price_min} MAD.`;
  } else if (marginPercent < minMargin) {
    // BLOCKED — below absolute floor (20%)
    status = 'BLOCKED';
    blockedReason = `Marge ${marginPercent}% < minimum absolu ${minMargin}%. Prix minimum: ${recommended_prices.price_min} MAD.`;
  } else if (marginPercent < warningMargin) {
    // WARNING — between 20% and 25%, needs manager approval
    status = 'WARNING';
    requiresApproval = true;
    approvalReason = `Marge ${marginPercent}% entre ${minMargin}% et ${warningMargin}%. Approbation du responsable requise. Prix recommandé: ${recommended_prices.price_target} MAD (${targetMargin}%).`;
  } else {
    // OK — margin >= 25%
    status = 'OK';
  }

  return ok({
    status,
    total_cost: round2(totalCost),
    selling_price: round2(sellingPrice),
    margin_amount: marginAmount,
    margin_percent: marginPercent,
    min_margin_percent: minMargin,
    warning_margin_percent: warningMargin,
    cost_breakdown: costBreakdown,
    recommended_prices,
    requires_approval: requiresApproval,
    approval_reason: approvalReason,
    blocked_reason: blockedReason,
  });
}

// ── Legacy wrapper (backward compatible) ───────────────────────────────────

export async function evaluatePriceProtection(
  projectId: string,
  sellingPrice: number,
): Promise<ServiceResult<PriceProtectionResult>> {
  const result = await evaluateSmartPricing(projectId, sellingPrice);
  if (!result.success || !result.data) return result as ServiceResult<PriceProtectionResult>;

  const d = result.data;
  return ok({
    status: d.status,
    total_cost: d.total_cost,
    selling_price: d.selling_price,
    margin_amount: d.margin_amount,
    margin_percent: d.margin_percent,
    min_margin_percent: d.min_margin_percent,
    cost_breakdown: d.cost_breakdown,
    requires_approval: d.requires_approval,
    approval_reason: d.approval_reason,
    blocked_reason: d.blocked_reason,
  });
}

// ── Auto Pricing ───────────────────────────────────────────────────────────

/**
 * Generate recommended prices for a project automatically.
 * No selling price needed — just computes all tiers from cost.
 */
export async function getAutoPricing(
  projectId: string,
): Promise<ServiceResult<{
  total_cost: number;
  recommended_prices: RecommendedPrices;
  cost_breakdown: PriceProtectionCostBreakdown;
}>> {
  if (!projectId) return fail('Project ID requis.');

  const costResult = await getProjectCostBreakdown(projectId);
  if (!costResult.success || !costResult.data) {
    return fail(costResult.error || 'Impossible de calculer le coût du projet.');
  }

  const totalCost = costResult.data.total_cost;

  return ok({
    total_cost: totalCost,
    recommended_prices: {
      price_min: priceFromMargin(totalCost, MARGIN_TIERS.min),
      price_warning: priceFromMargin(totalCost, MARGIN_TIERS.warning),
      price_target: priceFromMargin(totalCost, MARGIN_TIERS.target),
      price_aggressive: priceFromMargin(totalCost, MARGIN_TIERS.aggressive),
    },
    cost_breakdown: costResult.data,
  });
}

// ── Discount Control ───────────────────────────────────────────────────────

/**
 * Check if a discount is safe. ALWAYS rechecks margin after discount.
 *
 * Usage:
 *   const check = await checkDiscount(projectId, 3000, 10); // 10% off 3000
 *   if (check.data.status === 'BLOCKED') → reject discount
 */
export async function checkDiscount(
  projectId: string,
  originalPrice: number,
  discountPercent: number,
): Promise<ServiceResult<DiscountCheckResult>> {
  if (!projectId) return fail('Project ID requis.');
  if (discountPercent < 0 || discountPercent >= 100) return fail('Remise invalide.');

  const costResult = await getProjectCostBreakdown(projectId);
  if (!costResult.success || !costResult.data) {
    return fail(costResult.error || 'Impossible de calculer le coût.');
  }

  const totalCost = costResult.data.total_cost;
  const discountAmount = round2(originalPrice * discountPercent / 100);
  const finalPrice = round2(originalPrice - discountAmount);
  const marginAfter = marginFromPrice(totalCost, finalPrice);

  // Determine status after discount
  let status: PriceProtectionStatus;
  let blockedReason: string | null = null;

  if (finalPrice < totalCost) {
    status = 'BLOCKED';
    blockedReason = `Remise de ${discountPercent}% donne un prix (${finalPrice} MAD) inférieur au coût (${round2(totalCost)} MAD).`;
  } else if (marginAfter < MARGIN_TIERS.min) {
    status = 'BLOCKED';
    blockedReason = `Remise de ${discountPercent}% donne une marge de ${marginAfter}% < minimum ${MARGIN_TIERS.min}%.`;
  } else if (marginAfter < MARGIN_TIERS.warning) {
    status = 'WARNING';
  } else {
    status = 'OK';
  }

  // Compute maximum safe discount (floor at 20% margin)
  const floorPrice = priceFromMargin(totalCost, MARGIN_TIERS.min);
  const maxDiscountAmount = round2(originalPrice - floorPrice);
  const maxDiscountPercent = originalPrice > 0
    ? round2((maxDiscountAmount / originalPrice) * 100)
    : 0;

  return ok({
    original_price: round2(originalPrice),
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    final_price: finalPrice,
    margin_after_discount: marginAfter,
    status,
    blocked_reason: blockedReason,
    max_discount_percent: Math.max(0, maxDiscountPercent),
  });
}

// ── Validate Quote Before Save ─────────────────────────────────────────────

/**
 * Gate function — call before inserting/updating a quote.
 */
export async function validateQuotePrice(
  projectId: string,
  quoteTotal: number,
): Promise<ServiceResult<SmartPricingResult>> {
  return evaluateSmartPricing(projectId, quoteTotal);
}

// ── Store Approval Record ──────────────────────────────────────────────────

/**
 * Record a manager's approval for a WARNING-zone quote (20-25% margin).
 * BLOCKED quotes cannot be approved.
 */
export async function recordQuoteApproval(
  quoteId: string,
  projectId: string,
  approvedBy: string,
  approvalNotes: string,
  pricingResult: SmartPricingResult | PriceProtectionResult,
): Promise<ServiceResult<{ id: string }>> {
  if (!quoteId) return fail('Quote ID requis.');
  if (!approvedBy) return fail('Approbateur requis.');

  if (pricingResult.status === 'BLOCKED') {
    return fail('Impossible d\'approuver un devis bloqué. Le prix doit respecter la marge minimum.');
  }

  // Update the quote with approval metadata
  const { error: qErr } = await supabase()
    .from('quotes')
    .update({
      status: 'draft', // upgrade from pending_approval to draft
      cost_snapshot: {
        ...pricingResult.cost_breakdown,
        margin_percent: pricingResult.margin_percent,
        protection_status: pricingResult.status,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        approval_notes: approvalNotes,
      },
      notes: `Marge: ${pricingResult.margin_percent}% — Approuvé par ${approvedBy}. ${approvalNotes}`,
    })
    .eq('id', quoteId);

  if (qErr) return fail('Échec de la mise à jour du devis: ' + qErr.message);

  // Audit trail
  const { data: inserted, error: insErr } = await supabase()
    .from('project_costs')
    .insert({
      project_id: projectId,
      cost_type: 'overhead',
      description: `APPROVAL: Marge ${pricingResult.margin_percent}% approuvée par ${approvedBy}`,
      quantity: 1,
      unit_price: 0,
      amount: 0,
      created_by: approvedBy,
    })
    .select('id')
    .single();

  if (insErr) return fail('Échec audit trail: ' + insErr.message);

  return ok({ id: inserted?.id || quoteId });
}

// ── Protected Auto Quote ───────────────────────────────────────────────────

/**
 * Generate a quote with smart pricing protection.
 * BLOCKED → no quote created.
 * WARNING → quote created as 'pending_approval'.
 * OK → quote created as 'draft'.
 */
export async function generateProtectedQuote(
  projectId: string,
  userId: string,
  breakdown: CostBreakdown,
  customSellingPrice?: number,
): Promise<ServiceResult<{
  pricing: SmartPricingResult;
  quote_id?: string;
  quote_version?: number;
}>> {
  if (!projectId) return fail('Project ID requis.');

  // Use custom price or compute from target margin
  const sellingPrice = customSellingPrice
    ? customSellingPrice
    : priceFromMargin(breakdown.total_cost, MARGIN_TIERS.target);

  // Run smart pricing check
  const checkResult = await evaluateSmartPricing(projectId, sellingPrice);
  if (!checkResult.success || !checkResult.data) {
    return fail(checkResult.error || 'Échec de la vérification.');
  }

  const pricing = checkResult.data;

  // BLOCKED → no quote
  if (pricing.status === 'BLOCKED') {
    return ok({ pricing });
  }

  // OK or WARNING → create quote
  const quoteStatus = pricing.status === 'WARNING' ? 'pending_approval' : 'draft';
  const marginMultiplier = 1 / (1 - pricing.margin_percent / 100);

  // Get next version
  const { data: maxVer } = await supabase()
    .from('quotes')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (maxVer?.version ?? 0) + 1;

  // Build lines from BOM
  const lines: { description: string; quantity: number; unit: string; unit_price: number; total_price: number; sort_order: number }[] = [];
  let sortOrder = 1;

  const { data: bomRows } = await supabase()
    .from('project_material_requirements_bom')
    .select('material_type, panels_required, net_area_m2, total_cost, edge_banding_ml')
    .eq('project_id', projectId);

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
      const costWithMargin = round2((row.total_cost || 0) * marginMultiplier);
      lines.push({
        description: `${matLabel} — ${row.panels_required} panneaux (${row.net_area_m2} m²)`,
        quantity: row.panels_required || 1,
        unit: 'm²',
        unit_price: row.panels_required > 0 ? round2(costWithMargin / row.panels_required) : costWithMargin,
        total_price: costWithMargin,
        sort_order: sortOrder++,
      });
    }
  }

  if (breakdown.hardware_cost > 0) {
    lines.push({
      description: 'Quincaillerie (charnières, coulisses, supports)',
      quantity: 1, unit: 'lot',
      unit_price: round2(breakdown.hardware_cost * marginMultiplier),
      total_price: round2(breakdown.hardware_cost * marginMultiplier),
      sort_order: sortOrder++,
    });
  }

  if (breakdown.labor_cost > 0) {
    lines.push({
      description: 'Main d\'œuvre',
      quantity: 1, unit: 'forfait',
      unit_price: round2(breakdown.labor_cost * marginMultiplier),
      total_price: round2(breakdown.labor_cost * marginMultiplier),
      sort_order: sortOrder++,
    });
  }

  if (breakdown.machine_cost > 0) {
    lines.push({
      description: 'Usinage CNC & découpe',
      quantity: 1, unit: 'forfait',
      unit_price: round2(breakdown.machine_cost * marginMultiplier),
      total_price: round2(breakdown.machine_cost * marginMultiplier),
      sort_order: sortOrder++,
    });
  }

  if (breakdown.transport_cost > 0) {
    lines.push({
      description: 'Transport & livraison',
      quantity: 1, unit: 'forfait',
      unit_price: round2(breakdown.transport_cost * marginMultiplier),
      total_price: round2(breakdown.transport_cost * marginMultiplier),
      sort_order: sortOrder++,
    });
  }

  const subtotal = round2(lines.reduce((sum, l) => sum + l.total_price, 0));

  // Insert quote
  const { data: quote, error: qErr } = await supabase()
    .from('quotes')
    .insert({
      project_id: projectId,
      version: nextVersion,
      status: quoteStatus,
      subtotal,
      discount_percent: 0,
      discount_amount: 0,
      total_amount: subtotal,
      is_auto_generated: true,
      cost_snapshot: {
        ...breakdown,
        protection_status: pricing.status,
        margin_percent: pricing.margin_percent,
        total_cost_verified: pricing.total_cost,
        recommended_prices: pricing.recommended_prices,
      },
      created_by: userId,
      notes: pricing.status === 'WARNING'
        ? `⚠️ Marge ${pricing.margin_percent}% (zone 20-25%). Approbation requise. Recommandé: ${pricing.recommended_prices.price_target} MAD.`
        : `✅ Marge ${pricing.margin_percent}%. Coût: ${pricing.total_cost} MAD.`,
    })
    .select('id, version')
    .single();

  if (qErr) return fail('Échec création devis: ' + qErr.message);
  if (!quote) return fail('Devis créé mais pas d\'ID retourné.');

  // Insert lines
  const lineRows = lines.map(l => ({ ...l, quote_id: quote.id }));
  if (lineRows.length > 0) {
    const { error: lErr } = await supabase().from('quote_lines').insert(lineRows);
    if (lErr) return fail('Devis créé mais lignes échouées: ' + lErr.message);
  }

  return ok({
    pricing,
    quote_id: quote.id,
    quote_version: quote.version,
  });
}

// ── Apply Discount to Existing Quote ───────────────────────────────────────

/**
 * Apply a discount to an existing quote. Rechecks margin AFTER discount.
 * Returns BLOCKED if discount pushes margin below 20%.
 */
export async function applyQuoteDiscount(
  quoteId: string,
  projectId: string,
  discountPercent: number,
  userId: string,
): Promise<ServiceResult<DiscountCheckResult>> {
  if (!quoteId) return fail('Quote ID requis.');

  // Get current quote
  const { data: quote, error: qErr } = await supabase()
    .from('quotes')
    .select('subtotal, total_amount')
    .eq('id', quoteId)
    .single();

  if (qErr || !quote) return fail('Devis introuvable.');

  const originalPrice = quote.subtotal || quote.total_amount;

  // Check discount safety
  const check = await checkDiscount(projectId, originalPrice, discountPercent);
  if (!check.success || !check.data) return check;

  // If BLOCKED, don't apply
  if (check.data.status === 'BLOCKED') {
    return ok(check.data);
  }

  // Apply discount
  const { error: upErr } = await supabase()
    .from('quotes')
    .update({
      discount_percent: discountPercent,
      discount_amount: check.data.discount_amount,
      total_amount: check.data.final_price,
      status: check.data.status === 'WARNING' ? 'pending_approval' : undefined,
      notes: check.data.status === 'WARNING'
        ? `⚠️ Remise ${discountPercent}% appliquée. Marge résultante: ${check.data.margin_after_discount}%. Approbation requise.`
        : `Remise ${discountPercent}% appliquée. Marge: ${check.data.margin_after_discount}%.`,
    })
    .eq('id', quoteId);

  if (upErr) return fail('Échec application remise: ' + upErr.message);

  return ok(check.data);
}

// ── Get Project Cost Breakdown ─────────────────────────────────────────────

async function getProjectCostBreakdown(
  projectId: string,
): Promise<ServiceResult<PriceProtectionCostBreakdown>> {
  // Try RPC first (most accurate)
  const { data: rpcData, error: rpcErr } = await supabase().rpc('calculate_project_cost', {
    p_project_id: projectId,
  });

  if (!rpcErr && rpcData) {
    const bd = rpcData as CostBreakdown;
    const wasteCost = round2(bd.material_cost * 0.12);
    return ok({
      material_cost: round2(bd.material_cost),
      edge_cost: 0,
      labor_cost: round2(bd.labor_cost),
      hardware_cost: round2(bd.hardware_cost),
      machine_cost: round2(bd.machine_cost),
      transport_cost: round2(bd.transport_cost),
      waste_cost: wasteCost,
      facade_cost: 0,
      total_cost: round2(bd.total_cost),
    });
  }

  // Fallback: read from project_costs table
  const { data: costRows, error: costErr } = await supabase()
    .from('project_costs')
    .select('cost_type, amount')
    .eq('project_id', projectId);

  if (costErr) return fail('Impossible de lire les coûts: ' + costErr.message);

  let materialCost = 0;
  let laborCost = 0;
  let overheadCost = 0;
  let transportCost = 0;

  for (const row of (costRows || [])) {
    const amount = row.amount || 0;
    switch (row.cost_type) {
      case 'material': materialCost += amount; break;
      case 'labor': laborCost += amount; break;
      case 'overhead': overheadCost += amount; break;
      case 'transport': transportCost += amount; break;
    }
  }

  const totalCost = materialCost + laborCost + overheadCost + transportCost;
  const wasteCost = round2(materialCost * 0.12);

  return ok({
    material_cost: round2(materialCost),
    edge_cost: 0,
    labor_cost: round2(laborCost),
    hardware_cost: 0,
    machine_cost: round2(overheadCost),
    transport_cost: round2(transportCost),
    waste_cost: wasteCost,
    facade_cost: 0,
    total_cost: round2(totalCost),
  });
}

// ── Quick Check (lightweight, for UI badges) ───────────────────────────────

export async function quickMarginCheck(
  projectId: string,
  sellingPrice: number,
): Promise<ServiceResult<{ status: PriceProtectionStatus; margin_percent: number; max_discount_percent: number }>> {
  const { data: costData } = await supabase()
    .from('v_project_real_cost')
    .select('real_cost')
    .eq('project_id', projectId)
    .maybeSingle();

  const realCost = costData?.real_cost ?? 0;

  if (realCost === 0) {
    return ok({ status: 'OK', margin_percent: 100, max_discount_percent: 80 });
  }

  const marginPercent = marginFromPrice(realCost, sellingPrice);
  const floorPrice = priceFromMargin(realCost, MARGIN_TIERS.min);
  const maxDiscount = sellingPrice > 0
    ? round2(((sellingPrice - floorPrice) / sellingPrice) * 100)
    : 0;

  let status: PriceProtectionStatus;
  if (sellingPrice < realCost || marginPercent < MARGIN_TIERS.min) {
    status = 'BLOCKED';
  } else if (marginPercent < MARGIN_TIERS.warning) {
    status = 'WARNING';
  } else {
    status = 'OK';
  }

  return ok({
    status,
    margin_percent: marginPercent,
    max_discount_percent: Math.max(0, maxDiscount),
  });
}
