'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  Plus, X, Check, XCircle, Calendar, AlertCircle,
  Clock, CheckCircle, Users, CalendarDays, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type LeaveStatus = 'pending' | 'approved' | 'rejected';
type LeaveType = 'annual' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'other';

interface LeaveRequest {
  id: string;
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  status: LeaveStatus;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    role: string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countWorkDays(start: string, end: string): number {
  if (!start || !end) return 0;
  let count = 0;
  const d = new Date(start);
  const e = new Date(end);
  if (d > e) return 0;
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' });
}

function statusColor(s: LeaveStatus): string {
  switch (s) {
    case 'pending':  return 'text-yellow-700 bg-yellow-100 border-yellow-200';
    case 'approved': return 'text-green-700 bg-green-100 border-green-200';
    case 'rejected': return 'text-red-700 bg-red-100 border-red-200';
  }
}

function statusLabel(s: LeaveStatus): string {
  switch (s) {
    case 'pending':  return 'En attente';
    case 'approved': return 'Approuvé';
    case 'rejected': return 'Refusé';
  }
}

function leaveTypeLabel(t: LeaveType): string {
  switch (t) {
    case 'annual':    return 'Annuel';
    case 'sick':      return 'Maladie';
    case 'personal':  return 'Personnel';
    case 'maternity': return 'Maternité';
    case 'paternity': return 'Paternité';
    case 'other':     return 'Autre';
  }
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded-lg ${className}`} />;
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusColor(status)}`}>
      {status === 'pending'  && <Clock size={10} />}
      {status === 'approved' && <CheckCircle size={10} />}
      {status === 'rejected' && <XCircle size={10} />}
      {statusLabel(status)}
    </span>
  );
}

// ── Leave Calendar (Week View — Admin only) ───────────────────────────────────

