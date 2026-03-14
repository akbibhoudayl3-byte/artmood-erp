'use client';

/**
 * Work Time Reports — Manager view
 *
 * Tabs: Daily | Employees | Projects | Stages
 * Role-gated: workshop_manager, operations_manager, hr_manager, ceo, owner_admin
 *
 * Deploy to: src/app/(app)/hr/work-time/page.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { useLocale } from '@/lib/hooks/useLocale';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  Clock, Users, FolderOpen, BarChart2, Calendar,
  ChevronDown, ChevronUp, Download, RefreshCw,
  MapPin, Briefcase, TrendingUp, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyRow {
  work_date:          string;
  user_id:            string;
  full_name:          string;
  role:               string;
  checked_in:         boolean;
  check_in_time:      string | null;
  check_out_time:     string | null;
  session_count:      number;
  total_worked_minutes: number;
  company_minutes:    number;
  client_minutes:     number;
}

interface EmployeeRow {
  user_id:         string;
  employee_name:   string;
  role:            string;
  total_minutes:   number;
  company_minutes: number;
  client_minutes:  number;
  session_count:   number;
  task_breakdown:  Record<string, number>;
}

interface ProjectRow {
  project_id:      string;
  reference_code:  string;
  client_name:     string;
  total_minutes:   number;
  session_count:   number;
  employee_count:  number;
  stages:          Record<string, number>;
}

interface StageRow {
  stage:           string;
  task_type:       string;
  location_type:   string;
  total_minutes:   number;
  session_count:   number;
  employee_count:  number;
}

type ReportType = 'daily' | 'employee' | 'project' | 'stage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-MA', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-MA', {
    hour: '2-digit', minute: '2-digit',
  });
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const TASK_LABELS: Record<string, string> = {
  production:    'Production',
  cutting:       'Découpe',
  edge_banding:  'Chants',
  assembly:      'Assemblage',
  finishing:     'Finition',
  installation:  'Installation',
  quality_check: 'Contrôle QC',
  administrative:'Administratif',
  other:         'Autre',
};

const ROLE_LABELS: Record<string, string> = {
  owner_admin:          'Admin',
  ceo:                  'CEO',
  operations_manager:   'Ops Manager',
  commercial_manager:   'Commercial',
  hr_manager:           'RH',
  workshop_manager:     'Chef Atelier',
  workshop_worker:      'Ouvrier',
  designer:             'Designer',
  installer:            'Installateur',
  logistics:            'Logistique',
};

// ── Mini components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'blue' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="opacity-70">{icon}</span>
        <span className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

function TaskBreakdown({ data }: { data: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        {entries.length} type{entries.length > 1 ? 's' : ''}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="text-xs text-gray-600 flex gap-1">
              <span className="font-medium">{TASK_LABELS[k] ?? k}:</span>
              <span>{fmtMinutes(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Daily Tab ─────────────────────────────────────────────────────────────────

function DailyTab({ rows, loading }: { rows: DailyRow[]; loading: boolean }) {
  if (loading) return <LoadingRows />;
  if (rows.length === 0) return <EmptyState msg="Aucun pointage pour cette période." />;

  // Group by date
  const byDate: Record<string, DailyRow[]> = {};
  for (const r of rows) {
    (byDate[r.work_date] ??= []).push(r);
  }

  return (
    <div className="space-y-4">
      {Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayRows]) => {
        const present = dayRows.filter(r => r.checked_in).length;
        const totalMins = dayRows.reduce((s, r) => s + (r.total_worked_minutes ?? 0), 0);
        return (
          <div key={date} className="rounded-xl border border-gray-200 overflow-hidden">
            {/* Date header */}
            <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200">
              <span className="font-semibold text-gray-700">{fmtDate(date)}</span>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="text-green-600 font-medium">{present} présent{present > 1 ? 's' : ''}</span>
                <span>{fmtMinutes(totalMins)} total</span>
              </div>
            </div>
            {/* Rows */}
            <div className="divide-y divide-gray-100">
              {dayRows.map(r => (
                <div key={r.user_id + date} className="px-4 py-3 flex flex-wrap gap-2 items-center text-sm">
                  <div className="w-40 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{r.full_name}</p>
                    <p className="text-xs text-gray-400">{ROLE_LABELS[r.role] ?? r.role}</p>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 flex-1 min-w-0">
                    {r.checked_in ? (
                      <>
                        <span className="text-green-600">✓ {fmtTime(r.check_in_time)}</span>
                        {r.check_out_time && <span className="text-red-500">↓ {fmtTime(r.check_out_time)}</span>}
                      </>
                    ) : (
                      <span className="text-gray-400 italic">Absent</span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs ml-auto">
                    <span className="text-blue-600 font-medium">{fmtMinutes(r.total_worked_minutes)}</span>
                    {r.company_minutes > 0 && <span className="text-gray-400">🏭 {fmtMinutes(r.company_minutes)}</span>}
                    {r.client_minutes > 0  && <span className="text-gray-400">🏠 {fmtMinutes(r.client_minutes)}</span>}
                    {r.session_count > 0   && <span className="text-gray-300">{r.session_count} session{r.session_count > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Employee Tab ───────────────────────────────────────────────────────────────

function EmployeeTab({ rows, loading }: { rows: EmployeeRow[]; loading: boolean }) {
  if (loading) return <LoadingRows />;
  if (rows.length === 0) return <EmptyState msg="Aucune donnée employé pour cette période." />;

  const totalMins = rows.reduce((s, r) => s + r.total_minutes, 0);
  const totalSessions = rows.reduce((s, r) => s + r.session_count, 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />} label="Employés actifs" value={String(rows.length)} color="blue" />
        <StatCard icon={<Clock size={16} />} label="Heures totales" value={fmtMinutes(totalMins)} color="green" />
        <StatCard icon={<BarChart2 size={16} />} label="Sessions" value={String(totalSessions)} color="purple" />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Moy./employé"
          value={rows.length ? fmtMinutes(Math.round(totalMins / rows.length)) : '—'}
          color="orange"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Employé</th>
              <th className="px-4 py-2 text-center">Sessions</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Atelier</th>
              <th className="px-4 py-2 text-right">Chantier</th>
              <th className="px-4 py-2 text-left">Répartition tâches</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.user_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{r.employee_name}</p>
                  <p className="text-xs text-gray-400">{ROLE_LABELS[r.role] ?? r.role}</p>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{r.session_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmtMinutes(r.total_minutes)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{fmtMinutes(r.company_minutes)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{fmtMinutes(r.client_minutes)}</td>
                <td className="px-4 py-3"><TaskBreakdown data={r.task_breakdown} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Project Tab ────────────────────────────────────────────────────────────────

function ProjectTab({ rows, loading }: { rows: ProjectRow[]; loading: boolean }) {
  if (loading) return <LoadingRows />;
  if (rows.length === 0) return <EmptyState msg="Aucun temps enregistré sur des projets pour cette période." />;

  const totalMins = rows.reduce((s, r) => s + r.total_minutes, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={<FolderOpen size={16} />} label="Projets actifs" value={String(rows.length)} color="blue" />
        <StatCard icon={<Clock size={16} />} label="Heures totales" value={fmtMinutes(totalMins)} color="green" />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Moy./projet"
          value={rows.length ? fmtMinutes(Math.round(totalMins / rows.length)) : '—'}
          color="orange"
        />
      </div>

      <div className="rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Projet</th>
              <th className="px-4 py-2 text-center">Sessions</th>
              <th className="px-4 py-2 text-center">Employés</th>
              <th className="px-4 py-2 text-right">Temps total</th>
              <th className="px-4 py-2 text-left">Étapes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.project_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{r.reference_code}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[160px]">{r.client_name}</p>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{r.session_count}</td>
                <td className="px-4 py-3 text-center text-gray-600">{r.employee_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmtMinutes(r.total_minutes)}</td>
                <td className="px-4 py-3"><TaskBreakdown data={r.stages} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stage Tab ─────────────────────────────────────────────────────────────────

function StageTab({ rows, loading }: { rows: StageRow[]; loading: boolean }) {
  if (loading) return <LoadingRows />;
  if (rows.length === 0) return <EmptyState msg="Aucune donnée par étape pour cette période." />;

  // Aggregate totals
  const companyMins = rows.filter(r => r.location_type === 'company').reduce((s, r) => s + r.total_minutes, 0);
  const clientMins  = rows.filter(r => r.location_type === 'client').reduce((s, r) => s + r.total_minutes, 0);
  const totalMins   = companyMins + clientMins;

  // Group by stage
  const byStage: Record<string, StageRow[]> = {};
  for (const r of rows) {
    (byStage[r.stage] ??= []).push(r);
  }

  return (
    <div className="space-y-3">
      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={<Clock size={16} />} label="Total général" value={fmtMinutes(totalMins)} color="blue" />
        <StatCard icon={<MapPin size={16} />} label="🏭 Atelier" value={fmtMinutes(companyMins)}
          sub={totalMins ? `${Math.round(companyMins / totalMins * 100)}%` : ''} color="green" />
        <StatCard icon={<MapPin size={16} />} label="🏠 Chantier" value={fmtMinutes(clientMins)}
          sub={totalMins ? `${Math.round(clientMins / totalMins * 100)}%` : ''} color="orange" />
      </div>

      {/* Bar chart style breakdown */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">
          Répartition par étape
        </div>
        <div className="divide-y divide-gray-100">
          {Object.entries(byStage)
            .map(([stage, stageRows]) => ({
              stage,
              total: stageRows.reduce((s, r) => s + r.total_minutes, 0),
              company: stageRows.filter(r => r.location_type === 'company').reduce((s, r) => s + r.total_minutes, 0),
              client: stageRows.filter(r => r.location_type === 'client').reduce((s, r) => s + r.total_minutes, 0),
              sessions: stageRows.reduce((s, r) => s + r.session_count, 0),
              employees: Math.max(...stageRows.map(r => r.employee_count)),
            }))
            .sort((a, b) => b.total - a.total)
            .map(({ stage, total, company, client, sessions, employees }) => {
              const pct = totalMins > 0 ? Math.round(total / totalMins * 100) : 0;
              return (
                <div key={stage} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700 text-sm">{TASK_LABELS[stage] ?? stage}</span>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{sessions} sess.</span>
                      <span>{employees} emp.</span>
                      <span className="font-semibold text-blue-700 w-16 text-right">{fmtMinutes(total)}</span>
                      <span className="text-gray-400 w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Sub-location split */}
                  {(company > 0 || client > 0) && (
                    <div className="flex gap-4 mt-1 text-xs text-gray-400">
                      {company > 0 && <span>🏭 {fmtMinutes(company)}</span>}
                      {client > 0  && <span>🏠 {fmtMinutes(client)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Full table */}
      <div className="rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Étape / Tâche</th>
              <th className="px-4 py-2 text-center">Lieu</th>
              <th className="px-4 py-2 text-center">Sessions</th>
              <th className="px-4 py-2 text-center">Employés</th>
              <th className="px-4 py-2 text-right">Temps</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{TASK_LABELS[r.stage] ?? r.stage}</p>
                  {r.stage !== r.task_type && (
                    <p className="text-xs text-gray-400">{TASK_LABELS[r.task_type] ?? r.task_type}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.location_type === 'company'
                    ? <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">🏭 Atelier</span>
                    : <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">🏠 Chantier</span>
                  }
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{r.session_count}</td>
                <td className="px-4 py-3 text-center text-gray-600">{r.employee_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmtMinutes(r.total_minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared atoms ─────────────────────────────────────────────────────────────

function LoadingRows() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-12 bg-gray-100 rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
      <Clock size={40} strokeWidth={1.5} />
      <p className="text-sm">{msg}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkTimeReportsPage() {
  const { t }    = useLocale();
  const { profile } = useAuth();

  const [tab,     setTab]     = useState<ReportType>('daily');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Date range — default: last 7 days
  const [fromDate, setFromDate] = useState<string>(() => isoDate(new Date(Date.now() - 6 * 86_400_000)));
  const [toDate,   setToDate]   = useState<string>(() => isoDate(new Date()));

  // Filter: employee (managers only)
  const [userFilter,    setUserFilter]    = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Report data
  const [dailyRows,    setDailyRows]    = useState<DailyRow[]>([]);
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>([]);
  const [projectRows,  setProjectRows]  = useState<ProjectRow[]>([]);
  const [stageRows,    setStageRows]    = useState<StageRow[]>([]);

  const isFullManager = ['owner_admin', 'ceo', 'operations_manager', 'hr_manager'].includes(profile?.role ?? '');

  const fetchReport = useCallback(async (type: ReportType) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        type,
        from: fromDate,
        to:   toDate,
      });
      if (userFilter)    params.set('user_id',    userFilter);
      if (projectFilter) params.set('project_id', projectFilter);

      const res  = await fetch(`/api/work-time/reports?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Erreur lors du chargement du rapport.');
        return;
      }

      if (type === 'daily')    setDailyRows(data.rows ?? []);
      if (type === 'employee') setEmployeeRows(data.rows ?? []);
      if (type === 'project')  setProjectRows(data.rows ?? []);
      if (type === 'stage')    setStageRows(data.rows ?? []);
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, userFilter, projectFilter]);

  // Fetch on tab/filter change
  useEffect(() => { fetchReport(tab); }, [tab, fetchReport]);

  // Shortcut helpers
  function setRange(days: number) {
    setFromDate(isoDate(new Date(Date.now() - (days - 1) * 86_400_000)));
    setToDate(isoDate(new Date()));
  }

  const TABS: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: 'daily',    label: 'Journalier',  icon: <Calendar size={16} /> },
    { key: 'employee', label: 'Employés',    icon: <Users size={16} /> },
    { key: 'project',  label: 'Projets',     icon: <FolderOpen size={16} /> },
    { key: 'stage',    label: 'Étapes',      icon: <BarChart2 size={16} /> },
  ];

  return (
    <RoleGuard roles={['workshop_manager', 'operations_manager', 'hr_manager', 'ceo', 'owner_admin']}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Clock size={22} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Rapports Temps de Travail</h1>
              <p className="text-sm text-gray-500">Pointage & activité de l'équipe</p>
            </div>
          </div>
          <button
            onClick={() => fetchReport(tab)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          {/* Date shortcuts */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Aujourd\'hui', days: 1 },
              { label: '7 jours',     days: 7 },
              { label: '30 jours',    days: 30 },
            ].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => setRange(days)}
                className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date range inputs */}
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Du
              <input
                type="date" value={fromDate}
                max={toDate}
                onChange={e => setFromDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Au
              <input
                type="date" value={toDate}
                min={fromDate}
                max={isoDate(new Date())}
                onChange={e => setToDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
          </div>

          {/* Optional filters (manager-only) */}
          {isFullManager && (
            <div className="flex flex-wrap gap-3">
              <input
                type="text" placeholder="Filtrer par user_id…"
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="text" placeholder="Filtrer par project_id…"
                value={projectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'daily'    && <DailyTab    rows={dailyRows}    loading={loading} />}
        {tab === 'employee' && <EmployeeTab rows={employeeRows} loading={loading} />}
        {tab === 'project'  && <ProjectTab  rows={projectRows}  loading={loading} />}
        {tab === 'stage'    && <StageTab    rows={stageRows}    loading={loading} />}

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Données en temps réel — les sessions en cours ne sont pas incluses dans les totaux.
        </p>
      </div>
    </RoleGuard>
  );
}
