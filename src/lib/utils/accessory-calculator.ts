// ============================================================
// Accessory Calculator - Generate accessory list from module specs
// ============================================================

export interface AccessoryItem {
  accessory_name: string;
  quantity: number;
  unit: string;
}

interface ModuleInput {
  module_type: string;
  width: number;
  height: number;
  has_doors: boolean;
  door_count: number;
  has_drawers: boolean;
  drawer_count: number;
  has_shelves: boolean;
  shelf_count: number;
}

export function calculateAccessories(module: ModuleInput): AccessoryItem[] {
  const accessories: AccessoryItem[] = [];

  // Door hardware
  if (module.has_doors && module.door_count > 0) {
    // Hinges: 2 per door for height < 800mm, 3 for taller
    const hingesPerDoor = module.height > 800 ? 3 : 2;
    accessories.push({
      accessory_name: 'Hinge (110° soft-close)',
      quantity: module.door_count * hingesPerDoor,
      unit: 'pcs',
    });
    // Door handles
    accessories.push({
      accessory_name: 'Door Handle',
      quantity: module.door_count,
      unit: 'pcs',
    });
    // Door bumpers
    accessories.push({
      accessory_name: 'Door Bumper',
      quantity: module.door_count * 2,
      unit: 'pcs',
    });
  }

  // Drawer hardware
  if (module.has_drawers && module.drawer_count > 0) {
    // Drawer slides (pair per drawer)
    accessories.push({
      accessory_name: 'Drawer Slide (soft-close pair)',
      quantity: module.drawer_count,
      unit: 'pairs',
    });
    // Drawer handles
    accessories.push({
      accessory_name: 'Drawer Handle',
      quantity: module.drawer_count,
      unit: 'pcs',
    });
  }

  // Shelf hardware
  if (module.has_shelves && module.shelf_count > 0) {
    // Shelf pins (4 per shelf)
    accessories.push({
      accessory_name: 'Shelf Pin',
      quantity: module.shelf_count * 4,
      unit: 'pcs',
    });
  }

  // Common hardware
  // Cam locks and dowels
  accessories.push({
    accessory_name: 'Cam Lock',
    quantity: 8,
    unit: 'pcs',
  });
  accessories.push({
    accessory_name: 'Wooden Dowel',
    quantity: 12,
    unit: 'pcs',
  });

  // Leg levelers for base/drawer units
  if (module.module_type === 'base_cabinet' || module.module_type === 'drawer_unit') {
    accessories.push({
      accessory_name: 'Leg Leveler',
      quantity: 4,
      unit: 'pcs',
    });
  }

  // Wall brackets for wall cabinets
  if (module.module_type === 'wall_cabinet') {
    accessories.push({
      accessory_name: 'Wall Bracket',
      quantity: 2,
      unit: 'pcs',
    });
  }

  return accessories;
}

// Aggregate accessories from multiple modules
export function aggregateAccessories(moduleAccessories: AccessoryItem[][]): AccessoryItem[] {
  const map = new Map<string, AccessoryItem>();

  for (const items of moduleAccessories) {
    for (const item of items) {
      const key = item.accessory_name;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantity += item.quantity;
      } else {
        map.set(key, { ...item });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.accessory_name.localeCompare(b.accessory_name));
}
