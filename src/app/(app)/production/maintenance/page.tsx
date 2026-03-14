'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import {
  ArrowLeft, Plus, X, Wrench, AlertTriangle, Clock, Settings,
  ChevronDown, ChevronUp, CalendarDays, CheckCircle2, XCircle,
  Cog, Activity
} from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

// ── Types ──────────────────────────────────────────────────────────────────

type MachineType = 'saw' | 'cnc' | 'edge_bander' | 'drill' | 'compressor' | 'other';
type MachineStatus = 'operational' | 'needs_maintenance' | 'out_of_service';
type MaintenanceType = 'preventive' | 'corrective' | 'inspection';

interface Machine {
  id: string;
  name: string;
  machine_type: MachineType;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  location: string | null;
  status: MachineStatus;
  notes: string | null;
  created_at: string;
}

interface MaintenanceRecord {
  id: string;
  machine_id: string;
  maintenance_type: MaintenanceType;
  description: string;
  performed_by: string | null;
  performed_at: string;
  next_due_date: string | null;
  cost: number | null;
  parts_replaced: string | null;
  notes: string | null;
}

interface MaintenanceSchedule {
  id: string;
  machine_id: string;
  task_name: string;
  frequency_days: number;
  last_performed: string | null;
  next_due: string;
  assigned_to: string | null;
  is_active: boolean;
  notes: string | null;
  machine?: Machine;
}

// ── Status badge helper ────────────────────────────────────────────────────

