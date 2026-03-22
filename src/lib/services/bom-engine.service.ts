/**
 * BOM Engine Service — Bill of Materials for hardware and edge banding calculations.
 *
 * Calculates edge banding lengths per part/material and hardware needs per module,
 * with fallback estimation from part names when module data is unavailable.
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[bom-engine]', error);
  return { success: false, error };
}

function supabase() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface EdgeByMaterial {
  material_type: string;
  length_mm: number;
  length_m: number;
  part_count: number;
}

export interface EdgeBandingResult {
  project_id: string;
  total_length_mm: number;
  total_length_m: number;
  by_material: EdgeByMaterial[];
  estimated_cost_1mm: number;
  estimated_cost_2mm: number;
}

export interface HardwareItem {
  item_type: 'hinge' | 'runner' | 'shelf_support' | 'feet' | 'handle';
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface HardwareBOMResult {
  project_id: string;
  tier: string;
  items: HardwareItem[];
  total_hardware_cost: number;
}

export interface FullBOMResult {
  project_id: string;
  edge_banding: EdgeBandingResult;
  hardware: HardwareBOMResult;
  total_bom_cost: number;
}

// ── Pricing rule loader ────────────────────────────────────────────────────

interface PricingRuleMap {
  [key: string]: number;
}

async function loadPricingRules(category: string): Promise<ServiceResult<PricingRuleMap>> {
  const { data, error } = await supabase()
    .from('pricing_rules')
    .select('key, value')
    .eq('category', category);

  if (error) return fail(`Failed to load pricing_rules (${category}): ${error.message}`);

  const map: PricingRuleMap = {};
  for (const row of data || []) {
    map[row.key] = Number(row.value) || 0;
  }
  return ok(map);
}

// ── Edge Banding ───────────────────────────────────────────────────────────

/**
 * Calculate total edge banding length for every part in a project.
 * Groups results by material_type and estimates cost at 1mm and 2mm PVC prices.
 */
export async function calculateEdgeBanding(
  projectId: string,
): Promise<ServiceResult<EdgeBandingResult>> {
  if (!projectId) return fail('Project ID is required.');

  // Load parts
  const { data: parts, error: partsErr } = await supabase()
    .from('project_parts')
    .select('material_type, width_mm, height_mm, quantity, edge_top, edge_bottom, edge_left, edge_right')
    .eq('project_id', projectId);

  if (partsErr) return fail('Failed to load project parts: ' + partsErr.message);
  if (!parts || parts.length === 0) {
    return ok({
      project_id: projectId,
      total_length_mm: 0,
      total_length_m: 0,
      by_material: [],
      estimated_cost_1mm: 0,
      estimated_cost_2mm: 0,
    });
  }

  // Load edge banding prices
  const pricesResult = await loadPricingRules('edge_banding');
  const prices = pricesResult.data || {};
  const pvc1mmPerMl = prices['pvc_1mm_per_ml'] || 0;
  const pvc2mmPerMl = prices['pvc_2mm_per_ml'] || 0;

  // Accumulate per material
  const materialMap = new Map<string, { length_mm: number; part_count: number }>();

  let totalLengthMm = 0;

  for (const part of parts) {
    const qty = part.quantity || 1;
    let partEdgeMm = 0;

    if (part.edge_top) partEdgeMm += (part.width_mm || 0);
    if (part.edge_bottom) partEdgeMm += (part.width_mm || 0);
    if (part.edge_left) partEdgeMm += (part.height_mm || 0);
    if (part.edge_right) partEdgeMm += (part.height_mm || 0);

    const totalForPart = partEdgeMm * qty;
    totalLengthMm += totalForPart;

    if (totalForPart > 0) {
      const mat = part.material_type || 'unknown';
      const existing = materialMap.get(mat) || { length_mm: 0, part_count: 0 };
      existing.length_mm += totalForPart;
      existing.part_count += qty;
      materialMap.set(mat, existing);
    }
  }

  const totalLengthM = totalLengthMm / 1000;

  const byMaterial: EdgeByMaterial[] = Array.from(materialMap.entries()).map(
    ([material_type, { length_mm, part_count }]) => ({
      material_type,
      length_mm,
      length_m: length_mm / 1000,
      part_count,
    }),
  );

  return ok({
    project_id: projectId,
    total_length_mm: totalLengthMm,
    total_length_m: totalLengthM,
    by_material: byMaterial,
    estimated_cost_1mm: Math.round(totalLengthM * pvc1mmPerMl * 100) / 100,
    estimated_cost_2mm: Math.round(totalLengthM * pvc2mmPerMl * 100) / 100,
  });
}

