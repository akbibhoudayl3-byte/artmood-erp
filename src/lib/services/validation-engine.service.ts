/**
 * ARTMOOD — Validation Engine Service
 *
 * Validates project parts before nesting / production.
 * Loads thresholds dynamically from pricing_rules + nesting_config tables.
 * Error messages are in French (company language).
 *
 * Deploy to: src/lib/services/validation-engine.service.ts
 */

import { createClient } from '@/lib/supabase/client';

// ── Re-use shared service types ─────────────────────────────────────────────

export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[validation-engine]', error);
  return { success: false, error };
}

// ── Exported Types ──────────────────────────────────────────────────────────

export interface ValidationError {
  part_id: string;
  part_name: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  project_id: string;
  is_valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: ValidationSummary;
  validated_at: string;
}

export interface ValidationSummary {
  total_parts: number;
  total_qty: number;
  total_area_m2: number;
  materials_used: MaterialBreakdown[];
  all_valid: boolean;
}

export interface MaterialBreakdown {
  material_type: string;
  material_name: string;
  part_count: number;
  total_qty: number;
  total_area_m2: number;
}

// ── Internal helpers ────────────────────────────────────────────────────────

interface ValidationThresholds {
  min_part_width_mm: number;
  min_part_height_mm: number;
  max_part_width_mm: number;
  max_part_height_mm: number;
  require_grain_explicit: boolean;
  require_edge_explicit: boolean;
  blade_kerf_mm: number;
  trim_mm: number;
}

/** Sensible factory defaults — used only when DB rows are missing. */
const DEFAULTS: ValidationThresholds = {
  min_part_width_mm: 50,
  min_part_height_mm: 50,
  max_part_width_mm: 2750, // typical 2800 sheet - 2×25mm trim
  max_part_height_mm: 2050, // typical 2070 sheet - 2×10mm trim
  require_grain_explicit: false,
  require_edge_explicit: false,
  blade_kerf_mm: 4,
  trim_mm: 10,
};

function supabase() {
  return createClient();
}

/**
 * Loads validation thresholds from pricing_rules (category = 'validation')
 * and nesting_config tables. Falls back to DEFAULTS for any missing key.
 */
async function loadThresholds(): Promise<ValidationThresholds> {
  const sb = supabase();
  const thresholds: ValidationThresholds = { ...DEFAULTS };

  // --- pricing_rules (validation category) ---
  const { data: rules } = await sb
    .from('pricing_rules')
    .select('rule_key, rule_value')
    .in('rule_key', [
      'min_part_width_mm',
      'min_part_height_mm',
      'max_part_width_mm',
      'max_part_height_mm',
      'require_grain_explicit',
      'require_edge_explicit',
    ]);

  if (rules) {
    for (const r of rules) {
      const v = r.rule_value;
      switch (r.rule_key) {
        case 'min_part_width_mm':
          thresholds.min_part_width_mm = Number(v) || DEFAULTS.min_part_width_mm;
          break;
        case 'min_part_height_mm':
          thresholds.min_part_height_mm = Number(v) || DEFAULTS.min_part_height_mm;
          break;
        case 'max_part_width_mm':
          thresholds.max_part_width_mm = Number(v) || DEFAULTS.max_part_width_mm;
          break;
        case 'max_part_height_mm':
          thresholds.max_part_height_mm = Number(v) || DEFAULTS.max_part_height_mm;
          break;
        case 'require_grain_explicit':
          thresholds.require_grain_explicit = v === '1' || v === 'true';
          break;
        case 'require_edge_explicit':
          thresholds.require_edge_explicit = v === '1' || v === 'true';
          break;
      }
    }
  }

  // --- nesting_config ---
  const { data: nestCfg } = await sb
    .from('nesting_config')
    .select('config_key, config_value')
    .in('config_key', ['blade_kerf_mm', 'trim_mm']);

  if (nestCfg) {
    for (const c of nestCfg) {
      switch (c.config_key) {
        case 'blade_kerf_mm':
          thresholds.blade_kerf_mm = Number(c.config_value) || DEFAULTS.blade_kerf_mm;
          break;
        case 'trim_mm':
          thresholds.trim_mm = Number(c.config_value) || DEFAULTS.trim_mm;
          break;
      }
    }
  }

  return thresholds;
}

