// ============================================================
// Kitchen BOM Engine — ArtMood ERP
// Generates Bill of Materials from kitchen module instances
// ============================================================

import {
  THICKNESS,
  MATERIAL_PRICES,
  HINGE_RULES,
  LARGE_DOOR_THRESHOLD_MM,
} from '@/lib/config/kitchen';
import { roundMoney } from '@/lib/utils/money';
import type {
  KitchenProject,
  KitchenModuleInstance,
  KitchenFiller,
  ProductModule,
  ModuleRule,
  ModuleHardwareRule,
  BOMPanel,
  BOMEdgeBanding,
  BOMHardware,
  BOMResult,
} from '@/types/kitchen';

// ── Helpers ──

function mmToM(mm: number): number {
  return mm / 1000;
}

function mm2ToM2(w: number, h: number): number {
  return (w * h) / 1_000_000;
}

function panelCost(w_mm: number, h_mm: number, pricePerM2: number): number {
  return roundMoney(mm2ToM2(w_mm, h_mm) * pricePerM2);
}

function structurePrice(kitchen: KitchenProject): number {
  return kitchen.structure_material === 'latte'
    ? MATERIAL_PRICES.stratifie_m2 * 1.3
    : MATERIAL_PRICES.stratifie_m2;
}

function facadePrice(facadeOverride: string | null, kitchen: KitchenProject): number {
  if (facadeOverride === 'glass') return MATERIAL_PRICES.glass_m2;
  if (facadeOverride === 'semi_glass') return MATERIAL_PRICES.semi_glass_m2;
  // default MDF
  return MATERIAL_PRICES.mdf_18_uv_m2;
}

function backPrice(kitchen: KitchenProject): number {
  return kitchen.back_thickness === 8
    ? MATERIAL_PRICES.back_8mm_m2
    : MATERIAL_PRICES.back_5mm_m2;
}

// ── Core BOM Generator ──

export interface ModuleWithRules {
  instance: KitchenModuleInstance;
  module: ProductModule;
  rule: ModuleRule;
  hardware: ModuleHardwareRule;
}