function WeekLeaveCalendar({ requests }: { requests: LeaveRequest[] }) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const weekDays: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(d);
  }

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  // Approved leaves active this week
  const activeLeaves = requests.filter(r => r.status === 'approved').filter(r => {
    const start = new Date(r.start_date);
    const end   = new Date(r.end_date);
    const weekEnd = weekDays[5];
    return start <= weekEnd && end >= monday;
  });

  if (activeLeaves.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <CalendarDays size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Aucun congé cette semaine</p>
        </CardContent>
      </Card>
    );
  }

  function isOnLeave(leave: LeaveRequest, day: Date): boolean {
    const start = new Date(leave.start_date);
    const end   = new Date(leave.end_date);
    const dayStr = day.toISOString().split('T')[0];
    const startStr = leave.start_date;
    const endStr   = leave.end_date;
    return dayStr >= startStr && dayStr <= endStr;
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-500" />
            Calendrier de la semaine
            <span className="text-xs text-gray-400 font-normal ml-1">
              {fmtDateShort(monday.toISOString())} – {fmtDateShort(weekDays[5].toISOString())}
            </span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Employé</th>
                {dayLabels.map((d, i) => {
                  const isToday = weekDays[i].toDateString() === today.toDateString();
                  return (
                    <th key={d} className={`text-center px-2 py-2.5 font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                      <div>{d}</div>
                      <div className={`text-[9px] ${isToday ? 'text-blue-500' : 'text-gray-400'}`}>
                        {weekDays[i].getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeLeaves.map(leave => (
                <tr key={leave.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {leave.profiles?.full_name ?? 'Inconnu'}
                    <span className="block text-[10px] text-gray-400">{leaveTypeLabel(leave.type)}</span>
                  </td>
                  {weekDays.map((day, i) => (
                    <td key={i} className="px-2 py-2.5 text-center">
                      {isOnLeave(leave, day) ? (
                        <span className="inline-block w-4 h-4 rounded-full bg-green-400 mx-auto" title="En congé" />
                      ) : (
                        <span className="inline-block w-4 h-4 rounded-full bg-gray-100 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── New Leave Request Modal ───────────────────────────────────────────────────

function NewLeaveModal({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (data: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    daysCount: number;
    notes: string;
  }) => Promise<void>;
  submitting: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const daysCount = countWorkDays(startDate, endDate);

  const LEAVE_TYPES: { key: LeaveType; label: string }[] = [
    { key: 'annual',    label: 'Congé annuel' },
    { key: 'sick',      label: 'Congé maladie' },
    { key: 'personal',  label: 'Congé personnel' },
    { key: 'maternity', label: 'Congé maternité' },
    { key: 'paternity', label: 'Congé paternité' },
    { key: 'other',     label: 'Autre' },
  ];

  async function handleSubmit() {
    if (!startDate || !endDate) {
      setFormError('Veuillez saisir les dates de début et de fin.');
      return;
    }
    if (endDate < startDate) {
      setFormError('La date de fin ne peut pas être avant la date de début.');
      return;
    }
    if (daysCount === 0) {
      setFormError('La période sélectionnée ne contient aucun jour ouvrable.');
      return;
    }
    setFormError('');
    await onSubmit({ type: leaveType, startDate, endDate, daysCount, notes });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nouvelle Demande de Congé</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {formError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
            <AlertCircle size={13} /> {formError}
          </div>
        )}

        {/* Leave type */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Type de congé *
          </label>
          <select
            value={leaveType}
            onChange={e => setLeaveType(e.target.value as LeaveType)}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          >
            {LEAVE_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Date de début *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Date de fin *
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
        </div>

        {/* Days count */}
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <Calendar size={16} className="text-blue-500" />
          <span className="text-sm text-blue-800">
            <span className="font-bold">{daysCount}</span> jour{daysCount !== 1 ? 's' : ''} ouvrable{daysCount !== 1 ? 's' : ''}
          </span>
          {daysCount === 0 && startDate && endDate && (
            <span className="text-xs text-orange-600 ml-1">(week-end uniquement)</span>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Motif / Commentaires
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Précisez si nécessaire..."
            rows={3}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || daysCount === 0}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {submitting ? 'Envoi...' : 'Soumettre'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rejection Modal ───────────────────────────────────────────────────────────

function RejectModal({
  onClose,
  onConfirm,
  submitting,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  submitting: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 mx-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Motif de refus</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Expliquez la raison du refus..."
          rows={4}
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting || !reason.trim()}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {submitting ? 'Refus...' : 'Confirmer le refus'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Summary Stats ───────────────────────────────────────────────────────

function AdminStats({ requests }: { requests: LeaveRequest[] }) {
  const totalPending = requests.filter(r => r.status === 'pending').length;

  const now = new Date();
  const approvedThisMonth = requests.filter(r => {
    if (r.status !== 'approved') return false;
    const d = new Date(r.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const todayStr = now.toISOString().split('T')[0];
  const onLeaveToday = requests.filter(r =>
    r.status === 'approved' &&
    r.start_date <= todayStr &&
    r.end_date >= todayStr
  ).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        {
          label: 'En attente',
          value: totalPending,
          icon: <Clock size={18} className="text-yellow-500" />,
          bg: 'bg-yellow-50',
          valueColor: totalPending > 0 ? 'text-yellow-700' : 'text-gray-700',
        },
        {
          label: 'Approuvés ce mois',
          value: approvedThisMonth,
          icon: <CheckCircle size={18} className="text-green-500" />,
          bg: 'bg-green-50',
          valueColor: 'text-green-700',
        },
        {
          label: "En congé auj.",
          value: onLeaveToday,
          icon: <Users size={18} className="text-blue-500" />,
          bg: 'bg-blue-50',
          valueColor: 'text-blue-700',
        },
      ].map((s, i) => (
        <Card key={i}>
          <CardContent className="p-3 text-center">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mx-auto mb-1.5`}>
              {s.icon}
            </div>
            <p className={`text-xl font-bold ${s.valueColor}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 leading-tight">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Employee Summary Stats ────────────────────────────────────────────────────

function EmployeeStats({ requests }: { requests: LeaveRequest[] }) {
  const currentYear = new Date().getFullYear();
  const usedThisYear = requests
    .filter(r => r.status === 'approved' && new Date(r.start_date).getFullYear() === currentYear)
    .reduce((s, r) => s + r.days_count, 0);

  const ANNUAL_ENTITLEMENT = 18; // Standard Moroccan labor law: 18 days/year
  const remaining = Math.max(0, ANNUAL_ENTITLEMENT - usedThisYear);
  const pending = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        {
          label: 'Utilisés cette année',
          value: usedThisYear + 'j',
          icon: <Calendar size={18} className="text-orange-500" />,
          bg: 'bg-orange-50',
          valueColor: 'text-orange-700',
        },
        {
          label: 'Reste annuel',
          value: remaining + 'j',
          icon: <CalendarDays size={18} className="text-green-500" />,
          bg: 'bg-green-50',
          valueColor: remaining > 0 ? 'text-green-700' : 'text-red-600',
        },
        {
          label: 'En attente',
          value: pending,
          icon: <Clock size={18} className="text-yellow-500" />,
          bg: 'bg-yellow-50',
          valueColor: pending > 0 ? 'text-yellow-700' : 'text-gray-600',
        },
      ].map((s, i) => (
        <Card key={i}>
          <CardContent className="p-3 text-center">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mx-auto mb-1.5`}>
              {s.icon}
            </div>
            <p className={`text-xl font-bold ${s.valueColor}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 leading-tight">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HRLeavesPage() {
  const supabase = createClient();
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'hr_manager' || profile?.role === 'ceo';

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters (admin)
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError('');

    let query;
    if (isAdmin) {
      query = supabase
        .from('leave_requests')
        .select('*, profiles(full_name, role)')
        .order('created_at', { ascending: false });
    } else {
      query = supabase
        .from('leave_requests')
        .select('*, profiles(full_name, role)')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
    }

    const { data, error: err } = await query;
    if (err) {
      setError('Erreur de chargement: ' + err.message);
    } else {
      setRequests((data as LeaveRequest[]) ?? []);
    }
    setLoading(false);
  }, [profile, isAdmin]);

  useEffect(() => { load(); }, [load]);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  // ── Submit new leave ──

  async function handleSubmitLeave(form: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    daysCount: number;
    notes: string;
  }) {
    if (!profile) return;
    setSubmitting(true);
    const { error: err } = await supabase.from('leave_requests').insert({
      user_id: profile.id,
      type: form.type,
      start_date: form.startDate,
      end_date: form.endDate,
      days_count: form.daysCount,
      status: 'pending',
      notes: form.notes || null,
    });
    setSubmitting(false);
    if (err) {
      setError('Erreur lors de la soumission: ' + err.message);
      return;
    }
    setShowNewModal(false);
    showSuccess('Demande de congé soumise avec succès.');
    load();
  }

  // ── Approve ──

  async function handleApprove(req: LeaveRequest) {
    setApprovingId(req.id);
    const { error: err } = await supabase
      .from('leave_requests')
      .update({ status: 'approved' })
      .eq('id', req.id);

    if (!err) {
      // Notify employee
      const startFmt = fmtDate(req.start_date);
      const endFmt   = fmtDate(req.end_date);
      await supabase.from('notifications').insert({
        user_id: req.user_id,
        type: 'leave_approved',
        title: 'Congé approuvé',
        body: `Votre demande de congé du ${startFmt} au ${endFmt} a été approuvée.`,
        is_read: false,
      });
      showSuccess('Congé approuvé et employé notifié.');
      load();
    } else {
      setError('Erreur lors de l\'approbation: ' + err.message);
    }
    setApprovingId(null);
  }

  // ── Reject ──

  async function handleReject(reason: string) {
    if (!rejectTarget) return;
    setRejectSubmitting(true);
    const { error: err } = await supabase
      .from('leave_requests')
      .update({ status: 'rejected', rejection_reason: reason || null })
      .eq('id', rejectTarget.id);

    if (!err) {
      showSuccess('Demande refusée.');
      load();
      setRejectTarget(null);
    } else {
      setError('Erreur lors du refus: ' + err.message);
    }
    setRejectSubmitting(false);
  }

  // ── Filtered list ──

  const filtered = requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (employeeFilter) {
      const q = employeeFilter.toLowerCase();
      if (!(r.profiles?.full_name ?? '').toLowerCase().includes(q)) return false;
    }
    if (monthFilter) {
      const startMonth = r.start_date.slice(0, 7); // yyyy-mm
      if (startMonth !== monthFilter) return false;
    }
    return true;
  });

  // ── Render ──

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager']}>
      <div className="min-h-screen bg-gray-50 pb-16">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CalendarDays size={20} className="text-blue-600" />
                {isAdmin ? 'Gestion des Congés' : 'Mes Congés'}
              </h1>
              <p className="text-xs text-gray-500">
                {isAdmin ? 'Toutes les demandes des employés' : 'Vos demandes de congé'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={load}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <RefreshCw size={16} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {!isAdmin && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  Nouvelle demande
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 mt-5 space-y-5">

          {/* Banners */}
          {successMsg && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
              <CheckCircle size={16} /> {successMsg}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} className="p-1 hover:bg-red-100 rounded">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Summary stats */}
          {!loading && (
            isAdmin
              ? <AdminStats requests={requests} />
              : <EmployeeStats requests={requests} />
          )}
          {loading && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          )}

          {/* Calendar — admin only */}
          {isAdmin && !loading && (
            <WeekLeaveCalendar requests={requests} />
          )}

          {/* Admin: New leave button at top (employees have it in header) */}
          {isAdmin && (
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Toutes les demandes</h2>
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} /> Ajouter pour un employé
              </button>
            </div>
          )}

          {/* Admin filters */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2 items-center">
              {/* Status filter */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {s === 'all' ? 'Tous' : statusLabel(s as LeaveStatus)}
                  </button>
                ))}
              </div>
              {/* Employee search */}
              <input
                type="text"
                placeholder="Filtrer par employé..."
                value={employeeFilter}
                onChange={e => setEmployeeFilter(e.target.value)}
                className="px-3.5 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[150px]"
              />
              {/* Month filter */}
              <input
                type="month"
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                className="px-3.5 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              {(statusFilter !== 'all' || employeeFilter || monthFilter) && (
                <button
                  onClick={() => { setStatusFilter('all'); setEmployeeFilter(''); setMonthFilter(''); }}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          )}

          {/* Leave list */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <CalendarDays size={36} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">Aucune demande de congé</p>
                {!isAdmin && (
                  <p className="text-xs text-gray-400 mt-1">
                    Cliquez sur "Nouvelle demande" pour soumettre un congé
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden md:block overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {isAdmin && (
                            <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Employé</th>
                          )}
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Type</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Du</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Au</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Jours</th>
                          <th className="text-center px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Statut</th>
                          {isAdmin && (
                            <th className="text-center px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filtered.map(req => (
                          <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{req.profiles?.full_name ?? '—'}</p>
                                <p className="text-[10px] text-gray-400 capitalize">{req.profiles?.role?.replace('_', ' ')}</p>
                              </td>
                            )}
                            <td className="px-4 py-3 text-gray-700">{leaveTypeLabel(req.type)}</td>
                            <td className="px-4 py-3 text-gray-700">{fmtDate(req.start_date)}</td>
                            <td className="px-4 py-3 text-gray-700">{fmtDate(req.end_date)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                                {req.days_count}j
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <StatusBadge status={req.status} />
                                {req.status === 'rejected' && req.rejection_reason && (
                                  <span className="text-[9px] text-red-500 max-w-[120px] truncate" title={req.rejection_reason}>
                                    {req.rejection_reason}
                                  </span>
                                )}
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3 text-center">
                                {req.status === 'pending' ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => handleApprove(req)}
                                      disabled={approvingId === req.id}
                                      className="w-7 h-7 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
                                      title="Approuver"
                                    >
                                      {approvingId === req.id
                                        ? <RefreshCw size={12} className="animate-spin" />
                                        : <Check size={14} />
                                      }
                                    </button>
                                    <button
                                      onClick={() => setRejectTarget(req)}
                                      className="w-7 h-7 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg flex items-center justify-center transition-colors"
                                      title="Refuser"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400">—</span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2.5">
                {filtered.map(req => (
                  <Card key={req.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          {isAdmin && (
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {req.profiles?.full_name ?? '—'}
                            </p>
                          )}
                          <p className={`text-sm font-medium ${isAdmin ? 'text-gray-600' : 'text-gray-900'}`}>
                            {leaveTypeLabel(req.type)}
                          </p>
                        </div>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="text-gray-400" />
                          {fmtDate(req.start_date)} — {fmtDate(req.end_date)}
                        </span>
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                          {req.days_count}j
                        </span>
                      </div>
                      {req.notes && (
                        <p className="text-xs text-gray-500 mt-1.5 italic">{req.notes}</p>
                      )}
                      {req.status === 'rejected' && req.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1.5 bg-red-50 rounded px-2 py-1">
                          Motif: {req.rejection_reason}
                        </p>
                      )}
                      {isAdmin && req.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleApprove(req)}
                            disabled={approvingId === req.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {approvingId === req.id
                              ? <RefreshCw size={12} className="animate-spin" />
                              : <Check size={14} />
                            }
                            Approuver
                          </button>
                          <button
                            onClick={() => setRejectTarget(req)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl text-xs font-medium transition-colors"
                          >
                            <XCircle size={14} /> Refuser
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Modals */}
        {showNewModal && (
          <NewLeaveModal
            onClose={() => setShowNewModal(false)}
            onSubmit={handleSubmitLeave}
            submitting={submitting}
          />
        )}

        {rejectTarget && (
          <RejectModal
            onClose={() => setRejectTarget(null)}
            onConfirm={handleReject}
            submitting={rejectSubmitting}
          />
        )}
      </div>
    </RoleGuard>
  );
}
