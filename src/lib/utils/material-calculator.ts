// ============================================================
// Material Calculator - Calculate total materials needed
// ============================================================

export interface MaterialUsage {
  material: string;
  materialLabel: string;
  totalAreaM2: number;
  totalPanels: number;
  sheetsNeeded: number; // Standard sheet is 2440x1220mm = 2.98m2
}

export interface EdgeBandUsage {
  type: string;
  totalMeters: number;
  rollsNeeded: number; // Standard roll is 50m
}

const MATERIAL_LABELS: Record<string, string> = {
  melamine_white: 'Melamine White',
  melamine_oak: 'Melamine Oak',
  melamine_walnut: 'Melamine Walnut',
  melamine_anthracite: 'Melamine Anthracite',
  mdf_raw: 'MDF Raw',
  mdf_lacquered: 'MDF Lacquered',
  plywood: 'Plywood',
  solid_wood: 'Solid Wood',
  hpl: 'HPL',
  other: 'Other',
};

const STANDARD_SHEET_AREA = 2.44 * 1.22; // 2.98m2
const STANDARD_ROLL_LENGTH = 50; // 50m

interface PanelInput {
  material: string;
  length: number;
  width: number;
  quantity: number;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
}

export function calculateMaterialUsage(panels: PanelInput[]): MaterialUsage[] {
  const materialMap = new Map<string, { totalArea: number; totalPanels: number }>();

  for (const p of panels) {
    const area = (p.length * p.width * p.quantity) / 1_000_000;
    if (!materialMap.has(p.material)) {
      materialMap.set(p.material, { totalArea: 0, totalPanels: 0 });
    }
    const entry = materialMap.get(p.material)!;
    entry.totalArea += area;
    entry.totalPanels += p.quantity;
  }

  return Array.from(materialMap.entries()).map(([material, data]) => ({
    material,
    materialLabel: MATERIAL_LABELS[material] || material,
    totalAreaM2: Math.round(data.totalArea * 100) / 100,
    totalPanels: data.totalPanels,
    // Add 10% waste factor
    sheetsNeeded: Math.ceil((data.totalArea * 1.1) / STANDARD_SHEET_AREA),
  }));
}

export function calculateEdgeBandUsage(panels: PanelInput[], edgeBandType: string): EdgeBandUsage {
  let totalMeters = 0;

  for (const p of panels) {
    let edgePerPanel = 0;
    if (p.edge_top) edgePerPanel += p.length;
    if (p.edge_bottom) edgePerPanel += p.length;
    if (p.edge_left) edgePerPanel += p.width;
    if (p.edge_right) edgePerPanel += p.width;
    totalMeters += (edgePerPanel * p.quantity) / 1000;
  }

  return {
    type: edgeBandType,
    totalMeters: Math.round(totalMeters * 100) / 100,
    // Add 15% waste factor for edge banding
    rollsNeeded: Math.ceil((totalMeters * 1.15) / STANDARD_ROLL_LENGTH),
  };
}
