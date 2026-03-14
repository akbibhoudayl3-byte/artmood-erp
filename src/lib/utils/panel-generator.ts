// ============================================================
// Panel Generator - Auto-generates panel cut list from module specs
// ============================================================

export interface PanelSpec {
  panel_name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: 'length' | 'width' | 'none';
  notes: string | null;
}

interface ModuleInput {
  module_type: string;
  width: number;
  height: number;
  depth: number;
  material: string;
  has_back_panel: boolean;
  has_doors: boolean;
  door_count: number;
  has_drawers: boolean;
  drawer_count: number;
  has_shelves: boolean;
  shelf_count: number;
}

const PANEL_THICKNESS = 18; // mm

export function generatePanels(module: ModuleInput): PanelSpec[] {
  const { module_type, width, height, depth, material } = module;
  const panels: PanelSpec[] = [];
  const t = PANEL_THICKNESS;

  // Side panels (always 2)
  panels.push({
    panel_name: 'Side Panel',
    length: height,
    width: depth,
    quantity: 2,
    material,
    edge_top: false,
    edge_bottom: false,
    edge_left: false,
    edge_right: module_type === 'tall_cabinet' || module_type === 'wardrobe',
    grain_direction: 'length',
    notes: null,
  });

  // Top panel
  if (module_type !== 'base_cabinet' && module_type !== 'drawer_unit') {
    panels.push({
      panel_name: 'Top',
      length: width - t * 2,
      width: depth,
      quantity: 1,
      material,
      edge_top: true,
      edge_bottom: false,
      edge_left: false,
      edge_right: false,
      grain_direction: 'length',
      notes: null,
    });
  }

  // Bottom panel
  panels.push({
    panel_name: 'Bottom',
    length: width - t * 2,
    width: depth,
    quantity: 1,
    material,
    edge_top: module_type === 'wall_cabinet',
    edge_bottom: false,
    edge_left: false,
    edge_right: false,
    grain_direction: 'length',
    notes: null,
  });

  // Back panel
  if (module.has_back_panel) {
    const backHeight = module_type === 'wall_cabinet' ? height - t * 2 : height - t;
    panels.push({
      panel_name: 'Back Panel',
      length: width - t * 2,
      width: backHeight,
      quantity: 1,
      material: 'mdf_raw',
      edge_top: false,
      edge_bottom: false,
      edge_left: false,
      edge_right: false,
      grain_direction: 'none',
      notes: module_type === 'wall_cabinet' ? '3mm' : '8mm',
    });
  }

  // Shelves
  if (module.has_shelves && module.shelf_count > 0) {
    panels.push({
      panel_name: 'Shelf',
      length: width - t * 2,
      width: depth - 20,
      quantity: module.shelf_count,
      material,
      edge_top: true,
      edge_bottom: false,
      edge_left: false,
      edge_right: false,
      grain_direction: 'length',
      notes: null,
    });
  }

  // Doors
  if (module.has_doors && module.door_count > 0) {
    const doorWidth = module.door_count === 1 ? width - 4 : (width - 4) / module.door_count;
    const doorHeight = module_type === 'base_cabinet' ? height - 4 : height - t - 4;
    panels.push({
      panel_name: 'Door',
      length: doorHeight,
      width: doorWidth,
      quantity: module.door_count,
      material,
      edge_top: true,
      edge_bottom: true,
      edge_left: true,
      edge_right: true,
      grain_direction: 'length',
      notes: null,
    });
  }

  // Drawers
  if (module.has_drawers && module.drawer_count > 0) {
    const drawerFaceHeight = Math.floor((height - 4) / module.drawer_count) - 4;
    const drawerFaceWidth = width - 4;
    // Drawer face
    panels.push({
      panel_name: 'Drawer Face',
      length: drawerFaceHeight,
      width: drawerFaceWidth,
      quantity: module.drawer_count,
      material,
      edge_top: true,
      edge_bottom: true,
      edge_left: true,
      edge_right: true,
      grain_direction: 'length',
      notes: null,
    });
    // Drawer box sides
    panels.push({
      panel_name: 'Drawer Side',
      length: depth - 50,
      width: drawerFaceHeight - 40,
      quantity: module.drawer_count * 2,
      material: 'mdf_raw',
      edge_top: false,
      edge_bottom: false,
      edge_left: false,
      edge_right: false,
      grain_direction: 'none',
      notes: '16mm',
    });
    // Drawer box front/back
    panels.push({
      panel_name: 'Drawer Front/Back',
      length: width - t * 2 - 50,
      width: drawerFaceHeight - 40,
      quantity: module.drawer_count * 2,
      material: 'mdf_raw',
      edge_top: false,
      edge_bottom: false,
      edge_left: false,
      edge_right: false,
      grain_direction: 'none',
      notes: '16mm',
    });
    // Drawer bottom
    panels.push({
      panel_name: 'Drawer Bottom',
      length: width - t * 2 - 50,
      width: depth - 50,
      quantity: module.drawer_count,
      material: 'mdf_raw',
      edge_top: false,
      edge_bottom: false,
      edge_left: false,
      edge_right: false,
      grain_direction: 'none',
      notes: '3mm',
    });
  }

  return panels;
}

// Calculate summary stats for a set of panels
export function calculatePanelSummary(panels: PanelSpec[]) {
  let totalPanels = 0;
  let totalAreaM2 = 0;
  let totalEdgeMeters = 0;

  for (const p of panels) {
    totalPanels += p.quantity;
    totalAreaM2 += (p.length * p.width * p.quantity) / 1_000_000;

    let edgePerPanel = 0;
    if (p.edge_top) edgePerPanel += p.length;
    if (p.edge_bottom) edgePerPanel += p.length;
    if (p.edge_left) edgePerPanel += p.width;
    if (p.edge_right) edgePerPanel += p.width;
    totalEdgeMeters += (edgePerPanel * p.quantity) / 1000;
  }

  return {
    totalPanels,
    totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
    totalEdgeMeters: Math.round(totalEdgeMeters * 100) / 100,
  };
}
