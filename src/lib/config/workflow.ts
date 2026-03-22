// ============================================================
// Production Workflow Engine — Station & Task Constants
// ============================================================

export const WORKFLOW_STATIONS = [
  { key: 'DESIGN_CHECK',      label: 'Design Check',      color: 'bg-cyan-500',    textColor: 'text-cyan-700' },
  { key: 'CUTTING',           label: 'Cutting',           color: 'bg-red-500',     textColor: 'text-red-700' },
  { key: 'EDGE_BANDING',      label: 'Edge Banding',      color: 'bg-orange-500',  textColor: 'text-orange-700' },
  { key: 'DRILLING',          label: 'Drilling',          color: 'bg-yellow-500',  textColor: 'text-yellow-700' },
  { key: 'ASSEMBLY',          label: 'Assembly',          color: 'bg-blue-500',    textColor: 'text-blue-700' },
  { key: 'QUALITY_CHECK',     label: 'Quality Check',     color: 'bg-purple-500',  textColor: 'text-purple-700' },
  { key: 'PACKAGING',         label: 'Packaging',         color: 'bg-green-500',   textColor: 'text-green-700' },
  { key: 'READY_FOR_INSTALL', label: 'Ready for Install', color: 'bg-emerald-500', textColor: 'text-emerald-700' },
] as const;

export const WORKFLOW_STATION_COLORS: Record<string, string> = {
  DESIGN_CHECK:      '#06B6D4',
  CUTTING:           '#EF4444',
  EDGE_BANDING:      '#F97316',
  DRILLING:          '#EAB308',
  ASSEMBLY:          '#3B82F6',
  QUALITY_CHECK:     '#8B5CF6',
  PACKAGING:         '#22C55E',
  READY_FOR_INSTALL: '#10B981',
};

export const WORKFLOW_STATION_ORDER = [
  'DESIGN_CHECK', 'CUTTING', 'EDGE_BANDING', 'DRILLING',
  'ASSEMBLY', 'QUALITY_CHECK', 'PACKAGING', 'READY_FOR_INSTALL',
] as const;

export const TASK_STATUSES = [
  { key: 'pending',      label: 'Pending',          color: 'bg-gray-400' },
  { key: 'in_progress',  label: 'In Progress',      color: 'bg-blue-500' },
  { key: 'paused',       label: 'Paused',           color: 'bg-yellow-500' },
  { key: 'completed',    label: 'Completed',        color: 'bg-green-500' },
  { key: 'blocked',      label: 'Blocked',          color: 'bg-red-500' },
  { key: 'rework_sent',  label: 'Sent for Rework',  color: 'bg-orange-500' },
] as const;

export const QC_RESULTS = [
  { key: 'approved',         label: 'Approved',        color: 'bg-green-500' },
  { key: 'rework_required',  label: 'Rework Required', color: 'bg-orange-500' },
  { key: 'rejected',         label: 'Rejected',        color: 'bg-red-500' },
] as const;
