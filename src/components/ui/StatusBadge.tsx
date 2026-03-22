'use client';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  // Leads
  new: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  contacted: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  visit_scheduled: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  quote_sent: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  won: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  lost: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Projects
  measurements: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  design: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  client_validation: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  production: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  installation: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  delivered: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  // Production stations
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  saw: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cnc: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  edge: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  assembly: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  qc: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  packing: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  // Quotes
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  sent: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  accepted: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  revised: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  // Installation
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  issue_reported: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  rescheduled: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  // Payments
  deposit: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  pre_installation: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  final: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  // Cheques
  deposited: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  cleared: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  bounced: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Marketing
  instagram: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
  facebook: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  tiktok: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-600' },
  website: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  archived: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  // Leave types
  vacation: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  sick: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  personal: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  maternity: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
  unpaid: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  // Attendance
  present: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  absent: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  half_day: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  holiday: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  // Machine status
  operational: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  needs_maintenance: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  out_of_service: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Maintenance types
  preventive: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  corrective: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  inspection: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  // Machine types
  saw_machine: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cnc_machine: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  edge_bander: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  drill_machine: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  compressor: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  // Survey statuses
  expired: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  // Generic
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  // Priority
  low: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  normal: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  urgent: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Employee document types
  contract: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  cin: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  cnss: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  certificate: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  diploma: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
  work_permit: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  medical: { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  // Production issue types
  missing_material: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  wrong_dimension: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  machine_problem: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  client_change: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  quality_defect: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Issue severities
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Cabinet types
  base_cabinet: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  wall_cabinet: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  tall_cabinet: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  drawer_unit: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  wardrobe: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
  shelf_unit: { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  corner_cabinet: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  // Cost types
  material: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  labor: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  transport: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  subcontract: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  overhead: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-500' },
  // SAV
  open: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  planned: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  resolved: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  closed: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  hinge_problem: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  drawer_problem: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  door_alignment: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  damaged_panel: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  installation_correction: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  under_warranty: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  // PO statuses
  confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  received: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  // Project types
  kitchen: { bg: 'bg-[#C9956B]/10', text: 'text-[#9E7350]', dot: 'bg-[#C9956B]' },
  dressing: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  bathroom: { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  living_room: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  office: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500' },
  commercial: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  furniture: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  other: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
};

const defaultColors = { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const PULSE_STATUSES = new Set(['in_progress', 'needs_maintenance', 'issue_reported', 'bounced', 'urgent', 'critical', 'open']);

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] || defaultColors;
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const shouldPulse = PULSE_STATUSES.has(status);

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] tracking-wide font-semibold ring-1 ring-inset ring-black/[0.04] ${colors.bg} ${colors.text} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${colors.dot}${shouldPulse ? ' animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
