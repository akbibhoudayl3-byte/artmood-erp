// ============================================================
// Kitchen Cabinet Configuration — ArtMood Manufacturing Logic
// ============================================================

import type { ClientType, ModuleType } from '@/types/kitchen';

// ── Default Dimensions (mm) ──

export const DEFAULT_DIMENSIONS: Record<string, { height: number; depth: number }> = {
  base:   { height: 700,  depth: 560 },
  wall:   { height: 700,  depth: 320 },
  tall:   { height: 2100, depth: 560 },
  sink:   { height: 700,  depth: 560 },
  drawer: { height: 700,  depth: 560 },
  hotte:  { height: 400,  depth: 320 },
  corner: { height: 700,  depth: 560 },
};

// ── Material Thickness (mm) ──

export const THICKNESS = {
  structure: 18,     // stratifié / latte
  back_5: 5,
  back_8: 8,
  facade: 18,        // MDF 18 UV
  aluminium: 1.5,
} as const;

// ── Edge Banding ──

export const EDGE_BANDING = {
  caisson_mm: 0.8,
  facade_mm: 1.0,
  facade_optional_mm: 0.8,
} as const;

// ── Hardware Counts ──

export const HINGE_RULES: Record<string, number> = {
  small_door: 2,
  large_door: 3,     // width >= 600mm
  column: 4,
};

export const LARGE_DOOR_THRESHOLD_MM = 600;

// ── Material Prices (MAD per unit) ──

export const MATERIAL_PRICES = {
  stratifie_m2: 120,
  mdf_18_uv_m2: 180,
  back_5mm_m2: 45,
  back_8mm_m2: 65,
  aluminium_panel_m2: 250,
  glass_m2: 350,
  semi_glass_m2: 280,

  edge_08mm_m: 3.5,
  edge_1mm_m: 5.0,

  hinge_unit: 25,
  spider_unit: 35,
  rail_m: 45,
  drawer_system_unit: 180,
  gola_profile_m: 85,
  push_system_unit: 45,
  handle_unit: 30,
} as const;

// ── Labour & Fixed Charges ──

export const LABOUR_COSTS = {
  per_module: 150,       // MAD per module (cutting + assembly)
  per_drawer: 80,        // extra for drawer modules
  fixed_charges: 500,    // per kitchen (admin, electricity, etc.)
  transport_base: 300,   // base transport cost
  transport_per_km: 5,   // per km if applicable
  installation_per_module: 100,
} as const;

// ── Margin Rules ──

export const MARGIN_RULES: Record<ClientType, number> = {
  standard: 50,
  promoteur: 30,
  revendeur: 30,
  architecte: 40,
  urgent: 70,
};

// ── Filler Thresholds ──

export const FILLER_THRESHOLDS = {
  min_warning_mm: 50,
  max_filler_mm: 300,
} as const;

// ── Module Type Labels (fr) ──

export const MODULE_TYPE_LABELS: Record<ModuleType, string> = {
  base: 'Bas',
  wall: 'Haut',
  tall: 'Colonne',
  sink: 'Évier',
  drawer: 'Tiroir',
  hotte: 'Hotte',
  corner: 'Angle',
};

// ── Pipeline Steps ──

export const PIPELINE_STEPS = [
  { step: 1, key: 'project',       label: 'Projet',          labelAr: 'المشروع' },
  { step: 2, key: 'layout',        label: 'Plan',            labelAr: 'المخطط' },
  { step: 3, key: 'modules',       label: 'Modules',         labelAr: 'الوحدات' },
  { step: 4, key: 'options',       label: 'Options',         labelAr: 'الخيارات' },
  { step: 5, key: 'customization', label: 'Personnalisation',labelAr: 'التخصيص' },
  { step: 6, key: 'detection',     label: 'Détection Auto',  labelAr: 'الكشف التلقائي' },
  { step: 7, key: 'price',         label: 'Prix',            labelAr: 'السعر' },
  { step: 8, key: 'validation',    label: 'Validation',      labelAr: 'التحقق' },
  { step: 9, key: 'actions',       label: 'Actions',         labelAr: 'الإجراءات' },
] as const;
