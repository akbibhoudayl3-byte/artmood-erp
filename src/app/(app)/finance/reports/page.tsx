'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  RefreshCw, ArrowLeft, ArrowUpRight, Download,
  CheckCircle, AlertTriangle, XCircle, Package,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfitHealth = 'healthy' | 'warning' | 'critical' | 'loss' | 'uncalculated';
type HealthFilter = 'all' | ProfitHealth;
type DateRangeFilter = 'current_month' | 'last_3_months' | 'this_year' | 'all';

interface MonthlyPL {
  month: string;
  total_income: number;
  total_expenses: number;
  gross_profit: number;
  net_profit: number;
  gross_margin_percent: number;
}

interface ProjectIntel {
  id: string;
  reference_code: string | null;
  client_name: string;
  status: string;
  project_type: string;
  sale_price: number;
  total_project_costs: number;
  estimated_profit: number;
  margin_percent: number;
  profit_health: ProfitHealth;
}

interface DashboardData {
  summary: Record<string, number>;
  monthly_pl: MonthlyPL[];
  all_projects: ProjectIntel[];
}

interface MonthlyCashflow {
  month: string;
  total_payments: number;
  total_expenses: number;
  net_flow: number;
}

interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
  project?: { reference_code: string | null; client_name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD';
}

function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-MA', { month: 'short', year: '2-digit' });
}

function healthColor(h: ProfitHealth): string {
  switch (h) {
    case 'healthy':      return 'text-green-700 bg-green-100';
    case 'warning':      return 'text-yellow-700 bg-yellow-100';
    case 'critical':     return 'text-orange-700 bg-orange-100';
    case 'loss':         return 'text-red-700 bg-red-100';
    default:             return 'text-gray-500 bg-gray-100';
  }
}

function healthIcon(h: ProfitHealth) {
  switch (h) {
    case 'healthy':  return <CheckCircle size={13} />;
    case 'loss':     return <XCircle size={13} />;
    case 'critical':
    case 'warning':  return <AlertTriangle size={13} />;
    default:         return <BarChart3 size={13} />;
  }
}

function marginColor(pct: number): string {
  if (pct >= 30) return 'text-green-700 bg-green-100';
  if (pct >= 15) return 'text-yellow-700 bg-yellow-100';
  return 'text-red-700 bg-red-100';
}