/**
 * Fetches the set of valid material codes from the materials table.
 * Returns a Map of code -> name for quick lookup.
 */
async function loadMaterialCatalog(): Promise<Map<string, string>> {
  const { data } = await supabase()
    .from('materials')
    .select('code, name');

  const catalog = new Map<string, string>();
  if (data) {
    for (const m of data) {
      catalog.set(m.code, m.name);
    }
  }
  return catalog;
}

// ── Part row shape from DB ──────────────────────────────────────────────────

interface PartRow {
  id: string;
  part_name: string | null;
  material_type: string | null;
  width_mm: number | null;
  height_mm: number | null;
  quantity: number | null;
  grain_direction: string | null;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  project_module_id: string | null;
}

// ── Per-module-category dimension limits ────────────────────────────────────
// These override the global thresholds when a part belongs to a known module.
// Heights/widths are the maximum physically possible for that cabinet type,
// accounting for sheet dimensions + factory capability.

interface CategoryLimits {
  max_width_mm: number;
  max_height_mm: number;
}

const MODULE_CATEGORY_LIMITS: Record<string, CategoryLimits> = {
  base_cabinet:  { max_width_mm: 1200, max_height_mm: 900  },
  wall_cabinet:  { max_width_mm: 1200, max_height_mm: 1200 },
  tall_cabinet:  { max_width_mm: 1200, max_height_mm: 2400 },
  wardrobe:      { max_width_mm: 1200, max_height_mm: 2400 },
  drawer_unit:   { max_width_mm: 1200, max_height_mm: 900  },
};

/**
 * Infer module category from part name when project_module_id is NULL.
 * Orphan parts (imported manually, legacy BOM) have naming conventions:
 *   COL_*        → tall_cabinet
 *   B600_*, B800_*, BASE_* → base_cabinet
 *   H_*, HAUT_*, WALL_*   → wall_cabinet
 *   DRESS_*, WARD_*       → wardrobe
 */
