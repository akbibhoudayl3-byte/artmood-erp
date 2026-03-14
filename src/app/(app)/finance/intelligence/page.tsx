'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  CheckCircle, XCircle, BarChart3, RefreshCw, ArrowLeft,
  Package, Wrench, Truck, Building2, Layers,
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfitHealth = 'healthy' | 'warning' | 'critical' | 'loss' | 'uncalculated';
type ActiveTab    = 'overview' | 'projects' | 'alerts' | 'brain';

interface WasteRow {
  project_id:          string;
  reference_code:      string | null;
  client_name:         string;
  waste_pct:           number;
  waste_health:        string;
  consumption_records: number;
}

interface ProjectIntel {
  id:                  string;
  reference_code:      string | null;
  client_name:         string;
  status:              string;
  project_type:        string;
  sale_price:          number;
  paid_amount:         number;
  total_project_costs: number;
  estimated_profit:    number;
  margin_percent:      number;
  profit_health:       ProfitHealth;
  labor_cost:          number;
  material_cost_manual: number;
  material_cost_consumed: number;
  overhead_cost:       number;
  transport_cost:      number;
}

interface MonthlyPL {
  month:                string;
  total_income:         number;
  total_expenses:       number;
  gross_profit:         number;
  net_profit:           number;
  gross_margin_percent: number;
}

interface DashboardData {
  summary:          Record<string, number>;
  monthly_pl:       MonthlyPL[];
  loss_projects:    ProjectIntel[];
  warning_projects: ProjectIntel[];
  top_projects:     ProjectIntel[];
  all_projects:     ProjectIntel[];
}

interface LiveAlert {
  alert_type:     string;
  severity:       string;
  title:          string;
  body:           string;
  reference_type: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD';
}

function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function healthColor(h: ProfitHealth): string {
  switch (h) {
    case 'healthy':      return 'text-green-600 bg-green-50';
    case 'warning':      return 'text-yellow-600 bg-yellow-50';
    case 'critical':     return 'text-orange-600 bg-orange-50';
    case 'loss':         return 'text-red-600 bg-red-50';
    default:             return 'text-gray-500 bg-gray-50';
  }
}

function healthIcon(h: ProfitHealth) {
  switch (h) {
    case 'healthy':  return <CheckCircle size={14} className="text-green-500" />;
    case 'loss':     return <XCircle size={14} className="text-red-500" />;
    case 'critical': return <AlertTriangle size={14} className="text-orange-500" />;
    case 'warning':  return <AlertTriangle size={14} className="text-yellow-500" />;
    default:         return <BarChart3 size={14} className="text-gray-400" />;
  }
}

