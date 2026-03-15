// ============================================================
// Cabinet Types
// ============================================================
export const CABINET_TYPES = [
  { key: 'base_cabinet', label: 'Base Cabinet' },
  { key: 'wall_cabinet', label: 'Wall Cabinet' },
  { key: 'tall_cabinet', label: 'Tall Cabinet' },
  { key: 'drawer_unit', label: 'Drawer Unit' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'shelf_unit', label: 'Shelf Unit' },
  { key: 'corner_cabinet', label: 'Corner Cabinet' },
  { key: 'other', label: 'Other' },
] as const;

export const MATERIAL_OPTIONS = [
  { key: 'melamine_white', label: 'Melamine White' },
  { key: 'melamine_oak', label: 'Melamine Oak' },
  { key: 'melamine_walnut', label: 'Melamine Walnut' },
  { key: 'melamine_anthracite', label: 'Melamine Anthracite' },
  { key: 'mdf_raw', label: 'MDF Raw' },
  { key: 'mdf_lacquered', label: 'MDF Lacquered' },
  { key: 'plywood', label: 'Plywood' },
  { key: 'solid_wood', label: 'Solid Wood' },
  { key: 'hpl', label: 'HPL' },
  { key: 'other', label: 'Other' },
] as const;

export const EDGE_BAND_OPTIONS = [
  { key: '0.4mm_pvc', label: '0.4mm PVC' },
  { key: '1mm_pvc', label: '1mm PVC' },
  { key: '2mm_pvc', label: '2mm PVC' },
  { key: '2mm_abs', label: '2mm ABS' },
  { key: '45mm_solid', label: '45mm Solid Edge' },
  { key: 'none', label: 'None' },
] as const;
