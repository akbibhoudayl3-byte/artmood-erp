// ============================================================
// Pipeline stages
// ============================================================
export const LEAD_STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { key: 'visit_scheduled', label: 'Visit Scheduled', color: 'bg-purple-500' },
  { key: 'quote_sent', label: 'Quote Sent', color: 'bg-orange-500' },
  { key: 'won', label: 'Won', color: 'bg-green-500' },
  { key: 'lost', label: 'Lost', color: 'bg-red-500' },
] as const;

export const PROJECT_STAGES = [
  { key: 'draft', label: 'Brouillon', color: 'bg-gray-500' },
  { key: 'measurements_confirmed', label: 'Mesures', color: 'bg-blue-500' },
  { key: 'design_validated', label: 'Design', color: 'bg-purple-500' },
  { key: 'bom_generated', label: 'BOM', color: 'bg-yellow-500' },
  { key: 'ready_for_production', label: 'Prêt', color: 'bg-orange-500' },
  { key: 'in_production', label: 'Production', color: 'bg-red-500' },
  { key: 'installation', label: 'Installation', color: 'bg-indigo-500' },
  { key: 'delivered', label: 'Livré', color: 'bg-green-500' },
] as const;

export const PRODUCTION_STATIONS = [
  { key: 'pending', label: 'Pending', color: 'bg-gray-400' },
  { key: 'saw', label: 'SAW', color: 'bg-red-500' },
  { key: 'cnc', label: 'CNC', color: 'bg-orange-500' },
  { key: 'edge', label: 'EDGE', color: 'bg-yellow-500' },
  { key: 'assembly', label: 'ASSEMBLY', color: 'bg-blue-500' },
  { key: 'qc', label: 'QC', color: 'bg-purple-500' },
  { key: 'packing', label: 'PACKING', color: 'bg-green-500' },
] as const;

export const LEAD_SOURCES = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'google', label: 'Google' },
  { key: 'architect', label: 'Architect' },
  { key: 'referral', label: 'Referral' },
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'website', label: 'Website' },
  { key: 'other', label: 'Other' },
] as const;
