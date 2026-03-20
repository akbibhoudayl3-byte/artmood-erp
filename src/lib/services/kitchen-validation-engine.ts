// ============================================================
// Kitchen Validation Engine — ArtMood ERP
// Pre-quote validation: width, layout, technical, compatibility
// ============================================================

import type {
  KitchenProject,
  KitchenWall,
  KitchenModuleInstance,
  ProductModule,
  ValidationIssue,
  ValidationResult,
} from '@/types/kitchen';

interface ModuleWithProduct {
  instance: KitchenModuleInstance;
  module: ProductModule;
}

export function validateKitchen(
  kitchen: KitchenProject,
  walls: KitchenWall[],
  modulesWithProducts: ModuleWithProduct[]
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ── 1. WIDTH CHECK ──
  for (const wall of walls) {
    const wallModules = modulesWithProducts.filter(m => m.instance.wall_id === wall.id);
    const total = wallModules.reduce((s, m) => s + m.instance.width_mm, 0);
    const diff = total - wall.wall_length_mm;

    if (diff > 0) {
      issues.push({
        severity: 'red',
        category: 'width',
        message: `Mur ${wall.wall_name}: modules dépassent de ${diff}mm`,
        wall_id: wall.id,
      });
    } else if (diff < 0 && Math.abs(diff) < 50 && Math.abs(diff) > 0) {
      issues.push({
        severity: 'orange',
        category: 'width',
        message: `Mur ${wall.wall_name}: écart de ${Math.abs(diff)}mm — installer un filler`,
        wall_id: wall.id,
      });
    }
  }

  // ── 2. LAYOUT CHECK ──
  const wallCount = walls.length;
  if (kitchen.layout_type === 'I' && wallCount !== 1) {
    issues.push({
      severity: 'orange',
      category: 'layout',
      message: `Plan en I: un seul mur attendu, ${wallCount} défini(s)`,
    });
  }
  if (kitchen.layout_type === 'L' && wallCount !== 2) {
    issues.push({
      severity: 'orange',
      category: 'layout',
      message: `Plan en L: 2 murs attendus, ${wallCount} défini(s)`,
    });
  }
  if (kitchen.layout_type === 'U' && wallCount !== 3) {
    issues.push({
      severity: 'orange',
      category: 'layout',
      message: `Plan en U: 3 murs attendus, ${wallCount} défini(s)`,
    });
  }

  // Corner modules for L/U
  if ((kitchen.layout_type === 'L' || kitchen.layout_type === 'U')) {
    const hasCorner = modulesWithProducts.some(m => m.module.type === 'corner');
    if (!hasCorner) {
      issues.push({
        severity: 'orange',
        category: 'layout',
        message: `Plan en ${kitchen.layout_type}: module d'angle recommandé`,
      });
    }
  }

  // ── 3. TECHNICAL CHECK ──
  const hasSinkModule = modulesWithProducts.some(m => m.module.type === 'sink');
  const hasHotteModule = modulesWithProducts.some(m => m.module.type === 'hotte');

  // Kitchen should have at least one sink
  if (!hasSinkModule) {
    issues.push({
      severity: 'orange',
      category: 'technical',
      message: `Aucun module évier détecté`,
    });
  }

  // Tall modules height check
  for (const m of modulesWithProducts) {
    if (m.module.type === 'tall' && m.instance.height_mm < 2000) {
      issues.push({
        severity: 'orange',
        category: 'technical',
        message: `Colonne ${m.module.label}: hauteur ${m.instance.height_mm}mm semble faible`,
        module_instance_id: m.instance.id,
      });
    }
  }

  // Full height mode: check top closure
  if (kitchen.full_height) {
    const hasWall = modulesWithProducts.some(m => m.module.type === 'wall');
    if (!hasWall) {
      issues.push({
        severity: 'orange',
        category: 'technical',
        message: `Mode pleine hauteur: modules hauts nécessaires pour fermer le dessus`,
      });
    }
  }

  // ── 4. COMPATIBILITY CHECK ──
  // No modules at all
  if (modulesWithProducts.length === 0) {
    issues.push({
      severity: 'red',
      category: 'compatibility',
      message: `Aucun module placé`,
    });
  }

  // Check for walls with no modules
  for (const wall of walls) {
    const wallMods = modulesWithProducts.filter(m => m.instance.wall_id === wall.id);
    if (wallMods.length === 0) {
      issues.push({
        severity: 'red',
        category: 'compatibility',
        message: `Mur ${wall.wall_name}: aucun module placé`,
        wall_id: wall.id,
      });
    }
  }

  // Determine overall severity
  const hasRed = issues.some(i => i.severity === 'red');
  const hasOrange = issues.some(i => i.severity === 'orange');
  const overall = hasRed ? 'red' : hasOrange ? 'orange' : 'green';

  return {
    overall,
    issues,
    can_generate_quote: !hasRed,
  };
}