export function generateBOM(
  kitchen: KitchenProject,
  modulesWithRules: ModuleWithRules[],
  fillers: KitchenFiller[]
): BOMResult {
  const panels: BOMPanel[] = [];
  const edgeBanding: BOMEdgeBanding[] = [];
  const hardware: BOMHardware[] = [];
  const accessories: BOMHardware[] = [];
  const fillerPanels: BOMPanel[] = [];

  const T = THICKNESS.structure;
  const strPrice = structurePrice(kitchen);
  const bkPrice = backPrice(kitchen);

  for (const m of modulesWithRules) {
    const { instance, module: mod, rule, hardware: hw } = m;
    const W = instance.width_mm;
    const H = instance.height_mm;
    const D = instance.depth_mm;
    const iid = instance.id;

    // ── Sides (always 2) ──
    panels.push({
      module_instance_id: iid,
      part_name: 'side',
      description: `Côté ${mod.label}`,
      material: 'structure',
      width_mm: D,
      height_mm: H,
      thickness_mm: T,
      qty: 2,
      edge_top: true,
      edge_bottom: false,
      edge_left: true,
      edge_right: false,
    });

    // ── Bottom ──
    if (rule.has_bottom) {
      if (rule.construction_type === 'sink') {
        // Sink: aluminium panel instead of MDF
        panels.push({
          module_instance_id: iid,
          part_name: 'bottom',
          description: `Fond alu évier ${mod.label}`,
          material: 'aluminium',
          width_mm: W - 2 * T,
          height_mm: D,
          thickness_mm: THICKNESS.aluminium,
          qty: 1,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
        });
      } else {
        panels.push({
          module_instance_id: iid,
          part_name: 'bottom',
          description: `Bas ${mod.label}`,
          material: 'structure',
          width_mm: W - 2 * T,
          height_mm: D,
          thickness_mm: T,
          qty: 1,
          edge_top: true,
          edge_bottom: false,
          edge_left: false,
          edge_right: false,
        });
      }
    }

    // ── Top ──
    if (rule.has_top) {
      panels.push({
        module_instance_id: iid,
        part_name: 'top',
        description: `Dessus ${mod.label}`,
        material: 'structure',
        width_mm: W - 2 * T,
        height_mm: D,
        thickness_mm: T,
        qty: 1,
        edge_top: true,
        edge_bottom: false,
        edge_left: false,
        edge_right: false,
      });
    }

    // ── Shelves ──
    if (rule.has_shelf && rule.shelf_count > 0) {
      panels.push({
        module_instance_id: iid,
        part_name: 'shelf',
        description: `Étagère ${mod.label}`,
        material: 'structure',
        width_mm: W - 2 * T,
        height_mm: D - 20, // 20mm recess
        thickness_mm: T,
        qty: rule.shelf_count,
        edge_top: true,
        edge_bottom: false,
        edge_left: false,
        edge_right: false,
      });
    }

    // ── Back ──
    if (rule.has_back) {
      panels.push({
        module_instance_id: iid,
        part_name: 'back',
        description: `Dos ${mod.label}`,
        material: 'back',
        width_mm: W - 2 * T + 8, // inset in grooves
        height_mm: H - 2 * T + 8,
        thickness_mm: kitchen.back_thickness,
        qty: 1,
        edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
      });
    }

    // ── Facade ──
    if (rule.construction_type !== 'hotte') {
      if (rule.construction_type === 'drawer') {
        // Drawer: 3 facades + 3 bottoms
        const drawerCount = 3;
        const facadeH = Math.floor((H - (drawerCount + 1) * 3) / drawerCount); // 3mm gaps
        panels.push({
          module_instance_id: iid,
          part_name: 'drawer_facade',
          description: `Façade tiroir ${mod.label}`,
          material: 'facade',
          width_mm: W - 4, // 2mm gap each side
          height_mm: facadeH,
          thickness_mm: THICKNESS.facade,
          qty: drawerCount,
          edge_top: true, edge_bottom: true, edge_left: true, edge_right: true,
        });
        panels.push({
          module_instance_id: iid,
          part_name: 'drawer_bottom',
          description: `Fond tiroir ${mod.label}`,
          material: 'structure',
          width_mm: W - 2 * T - 26, // clearance for slides
          height_mm: D - 50,
          thickness_mm: T,
          qty: drawerCount,
          edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
        });
      } else {
        // Standard facade (1 or 2 doors)
        const doorCount = W >= 800 ? 2 : 1;
        const facadeW = doorCount === 2 ? Math.floor((W - 4) / 2) : W - 4;
        panels.push({
          module_instance_id: iid,
          part_name: 'facade',
          description: `Façade ${mod.label}`,
          material: 'facade',
          width_mm: facadeW,
          height_mm: H - 4, // 2mm gap top/bottom
          thickness_mm: THICKNESS.facade,
          qty: doorCount,
          edge_top: true, edge_bottom: true, edge_left: true, edge_right: true,
        });
      }
    }

    // ── Edge Banding ──
    const caissonEdge = kitchen.edge_caisson_mm;
    const facadeEdge = kitchen.edge_facade_mm;

    // Calculate edge banding for all panels of this module
    for (const p of panels.filter(pp => pp.module_instance_id === iid)) {
      const edgeMm = p.material === 'facade' ? facadeEdge : caissonEdge;
      let totalEdgeLength = 0;
      if (p.edge_top) totalEdgeLength += p.width_mm * p.qty;
      if (p.edge_bottom) totalEdgeLength += p.width_mm * p.qty;
      if (p.edge_left) totalEdgeLength += p.height_mm * p.qty;
      if (p.edge_right) totalEdgeLength += p.height_mm * p.qty;

      if (totalEdgeLength > 0) {
        edgeBanding.push({
          module_instance_id: iid,
          description: `Chant ${edgeMm}mm — ${p.description}`,
          thickness_mm: edgeMm,
          length_m: roundMoney(mmToM(totalEdgeLength) * 1.05), // 5% waste
        });
      }
    }

    // ── Hardware ──
    if (rule.construction_type === 'drawer') {
      hardware.push({
        module_instance_id: iid,
        description: `Système tiroir aluminium × 3`,
        qty: 3,
        unit_cost: MATERIAL_PRICES.drawer_system_unit,
      });
    } else if (rule.construction_type !== 'hotte') {
      // Hinges
      let hingeCount = hw.hinges_count;
      if (rule.construction_type === 'column') {
        hingeCount = HINGE_RULES.column;
      } else if (W >= LARGE_DOOR_THRESHOLD_MM) {
        hingeCount = HINGE_RULES.large_door;
      } else {
        hingeCount = HINGE_RULES.small_door;
      }
      const doorCount = W >= 800 ? 2 : 1;
      hardware.push({
        module_instance_id: iid,
        description: `Charnière`,
        qty: hingeCount * doorCount,
        unit_cost: MATERIAL_PRICES.hinge_unit,
      });
    }

    // Spider system for wall cabinets
    if (hw.spider_required) {
      accessories.push({
        module_instance_id: iid,
        description: `Spider fixation murale`,
        qty: hw.spider_count,
        unit_cost: MATERIAL_PRICES.spider_unit,
      });
    }

    // Opening system accessories
    if (kitchen.opening_system === 'gola') {
      const golaLength = mmToM(W);
      accessories.push({
        module_instance_id: iid,
        description: `Profil Gola aluminium`,
        qty: 1,
        unit_cost: roundMoney(golaLength * MATERIAL_PRICES.gola_profile_m),
      });
    } else if (kitchen.opening_system === 'push') {
      accessories.push({
        module_instance_id: iid,
        description: `Système Push`,
        qty: 1,
        unit_cost: MATERIAL_PRICES.push_system_unit,
      });
    } else {
      // handles
      const doorCount = rule.construction_type === 'drawer' ? 3 : (W >= 800 ? 2 : 1);
      accessories.push({
        module_instance_id: iid,
        description: `Poignée`,
        qty: doorCount,
        unit_cost: MATERIAL_PRICES.handle_unit,
      });
    }
  }

  // ── Wall Rail (shared across wall modules) ──
  const wallModules = modulesWithRules.filter(m => m.hardware.rail_shared);
  if (wallModules.length > 0) {
    const totalRailLength = wallModules.reduce((sum, m) => sum + m.instance.width_mm, 0);
    accessories.push({
      module_instance_id: null,
      description: `Rail mural partagé`,
      qty: 1,
      unit_cost: roundMoney(mmToM(totalRailLength) * MATERIAL_PRICES.rail_m),
    });
  }

  // ── Fillers ──
  for (const f of fillers) {
    fillerPanels.push({
      module_instance_id: null,
      part_name: 'side',
      description: `Filler ${f.side} (${f.width_mm}mm)`,
      material: 'structure',
      width_mm: f.width_mm,
      height_mm: f.height_mm,
      thickness_mm: THICKNESS.structure,
      qty: 1,
      edge_top: true,
      edge_bottom: true,
      edge_left: true,
      edge_right: true,
    });

    // Filler edge banding
    const fillerEdgeLen = 2 * (f.width_mm + f.height_mm);
    edgeBanding.push({
      module_instance_id: null,
      description: `Chant filler ${f.side}`,
      thickness_mm: kitchen.edge_caisson_mm,
      length_m: roundMoney(mmToM(fillerEdgeLen) * 1.05),
    });
  }

  return {
    panels,
    edge_banding: edgeBanding,
    hardware,
    accessories,
    fillers: fillerPanels,
  };
}