// ── Hardware BOM ───────────────────────────────────────────────────────────

/**
 * Determine if a module type is "tall" (pantry, tall cabinet, etc.)
 */
function isTallModule(moduleType: string | null): boolean {
  if (!moduleType) return false;
  const lower = moduleType.toLowerCase();
  return lower.includes('tall') || lower.includes('pantry') || lower.includes('colonne');
}

function isBaseModule(moduleType: string | null): boolean {
  if (!moduleType) return true; // default to base
  const lower = moduleType.toLowerCase();
  return lower.includes('base') || lower.includes('bas') || lower.includes('floor');
}

/**
 * Generate hardware BOM for a project using module data.
 * Falls back to part-name heuristics when no modules exist.
 */
export async function generateHardwareBOM(
  projectId: string,
  tier: 'budget' | 'standard' | 'premium',
): Promise<ServiceResult<HardwareBOMResult>> {
  if (!projectId) return fail('Project ID is required.');

  // Load BOM config rules
  const bomResult = await loadPricingRules('bom');
  const bomRules = bomResult.data || {};

  const hingesPerDoorBase = bomRules['hinges_per_door_base'] || 2;
  const hingesPerDoorWall = bomRules['hinges_per_door_wall'] || 2;
  const hingesPerDoorTall = bomRules['hinges_per_door_tall'] || 4;
  const runnersPerDrawer = bomRules['runners_per_drawer'] || 1;
  const shelfSupportsPerShelf = bomRules['shelf_supports_per_shelf'] || 4;
  const feetPerBaseCabinet = bomRules['feet_per_base_cabinet'] || 4;

  // Load hardware prices by tier
  const { data: presetRow, error: presetErr } = await supabase()
    .from('cabinet_hardware_presets')
    .select('hinge_unit_price, drawer_slide_unit_price, handle_unit_price, shelf_support_unit_price')
    .eq('tier', tier)
    .single();

  if (presetErr || !presetRow) {
    return fail(`Hardware preset not found for tier "${tier}": ${presetErr?.message || 'no data'}`);
  }

  const hingePrice = Number(presetRow.hinge_unit_price) || 0;
  const runnerPrice = Number(presetRow.drawer_slide_unit_price) || 0;
  const handlePrice = Number(presetRow.handle_unit_price) || 0;
  const shelfSupportPrice = Number(presetRow.shelf_support_unit_price) || 0;

  // Try loading modules first (via production_sheet_modules linked through production_sheets)
  const { data: sheets } = await supabase()
    .from('production_sheets')
    .select('id')
    .eq('project_id', projectId);

  const sheetIds = (sheets || []).map((s: { id: string }) => s.id);

  let totalHinges = 0;
  let totalRunners = 0;
  let totalShelfSupports = 0;
  let totalFeet = 0;
  let totalHandles = 0;
  let usedModules = false;

  if (sheetIds.length > 0) {
    const { data: modules, error: modErr } = await supabase()
      .from('production_sheet_modules')
      .select('module_type, door_count, shelf_count, drawer_count')
      .in('production_sheet_id', sheetIds);

    if (!modErr && modules && modules.length > 0) {
      usedModules = true;

      for (const mod of modules) {
        const doors = mod.door_count || 0;
        const drawers = mod.drawer_count || 0;
        const shelves = mod.shelf_count || 0;

        // Hinges: depend on module type
        if (doors > 0) {
          let hingesPerDoor = hingesPerDoorBase;
          if (isTallModule(mod.module_type)) {
            hingesPerDoor = hingesPerDoorTall;
          } else if (!isBaseModule(mod.module_type)) {
            // wall/upper modules
            hingesPerDoor = hingesPerDoorWall;
          }
          totalHinges += doors * hingesPerDoor;
        }

        // Handles: one per door + one per drawer
        totalHandles += doors + drawers;

        // Runners
        totalRunners += drawers * runnersPerDrawer;

        // Shelf supports
        totalShelfSupports += shelves * shelfSupportsPerShelf;

        // Feet for base cabinets
        if (isBaseModule(mod.module_type)) {
          totalFeet += feetPerBaseCabinet;
        }
      }
    }
  }

  // Fallback: estimate from part names when no modules found
  if (!usedModules) {
    const { data: parts, error: partsErr } = await supabase()
      .from('project_parts')
      .select('part_name, quantity')
      .eq('project_id', projectId);

    if (partsErr) return fail('Failed to load project parts for hardware estimation: ' + partsErr.message);

    for (const part of parts || []) {
      const name = (part.part_name || '').toLowerCase();
      const qty = part.quantity || 1;

      // Doors / Portes -> hinges + handles
      if (name.includes('porte') || name.includes('door')) {
        totalHinges += qty * hingesPerDoorBase;
        totalHandles += qty;
      }

      // Drawers / Tiroirs -> runners + handles
      if (name.includes('tiroir') || name.includes('drawer')) {
        totalRunners += qty * runnersPerDrawer;
        totalHandles += qty;
      }

      // Shelves / Etageres -> shelf supports
      if (
        name.includes('étagère') || name.includes('etagere') ||
        name.includes('shelf') || name.includes('tablette')
      ) {
        totalShelfSupports += qty * shelfSupportsPerShelf;
      }
    }
  }

  // Build items list (only include non-zero quantities)
  const items: HardwareItem[] = [];

  if (totalHinges > 0) {
    items.push({
      item_type: 'hinge',
      item_name: `Charnières (${tier})`,
      quantity: totalHinges,
      unit_price: hingePrice,
      total_price: Math.round(totalHinges * hingePrice * 100) / 100,
    });
  }

  if (totalRunners > 0) {
    items.push({
      item_type: 'runner',
      item_name: `Coulisses tiroir (${tier})`,
      quantity: totalRunners,
      unit_price: runnerPrice,
      total_price: Math.round(totalRunners * runnerPrice * 100) / 100,
    });
  }

  if (totalShelfSupports > 0) {
    items.push({
      item_type: 'shelf_support',
      item_name: `Supports étagère (${tier})`,
      quantity: totalShelfSupports,
      unit_price: shelfSupportPrice,
      total_price: Math.round(totalShelfSupports * shelfSupportPrice * 100) / 100,
    });
  }

  if (totalFeet > 0) {
    // Feet price not in presets — use shelf_support price as proxy or 0
    const feetPrice = shelfSupportPrice;
    items.push({
      item_type: 'feet',
      item_name: `Pieds de meuble (${tier})`,
      quantity: totalFeet,
      unit_price: feetPrice,
      total_price: Math.round(totalFeet * feetPrice * 100) / 100,
    });
  }

  if (totalHandles > 0) {
    items.push({
      item_type: 'handle',
      item_name: `Poignées (${tier})`,
      quantity: totalHandles,
      unit_price: handlePrice,
      total_price: Math.round(totalHandles * handlePrice * 100) / 100,
    });
  }

  const totalHardwareCost = items.reduce((sum, item) => sum + item.total_price, 0);

  return ok({
    project_id: projectId,
    tier,
    items,
    total_hardware_cost: Math.round(totalHardwareCost * 100) / 100,
  });
}

// ── Full BOM ───────────────────────────────────────────────────────────────

/**
 * Combines edge banding + hardware into a complete BOM with total cost.
 */
export async function getFullBOM(
  projectId: string,
  tier: 'budget' | 'standard' | 'premium',
): Promise<ServiceResult<FullBOMResult>> {
  if (!projectId) return fail('Project ID is required.');

  const [edgeResult, hardwareResult] = await Promise.all([
    calculateEdgeBanding(projectId),
    generateHardwareBOM(projectId, tier),
  ]);

  if (!edgeResult.success || !edgeResult.data) {
    return fail(edgeResult.error || 'Edge banding calculation failed.');
  }

  if (!hardwareResult.success || !hardwareResult.data) {
    return fail(hardwareResult.error || 'Hardware BOM generation failed.');
  }

  const edge = edgeResult.data;
  const hardware = hardwareResult.data;

  // Use 2mm PVC cost as the default edge cost for the combined total
  const totalBomCost = Math.round(
    (edge.estimated_cost_2mm + hardware.total_hardware_cost) * 100,
  ) / 100;

  return ok({
    project_id: projectId,
    edge_banding: edge,
    hardware,
    total_bom_cost: totalBomCost,
  });
}