function inferCategoryFromPartName(name: string | null): string | null {
  if (!name) return null;
  const upper = name.toUpperCase();
  if (upper.startsWith('COL'))                                return 'tall_cabinet';
  if (upper.startsWith('PANTRY') || upper.startsWith('TALL')) return 'tall_cabinet';
  if (/^B\d/.test(upper) || upper.startsWith('BASE'))        return 'base_cabinet';
  if (upper.startsWith('H_') || upper.startsWith('HAUT') || upper.startsWith('WALL')) return 'wall_cabinet';
  if (upper.startsWith('DRESS') || upper.startsWith('WARD')) return 'wardrobe';
  if (upper.includes('COLONNE'))                              return 'tall_cabinet';
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Validate every part in `project_parts` for a given project.
 */
export async function validateProjectParts(
  projectId: string,
): Promise<ServiceResult<ValidationResult>> {
  if (!projectId) return fail('ID du projet manquant.');

  const sb = supabase();

  // Parallel fetch: parts, thresholds, material catalog, module categories
  const [partsRes, thresholds, catalog, moduleCatsRes] = await Promise.all([
    sb
      .from('project_parts')
      .select('id, part_name, material_type, width_mm, height_mm, quantity, grain_direction, edge_top, edge_bottom, edge_left, edge_right, project_module_id')
      .eq('project_id', projectId),
    loadThresholds(),
    loadMaterialCatalog(),
    // Resolve module category for each project_module → module.category
    sb
      .from('project_modules')
      .select('id, module:module_id(category)')
      .eq('project_id', projectId),
  ]);

  // Build lookup: project_module_id → module category
  const moduleCategoryMap = new Map<string, string>();
  if (moduleCatsRes.data) {
    for (const pm of moduleCatsRes.data) {
      const cat = (pm.module as any)?.category;
      if (cat) moduleCategoryMap.set(pm.id, cat);
    }
  }

  if (partsRes.error) {
    return fail(`Erreur lors du chargement des pièces : ${partsRes.error.message}`);
  }

  const parts: PartRow[] = partsRes.data ?? [];

  if (parts.length === 0) {
    return fail('Aucune pièce trouvée pour ce projet.');
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Per-material accumulators for summary
  const matMap = new Map<
    string,
    { name: string; partCount: number; totalQty: number; totalArea: number }
  >();

  let totalQty = 0;
  let totalArea = 0;

  for (const part of parts) {
    const label = part.part_name || part.id;
    const qty = part.quantity ?? 0;

    // ── material_type ──
    if (!part.material_type) {
      errors.push({
        part_id: part.id,
        part_name: label,
        field: 'material_type',
        message: 'Type de matériau non défini.',
        severity: 'error',
      });
    } else if (!catalog.has(part.material_type)) {
      errors.push({
        part_id: part.id,
        part_name: label,
        field: 'material_type',
        message: `Matériau « ${part.material_type} » introuvable dans le catalogue.`,
        severity: 'error',
      });
    }

    // ── Resolve per-module-category dimension limits ──
    // Priority: module FK → name-based inference → global fallback.
    const fkCategory = part.project_module_id
      ? moduleCategoryMap.get(part.project_module_id) ?? null
      : null;
    const partCategory = fkCategory ?? inferCategoryFromPartName(part.part_name);
    const catLimits = partCategory ? MODULE_CATEGORY_LIMITS[partCategory] : null;
    const effectiveMaxWidth  = catLimits?.max_width_mm  ?? thresholds.max_part_width_mm;
    const effectiveMaxHeight = catLimits?.max_height_mm ?? thresholds.max_part_height_mm;

    // ── width_mm ──
    if (part.width_mm == null || part.width_mm <= 0) {
      errors.push({
        part_id: part.id,
        part_name: label,
        field: 'width_mm',
        message: 'Largeur invalide (doit être > 0).',
        severity: 'error',
      });
    } else {
      if (part.width_mm < thresholds.min_part_width_mm) {
        warnings.push({
          part_id: part.id,
          part_name: label,
          field: 'width_mm',
          message: `Largeur ${part.width_mm} mm inférieure au minimum (${thresholds.min_part_width_mm} mm).`,
          severity: 'warning',
        });
      }
      if (part.width_mm > effectiveMaxWidth) {
        errors.push({
          part_id: part.id,
          part_name: label,
          field: 'width_mm',
          message: `Largeur ${part.width_mm} mm dépasse le max${partCategory ? ` (${partCategory}: ${effectiveMaxWidth} mm)` : ` (${effectiveMaxWidth} mm)`}.`,
          severity: 'error',
        });
      }
    }

    // ── height_mm ──
    if (part.height_mm == null || part.height_mm <= 0) {
      errors.push({
        part_id: part.id,
        part_name: label,
        field: 'height_mm',
        message: 'Hauteur invalide (doit être > 0).',
        severity: 'error',
      });
    } else {
      if (part.height_mm < thresholds.min_part_height_mm) {
        warnings.push({
          part_id: part.id,
          part_name: label,
          field: 'height_mm',
          message: `Hauteur ${part.height_mm} mm inférieure au minimum (${thresholds.min_part_height_mm} mm).`,
          severity: 'warning',
        });
      }
      if (part.height_mm > effectiveMaxHeight) {
        errors.push({
          part_id: part.id,
          part_name: label,
          field: 'height_mm',
          message: `Hauteur ${part.height_mm} mm dépasse le max${partCategory ? ` (${partCategory}: ${effectiveMaxHeight} mm)` : ` (${effectiveMaxHeight} mm)`}.`,
          severity: 'error',
        });
      }
    }

    // ── quantity ──
    if (qty <= 0) {
      errors.push({
        part_id: part.id,
        part_name: label,
        field: 'quantity',
        message: 'Quantité invalide (doit être > 0).',
        severity: 'error',
      });
    }

    // ── grain_direction (conditional) ──
    if (thresholds.require_grain_explicit && !part.grain_direction) {
      errors.push({
        part_id: part.id,
        part_name: label,
        field: 'grain_direction',
        message: 'Sens du fil non spécifié (obligatoire).',
        severity: 'error',
      });
    }

    // ── edge banding (conditional) ──
    if (thresholds.require_edge_explicit) {
      const edgeFields: Array<{ key: keyof PartRow; label: string }> = [
        { key: 'edge_top', label: 'Chant haut' },
        { key: 'edge_bottom', label: 'Chant bas' },
        { key: 'edge_left', label: 'Chant gauche' },
        { key: 'edge_right', label: 'Chant droit' },
      ];
      for (const ef of edgeFields) {
        if (!part[ef.key]) {
          errors.push({
            part_id: part.id,
            part_name: label,
            field: ef.key,
            message: `${ef.label} non spécifié (obligatoire).`,
            severity: 'error',
          });
        }
      }
    }

    // ── Accumulate summary ──
    const w = part.width_mm ?? 0;
    const h = part.height_mm ?? 0;
    const area = (w * h * qty) / 1_000_000; // mm^2 -> m^2
    totalQty += qty;
    totalArea += area;

    if (part.material_type) {
      const existing = matMap.get(part.material_type);
      if (existing) {
        existing.partCount += 1;
        existing.totalQty += qty;
        existing.totalArea += area;
      } else {
        matMap.set(part.material_type, {
          name: catalog.get(part.material_type) ?? part.material_type,
          partCount: 1,
          totalQty: qty,
          totalArea: area,
        });
      }
    }
  }

  // Build material breakdown
  const materialsUsed: MaterialBreakdown[] = [];
  for (const [code, acc] of matMap) {
    materialsUsed.push({
      material_type: code,
      material_name: acc.name,
      part_count: acc.partCount,
      total_qty: acc.totalQty,
      total_area_m2: Math.round(acc.totalArea * 1000) / 1000,
    });
  }

  const allValid = errors.length === 0;

  const summary: ValidationSummary = {
    total_parts: parts.length,
    total_qty: totalQty,
    total_area_m2: Math.round(totalArea * 1000) / 1000,
    materials_used: materialsUsed,
    all_valid: allValid,
  };

  const result: ValidationResult = {
    project_id: projectId,
    is_valid: allValid,
    errors,
    warnings,
    summary,
    validated_at: new Date().toISOString(),
  };

  return ok(result);
}

/**
 * Lightweight summary of project parts — no per-part validation errors,
 * just counts, areas, and material breakdown.
 */
export async function getValidationSummary(
  projectId: string,
): Promise<ServiceResult<ValidationSummary>> {
  if (!projectId) return fail('ID du projet manquant.');

  const sb = supabase();

  const [partsRes, catalog] = await Promise.all([
    sb
      .from('project_parts')
      .select('id, part_name, material_type, width_mm, height_mm, quantity')
      .eq('project_id', projectId),
    loadMaterialCatalog(),
  ]);

  if (partsRes.error) {
    return fail(`Erreur lors du chargement des pièces : ${partsRes.error.message}`);
  }

  const parts = partsRes.data ?? [];

  if (parts.length === 0) {
    return fail('Aucune pièce trouvée pour ce projet.');
  }

  let totalQty = 0;
  let totalArea = 0;
  let hasInvalid = false;

  const matMap = new Map<
    string,
    { name: string; partCount: number; totalQty: number; totalArea: number }
  >();

  for (const part of parts) {
    const qty = part.quantity ?? 0;
    const w = part.width_mm ?? 0;
    const h = part.height_mm ?? 0;
    const area = (w * h * qty) / 1_000_000;

    totalQty += qty;
    totalArea += area;

    // Quick validity check (no detailed errors needed)
    if (!part.material_type || w <= 0 || h <= 0 || qty <= 0) {
      hasInvalid = true;
    }

    if (part.material_type) {
      const existing = matMap.get(part.material_type);
      if (existing) {
        existing.partCount += 1;
        existing.totalQty += qty;
        existing.totalArea += area;
      } else {
        matMap.set(part.material_type, {
          name: catalog.get(part.material_type) ?? part.material_type,
          partCount: 1,
          totalQty: qty,
          totalArea: area,
        });
      }
    }
  }

  const materialsUsed: MaterialBreakdown[] = [];
  for (const [code, acc] of matMap) {
    materialsUsed.push({
      material_type: code,
      material_name: acc.name,
      part_count: acc.partCount,
      total_qty: acc.totalQty,
      total_area_m2: Math.round(acc.totalArea * 1000) / 1000,
    });
  }

  const summary: ValidationSummary = {
    total_parts: parts.length,
    total_qty: totalQty,
    total_area_m2: Math.round(totalArea * 1000) / 1000,
    materials_used: materialsUsed,
    all_valid: !hasInvalid,
  };

  return ok(summary);
}
