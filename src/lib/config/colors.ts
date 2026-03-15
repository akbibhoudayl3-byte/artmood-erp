// ============================================================
// Production Station Colors
// ============================================================
export const STATION_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  saw: '#3B82F6',
  cnc: '#8B5CF6',
  edge: '#F97316',
  assembly: '#22C55E',
  qc: '#EAB308',
  packing: '#14B8A6',
};

export const STATION_ORDER = ['pending', 'saw', 'cnc', 'edge', 'assembly', 'qc', 'packing'] as const;