const STATUS_MAP: Record<MachineStatus, { label: string; bg: string; text: string; dot: string }> = {
  operational: { label: 'Operational', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  needs_maintenance: { label: 'Needs Maintenance', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  out_of_service: { label: 'Out of Service', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const MAINTENANCE_TYPE_MAP: Record<MaintenanceType, { label: string; bg: string; text: string; dot: string }> = {
  preventive: { label: 'Preventive', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  corrective: { label: 'Corrective', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  inspection: { label: 'Inspection', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
};

function MachineStatusBadge({ status }: { status: MachineStatus }) {
  const s = STATUS_MAP[status] || STATUS_MAP.operational;
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
      </RoleGuard>
  );
}

function MaintenanceTypeBadge({ type }: { type: MaintenanceType }) {
  const s = MAINTENANCE_TYPE_MAP[type] || MAINTENANCE_TYPE_MAP.inspection;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const MACHINE_TYPES: { value: MachineType; label: string }[] = [
  { value: 'saw', label: 'Saw' },
  { value: 'cnc', label: 'CNC' },
  { value: 'edge_bander', label: 'Edge Bander' },
  { value: 'drill', label: 'Drill' },
  { value: 'compressor', label: 'Compressor' },
  { value: 'other', label: 'Other' },
];

const MACHINE_STATUSES: { value: MachineStatus; label: string }[] = [
  { value: 'operational', label: 'Operational' },
  { value: 'needs_maintenance', label: 'Needs Maintenance' },
  { value: 'out_of_service', label: 'Out of Service' },
];

const MAINTENANCE_TYPES: { value: MaintenanceType; label: string }[] = [
  { value: 'preventive', label: 'Preventive' },
  { value: 'corrective', label: 'Corrective' },
  { value: 'inspection', label: 'Inspection' },
];

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const canManage = ['ceo', 'workshop_manager'].includes(profile?.role || '');
  const today = new Date().toISOString().split('T')[0];

  // Data state
  const [machines, setMachines] = useState<Machine[]>([]);
  const [overdueSchedules, setOverdueSchedules] = useState<(MaintenanceSchedule & { machine?: Machine })[]>([]);
  const [loading, setLoading] = useState(true);

  // Expanded machine state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [machineSchedules, setMachineSchedules] = useState<MaintenanceSchedule[]>([]);
  const [machineRecords, setMachineRecords] = useState<MaintenanceRecord[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form toggles
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [showLogMaintenance, setShowLogMaintenance] = useState<string | null>(null);
  const [showAddSchedule, setShowAddSchedule] = useState<string | null>(null);

  // Add Machine form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<MachineType>('saw');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [newLocation, setNewLocation] = useState('');

  // Log Maintenance form
  const [logType, setLogType] = useState<MaintenanceType>('preventive');
  const [logDescription, setLogDescription] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logParts, setLogParts] = useState('');
  const [logNextDue, setLogNextDue] = useState('');
  const [logNotes, setLogNotes] = useState('');

  // Add Schedule form
  const [schedTaskName, setSchedTaskName] = useState('');
  const [schedFrequency, setSchedFrequency] = useState('');
  const [schedNextDue, setSchedNextDue] = useState('');
  const [schedNotes, setSchedNotes] = useState('');

  const [saving, setSaving] = useState(false);

  // ── Load data ──

  useEffect(() => {
    loadMachines();
    loadOverdueSchedules();
  }, []);

  async function loadMachines() {
    const { data } = await supabase
      .from('machines')
      .select('*')
      .order('name');
    setMachines((data as Machine[]) || []);
    setLoading(false);
  }

  async function loadOverdueSchedules() {
    const { data } = await supabase
      .from('maintenance_schedules')
      .select('*, machine:machines(*)')
      .eq('is_active', true)
      .lt('next_due', today)
      .order('next_due');
    setOverdueSchedules((data as (MaintenanceSchedule & { machine?: Machine })[]) || []);
  }

  async function loadMachineDetails(machineId: string) {
    setLoadingDetails(true);
    const [schedRes, recRes] = await Promise.all([
      supabase
        .from('maintenance_schedules')
        .select('*')
        .eq('machine_id', machineId)
        .eq('is_active', true)
        .order('next_due'),
      supabase
        .from('maintenance_records')
        .select('*')
        .eq('machine_id', machineId)
        .order('performed_at', { ascending: false })
        .limit(10),
    ]);
    setMachineSchedules((schedRes.data as MaintenanceSchedule[]) || []);
    setMachineRecords((recRes.data as MaintenanceRecord[]) || []);
    setLoadingDetails(false);
  }

  // ── Toggle expand ──

  function toggleExpand(machineId: string) {
    if (expandedId === machineId) {
      setExpandedId(null);
    } else {
      setExpandedId(machineId);
      loadMachineDetails(machineId);
    }
    // Reset forms when switching
    setShowLogMaintenance(null);
    setShowAddSchedule(null);
  }

  // ── Add Machine ──

  async function addMachine() {
    if (!newName.trim()) return;
    setSaving(true);
    await supabase.from('machines').insert({
      name: newName.trim(),
      machine_type: newType,
      brand: newBrand.trim() || null,
      model: newModel.trim() || null,
      serial_number: newSerial.trim() || null,
      location: newLocation.trim() || null,
      status: 'operational' as MachineStatus,
    });
    setShowAddMachine(false);
    setNewName('');
    setNewBrand('');
    setNewModel('');
    setNewSerial('');
    setNewLocation('');
    setNewType('saw');
    setSaving(false);
    loadMachines();
  }

  // ── Change status ──

  async function changeStatus(machineId: string, newStatus: MachineStatus) {
    await supabase.from('machines').update({ status: newStatus }).eq('id', machineId);
    loadMachines();
    if (expandedId === machineId) loadMachineDetails(machineId);
  }

  // ── Log Maintenance ──

  async function logMaintenance(machineId: string) {
    if (!logDescription.trim()) return;
    setSaving(true);
    await supabase.from('maintenance_records').insert({
      machine_id: machineId,
      maintenance_type: logType,
      description: logDescription.trim(),
      performed_by: profile?.id || null,
      performed_at: new Date().toISOString(),
      next_due_date: logNextDue || null,
      cost: logCost ? parseFloat(logCost) : null,
      parts_replaced: logParts.trim() || null,
      notes: logNotes.trim() || null,
    });
    setShowLogMaintenance(null);
    setLogDescription('');
    setLogCost('');
    setLogParts('');
    setLogNextDue('');
    setLogNotes('');
    setLogType('preventive');
    setSaving(false);
    loadMachineDetails(machineId);
    loadOverdueSchedules();
  }

  // ── Add Schedule ──

  async function addSchedule(machineId: string) {
    if (!schedTaskName.trim() || !schedFrequency || !schedNextDue) return;
    setSaving(true);
    await supabase.from('maintenance_schedules').insert({
      machine_id: machineId,
      task_name: schedTaskName.trim(),
      frequency_days: parseInt(schedFrequency),
      next_due: schedNextDue,
      is_active: true,
      notes: schedNotes.trim() || null,
    });
    setShowAddSchedule(null);
    setSchedTaskName('');
    setSchedFrequency('');
    setSchedNextDue('');
    setSchedNotes('');
    setSaving(false);
    loadMachineDetails(machineId);
    loadOverdueSchedules();
  }

  // ── Helpers ──

  function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function isOverdue(dateStr: string) {
    return dateStr < today;
  }

  function daysUntil(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  // ── Render ──

  const operationalCount = machines.filter(m => m.status === 'operational').length;
  const needsMaintenanceCount = machines.filter(m => m.status === 'needs_maintenance').length;
  const outOfServiceCount = machines.filter(m => m.status === 'out_of_service').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('maint.title')}</h1>
          <p className="text-sm text-[#64648B]">{machines.length} {t('maint.machines')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAddMachine(true)}>
            <Plus size={16} /> {t('maint.add_machine')}
          </Button>
        )}
      </div>

      {/* Overdue Alerts Banner */}
      {overdueSchedules.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent>
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm text-red-800">
                  {overdueSchedules.length} Overdue Maintenance Task{overdueSchedules.length > 1 ? 's' : ''}
                </h3>
                <div className="mt-2 space-y-1.5">
                  {overdueSchedules.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-red-700">
                        <span className="font-medium">{s.machine?.name || 'Unknown'}</span>
                        {' - '}{s.task_name}
                      </span>
                      <span className="text-red-500 font-medium">
                        Due {formatDate(s.next_due)} ({Math.abs(daysUntil(s.next_due))}d overdue)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <CheckCircle2 size={20} className="mx-auto text-emerald-600 mb-1" />
          <p className="text-lg font-bold text-emerald-700">{operationalCount}</p>
          <p className="text-[11px] text-emerald-600">{t('maint.operational')}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-3 text-center">
          <Wrench size={20} className="mx-auto text-yellow-600 mb-1" />
          <p className="text-lg font-bold text-yellow-700">{needsMaintenanceCount}</p>
          <p className="text-[11px] text-yellow-600">{t('maint.needs_maintenance')}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <XCircle size={20} className="mx-auto text-red-600 mb-1" />
          <p className="text-lg font-bold text-red-700">{outOfServiceCount}</p>
          <p className="text-[11px] text-red-600">{t('maint.out_of_service')}</p>
        </div>
      </div>

      {/* Add Machine Form */}
      {showAddMachine && canManage && (
        <Card className="border-[#C9956B]/30 bg-[#C9956B]/5">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[#1a1a2e]">{t('maint.add_machine')}</h3>
                <button onClick={() => setShowAddMachine(false)}><X size={18} className="text-gray-400" /></button>
              </div>

              <Input
                placeholder="Machine name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Machine Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as MachineType)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                  >
                    {MACHINE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  placeholder="Brand"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Model"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                />
                <Input
                  placeholder="Serial number"
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                />
              </div>

              <Input
                placeholder="Location (e.g., Workshop A)"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
              />

              <Button fullWidth onClick={addMachine} disabled={saving || !newName.trim()}>
                <Plus size={16} /> {saving ? t('common.loading') : t('maint.add_machine')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Machine List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
        </div>
      ) : machines.length === 0 ? (
        <div className="text-center py-12">
          <Cog size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">No machines registered yet</p>
          {canManage && <p className="text-xs text-[#64648B] mt-1">Add your first machine to start tracking maintenance</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {machines.map(machine => {
            const isExpanded = expandedId === machine.id;
            return (
              <Card key={machine.id} className="overflow-hidden">
                {/* Machine row */}
                <button
                  onClick={() => toggleExpand(machine.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#F5F3F0] flex items-center justify-center flex-shrink-0">
                    <Settings size={18} className="text-[#64648B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-[#1a1a2e] truncate">{machine.name}</h3>
                      <MachineStatusBadge status={machine.status} />
                    </div>
                    <p className="text-xs text-[#64648B] mt-0.5">
                      {MACHINE_TYPES.find(t => t.value === machine.machine_type)?.label || machine.machine_type}
                      {machine.brand && ` - ${machine.brand}`}
                      {machine.model && ` ${machine.model}`}
                      {machine.location && ` | ${machine.location}`}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp size={18} className="text-[#64648B]" /> : <ChevronDown size={18} className="text-[#64648B]" />}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-[#E8E5E0] bg-[#FAFAF8]">
                    {loadingDetails ? (
                      <div className="p-4 space-y-2">
                        <div className="h-4 skeleton rounded w-1/2" />
                        <div className="h-4 skeleton rounded w-3/4" />
                      </div>
                    ) : (
                      <div className="p-4 space-y-4">
                        {/* Machine Details */}
                        <div>
                          <h4 className="text-xs font-semibold text-[#64648B] uppercase tracking-wide mb-2">Machine Details</h4>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <div><span className="text-[#64648B]">Type:</span> <span className="text-[#1a1a2e] font-medium">{MACHINE_TYPES.find(t => t.value === machine.machine_type)?.label}</span></div>
                            <div><span className="text-[#64648B]">Brand:</span> <span className="text-[#1a1a2e] font-medium">{machine.brand || '-'}</span></div>
                            <div><span className="text-[#64648B]">Model:</span> <span className="text-[#1a1a2e] font-medium">{machine.model || '-'}</span></div>
                            <div><span className="text-[#64648B]">Serial:</span> <span className="text-[#1a1a2e] font-medium">{machine.serial_number || '-'}</span></div>
                            <div><span className="text-[#64648B]">Location:</span> <span className="text-[#1a1a2e] font-medium">{machine.location || '-'}</span></div>
                            <div><span className="text-[#64648B]">Purchased:</span> <span className="text-[#1a1a2e] font-medium">{formatDate(machine.purchase_date)}</span></div>
                          </div>
                          {machine.notes && <p className="text-xs text-[#64648B] mt-1.5 italic">{machine.notes}</p>}
                        </div>

                        {/* Status toggle */}
                        {canManage && (
                          <div>
                            <h4 className="text-xs font-semibold text-[#64648B] uppercase tracking-wide mb-2">Change Status</h4>
                            <div className="flex gap-2">
                              {MACHINE_STATUSES.map(s => (
                                <button
                                  key={s.value}
                                  onClick={() => changeStatus(machine.id, s.value)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    machine.status === s.value
                                      ? 'bg-[#1E2F52] text-white'
                                      : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EBE8E3]'
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Maintenance Schedule */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-[#64648B] uppercase tracking-wide">
                              <CalendarDays size={12} className="inline mr-1" />
                              {t('maint.next_scheduled')}
                            </h4>
                            {canManage && (
                              <button
                                onClick={() => setShowAddSchedule(showAddSchedule === machine.id ? null : machine.id)}
                                className="text-[11px] text-[#C9956B] font-medium hover:underline"
                              >
                                + Add Task
                              </button>
                            )}
                          </div>

                          {/* Add Schedule Form */}
                          {showAddSchedule === machine.id && canManage && (
                            <div className="bg-white border border-[#E8E5E0] rounded-xl p-3 mb-2 space-y-2">
                              <Input
                                placeholder="Task name (e.g., Oil change) *"
                                value={schedTaskName}
                                onChange={(e) => setSchedTaskName(e.target.value)}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  placeholder="Frequency (days) *"
                                  value={schedFrequency}
                                  onChange={(e) => setSchedFrequency(e.target.value)}
                                />
                                <Input
                                  type="date"
                                  placeholder="Next due *"
                                  value={schedNextDue}
                                  onChange={(e) => setSchedNextDue(e.target.value)}
                                />
                              </div>
                              <Textarea
                                placeholder="Notes (optional)"
                                value={schedNotes}
                                onChange={(e) => setSchedNotes(e.target.value)}
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <Button fullWidth onClick={() => addSchedule(machine.id)} disabled={saving || !schedTaskName.trim() || !schedFrequency || !schedNextDue}>
                                  {saving ? t('common.loading') : t('common.save')}
                                </Button>
                                <button onClick={() => setShowAddSchedule(null)} className="px-3 text-sm text-[#64648B] hover:text-[#1a1a2e]">
                                  {t('common.cancel')}
                                </button>
                              </div>
                            </div>
                          )}

                          {machineSchedules.length === 0 ? (
                            <p className="text-xs text-[#64648B] italic">No scheduled tasks</p>
                          ) : (
                            <div className="space-y-1.5">
                              {machineSchedules.map(s => {
                                const overdue = isOverdue(s.next_due);
                                const days = daysUntil(s.next_due);
                                return (
                                  <div
                                    key={s.id}
                                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                                      overdue ? 'bg-red-50 border border-red-200' : 'bg-white border border-[#E8E5E0]'
                                    }`}
                                  >
                                    <div>
                                      <span className={`font-medium ${overdue ? 'text-red-700' : 'text-[#1a1a2e]'}`}>
                                        {s.task_name}
                                      </span>
                                      <span className="text-[#64648B] ml-2">every {s.frequency_days}d</span>
                                    </div>
                                    <div className={`font-medium ${overdue ? 'text-red-600' : days <= 7 ? 'text-yellow-600' : 'text-[#64648B]'}`}>
                                      {overdue ? (
                                        <span className="flex items-center gap-1">
                                          <AlertTriangle size={12} />
                                          {Math.abs(days)}d overdue
                                        </span>
                                      ) : days === 0 ? (
                                        'Due today'
                                      ) : (
                                        `Due in ${days}d`
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Recent Maintenance History */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-[#64648B] uppercase tracking-wide">
                              <Activity size={12} className="inline mr-1" />
                              Recent Maintenance ({machineRecords.length})
                            </h4>
                            {canManage && (
                              <button
                                onClick={() => setShowLogMaintenance(showLogMaintenance === machine.id ? null : machine.id)}
                                className="text-[11px] text-[#C9956B] font-medium hover:underline"
                              >
                                + {t('maint.log_maintenance')}
                              </button>
                            )}
                          </div>

                          {/* Log Maintenance Form */}
                          {showLogMaintenance === machine.id && canManage && (
                            <div className="bg-white border border-[#E8E5E0] rounded-xl p-3 mb-2 space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.type')}</label>
                                <select
                                  value={logType}
                                  onChange={(e) => setLogType(e.target.value as MaintenanceType)}
                                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                                >
                                  {MAINTENANCE_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                              <Textarea
                                placeholder="Description of work performed *"
                                value={logDescription}
                                onChange={(e) => setLogDescription(e.target.value)}
                                rows={2}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  placeholder="Cost (MAD)"
                                  value={logCost}
                                  onChange={(e) => setLogCost(e.target.value)}
                                />
                                <Input
                                  type="date"
                                  placeholder="Next due date"
                                  value={logNextDue}
                                  onChange={(e) => setLogNextDue(e.target.value)}
                                />
                              </div>
                              <Input
                                placeholder="Parts replaced (optional)"
                                value={logParts}
                                onChange={(e) => setLogParts(e.target.value)}
                              />
                              <Textarea
                                placeholder="Additional notes (optional)"
                                value={logNotes}
                                onChange={(e) => setLogNotes(e.target.value)}
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <Button fullWidth onClick={() => logMaintenance(machine.id)} disabled={saving || !logDescription.trim()}>
                                  <Wrench size={14} /> {saving ? t('common.loading') : t('maint.log_maintenance')}
                                </Button>
                                <button onClick={() => setShowLogMaintenance(null)} className="px-3 text-sm text-[#64648B] hover:text-[#1a1a2e]">
                                  {t('common.cancel')}
                                </button>
                              </div>
                            </div>
                          )}

                          {machineRecords.length === 0 ? (
                            <p className="text-xs text-[#64648B] italic">No maintenance records yet</p>
                          ) : (
                            <div className="space-y-1.5">
                              {machineRecords.map(r => (
                                <div key={r.id} className="bg-white border border-[#E8E5E0] rounded-lg px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <MaintenanceTypeBadge type={r.maintenance_type} />
                                      <span className="text-xs text-[#1a1a2e] font-medium truncate max-w-[180px]">{r.description}</span>
                                    </div>
                                    <span className="text-[11px] text-[#64648B]">{formatDate(r.performed_at)}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-[11px] text-[#64648B]">
                                    {r.cost != null && <span>{r.cost.toLocaleString('fr-FR')} MAD</span>}
                                    {r.parts_replaced && <span>Parts: {r.parts_replaced}</span>}
                                    {r.next_due_date && <span>Next: {formatDate(r.next_due_date)}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