function getDateFilter(range: DateRangeFilter): string | null {
  const now = new Date();
  switch (range) {
    case 'current_month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    case 'last_3_months':
      return new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    default:
      return null;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded-lg ${className}`} />;
}

// Simple CSS bar chart — no library
function CashflowBars({ data }: { data: MonthlyCashflow[] }) {
  if (!data.length) return <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée</p>;
  const maxAbs = Math.max(...data.map(d => Math.max(Math.abs(d.total_payments), Math.abs(d.total_expenses))), 1);
  const CHART_HEIGHT = 100;

  return (
    <div className="flex items-end gap-1.5 h-28 w-full overflow-x-auto pb-1">
      {data.slice().reverse().map((d, i) => {
        const incH = Math.round((d.total_payments / maxAbs) * CHART_HEIGHT);
        const expH = Math.round((d.total_expenses / maxAbs) * CHART_HEIGHT);
        const positive = d.net_flow >= 0;
        return (
          <div key={i} className="flex-1 min-w-[32px] flex flex-col items-center gap-0.5"
            title={`${fmtMonth(d.month)} — Encaissements: ${fmt(d.total_payments)}, Dépenses: ${fmt(d.total_expenses)}, Net: ${fmt(d.net_flow)}`}>
            <div className="w-full flex items-end justify-center gap-px" style={{ height: CHART_HEIGHT + 4 }}>
              <div className="w-3 rounded-t bg-blue-400 transition-all" style={{ height: incH }} />
              <div className="w-3 rounded-t bg-red-300 transition-all" style={{ height: expH }} />
            </div>
            <span className={`text-[9px] font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
              {fmtMonth(d.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal bar chart for expense categories
function CategoryBars({ data }: { data: { category: string; total: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.total), 1);
  const colors = ['bg-blue-400', 'bg-emerald-400', 'bg-purple-400', 'bg-orange-400', 'bg-pink-400', 'bg-teal-400'];

  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const pct = (item.total / max) * 100;
        return (
          <div key={item.category} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 truncate capitalize">{item.category.replace('_', ' ')}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${colors[i % colors.length]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700 w-28 text-right">{fmt(item.total)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Monthly P&L ─────────────────────────────────────────────────────────

function MonthlyPLTab({ monthlyPL, loading }: { monthlyPL: MonthlyPL[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // YTD aggregates
  const now = new Date();
  const currentYear = now.getFullYear();
  const ytdRows = monthlyPL.filter(m => new Date(m.month).getFullYear() === currentYear);

  const ytdRevenue  = ytdRows.reduce((s, m) => s + m.total_income, 0);
  const ytdCosts    = ytdRows.reduce((s, m) => s + m.total_expenses, 0);
  const ytdProfit   = ytdRows.reduce((s, m) => s + m.gross_profit, 0);
  const avgMargin   = ytdRows.length > 0
    ? ytdRows.reduce((s, m) => s + m.gross_margin_percent, 0) / ytdRows.length
    : 0;

  // Totals for all rows shown
  const totalRevenue  = monthlyPL.reduce((s, m) => s + m.total_income, 0);
  const totalCosts    = monthlyPL.reduce((s, m) => s + m.total_expenses, 0);
  const totalGross    = monthlyPL.reduce((s, m) => s + m.gross_profit, 0);
  const totalNet      = monthlyPL.reduce((s, m) => s + m.net_profit, 0);
  const overallMargin = totalRevenue > 0 ? (totalGross / totalRevenue) * 100 : 0;

  const summaryCards = [
    { label: 'Revenus YTD',    value: fmt(ytdRevenue),  icon: <TrendingUp size={18} className="text-blue-500" />,    bg: 'bg-blue-50' },
    { label: 'Charges YTD',    value: fmt(ytdCosts),    icon: <TrendingDown size={18} className="text-red-500" />,   bg: 'bg-red-50' },
    { label: 'Bénéfice YTD',   value: fmt(ytdProfit),   icon: <DollarSign size={18} className={ytdProfit >= 0 ? 'text-emerald-500' : 'text-red-500'} />, bg: ytdProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
    { label: 'Marge Moyenne',  value: avgMargin.toFixed(1) + '%', icon: <BarChart3 size={18} className="text-purple-500" />, bg: 'bg-purple-50' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
                {c.icon}
              </div>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table — desktop */}
      <Card className="hidden md:block overflow-hidden">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Compte de Résultat Mensuel</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Mois</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Revenus</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Charges</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Bénéf. Brut</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Bénéf. Net</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Marge %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthlyPL.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      Aucune donnée disponible
                    </td>
                  </tr>
                ) : (
                  monthlyPL.slice().reverse().map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {new Date(m.month).toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-700 font-medium">{fmt(m.total_income)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{fmt(m.total_expenses)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${m.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt(m.gross_profit)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${m.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt(m.net_profit)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${marginColor(m.gross_margin_percent)}`}>
                          {m.gross_margin_percent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {monthlyPL.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <td className="px-4 py-3 text-gray-900 text-xs uppercase tracking-wide">Total</td>
                    <td className="px-4 py-3 text-right text-blue-800">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-3 text-right text-red-700">{fmt(totalCosts)}</td>
                    <td className={`px-4 py-3 text-right ${totalGross >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>{fmt(totalGross)}</td>
                    <td className={`px-4 py-3 text-right ${totalNet >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>{fmt(totalNet)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${marginColor(overallMargin)}`}>
                        {overallMargin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {monthlyPL.slice().reverse().map((m, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(m.month).toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })}
                </p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${marginColor(m.gross_margin_percent)}`}>
                  {m.gross_margin_percent.toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">Revenus</p>
                  <p className="font-medium text-blue-700">{fmt(m.total_income)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Charges</p>
                  <p className="font-medium text-red-600">{fmt(m.total_expenses)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Bénéfice</p>
                  <p className={`font-semibold ${m.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(m.gross_profit)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Project Profitability ────────────────────────────────────────────────

function ProjectProfitabilityTab({
  projects,
  loading,
  onNavigate,
}: {
  projects: ProjectIntel[];
  loading: boolean;
  onNavigate: (id: string) => void;
}) {
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [search, setSearch] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const filtered = projects.filter(p => {
    if (healthFilter !== 'all' && p.profit_health !== healthFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.client_name.toLowerCase().includes(q) &&
        !(p.reference_code ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  function showExportToast() {
    setToastMsg('Export disponible prochainement');
    setTimeout(() => setToastMsg(''), 3000);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toastMsg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-2 text-sm text-center">
          {toastMsg}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Rechercher client / référence..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
        />
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {(['all', 'healthy', 'warning', 'critical', 'loss'] as const).map(h => (
            <button
              key={h}
              onClick={() => setHealthFilter(h)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                healthFilter === h
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {h === 'all' ? 'Tous' : h}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={showExportToast}>
          <Download size={14} /> Export
        </Button>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Référence</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Client</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Prix de Vente</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Coûts</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Bénéfice</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Marge</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Santé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      Aucun projet correspondant
                    </td>
                  </tr>
                ) : (
                  filtered.map(p => (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => onNavigate(p.id)}
                    >
                      <td className="px-4 py-3 font-mono text-gray-600 text-[11px]">
                        {p.reference_code ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.client_name}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(p.sale_price)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {p.total_project_costs > 0 ? fmt(p.total_project_costs) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${p.estimated_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {p.total_project_costs > 0 ? fmt(p.estimated_profit) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.total_project_costs > 0 ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${marginColor(p.margin_percent)}`}>
                            {p.margin_percent.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-300 text-[10px]">Sans coûts</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${healthColor(p.profit_health)}`}>
                          {healthIcon(p.profit_health)}
                          {p.profit_health}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map(p => (
          <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate(p.id)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.client_name}</p>
                  <p className="text-[11px] text-gray-500 font-mono">{p.reference_code ?? '—'}</p>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${healthColor(p.profit_health)}`}>
                    {healthIcon(p.profit_health)}
                    {p.profit_health}
                  </span>
                  <ArrowUpRight size={14} className="text-gray-400" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                <div>
                  <p className="text-gray-400">Vente</p>
                  <p className="font-medium text-gray-800">{fmt(p.sale_price)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Bénéfice</p>
                  <p className={`font-medium ${p.estimated_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {p.total_project_costs > 0 ? fmt(p.estimated_profit) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Marge</p>
                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${marginColor(p.margin_percent)}`}>
                    {p.total_project_costs > 0 ? p.margin_percent.toFixed(1) + '%' : '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">Aucun projet correspondant</p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Cash Flow ────────────────────────────────────────────────────────────

function CashFlowTab() {
  const supabase = createClient();
  const [data, setData] = useState<MonthlyCashflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: rows, error: err } = await supabase
      .from('v_monthly_cashflow')
      .select('*')
      .order('month', { ascending: false })
      .limit(12);
    if (err) {
      setError('Erreur de chargement: ' + err.message);
    } else {
      setData(rows ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}</div>;

  if (error) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Réessayer</Button>
      </div>
    );
  }

  const totalIn  = data.reduce((s, d) => s + d.total_payments, 0);
  const totalOut = data.reduce((s, d) => s + d.total_expenses, 0);
  const netTotal = data.reduce((s, d) => s + d.net_flow, 0);

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Encaissé',  value: fmt(totalIn),  color: 'text-blue-700' },
          { label: 'Total Dépensé',   value: fmt(totalOut), color: 'text-red-600' },
          { label: 'Flux Net',        value: fmt(netTotal), color: netTotal >= 0 ? 'text-emerald-700' : 'text-red-600' },
        ].map((c, i) => (
          <Card key={i}>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
              <p className={`text-sm font-bold mt-0.5 ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Flux de Trésorerie (12 mois)</h2>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400" /> Encaissements</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-300" /> Dépenses</span>
            </div>
          </div>
          <CashflowBars data={data} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Mois</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Encaissements</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Dépenses</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Flux Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400">Aucune donnée</td>
                  </tr>
                ) : (
                  data.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{fmtMonth(d.month)}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{fmt(d.total_payments)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{fmt(d.total_expenses)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${d.net_flow >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {d.net_flow >= 0 ? '+' : ''}{fmt(d.net_flow)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Expenses Analysis ────────────────────────────────────────────────────

function ExpensesAnalysisTab() {
  const supabase = createClient();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('current_month');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('expenses')
      .select('id, date, category, amount, description, projects(reference_code, client_name)')
      .order('date', { ascending: false });

    const fromDate = getDateFilter(dateRange);
    if (fromDate) query = query.gte('date', fromDate);

    const { data, error: err } = await query.limit(500);
    if (err) {
      setError('Erreur: ' + err.message);
    } else {
      setExpenses((data as any[]) || []);
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  // Group by category
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    const cat = e.category || 'other';
    acc[cat] = (acc[cat] || 0) + Number(e.amount);
    return acc;
  }, {});

  const categoryData = Object.entries(byCategory)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const top10 = expenses.slice().sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 10);
  const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const DATE_RANGES: { key: DateRangeFilter; label: string }[] = [
    { key: 'current_month',  label: 'Ce mois' },
    { key: 'last_3_months',  label: '3 derniers mois' },
    { key: 'this_year',      label: 'Cette année' },
    { key: 'all',            label: 'Tout' },
  ];

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;

  if (error) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Réessayer</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Période:</span>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                dateRange === r.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-sm font-bold text-gray-800 ml-auto">
          Total: {fmt(grandTotal)}
        </span>
      </div>

      {/* Category bars */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package size={16} className="text-purple-500" />
            Répartition par Catégorie
          </h2>
          {categoryData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune dépense sur cette période</p>
          ) : (
            <CategoryBars data={categoryData} />
          )}
        </CardContent>
      </Card>

      {/* Top 10 largest expenses */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Top 10 — Dépenses les plus élevées</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Catégorie</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Projet</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {top10.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">Aucune dépense</td>
                  </tr>
                ) : (
                  top10.map((e, i) => (
                    <tr key={e.id} className={`hover:bg-gray-50 transition-colors ${i === 0 ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(e.date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">
                          {(e.category ?? 'autre').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{e.description ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{e.project?.client_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(Number(e.amount))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type TabKey = 'pl' | 'projects' | 'cashflow' | 'expenses';

export default function FinanceReportsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('pl');
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/intelligence/dashboard?period=ytd');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDashData(await res.json());
    } catch (e: any) {
      setError('Impossible de charger les données: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'pl',        label: 'P&L Mensuel' },
    { key: 'projects',  label: `Projets (${dashData?.all_projects?.length ?? 0})` },
    { key: 'cashflow',  label: 'Flux de Trésorerie' },
    { key: 'expenses',  label: 'Analyse Dépenses' },
  ];

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager']}>
      <div className="min-h-screen bg-gray-50 pb-16">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft size={18} className="text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-600" />
                  Rapports Financiers
                </h1>
                <p className="text-xs text-gray-500">Analyse complète — ArtMood Factory</p>
              </div>
            </div>
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <RefreshCw size={16} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Tabs */}
          <div className="max-w-6xl mx-auto px-4 pb-0 flex gap-0.5 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 mt-5">

          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertTriangle size={16} />
              <span>{error}</span>
              <button onClick={loadDashboard} className="ml-auto underline text-xs">Réessayer</button>
            </div>
          )}

          {activeTab === 'pl' && (
            <MonthlyPLTab
              monthlyPL={dashData?.monthly_pl ?? []}
              loading={loading}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectProfitabilityTab
              projects={dashData?.all_projects ?? []}
              loading={loading}
              onNavigate={id => router.push(`/projects/${id}`)}
            />
          )}

          {activeTab === 'cashflow' && <CashFlowTab />}

          {activeTab === 'expenses' && <ExpensesAnalysisTab />}
        </div>
      </div>
    </RoleGuard>
  );
}
