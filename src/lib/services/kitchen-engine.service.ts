/**
 * Kitchen Engine Service — Generates project parts from kitchen configuration,
 * then chains into BOM → Cost → Auto-Quote using existing engines.
 */

import { createClient } from '@/lib/supabase/client';
import type { ServiceResult } from './index';
import type {
  CabinetMaterialPreset,
  CabinetHardwarePreset,
  KitchenConfiguration,
  KitchenLayoutTemplate,
  KitchenConfigModule,
  CostBreakdown,
} from '@/types/finance';
import { calculateAndStoreCosts, generateAutoQuote } from './cost-engine.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[kitchen-engine]', error);
  return { success: false, error };
}

function sb() {
  return createClient();
}

// ── Safe formula evaluator ────────────────────────────────────────────────────

/**
 * CSP-safe formula evaluator (no eval/Function — works with strict CSP).
 * Supports: numbers, +, -, *, /, parentheses, Math.round/floor/ceil.
 * Variables {W}, {H}, {D} are substituted before parsing.
 */
export function safeEval(expr: string, W: number, H: number, D: number): number {
  try {
    const e = expr
      .replace(/\{W\}/g, String(W))
      .replace(/\{H\}/g, String(H))
      .replace(/\{D\}/g, String(D))
      .trim();

    let pos = 0;

    function skipSpaces() { while (pos < e.length && e[pos] === ' ') pos++; }

    function parseExpr(): number {
      let result = parseTerm();
      while (pos < e.length) {
        skipSpaces();
        if (e[pos] === '+') { pos++; result += parseTerm(); }
        else if (e[pos] === '-') { pos++; result -= parseTerm(); }
        else break;
      }
      return result;
    }

    function parseTerm(): number {
      let result = parseFactor();
      while (pos < e.length) {
        skipSpaces();
        if (e[pos] === '*') { pos++; result *= parseFactor(); }
        else if (e[pos] === '/') { pos++; const d = parseFactor(); result = d !== 0 ? result / d : 0; }
        else break;
      }
      return result;
    }

    function parseFactor(): number {
      skipSpaces();

      // Handle Math.round / Math.floor / Math.ceil
      if (e.substring(pos, pos + 5) === 'Math.') {
        const fnStart = pos + 5;
        let fnName = '';
        while (pos < e.length && e[fnStart + fnName.length] !== '(') {
          fnName += e[fnStart + fnName.length];
          if (fnName.length > 10) break;
        }
        pos = fnStart + fnName.length; // now at '('
        if (e[pos] === '(') {
          pos++; // skip '('
          const inner = parseExpr();
          skipSpaces();
          if (pos < e.length && e[pos] === ')') pos++; // skip ')'
          switch (fnName) {
            case 'round': return Math.round(inner);
            case 'floor': return Math.floor(inner);
            case 'ceil':  return Math.ceil(inner);
            case 'abs':   return Math.abs(inner);
            default: return inner;
          }
        }
      }

      // Handle String(...) wrapper — just parse inner value
      if (e.substring(pos, pos + 7) === 'String(') {
        pos += 7;
        const inner = parseExpr();
        skipSpaces();
        if (pos < e.length && e[pos] === ')') pos++;
        return inner;
      }

      // Parentheses
      if (e[pos] === '(') { pos++; const r = parseExpr(); skipSpaces(); if (pos < e.length && e[pos] === ')') pos++; return r; }

      // Unary minus
      if (e[pos] === '-') { pos++; return -parseFactor(); }

      // Number
      let numStr = '';
      while (pos < e.length && ((e[pos] >= '0' && e[pos] <= '9') || e[pos] === '.')) {
        numStr += e[pos]; pos++;
      }
      skipSpaces();
      return numStr ? parseFloat(numStr) : 0;
    }

    const result = parseExpr();
    return Math.round(isNaN(result) ? 0 : result);
  } catch {
    return 0;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ModulePartRow {
  id: string;
  module_id: string;
  code: string;
  name: string;
  part_type: string;
  material_type: string | null;
  thickness_mm: number | null;
  width_formula: string | null;
  height_formula: string | null;
  quantity_formula: string | null;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: string | null;
  sort_order: number;
}

interface CatalogModule {
  id: string;
  code: string;
  name: string;
  category: string;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  has_doors?: boolean;
  door_count?: number;
  has_drawers?: boolean;
  drawer_count?: number;
  has_shelves?: boolean;
  shelf_count?: number;
}

export interface KitchenGenerationResult {
  parts_created: number;
  hardware_items: number;
  cost_breakdown: CostBreakdown | null;
  quote_id: string | null;
  quote_version: number | null;
}

// ── Material type → thickness ground truth ───────────────────────────────────

/**
 * Canonical thickness for each material_type code.
 * Used to enforce data integrity: if the material code encodes a thickness,
 * the thickness_mm column MUST match.
 */
export const MATERIAL_THICKNESS_MAP: Record<string, number> = {
  mdf_18: 18, mdf_16: 16, mdf_22: 22, mdf_10: 10,
  back_hdf_5: 5, back_hdf_3: 3, back_mdf_8: 8,
  stratifie_18: 18, stratifie_16: 16,
  melamine_anthracite: 18, melamine_blanc: 18,
  melamine_chene: 18, melamine_noyer: 18,
};

/**
 * Enforce material_type ↔ thickness_mm consistency.
 * If the material code has a known canonical thickness, it overrides whatever
 * thickness was passed in. Returns the corrected thickness.
 */
export function enforceThickness(materialType: string, thickness: number): number {
  const canonical = MATERIAL_THICKNESS_MAP[materialType];
  if (canonical !== undefined && canonical !== thickness) {
    console.warn(
      `[kitchen-engine] thickness mismatch: ${materialType} got ${thickness}mm, enforcing ${canonical}mm`,
    );
    return canonical;
  }
  return thickness;
}

// ── Material type resolution ─────────────────────────────────────────────────

/** Resolve abstract material types (carcass, facade, back_panel) to actual material codes */
function resolveMaterialType(
  partMaterialType: string | null,
  preset: CabinetMaterialPreset
): { material: string; thickness: number } {
  let result: { material: string; thickness: number };
  switch (partMaterialType) {
    case 'carcass':
      result = { material: preset.carcass_material, thickness: preset.carcass_thickness_mm };
      break;
    case 'facade':
      result = { material: preset.facade_material, thickness: preset.facade_thickness_mm };
      break;
    case 'back_panel':
      result = { material: preset.back_panel_material, thickness: preset.back_panel_thickness_mm };
      break;
    default:
      // Already a concrete material type
      result = { material: partMaterialType || 'mdf_18', thickness: 18 };
  }
  // Enforce: material code wins over preset thickness if they conflict
  result.thickness = enforceThickness(result.material, result.thickness);
  return result;
}

// ── Load presets ─────────────────────────────────────────────────────────────

export async function getMaterialPresets(): Promise<ServiceResult<CabinetMaterialPreset[]>> {
  const { data, error } = await sb()
    .from('cabinet_material_presets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return fail(error.message);
  return ok(data as CabinetMaterialPreset[]);
}

export async function getHardwarePresets(): Promise<ServiceResult<CabinetHardwarePreset[]>> {
  const { data, error } = await sb()
    .from('cabinet_hardware_presets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return fail(error.message);
  return ok(data as CabinetHardwarePreset[]);
}

export async function getLayoutTemplates(): Promise<ServiceResult<KitchenLayoutTemplate[]>> {
  const { data, error } = await sb()
    .from('kitchen_layout_templates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return fail(error.message);
  return ok(data as KitchenLayoutTemplate[]);
}

// ── Kitchen Configuration CRUD ───────────────────────────────────────────────

export async function getKitchenConfig(projectId: string): Promise<ServiceResult<KitchenConfiguration | null>> {
  const { data, error } = await sb()
    .from('kitchen_configurations')
    .select('*, layout_template:kitchen_layout_templates(*), material_preset:cabinet_material_presets(*), hardware_preset:cabinet_hardware_presets(*)')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) return fail(error.message);
  return ok(data as KitchenConfiguration | null);
}

export async function saveKitchenConfig(config: {
  project_id: string;
  layout_template_id: string | null;
  material_preset_id: string | null;
  hardware_preset_id: string | null;
  opening_system: string;
  wall_length_mm?: number | null;
  wall_length_b_mm?: number | null;
  ceiling_height_mm?: number | null;
  notes?: string | null;
  created_by: string;
  modules?: KitchenConfigModule[] | null;
}): Promise<ServiceResult<KitchenConfiguration>> {
  const { data, error } = await sb()
    .from('kitchen_configurations')
    .upsert(config, { onConflict: 'project_id' })
    .select('*')
    .single();
  if (error) return fail(error.message);
  return ok(data as KitchenConfiguration);
}

// ── MAIN: Generate Kitchen → Parts → BOM → Cost → Quote ─────────────────────

/**
 * Full kitchen generation pipeline:
 * 1. Read kitchen config (material preset, hardware preset, opening system)
 * 2. Read assigned project_modules for this project
 * 3. Fetch module_parts templates for each module
 * 4. Resolve materials via preset (carcass→mdf_18, facade→stratifie_18, etc.)
 * 5. Generate project_parts rows
 * 6. Generate hardware project_parts (hinges, slides, handles, shelf supports)
 * 7. Call generate_project_bom() RPC
 * 8. Call calculateAndStoreCosts()
 * 9. Call generateAutoQuote()
 */
export async function generateKitchen(
  projectId: string,
  userId: string,
  modules: KitchenConfigModule[],
): Promise<ServiceResult<KitchenGenerationResult>> {
  const supabase = sb();

  try {
    // ── 1. Load kitchen config ──
    const { data: config } = await supabase
      .from('kitchen_configurations')
      .select('*, material_preset:cabinet_material_presets(*), hardware_preset:cabinet_hardware_presets(*)')
      .eq('project_id', projectId)
      .single();

    if (!config) return fail('Kitchen configuration not found. Save config first.');

    const materialPreset = config.material_preset as CabinetMaterialPreset | null;
    const hardwarePreset = config.hardware_preset as CabinetHardwarePreset | null;

    if (!materialPreset) return fail('Material preset not selected.');
    if (!hardwarePreset) return fail('Hardware preset not selected.');

    // ── 1b. Fallback: if modules param is empty, try reading from config ──
    if ((!modules || modules.length === 0) && config.modules && Array.isArray(config.modules) && config.modules.length > 0) {
      console.log('[kitchen-engine] Using modules from saved config (' + config.modules.length + ' modules)');
      modules = config.modules as KitchenConfigModule[];
    }

    // ── 2. Resolve modules from catalog ──
    console.log('[kitchen-engine] Modules count:', modules.length, 'IDs:', modules.map((m: any) => m.module_id?.substring(0, 8)).join(','));
    const moduleIds = [...new Set(modules.map(m => m.module_id))];
    if (moduleIds.length === 0) return fail('No modules selected.');

    const { data: catalogModules, error: cmErr } = await supabase
      .from('product_modules')
      .select('id, code, name, category, width_mm, height_mm, depth_mm')
      .in('id', moduleIds);
    if (cmErr) return fail(cmErr.message);

    const moduleMap: Record<string, CatalogModule> = {};
    for (const m of (catalogModules || [])) {
      moduleMap[m.id] = m as CatalogModule;
    }

    // ── 3. Fetch module_parts for all modules ──
    const { data: allModuleParts, error: mpErr } = await supabase
      .from('module_parts')
      .select('*')
      .in('module_id', moduleIds);
    if (mpErr) return fail(mpErr.message);

    console.log('[kitchen-engine] module_parts fetched:', (allModuleParts || []).length, 'rows');

    const partsMap: Record<string, ModulePartRow[]> = {};
    for (const p of (allModuleParts || []) as ModulePartRow[]) {
      if (!partsMap[p.module_id]) partsMap[p.module_id] = [];
      partsMap[p.module_id].push(p);
    }
    console.log('[kitchen-engine] partsMap keys:', Object.keys(partsMap).length, 'modules with templates');

    // ── 4. Delete old kitchen-generated parts ──
    await supabase.from('project_parts').delete()
      .eq('project_id', projectId)
      .like('part_code', 'KC-%');

    // Delete old kitchen-generated project_modules
    await supabase.from('project_modules').delete()
      .eq('project_id', projectId)
      .like('position_label', 'KC:%');

    // ── 5. Generate project_modules + project_parts ──
    const allProjectParts: any[] = [];
    let hardwareCount = 0;
    let partIndex = 0;

    for (const slot of modules) {
      const catModule = moduleMap[slot.module_id];
      if (!catModule) continue;

      const W = slot.custom_width_mm ?? catModule.width_mm ?? 600;
      const H = slot.custom_height_mm ?? catModule.height_mm ?? 720;
      const D = slot.custom_depth_mm ?? catModule.depth_mm ?? 560;
      const qty = slot.quantity || 1;

      // Insert project_module
      const { data: pm, error: pmErr } = await supabase.from('project_modules').insert({
        project_id: projectId,
        module_id: slot.module_id,
        quantity: qty,
        custom_width_mm: slot.custom_width_mm,
        custom_height_mm: slot.custom_height_mm,
        custom_depth_mm: slot.custom_depth_mm,
        finish: materialPreset.name,
        position_label: 'KC:' + slot.slot_label,
        bom_generated: false,
      }).select('id').single();

      if (pmErr) { console.warn('project_module insert:', pmErr.message); continue; }
      const projectModuleId = pm.id;

      // Generate panel parts
      const templateParts = partsMap[slot.module_id] || [];
      for (const tpl of templateParts) {
        if (tpl.part_type !== 'panel') continue;

        const resolved = resolveMaterialType(tpl.material_type, materialPreset);
        const partW = tpl.width_formula ? safeEval(tpl.width_formula, W, H, D) : W;
        const partH = tpl.height_formula ? safeEval(tpl.height_formula, W, H, D) : H;
        const partQty = tpl.quantity_formula ? safeEval(tpl.quantity_formula, W, H, D) : 1;
        const totalQty = partQty * qty;

        // Compute edge banding length for this panel
        const edgeLen =
          (tpl.edge_top ? partW : 0) +
          (tpl.edge_bottom ? partW : 0) +
          (tpl.edge_left ? partH : 0) +
          (tpl.edge_right ? partH : 0);

        for (let i = 0; i < totalQty; i++) {
          partIndex++;
          allProjectParts.push({
            project_id: projectId,
            project_module_id: projectModuleId,
            part_code: 'KC-' + String(partIndex).padStart(4, '0'),
            part_name: tpl.name + ' (' + catModule.code + ' — ' + slot.slot_label + ')',
            material_type: resolved.material,
            thickness_mm: resolved.thickness,
            width_mm: partW,
            height_mm: partH,
            quantity: 1,
            unit_price: 0,
            edge_top: tpl.edge_top,
            edge_bottom: tpl.edge_bottom,
            edge_left: tpl.edge_left,
            edge_right: tpl.edge_right,
            edge_length_mm: edgeLen,
            grain_direction: tpl.grain_direction || 'none',
            is_cut: false,
            is_edged: false,
            is_assembled: false,
          });
        }
      }

      // ── 6. Generate hardware parts ──
      // Count doors and drawers for this module from template parts
      const doorParts = templateParts.filter(p => p.code.includes('DOOR'));
      const drawerParts = templateParts.filter(p => p.code.includes('DRW-FRONT'));
      const shelfParts = templateParts.filter(p => p.code.includes('SHELF'));

      let doorCount = 0;
      for (const dp of doorParts) {
        doorCount += (dp.quantity_formula ? safeEval(dp.quantity_formula, W, H, D) : 1) * qty;
      }
      let drawerCount = 0;
      for (const dp of drawerParts) {
        drawerCount += (dp.quantity_formula ? safeEval(dp.quantity_formula, W, H, D) : 1) * qty;
      }
      let shelfCount = 0;
      for (const sp of shelfParts) {
        shelfCount += (sp.quantity_formula ? safeEval(sp.quantity_formula, W, H, D) : 1) * qty;
      }

      // Hinges: 2 per door
      if (doorCount > 0) {
        partIndex++;
        allProjectParts.push({
          project_id: projectId,
          project_module_id: projectModuleId,
          part_code: 'KC-HW-' + String(partIndex).padStart(4, '0'),
          part_name: 'Charnière ' + hardwarePreset.hinge_type + ' (' + catModule.code + ')',
          material_type: 'hardware',
          thickness_mm: 0,
          width_mm: 0,
          height_mm: 0,
          quantity: doorCount * 2,
          unit_price: hardwarePreset.hinge_unit_price,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
          grain_direction: 'none',
          is_cut: false, is_edged: false, is_assembled: false,
          notes: 'Charnière × ' + (doorCount * 2) + ' @ ' + hardwarePreset.hinge_unit_price + ' MAD',
        });
        hardwareCount += doorCount * 2;
      }

      // Drawer slides: 1 pair per drawer
      if (drawerCount > 0) {
        partIndex++;
        allProjectParts.push({
          project_id: projectId,
          project_module_id: projectModuleId,
          part_code: 'KC-HW-' + String(partIndex).padStart(4, '0'),
          part_name: 'Coulisse ' + hardwarePreset.drawer_slide_type + ' (' + catModule.code + ')',
          material_type: 'hardware',
          thickness_mm: 0,
          width_mm: 0,
          height_mm: 0,
          quantity: drawerCount,
          unit_price: hardwarePreset.drawer_slide_unit_price,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
          grain_direction: 'none',
          is_cut: false, is_edged: false, is_assembled: false,
          notes: 'Coulisse × ' + drawerCount + ' @ ' + hardwarePreset.drawer_slide_unit_price + ' MAD/paire',
        });
        hardwareCount += drawerCount;
      }

      // Handles: 1 per door + 1 per drawer (if opening_system is 'handle')
      if (config.opening_system === 'handle' && (doorCount + drawerCount) > 0) {
        partIndex++;
        allProjectParts.push({
          project_id: projectId,
          project_module_id: projectModuleId,
          part_code: 'KC-HW-' + String(partIndex).padStart(4, '0'),
          part_name: 'Poignée ' + hardwarePreset.handle_type + ' (' + catModule.code + ')',
          material_type: 'hardware',
          thickness_mm: 0,
          width_mm: 0,
          height_mm: 0,
          quantity: doorCount + drawerCount,
          unit_price: hardwarePreset.handle_unit_price,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
          grain_direction: 'none',
          is_cut: false, is_edged: false, is_assembled: false,
          notes: 'Poignée × ' + (doorCount + drawerCount) + ' @ ' + hardwarePreset.handle_unit_price + ' MAD',
        });
        hardwareCount += doorCount + drawerCount;
      }

      // Gola profile: 1 per door + drawer (if opening_system is 'gola')
      if (config.opening_system === 'gola' && (doorCount + drawerCount) > 0) {
        partIndex++;
        const golaUnitPrice = 85;
        allProjectParts.push({
          project_id: projectId,
          project_module_id: projectModuleId,
          part_code: 'KC-HW-' + String(partIndex).padStart(4, '0'),
          part_name: 'Profil Gola (' + catModule.code + ')',
          material_type: 'hardware',
          thickness_mm: 0,
          width_mm: W,
          height_mm: 0,
          quantity: doorCount + drawerCount,
          unit_price: golaUnitPrice,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
          grain_direction: 'none',
          is_cut: false, is_edged: false, is_assembled: false,
          notes: 'Gola × ' + (doorCount + drawerCount) + ' @ ' + golaUnitPrice + ' MAD/ml',
        });
        hardwareCount += doorCount + drawerCount;
      }

      // Push-open: 1 per door + drawer (if opening_system is 'push_open')
      if (config.opening_system === 'push_open' && (doorCount + drawerCount) > 0) {
        partIndex++;
        const pushOpenPrice = 15;
        allProjectParts.push({
          project_id: projectId,
          project_module_id: projectModuleId,
          part_code: 'KC-HW-' + String(partIndex).padStart(4, '0'),
          part_name: 'Push-Open (' + catModule.code + ')',
          material_type: 'hardware',
          thickness_mm: 0,
          width_mm: 0,
          height_mm: 0,
          quantity: doorCount + drawerCount,
          unit_price: pushOpenPrice,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
          grain_direction: 'none',
          is_cut: false, is_edged: false, is_assembled: false,
          notes: 'Push-open × ' + (doorCount + drawerCount) + ' @ ' + pushOpenPrice + ' MAD',
        });
        hardwareCount += doorCount + drawerCount;
      }

      // Shelf supports: 4 per shelf
      if (shelfCount > 0) {
        partIndex++;
        allProjectParts.push({
          project_id: projectId,
          project_module_id: projectModuleId,
          part_code: 'KC-HW-' + String(partIndex).padStart(4, '0'),
          part_name: 'Support étagère (' + catModule.code + ')',
          material_type: 'hardware',
          thickness_mm: 0,
          width_mm: 0,
          height_mm: 0,
          quantity: shelfCount * 4,
          unit_price: hardwarePreset.shelf_support_unit_price,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
          grain_direction: 'none',
          is_cut: false, is_edged: false, is_assembled: false,
          notes: 'Support × ' + (shelfCount * 4) + ' @ ' + hardwarePreset.shelf_support_unit_price + ' MAD',
        });
        hardwareCount += shelfCount * 4;
      }
    }

    // ── 7. Normalize & Insert project_parts in batches ──
    if (allProjectParts.length === 0) return fail('No parts generated from kitchen modules.');

    // Ensure all objects have identical keys (PostgREST requires this for batch inserts)
    const normalizedParts = allProjectParts.map(p => ({
      project_id: p.project_id,
      project_module_id: p.project_module_id,
      part_code: p.part_code,
      part_name: p.part_name,
      material_type: p.material_type,
      thickness_mm: p.thickness_mm,
      width_mm: p.width_mm,
      height_mm: p.height_mm,
      quantity: p.quantity,
      unit_price: p.unit_price || 0,
      edge_top: p.edge_top,
      edge_bottom: p.edge_bottom,
      edge_left: p.edge_left,
      edge_right: p.edge_right,
      edge_length_mm: p.edge_length_mm || 0,
      grain_direction: p.grain_direction,
      is_cut: p.is_cut,
      is_edged: p.is_edged,
      is_assembled: p.is_assembled,
      notes: p.notes || null,
    }));

    console.log('[kitchen-engine] Inserting', normalizedParts.length, 'parts (' +
      normalizedParts.filter(p => p.material_type !== 'hardware').length + ' panels + ' +
      normalizedParts.filter(p => p.material_type === 'hardware').length + ' hardware)');

    for (let i = 0; i < normalizedParts.length; i += 200) {
      const batch = normalizedParts.slice(i, i + 200);
      const { error: pErr } = await supabase.from('project_parts').insert(batch);
      if (pErr) return fail('Parts insert failed: ' + pErr.message);
    }

    // ── 8. Mark project_modules as bom_generated ──
    await supabase.from('project_modules')
      .update({ bom_generated: true })
      .eq('project_id', projectId)
      .like('position_label', 'KC:%');

    // ── 9. Generate BOM via RPC ──
    const { error: bomErr } = await supabase.rpc('generate_project_bom', { p_project_id: projectId });
    if (bomErr) return fail('BOM generation failed: ' + bomErr.message);

    // ── 10. Calculate costs ──
    let costBreakdown: CostBreakdown | null = null;
    let quoteId: string | null = null;
    let quoteVersion: number | null = null;

    const costResult = await calculateAndStoreCosts(projectId, userId);
    if (costResult.success && costResult.data) {
      costBreakdown = costResult.data;

      // ── 11. Generate auto-quote ──
      const quoteResult = await generateAutoQuote(projectId, userId, costResult.data);
      if (quoteResult.success && quoteResult.data) {
        quoteId = quoteResult.data.id;
        quoteVersion = quoteResult.data.version;
      }
    }

    // ── 12. Update kitchen config status ──
    await supabase.from('kitchen_configurations')
      .update({ generation_status: 'generated', updated_at: new Date().toISOString() })
      .eq('project_id', projectId);

    return ok({
      parts_created: allProjectParts.length,
      hardware_items: hardwareCount,
      cost_breakdown: costBreakdown,
      quote_id: quoteId,
      quote_version: quoteVersion,
    });
  } catch (e: any) {
    return fail(e.message || 'Unknown error in kitchen generation');
  }
}
