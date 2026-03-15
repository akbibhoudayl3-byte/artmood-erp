export const COST_TYPES = [
  { key: 'material', label: 'Material' },
  { key: 'labor', label: 'Labor' },
  { key: 'transport', label: 'Transport' },
  { key: 'installation', label: 'Installation' },
  { key: 'subcontract', label: 'Subcontract' },
  { key: 'overhead', label: 'Overhead' },
  { key: 'other', label: 'Other' },
] as const;

// ============================================================
// Payment rules
// ============================================================
export const PAYMENT_RULES = {
  deposit_percent: 50,
  pre_installation_percent: 40,
  final_percent: 10,
} as const;
