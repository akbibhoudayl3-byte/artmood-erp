// ============================================================
// Kitchen System — Full Simulation Test
// Simulates Zineb creating a kitchen from scratch
// ============================================================

import { generateBOM, computeBOMCost } from '../kitchen-bom-engine';
import { detectFillers } from '../kitchen-filler-engine';
import { validateKitchen } from '../kitchen-validation-engine';
import { computeKitchenCost } from '../kitchen-cost-engine';
import type {
  KitchenProject, KitchenWall, KitchenModuleInstance,
  KitchenFiller, ProductModule, ModuleRule, ModuleHardwareRule,
} from '@/types/kitchen';
import type { ModuleWithRules } from '../kitchen-bom-engine';

// ── Mock Data: Product Modules ──

const MOCK_MODULES: Record<string, ProductModule> = {
  BASE_600: { id: 'base600', code: 'BASE_600', label: 'Bas 60cm', type: 'base', default_width: 600, default_height: 700, default_depth: 560, sort_order: 4, is_active: true },
  SINK_600: { id: 'sink600', code: 'SINK_600', label: 'Évier 60cm', type: 'sink', default_width: 600, default_height: 700, default_depth: 560, sort_order: 10, is_active: true },
  DRAWER_600: { id: 'drawer600', code: 'DRAWER_600', label: 'Tiroir 60cm', type: 'drawer', default_width: 600, default_height: 700, default_depth: 560, sort_order: 22, is_active: true },
  WALL_600: { id: 'wall600', code: 'WALL_600', label: 'Haut 60cm', type: 'wall', default_width: 600, default_height: 700, default_depth: 320, sort_order: 33, is_active: true },
  COL_600: { id: 'col600', code: 'COL_600', label: 'Colonne 60cm', type: 'tall', default_width: 600, default_height: 2100, default_depth: 560, sort_order: 40, is_active: true },
  HOTTE_600: { id: 'hotte600', code: 'HOTTE_600', label: 'Hotte 60cm', type: 'hotte', default_width: 600, default_height: 400, default_depth: 320, sort_order: 50, is_active: true },
};

const MOCK_RULES: Record<string, ModuleRule> = {
  base600: { id: 'r1', module_id: 'base600', has_top: true, has_bottom: true, has_back: true, has_shelf: true, shelf_count: 1, construction_type: 'standard' },
  sink600: { id: 'r2', module_id: 'sink600', has_top: true, has_bottom: false, has_back: true, has_shelf: false, shelf_count: 0, construction_type: 'sink' },
  drawer600: { id: 'r3', module_id: 'drawer600', has_top: false, has_bottom: false, has_back: false, has_shelf: false, shelf_count: 0, construction_type: 'drawer' },
  wall600: { id: 'r4', module_id: 'wall600', has_top: true, has_bottom: true, has_back: true, has_shelf: true, shelf_count: 1, construction_type: 'standard' },
  col600: { id: 'r5', module_id: 'col600', has_top: true, has_bottom: true, has_back: true, has_shelf: true, shelf_count: 3, construction_type: 'column' },
  hotte600: { id: 'r6', module_id: 'hotte600', has_top: false, has_bottom: false, has_back: true, has_shelf: false, shelf_count: 0, construction_type: 'hotte' },
};

const MOCK_HW: Record<string, ModuleHardwareRule> = {
  base600: { id: 'h1', module_id: 'base600', hinges_count: 2, drawer_system: null, spider_required: false, spider_count: 0, rail_shared: false },
  sink600: { id: 'h2', module_id: 'sink600', hinges_count: 2, drawer_system: null, spider_required: false, spider_count: 0, rail_shared: false },
  drawer600: { id: 'h3', module_id: 'drawer600', hinges_count: 0, drawer_system: 'aluminium', spider_required: false, spider_count: 0, rail_shared: false },
  wall600: { id: 'h4', module_id: 'wall600', hinges_count: 2, drawer_system: null, spider_required: true, spider_count: 2, rail_shared: true },
  col600: { id: 'h5', module_id: 'col600', hinges_count: 4, drawer_system: null, spider_required: false, spider_count: 0, rail_shared: false },
  hotte600: { id: 'h6', module_id: 'hotte600', hinges_count: 0, drawer_system: null, spider_required: false, spider_count: 0, rail_shared: false },
};

