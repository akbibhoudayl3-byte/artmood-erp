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
  { key: 'island_unit', label: 'Island Unit' },
  { key: 'dressing_module', label: 'Dressing Module' },
  { key: 'tv_unit', label: 'TV Unit' },
  { key: 'vanity', label: 'Bathroom Vanity' },
  { key: 'custom_storage', label: 'Custom Storage' },
  { key: 'other', label: 'Other' },
] as const;

// ============================================================
// Material Options
// ============================================================
export const MATERIAL_OPTIONS = [
  { key: 'melamine_white', label: 'Melamine White' },
  { key: 'melamine_oak', label: 'Melamine Oak' },
  { key: 'melamine_walnut', label: 'Melamine Walnut' },
  { key: 'melamine_anthracite', label: 'Melamine Anthracite' },
  { key: 'mdf_raw', label: 'MDF Raw' },
  { key: 'mdf_lacquered', label: 'MDF Lacquered' },
  { key: 'mdf_vortex_eco', label: 'MDF Vortex ECO' },
  { key: 'mdf_vortex_mid', label: 'MDF Vortex MID' },
  { key: 'mdf_vortex_premium', label: 'MDF Vortex PREMIUM' },
  { key: 'stratifie_eco', label: 'Stratifié ECO' },
  { key: 'stratifie_mid', label: 'Stratifié MID' },
  { key: 'stratifie_premium', label: 'Stratifié PREMIUM' },
  { key: 'plywood', label: 'Plywood' },
  { key: 'solid_wood', label: 'Solid Wood' },
  { key: 'hpl', label: 'HPL' },
  { key: 'other', label: 'Other' },
] as const;

// ============================================================
// Edge Banding Options
// ============================================================
export const EDGE_BAND_OPTIONS = [
  { key: '0.4mm_pvc', label: '0.4mm PVC' },
  { key: '1mm_pvc', label: '1mm PVC' },
  { key: '2mm_pvc', label: '2mm PVC' },
  { key: '1mm_abs', label: '1mm ABS' },
  { key: '2mm_abs', label: '2mm ABS' },
  { key: '45mm_solid', label: '45mm Solid Edge' },
  { key: 'none', label: 'None' },
] as const;

// ============================================================
// Opening System Options
// ============================================================
export const OPENING_SYSTEM_OPTIONS = [
  { key: 'handle', label: 'Standard Handles' },
  { key: 'gola_lower', label: 'Gola Lower Profile' },
  { key: 'gola_upper', label: 'Gola Upper Profile' },
  { key: 'push_open', label: 'Push to Open' },
  { key: 'handleless', label: 'Handleless (J-Pull)' },
] as const;

// ============================================================
// Kitchen Layout Types
// ============================================================
export const KITCHEN_LAYOUT_TYPES = [
  { key: 'I', label: 'I Shape (Straight)' },
  { key: 'L', label: 'L Shape' },
  { key: 'U', label: 'U Shape' },
  { key: 'parallel', label: 'Parallel (Galley)' },
  { key: 'island', label: 'Island Kitchen' },
  { key: 'peninsula', label: 'Peninsula Kitchen' },
] as const;

// ============================================================
// Hardware Tiers
// ============================================================
export const HARDWARE_TIERS = [
  { key: 'eco', label: 'ECO', description: 'Basic hardware — 10/40/8 MAD (hinge/runner/handle)' },
  { key: 'mid', label: 'MID', description: 'Soft-close & design — 20/80/25 MAD' },
  { key: 'premium', label: 'PREMIUM', description: 'Blum/Hettich top range — 30/150/60 MAD' },
] as const;

// ============================================================
// Color Selection Modes
// ============================================================
export const COLOR_SELECTION_MODES = [
  { key: 'one_color', label: 'One Color All Units' },
  { key: 'body_and_door', label: 'Body Color + Door Color' },
  { key: 'mixed', label: 'Mixed Colors (per module)' },
] as const;

// ============================================================
// MDF Vortex Color Variants
// ============================================================
export const MDF_VORTEX_COLORS = [
  { key: 'blanc', label: 'Blanc', tier: 'eco' },
  { key: 'milk', label: 'Milk', tier: 'eco' },
  { key: 'standard_color', label: 'Standard Color', tier: 'mid' },
  { key: 'laguna', label: 'Laguna', tier: 'mid' },
  { key: 'daikiri', label: 'Daikiri', tier: 'mid' },
  { key: 'jasmine', label: 'Jasmine', tier: 'mid' },
  { key: 'premium_color', label: 'Premium Color', tier: 'premium' },
] as const;

// ============================================================
// Sheet Sizes (reference constants)
// ============================================================
export const SHEET_SIZES = {
  MDF_VORTEX_18: { length_mm: 2800, width_mm: 1220, area_m2: 3.416, thickness_mm: 18 },
  STRATIFIE_16: { length_mm: 2550, width_mm: 1830, area_m2: 4.6665, thickness_mm: 16 },
  HDF_5: { length_mm: 2440, width_mm: 1220, area_m2: 2.9768, thickness_mm: 5 },
} as const;