// ── Cost calculation for BOM ──

export function computeBOMCost(
  bom: BOMResult,
  kitchen: KitchenProject
): { materials: number; hardware: number; accessories: number } {
  const strPrice = structurePrice(kitchen);
  const bkPrice = backPrice(kitchen);

  let materials = 0;
  for (const p of [...bom.panels, ...bom.fillers]) {
    let pricePerM2: number;
    switch (p.material) {
      case 'structure': pricePerM2 = strPrice; break;
      case 'back': pricePerM2 = bkPrice; break;
      case 'facade': pricePerM2 = facadePrice(null, kitchen); break;
      case 'aluminium': pricePerM2 = MATERIAL_PRICES.aluminium_panel_m2; break;
      default: pricePerM2 = strPrice;
    }
    materials += panelCost(p.width_mm, p.height_mm, pricePerM2) * p.qty;
  }

  // Edge banding cost
  for (const e of bom.edge_banding) {
    const pricePerM = e.thickness_mm <= 0.8
      ? MATERIAL_PRICES.edge_08mm_m
      : MATERIAL_PRICES.edge_1mm_m;
    materials += roundMoney(e.length_m * pricePerM);
  }

  let hardwareCost = 0;
  for (const h of bom.hardware) {
    hardwareCost += roundMoney(h.qty * h.unit_cost);
  }

  let accessoryCost = 0;
  for (const a of bom.accessories) {
    accessoryCost += roundMoney(a.qty * a.unit_cost);
  }

  return {
    materials: roundMoney(materials),
    hardware: roundMoney(hardwareCost),
    accessories: roundMoney(accessoryCost),
  };
}
