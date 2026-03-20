// ============================================================
// Kitchen Filler Engine — ArtMood ERP
// Auto-detects gaps and suggests fillers
// ============================================================

import { FILLER_THRESHOLDS } from '@/lib/config/kitchen';
import type {
  KitchenWall,
  KitchenModuleInstance,
  FillerSuggestion,
} from '@/types/kitchen';

export function detectFillers(
  walls: KitchenWall[],
  modules: KitchenModuleInstance[]
): FillerSuggestion[] {
  const suggestions: FillerSuggestion[] = [];

  for (const wall of walls) {
    const wallModules = modules
      .filter(m => m.wall_id === wall.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const totalModulesWidth = wallModules.reduce((sum, m) => sum + m.width_mm, 0);
    const gap = wall.wall_length_mm - totalModulesWidth;

    if (gap === 0) {
      suggestions.push({
        wall_id: wall.id,
        wall_name: wall.wall_name,
        wall_length_mm: wall.wall_length_mm,
        total_modules_width: totalModulesWidth,
        gap_mm: 0,
        suggestion: 'ok',
        message: `Mur ${wall.wall_name}: parfaitement rempli`,
      });
    } else if (gap < 0) {
      suggestions.push({
        wall_id: wall.id,
        wall_name: wall.wall_name,
        wall_length_mm: wall.wall_length_mm,
        total_modules_width: totalModulesWidth,
        gap_mm: gap,
        suggestion: 'overflow',
        message: `Mur ${wall.wall_name}: dépassement de ${Math.abs(gap)}mm — réduire les modules`,
      });
    } else if (gap > 0 && gap < FILLER_THRESHOLDS.min_warning_mm) {
      suggestions.push({
        wall_id: wall.id,
        wall_name: wall.wall_name,
        wall_length_mm: wall.wall_length_mm,
        total_modules_width: totalModulesWidth,
        gap_mm: gap,
        suggestion: 'too_small',
        message: `Mur ${wall.wall_name}: écart de ${gap}mm — problème d'installation possible`,
      });
    } else if (gap > FILLER_THRESHOLDS.max_filler_mm) {
      suggestions.push({
        wall_id: wall.id,
        wall_name: wall.wall_name,
        wall_length_mm: wall.wall_length_mm,
        total_modules_width: totalModulesWidth,
        gap_mm: gap,
        suggestion: 'add_module',
        message: `Mur ${wall.wall_name}: ${gap}mm d'espace — envisager un module supplémentaire`,
      });
    } else {
      suggestions.push({
        wall_id: wall.id,
        wall_name: wall.wall_name,
        wall_length_mm: wall.wall_length_mm,
        total_modules_width: totalModulesWidth,
        gap_mm: gap,
        suggestion: 'filler_needed',
        message: `Mur ${wall.wall_name}: filler de ${gap}mm nécessaire`,
      });
    }
  }

  return suggestions;
}

/**
 * Create filler records split left/right.
 * Default: all gap on right side. User can adjust.
 */
export function createFillerSplit(
  wallId: string,
  gap: number,
  height: number,
  depth: number,
  leftPortion: number = 0 // 0 means all on right
): { left: number; right: number } {
  const left = Math.min(Math.max(0, leftPortion), gap);
  const right = gap - left;
  return { left, right };
}
