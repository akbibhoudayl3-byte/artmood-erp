// ============================================================
// Template Engine - Apply library templates with custom dimensions
// ============================================================

import type { ModuleLibrary } from '@/types/database';

export interface TemplateResult {
  module_name: string;
  module_type: string;
  width: number;
  height: number;
  depth: number;
  material: string;
  edge_band_type: string;
  has_back_panel: boolean;
  has_doors: boolean;
  door_count: number;
  has_drawers: boolean;
  drawer_count: number;
  has_shelves: boolean;
  shelf_count: number;
  notes: string;
}

/**
 * Apply a library template to create module form data.
 * Optionally override dimensions.
 */
export function applyTemplate(
  template: ModuleLibrary,
  overrides?: {
    width?: number;
    height?: number;
    depth?: number;
    material?: string;
    edge_band_type?: string;
  },
  locale: string = 'en'
): TemplateResult {
  // Pick localized name
  let name = template.name_en;
  if (locale === 'fr' && template.name_fr) name = template.name_fr;
  if ((locale === 'ar' || locale === 'darija') && template.name_ar) name = template.name_ar;

  return {
    module_name: name,
    module_type: template.module_type,
    width: overrides?.width ?? template.default_width,
    height: overrides?.height ?? template.default_height,
    depth: overrides?.depth ?? template.default_depth,
    material: overrides?.material ?? template.default_material,
    edge_band_type: overrides?.edge_band_type ?? template.default_edge_band,
    has_back_panel: template.has_back_panel,
    has_doors: template.has_doors,
    door_count: template.default_door_count,
    has_drawers: template.has_drawers,
    drawer_count: template.default_drawer_count,
    has_shelves: template.has_shelves,
    shelf_count: template.default_shelf_count,
    notes: '',
  };
}

/**
 * Get localized template name
 */
export function getTemplateName(template: ModuleLibrary, locale: string): string {
  if (locale === 'fr' && template.name_fr) return template.name_fr;
  if ((locale === 'ar' || locale === 'darija') && template.name_ar) return template.name_ar;
  return template.name_en;
}