function costTypeIcon(type: string) {
  switch (type) {
    case 'material':     return <Package size={14} />;
    case 'labor':        return <Wrench size={14} />;
    case 'transport':    return <Truck size={14} />;
    case 'overhead':     return <Building2 size={14} />;
    default:             return <Layers size={14} />;
  }
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MonthlyChart({ data }: { data: MonthlyPL[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => Math.max(d.total_income, d.total_expenses)), 1);

  return (
    <div className="flex items-end gap-1 h-24 w-full">
      {data.slice(-8).map((d, i) => {
        const incH = Math.round((d.total_income / maxVal) * 96);
        const expH = Math.round((d.total_expenses / maxVal) * 96);
        const month = new Date(d.month).toLocaleDateString('fr-MA', { month: 'short' });
        const profit = d.gross_profit;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${month}: Revenu ${fmt(d.total_income)}, Dépenses ${fmt(d.total_expenses)}`}>
            <div className="w-full flex items-end justify-center gap-px" style={{ height: 88 }}>
              <div
                className="w-2 rounded-t bg-blue-400 transition-all"
                style={{ height: incH }}
              />
              <div
                className="w-2 rounded-t bg-red-300 transition-all"
                style={{ height: expH }}
              />
            </div>
            <span className={`text-[9px] font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FinancialIntelligencePage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [period, setPeriod] = useState<'30d' | '90d' | 'ytd'>('30d');
  const [activeTab,    setActiveTab]    = useState<ActiveTab>('overview');
  const [wasteRows,    setWasteRows]    = useState<WasteRow[]>([]);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [scanningAlerts, setScanningAlerts] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/intelligence/dashboard?period=${period}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch('/api/finance/intelligence/alerts');
      if (res.ok) {
        const json = await res.json();
        setAlerts(json.live_alerts ?? []);
      }
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (activeTab === 'alerts') loadAlerts(); }, [activeTab, loadAlerts]);
  useEffect(() => {
    if (activeTab !== 'brain') return;
    setWasteLoading(true);
    fetch('/api/intelligence/project-waste')
      .then(r => r.ok ? r.json() : [])
      .then(rows => { setWasteRows(rows ?? []); setWasteLoading(false); })
      .catch(() => setWasteLoading(false));
  }, [activeTab]);

  async function pushAlerts() {
    setScanningAlerts(true);
    await fetch('/api/finance/intelligence/alerts', { method: 'POST' });
    await loadAlerts();
    setScanningAlerts(false);
  }

  const s = data?.summary ?? {};

  return (
    <RoleGuard allowedRoles={['ceo']}>
      <div className="min-h-screen bg-gray-50 pb-8">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft size={16} />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <DollarSign size={20} className="text-emerald-600" />
                  Financial Intelligence
                </h1>
                <p className="text-xs text-gray-500">Real profit analysis for ArtMood Factory</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Period selector */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['30d', '90d', 'ytd'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === p
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p === 'ytd' ? 'Year' : p}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={loadDashboard} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="max-w-6xl mx-auto mt-3 flex gap-1">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'projects', label: `Projects (${data?.all_projects?.length ?? 0})` },
              { key: 'alerts',   label: `Alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
              { key: 'brain',    label: '⚡ Brain' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 mt-4">

          {/* ── OVERVIEW TAB ────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Revenue Collected',
                    value: fmt(s.total_payments ?? 0),
                    icon: <TrendingUp size={18} className="text-blue-500" />,
                    bg: 'bg-blue-50',
                  },
                  {
                    label: 'Total Expenses',
                    value: fmt(s.total_expenses ?? 0),
                    icon: <TrendingDown size={18} className="text-red-500" />,
                    bg: 'bg-red-50',
                  },
                  {
                    label: 'Gross Profit',
                    value: fmt(s.gross_profit ?? 0),
                    icon: <DollarSign size={18} className={s.gross_profit >= 0 ? 'text-emerald-500' : 'text-red-500'} />,
                    bg: (s.gross_profit ?? 0) >= 0 ? 'bg-emerald-50' : 'bg-red-50',
                  },
                  {
                    label: 'Avg Margin',
                    value: fmtPct(s.average_margin_percent ?? 0),
                    icon: <BarChart3 size={18} className="text-purple-500" />,
                    bg: 'bg-purple-50',
                  },
                ].map((kpi, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
                        {kpi.icon}
                      </div>
                      <p className="text-xs text-gray-500">{kpi.label}</p>
                      <p className="text-base font-bold text-gray-900 mt-0.5">{loading ? '...' : kpi.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{s.active_projects ?? 0}</p>
                    <p className="text-xs text-gray-500">Active Projects</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{s.delivered_projects ?? 0}</p>
                    <p className="text-xs text-gray-500">Delivered (period)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className={`text-2xl font-bold ${(s.loss_making_projects ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {s.loss_making_projects ?? 0}
                    </p>
                    <p className="text-xs text-gray-500">Loss-Making</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{fmt(s.total_project_costs ?? 0)}</p>
                    <p className="text-xs text-gray-500">Production Costs</p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly P&L Chart */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">Monthly P&L (12 months)</h2>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400" /> Revenue</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-300" /> Expenses</span>
                    </div>
                  </div>
                  {loading ? (
                    <div className="h-24 bg-gray-100 animate-pulse rounded" />
                  ) : (
                    <MonthlyChart data={data?.monthly_pl ?? []} />
                  )}

                  {/* Monthly table */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-1 text-gray-500 font-medium">Month</th>
                          <th className="text-right py-1 text-gray-500 font-medium">Revenue</th>
                          <th className="text-right py-1 text-gray-500 font-medium">Expenses</th>
                          <th className="text-right py-1 text-gray-500 font-medium">Profit</th>
                          <th className="text-right py-1 text-gray-500 font-medium">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.monthly_pl ?? []).slice(-6).reverse().map((m, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-1.5 text-gray-700 font-medium">
                              {new Date(m.month).toLocaleDateString('fr-MA', { month: 'short', year: '2-digit' })}
                            </td>
                            <td className="py-1.5 text-right text-blue-700">{fmt(m.total_income)}</td>
                            <td className="py-1.5 text-right text-red-600">{fmt(m.total_expenses)}</td>
                            <td className={`py-1.5 text-right font-semibold ${m.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {fmt(m.gross_profit)}
                            </td>
                            <td className={`py-1.5 text-right ${m.gross_margin_percent >= 20 ? 'text-emerald-600' : m.gross_margin_percent >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {m.gross_margin_percent.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Loss-making + Warning projects quick view */}
              {((data?.loss_projects?.length ?? 0) > 0 || (data?.warning_projects?.length ?? 0) > 0) && (
                <Card>
                  <CardContent className="p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-500" />
                      Attention Required
                    </h2>
                    <div className="space-y-2">
                      {[...(data?.loss_projects ?? []), ...(data?.warning_projects ?? [])].map(p => (
                        <div key={p.id} className={`flex items-center justify-between p-2.5 rounded-lg ${healthColor(p.profit_health)}`}>
                          <div className="flex items-center gap-2">
                            {healthIcon(p.profit_health)}
                            <div>
                              <p className="text-xs font-medium">{p.client_name}</p>
                              <p className="text-[10px] opacity-70">{p.reference_code ?? p.status}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold">{fmt(p.estimated_profit)}</p>
                            <p className="text-[10px]">{p.margin_percent.toFixed(1)}% margin</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ── PROJECTS TAB ────────────────────────────────────────────── */}
          {activeTab === 'projects' && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Project Profitability</h2>
                  <p className="text-xs text-gray-500 mt-0.5">All active projects with cost data</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Project</th>
                        <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Sale Price</th>
                        <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Total Costs</th>
                        <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Profit</th>
                        <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Margin</th>
                        <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                      ) : (data?.all_projects ?? []).length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No project data yet</td></tr>
                      ) : (
                        (data?.all_projects ?? []).map(p => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{p.client_name}</p>
                              <p className="text-gray-400">{p.reference_code ?? p.project_type}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(p.sale_price)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {p.total_project_costs > 0 ? fmt(p.total_project_costs) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold ${p.estimated_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {p.total_project_costs > 0 ? fmt(p.estimated_profit) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {p.total_project_costs > 0 ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${healthColor(p.profit_health)}`}>
                                  {p.margin_percent.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-gray-300 text-[10px]">No costs</span>
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
          )}

          {/* ── ALERTS TAB ──────────────────────────────────────────────── */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Live Financial Alerts</h2>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={pushAlerts}
                  disabled={scanningAlerts}
                >
                  <RefreshCw size={14} className={scanningAlerts ? 'animate-spin' : ''} />
                  {scanningAlerts ? 'Scanning…' : 'Scan & Push'}
                </Button>
              </div>

              {alertsLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">No financial alerts</p>
                    <p className="text-xs text-gray-500 mt-1">All projects are financially healthy</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert, i) => (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            alert.severity === 'critical' ? 'bg-red-100' :
                            alert.severity === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'
                          }`}>
                            {alert.severity === 'critical'
                              ? <XCircle size={16} className="text-red-500" />
                              : <AlertTriangle size={16} className={alert.severity === 'warning' ? 'text-yellow-500' : 'text-blue-500'} />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                                alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {alert.severity}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{alert.body}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── BRAIN TAB ──────────────────────────────────────────────── */}
          {activeTab === 'brain' && (
            <div className="space-y-4">
              {/* Profit at Risk */}
              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Profit at Risk</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Projects with loss, critical or warning margins</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {loading ? (
                      <div className="p-4 text-center text-xs text-gray-400">Loading…</div>
                    ) : (() => {
                        const at_risk = (data?.all_projects ?? [])
                          .filter(p => ['loss','critical','warning'].includes(p.profit_health))
                          .sort((a, b) => a.margin_percent - b.margin_percent);
                        return at_risk.length === 0 ? (
                          <div className="p-6 text-center">
                            <CheckCircle size={24} className="text-emerald-400 mx-auto mb-1" />
                            <p className="text-xs text-gray-500">All projects have healthy margins</p>
                          </div>
                        ) : at_risk.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              {healthIcon(p.profit_health)}
                              <div>
                                <p className="text-xs font-medium text-gray-900">{p.client_name}</p>
                                <p className="text-[10px] text-gray-400">{p.reference_code ?? p.project_type}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${healthColor(p.profit_health)}`}>
                                {p.margin_percent.toFixed(1)}%
                              </span>
                              <p className="text-[10px] text-gray-400 mt-0.5">{fmt(p.estimated_profit)}</p>
                            </div>
                          </div>
                        ));
                      })()
                    }
                  </div>
                </CardContent>
              </Card>

              {/* Material Waste Alerts */}
              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Material Waste Alerts</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Projects with recorded consumption above 5% waste</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {wasteLoading ? (
                      <div className="p-4 text-center text-xs text-gray-400">Loading…</div>
                    ) : (() => {
                        const flagged = wasteRows.filter(w => w.waste_pct >= 5);
                        if (flagged.length === 0) return (
                          <div className="p-6 text-center">
                            <CheckCircle size={24} className="text-emerald-400 mx-auto mb-1" />
                            <p className="text-xs text-gray-500">
                              {wasteRows.length === 0 ? 'No consumption data recorded yet' : 'All waste rates within acceptable limits'}
                            </p>
                          </div>
                        );
                        return flagged.map(w => {
                          const wCls =
                            w.waste_pct >= 30 ? 'text-red-600 bg-red-50' :
                            w.waste_pct >= 20 ? 'text-orange-600 bg-orange-50' :
                            w.waste_pct >= 10 ? 'text-yellow-600 bg-yellow-50' :
                                                'text-yellow-500 bg-yellow-50';
                          return (
                            <div key={w.project_id} className="flex items-center justify-between px-4 py-3">
                              <div>
                                <p className="text-xs font-medium text-gray-900">{w.client_name}</p>
                                <p className="text-[10px] text-gray-400">{w.reference_code ?? '—'}</p>
                              </div>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${wCls}`}>
                                {Number(w.waste_pct).toFixed(1)}% waste
                              </span>
                            </div>
                          );
                        });
                      })()
                    }
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