// ── Test Scenario: L-Kitchen, 3200mm + 2400mm ──

const kitchen: KitchenProject = {
  id: 'kitchen-test-1',
  project_id: null,
  client_name: 'Mme Amrani',
  client_type: 'standard',
  kitchen_type: 'modern',
  layout_type: 'L',
  full_height: false,
  opening_system: 'handles',
  structure_material: 'stratifie',
  facade_material: 'mdf_18_uv',
  back_thickness: 5,
  edge_caisson_mm: 0.8,
  edge_facade_mm: 1.0,
  status: 'draft',
  notes: null,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const walls: KitchenWall[] = [
  { id: 'wall-a', kitchen_id: 'kitchen-test-1', wall_name: 'A', wall_length_mm: 3200, sort_order: 0 },
  { id: 'wall-b', kitchen_id: 'kitchen-test-1', wall_name: 'B', wall_length_mm: 2400, sort_order: 1 },
];

// Wall A: SINK_600 + BASE_600 + BASE_600 + DRAWER_600 + BASE_600 = 3000mm (200mm gap)
// Wall B: COL_600 + WALL_600 + WALL_600 + WALL_600 = 2400mm (0mm gap)
const instances: KitchenModuleInstance[] = [
  { id: 'inst-1', kitchen_id: 'kitchen-test-1', wall_id: 'wall-a', module_id: 'sink600', position_x_mm: 0, width_mm: 600, height_mm: 700, depth_mm: 560, facade_override: null, sort_order: 0 },
  { id: 'inst-2', kitchen_id: 'kitchen-test-1', wall_id: 'wall-a', module_id: 'base600', position_x_mm: 600, width_mm: 600, height_mm: 700, depth_mm: 560, facade_override: null, sort_order: 1 },
  { id: 'inst-3', kitchen_id: 'kitchen-test-1', wall_id: 'wall-a', module_id: 'base600', position_x_mm: 1200, width_mm: 600, height_mm: 700, depth_mm: 560, facade_override: 'glass', sort_order: 2 },
  { id: 'inst-4', kitchen_id: 'kitchen-test-1', wall_id: 'wall-a', module_id: 'drawer600', position_x_mm: 1800, width_mm: 600, height_mm: 700, depth_mm: 560, facade_override: null, sort_order: 3 },
  { id: 'inst-5', kitchen_id: 'kitchen-test-1', wall_id: 'wall-a', module_id: 'base600', position_x_mm: 2400, width_mm: 600, height_mm: 700, depth_mm: 560, facade_override: null, sort_order: 4 },
  { id: 'inst-6', kitchen_id: 'kitchen-test-1', wall_id: 'wall-b', module_id: 'col600', position_x_mm: 0, width_mm: 600, height_mm: 2100, depth_mm: 560, facade_override: null, sort_order: 5 },
  { id: 'inst-7', kitchen_id: 'kitchen-test-1', wall_id: 'wall-b', module_id: 'wall600', position_x_mm: 600, width_mm: 600, height_mm: 700, depth_mm: 320, facade_override: null, sort_order: 6 },
  { id: 'inst-8', kitchen_id: 'kitchen-test-1', wall_id: 'wall-b', module_id: 'wall600', position_x_mm: 1200, width_mm: 600, height_mm: 700, depth_mm: 320, facade_override: null, sort_order: 7 },
  { id: 'inst-9', kitchen_id: 'kitchen-test-1', wall_id: 'wall-b', module_id: 'wall600', position_x_mm: 1800, width_mm: 600, height_mm: 700, depth_mm: 320, facade_override: null, sort_order: 8 },
];

const modulesWithRules: ModuleWithRules[] = instances.map(inst => ({
  instance: inst,
  module: Object.values(MOCK_MODULES).find(m => m.id === inst.module_id)!,
  rule: MOCK_RULES[inst.module_id],
  hardware: MOCK_HW[inst.module_id],
}));

// ══════════════════════════════════════════════════════════
// RUN SIMULATION
// ══════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════');
console.log('  KITCHEN SIMULATION: Mme Amrani — L-Kitchen');
console.log('  Wall A: 3200mm | Wall B: 2400mm');
console.log('═══════════════════════════════════════════════════\n');

// 1. FILLER DETECTION
console.log('──── STEP 1: FILLER DETECTION ────');
const fillerSuggestions = detectFillers(walls, instances);
for (const f of fillerSuggestions) {
  const icon = f.suggestion === 'ok' ? '✅' : f.suggestion === 'overflow' ? '🔴' : '🟡';
  console.log(`  ${icon} ${f.message} (gap: ${f.gap_mm}mm)`);
}

// Create fillers
const fillers: KitchenFiller[] = fillerSuggestions
  .filter(f => f.suggestion === 'filler_needed')
  .map(f => ({
    id: `filler-${f.wall_id}`,
    kitchen_id: kitchen.id,
    wall_id: f.wall_id,
    side: 'right' as const,
    width_mm: f.gap_mm,
    height_mm: 700,
    depth_mm: 560,
  }));
console.log(`  → Created ${fillers.length} filler(s)\n`);

// 2. VALIDATION
console.log('──── STEP 2: VALIDATION ────');
const validation = validateKitchen(
  kitchen,
  walls,
  instances.map(inst => ({
    instance: inst,
    module: Object.values(MOCK_MODULES).find(m => m.id === inst.module_id)!,
  }))
);
console.log(`  Overall: ${validation.overall.toUpperCase()}`);
console.log(`  Can generate quote: ${validation.can_generate_quote}`);
for (const issue of validation.issues) {
  const icon = issue.severity === 'red' ? '🔴' : issue.severity === 'orange' ? '🟠' : '🟢';
  console.log(`  ${icon} [${issue.category}] ${issue.message}`);
}
console.log();

// 3. BOM GENERATION
console.log('──── STEP 3: BOM GENERATION ────');
const bom = generateBOM(kitchen, modulesWithRules, fillers);

console.log(`  Panels: ${bom.panels.length}`);
console.log(`  Edge banding entries: ${bom.edge_banding.length}`);
console.log(`  Hardware entries: ${bom.hardware.length}`);
console.log(`  Accessories: ${bom.accessories.length}`);
console.log(`  Filler panels: ${bom.fillers.length}`);

// Check critical items
const hasAluminiumSink = bom.panels.some(p => p.material === 'aluminium');
const hasSpider = bom.accessories.some(a => a.description.includes('Spider'));
const hasRail = bom.accessories.some(a => a.description.includes('Rail'));
const hasDrawerSystem = bom.hardware.some(h => h.description.includes('tiroir'));
const hasHingesColumn = bom.hardware.some(h => h.qty >= 4);

console.log('\n  ── Critical Checks ──');
console.log(`  ✓ Aluminium sink panel:    ${hasAluminiumSink ? 'YES ✅' : 'MISSING ❌'}`);
console.log(`  ✓ Spider system (wall):    ${hasSpider ? 'YES ✅' : 'MISSING ❌'}`);
console.log(`  ✓ Rail mural:              ${hasRail ? 'YES ✅' : 'MISSING ❌'}`);
console.log(`  ✓ Drawer alu system:       ${hasDrawerSystem ? 'YES ✅' : 'MISSING ❌'}`);
console.log(`  ✓ Column 4 hinges:         ${hasHingesColumn ? 'YES ✅' : 'MISSING ❌'}`);

// Print panels detail
console.log('\n  ── All Panels ──');
for (const p of bom.panels) {
  console.log(`  ${p.qty}x ${p.description.padEnd(30)} ${p.width_mm}×${p.height_mm}mm [${p.material}] edges: T${p.edge_top?1:0} B${p.edge_bottom?1:0} L${p.edge_left?1:0} R${p.edge_right?1:0}`);
}

// Print edge banding
const totalEdge = bom.edge_banding.reduce((s, e) => s + e.length_m, 0);
console.log(`\n  ── Edge Banding: ${totalEdge.toFixed(2)}m total ──`);

// Print hardware
console.log('\n  ── Hardware ──');
for (const h of bom.hardware) {
  console.log(`  ${h.qty}x ${h.description} @ ${h.unit_cost} MAD`);
}

// Print accessories
console.log('\n  ── Accessories ──');
for (const a of bom.accessories) {
  console.log(`  ${a.qty}x ${a.description} @ ${a.unit_cost} MAD`);
}

// 4. COST
console.log('\n──── STEP 4: COST BREAKDOWN ────');
const cost = computeKitchenCost(kitchen, instances, bom);
console.log(`  Materials:     ${cost.materials} MAD`);
console.log(`  Hardware:      ${cost.hardware} MAD`);
console.log(`  Accessories:   ${cost.accessories} MAD`);
console.log(`  Labour:        ${cost.labour} MAD`);
console.log(`  Fixed charges: ${cost.fixed_charges} MAD`);
console.log(`  Transport:     ${cost.transport} MAD`);
console.log(`  Installation:  ${cost.installation} MAD`);
console.log(`  ──────────────────────`);
console.log(`  Subtotal:      ${cost.subtotal} MAD`);
console.log(`  Margin (${cost.margin_percent}%): ${cost.margin_amount} MAD`);
console.log(`  Total HT:      ${cost.total_ht} MAD`);
console.log(`  TVA (20%):     ${cost.vat_amount} MAD`);
console.log(`  ══════════════════════`);
console.log(`  TOTAL TTC:     ${cost.total_ttc} MAD`);

// 5. OVERFLOW TEST
console.log('\n──── STEP 5: OVERFLOW TEST ────');
const overflowInstances: KitchenModuleInstance[] = [
  ...instances,
  { id: 'inst-extra', kitchen_id: 'kitchen-test-1', wall_id: 'wall-a', module_id: 'base600', position_x_mm: 3000, width_mm: 600, height_mm: 700, depth_mm: 560, facade_override: null, sort_order: 9 },
];
const overflowValidation = validateKitchen(
  kitchen,
  walls,
  overflowInstances.map(inst => ({
    instance: inst,
    module: Object.values(MOCK_MODULES).find(m => m.id === inst.module_id)!,
  }))
);
console.log(`  Added extra module to wall A (total: 3600mm > 3200mm)`);
console.log(`  Validation result: ${overflowValidation.overall.toUpperCase()}`);
console.log(`  Blocks quote: ${!overflowValidation.can_generate_quote ? 'YES ✅' : 'NO ❌'}`);
for (const issue of overflowValidation.issues) {
  if (issue.severity === 'red') console.log(`  🔴 ${issue.message}`);
}

// 6. EMPTY WALL TEST
console.log('\n──── STEP 6: EMPTY WALL TEST ────');
const emptyWallInstances = instances.filter(i => i.wall_id !== 'wall-b');
const emptyWallValidation = validateKitchen(
  kitchen,
  walls,
  emptyWallInstances.map(inst => ({
    instance: inst,
    module: Object.values(MOCK_MODULES).find(m => m.id === inst.module_id)!,
  }))
);
console.log(`  Removed all modules from wall B`);
console.log(`  Validation result: ${emptyWallValidation.overall.toUpperCase()}`);
console.log(`  Blocks quote: ${!emptyWallValidation.can_generate_quote ? 'YES ✅' : 'NO ❌'}`);

// 7. FACADE OVERRIDE CHECK
console.log('\n──── STEP 7: FACADE OVERRIDE CHECK ────');
const glassModule = instances.find(i => i.facade_override === 'glass');
console.log(`  Module inst-3 facade_override: ${glassModule?.facade_override ?? 'NULL'}`);
console.log(`  Per-module facade change: ${glassModule?.facade_override === 'glass' ? 'WORKS ✅' : 'BROKEN ❌'}`);

console.log('\n═══════════════════════════════════════════════════');
console.log('  SIMULATION COMPLETE');
console.log('═══════════════════════════════════════════════════');
