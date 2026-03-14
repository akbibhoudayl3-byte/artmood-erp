'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import {
  ArrowLeft, DollarSign, Clock, CreditCard, Activity,
  Trash2, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Performance {
  id: string;
  reference_code: string;
  client_name: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  total_cost: number;
  cost_status: string;
  schedule_status: string;
  payment_status: string;
  overall_health: string;
}

// P&L — v_project_financial_intelligence (already exists)
interface Intelligence {
  sale_price: number; paid_amount: number;
  total_project_costs: number; estimated_profit: number;
  margin_percent: number; profit_health: string;
  material_cost_consumed: number; material_cost_manual: number;
  labor_cost: number; transport_cost: number;
  installation_cost: number; overhead_cost: number; other_cost: number;
}

// Waste — v_project_material_waste (Phase A view)
interface Waste {
  expected_qty: number; actual_qty: number; waste_qty: number;
  waste_pct: number; waste_health: string;
  consumption_records: number; recorded_records: number;
  offcut_m2: number; reusable_m2: number; offcut_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD';

const HEALTH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  label: 'On Track' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'At Risk' },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Critical' },
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'N/A' },
};

const PROFIT_HEALTH: Record<string, { cls: string; label: string }> = {
  healthy:      { cls: 'text-green-600 bg-green-50',   label: 'Healthy' },
  warning:      { cls: 'text-yellow-600 bg-yellow-50', label: 'Warning' },
  critical:     { cls: 'text-orange-600 bg-orange-50', label: 'Critical' },
  loss:         { cls: 'text-red-600 bg-red-50',       label: 'Loss' },
  uncalculated: { cls: 'text-gray-500 bg-gray-50',     label: 'No data' },
};

const WASTE_HEALTH: Record<string, { cls: string; label: string }> = {
  ok:       { cls: 'text-green-600 bg-green-50',   label: 'Normal' },
  warning:  { cls: 'text-yellow-600 bg-yellow-50', label: 'Warning' },
  elevated: { cls: 'text-yellow-600 bg-yellow-50', label: 'Elevated' },
  high:     { cls: 'text-orange-600 bg-orange-50', label: 'High' },
  critical: { cls: 'text-red-600 bg-red-50',       label: 'Critical' },
};

function HealthDot({ status }: { status: string }) {
  const color = HEALTH_COLORS[status] || HEALTH_COLORS.gray;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${color.bg} ${color.text}`}>
      <span className={`w-2 h-2 rounded-full ${
        status === 'green' ? 'bg-green-500' :
        status === 'yellow' ? 'bg-yellow-500' :
        status === 'red' ? 'bg-red-500' : 'bg-gray-400'
      }`} />
      {color.label}
    </span>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-900">{value}</span>
        {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ProjectPerformancePage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();
  const [tab,   setTab]   = useState<'health' | 'pl' | 'waste'>('health');
  const [perf,  setPerf]  = useState<Performance | null>(null);
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [waste, setWaste] = useState<Waste | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('v_project_performance')
        .select('*').eq('id', id).single(),
      supabase.from('v_project_financial_intelligence')
        .select('sale_price,paid_amount,total_project_costs,estimated_profit,margin_percent,profit_health,material_cost_consumed,material_cost_manual,labor_cost,transport_cost,installation_cost,overhead_cost,other_cost')
        .eq('id', id).single(),
      supabase.from('v_project_material_waste')
        .select('expected_qty,actual_qty,waste_qty,waste_pct,waste_health,consumption_records,recorded_records,offcut_m2,reusable_m2,offcut_count')
        .eq('project_id', id).single(),
    ]).then(([p, i, w]) => {
      setPerf(p.data as Performance);
      setIntel(i.data as Intelligence);
      setWaste(w.data as Waste);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!perf)   return <div className="text-center py-12 text-gray-500">Performance data not available</div>;

  const profitH  = PROFIT_HEALTH[intel?.profit_health  ?? 'uncalculated'];
  const wasteH   = WASTE_HEALTH [waste?.waste_health   ?? 'ok'];
  const hasIntel = intel && intel.total_project_costs > 0;
  const hasWaste = waste && waste.consumption_records  > 0;

  const TABS = [
    { key: 'health', label: 'Health' },
    { key: 'pl',     label: 'P&L' },
    { key: 'waste',  label: 'Waste' },
  ] as const;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
      <div className="space-y-4">

        {/* Header — unchanged */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-mono">{perf.reference_code}</p>
            <h1 className="text-xl font-bold text-[#1a1a2e]">{perf.client_name}</h1>
          </div>
          <HealthDot status={perf.overall_health} />
        </div>

        {/* Tab bar */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {TABS.map(tb => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === tb.key ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-gray-500'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* ── HEALTH TAB — original content, unchanged ────────────────────── */}
        {tab === 'health' && (
          <div className="space-y-3">
            <Card className={`p-6 text-center ${
              perf.overall_health === 'green'  ? 'border-green-200 bg-green-50/50' :
              perf.overall_health === 'yellow' ? 'border-yellow-200 bg-yellow-50/50' :
              perf.overall_health === 'red'    ? 'border-red-200 bg-red-50/50' : ''
            }`}>
              <Activity size={32} className={`mx-auto mb-2 ${
                perf.overall_health === 'green'  ? 'text-green-500' :
                perf.overall_health === 'yellow' ? 'text-yellow-500' :
                perf.overall_health === 'red'    ? 'text-red-500' : 'text-gray-400'
              }`} />
              <p className="text-sm font-medium text-[#64648B]">{t('perf.title')}</p>
              <p className={`text-2xl font-bold mt-1 ${
                perf.overall_health === 'green'  ? 'text-green-700' :
                perf.overall_health === 'yellow' ? 'text-yellow-700' :
                perf.overall_health === 'red'    ? 'text-red-700' : 'text-gray-600'
              }`}>
                {HEALTH_COLORS[perf.overall_health]?.label || 'Unknown'}
              </p>
            </Card>

            <div className="grid grid-cols-1 gap-3">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <DollarSign size={20} className="text-[#64648B]" />
                    <div>
                      <p className="text-sm font-medium text-[#1a1a2e]">{t('perf.cost_variance')}</p>
                      <p className="text-xs text-[#64648B]">
                        Cost: {perf.total_cost.toLocaleString()} / Revenue: {perf.total_amount.toLocaleString()} MAD
                      </p>
                    </div>
                  </div>
                  <HealthDot status={perf.cost_status} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock size={20} className="text-[#64648B]" />
                    <div>
                      <p className="text-sm font-medium text-[#1a1a2e]">{t('perf.schedule_variance')}</p>
                      <p className="text-xs text-[#64648B]">Current status: {perf.status.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <HealthDot status={perf.schedule_status} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard size={20} className="text-[#64648B]" />
                    <div>
                      <p className="text-sm font-medium text-[#1a1a2e]">{t('common.status')}</p>
                      <p className="text-xs text-[#64648B]">
                        Paid: {perf.paid_amount.toLocaleString()} / {perf.total_amount.toLocaleString()} MAD
                      </p>
                    </div>
                  </div>
                  <HealthDot status={perf.payment_status} />
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ── P&L TAB ──────────────────────────────────────────────────────── */}
        {tab === 'pl' && (
          <div className="space-y-3">
            {!hasIntel ? (
              <Card className="p-8 text-center">
                <DollarSign size={32} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No cost data yet.</p>
                <p className="text-xs text-gray-400 mt-1">Add costs in the Costs tab to see P&L.</p>
              </Card>
            ) : (
              <>
                <Card className={`p-4 border-0 ${profitH.cls}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium opacity-70">Profit Health</p>
                      <p className="text-xl font-bold">{profitH.label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black">{Number(intel!.margin_percent).toFixed(1)}%</p>
                      <p className="text-xs opacity-70">margin</p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Revenue & Profit</h3>
                    <StatRow label="Sale Price"   value={fmt(intel!.sale_price)} />
                    <StatRow label="Paid Amount"  value={fmt(intel!.paid_amount)}
                      sub={`${((intel!.paid_amount / Math.max(intel!.sale_price, 1)) * 100).toFixed(0)}% collected`} />
                    <StatRow label="Total Costs"  value={fmt(intel!.total_project_costs)} />
                    <StatRow label="Gross Profit" value={fmt(intel!.estimated_profit)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cost Breakdown</h3>
                    {intel!.material_cost_consumed > 0 &&
                      <StatRow label="Material (consumption)" value={fmt(intel!.material_cost_consumed)} />}
                    {intel!.material_cost_manual > 0 &&
                      <StatRow label="Material (manual)"      value={fmt(intel!.material_cost_manual)} />}
                    {intel!.labor_cost > 0        && <StatRow label="Labor"        value={fmt(intel!.labor_cost)} />}
                    {intel!.transport_cost > 0    && <StatRow label="Transport"    value={fmt(intel!.transport_cost)} />}
                    {intel!.installation_cost > 0 && <StatRow label="Installation" value={fmt(intel!.installation_cost)} />}
                    {intel!.overhead_cost > 0     && <StatRow label="Overhead"     value={fmt(intel!.overhead_cost)} />}
                    {intel!.other_cost > 0        && <StatRow label="Other"        value={fmt(intel!.other_cost)} />}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Margin</span>
                      <span className={
                        intel!.margin_percent >= 20 ? 'text-green-600' :
                        intel!.margin_percent >= 0  ? 'text-yellow-600' : 'text-red-600'
                      }>{Number(intel!.margin_percent).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        intel!.margin_percent >= 20 ? 'bg-green-500' :
                        intel!.margin_percent >= 0  ? 'bg-yellow-400' : 'bg-red-500'
                      }`} style={{ width: `${Math.min(100, Math.max(0, intel!.margin_percent))}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>0%</span><span>20% target</span><span>100%</span>
                    </div>
                  </CardContent>
                </Card>

                {intel!.profit_health === 'loss' && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                    <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700">
                      This project is loss-making. Costs exceed revenue by {fmt(Math.abs(intel!.estimated_profit))}.
                    </p>
                  </div>
                )}
                {intel!.profit_health === 'critical' && (
                  <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl border border-orange-100">
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-orange-700">Margin below 10%. Review costs to protect profitability.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── WASTE TAB ────────────────────────────────────────────────────── */}
        {tab === 'waste' && (
          <div className="space-y-3">
            {!hasWaste ? (
              <Card className="p-8 text-center">
                <Trash2 size={32} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No consumption data yet.</p>
                <p className="text-xs text-gray-400 mt-1">Track consumption in the Cutting page to see waste analysis.</p>
              </Card>
            ) : (
              <>
                <Card className={`p-4 border-0 ${wasteH.cls}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium opacity-70">Waste Health</p>
                      <p className="text-xl font-bold">{wasteH.label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black">{Number(waste!.waste_pct).toFixed(1)}%</p>
                      <p className="text-xs opacity-70">waste rate</p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Material Consumption</h3>
                    <StatRow label="Expected Qty" value={Number(waste!.expected_qty).toFixed(2)}
                      sub={`${waste!.consumption_records} material(s) planned`} />
                    <StatRow label="Actual Qty"   value={Number(waste!.actual_qty).toFixed(2)}
                      sub={`${waste!.recorded_records} of ${waste!.consumption_records} recorded`} />
                    <StatRow label="Waste Qty"    value={Number(waste!.waste_qty).toFixed(2)} />
                    <StatRow label="Waste Rate"   value={`${Number(waste!.waste_pct).toFixed(1)}%`} />
                  </CardContent>
                </Card>

                {waste!.offcut_count > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Offcut Records</h3>
                      <StatRow label="Total Offcut Area"    value={`${Number(waste!.offcut_m2).toFixed(3)} m²`} />
                      <StatRow label="Reusable Offcut Area" value={`${Number(waste!.reusable_m2).toFixed(3)} m²`}
                        sub={waste!.offcut_m2 > 0
                          ? `${((waste!.reusable_m2 / waste!.offcut_m2) * 100).toFixed(0)}% reusable`
                          : undefined} />
                      <StatRow label="Offcut Records"       value={waste!.offcut_count.toString()} />
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Waste Rate</span>
                      <span className={
                        waste!.waste_pct >= 30 ? 'text-red-600' :
                        waste!.waste_pct >= 20 ? 'text-orange-600' :
                        waste!.waste_pct >= 10 ? 'text-yellow-600' : 'text-green-600'
                      }>{Number(waste!.waste_pct).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        waste!.waste_pct >= 30 ? 'bg-red-500' :
                        waste!.waste_pct >= 20 ? 'bg-orange-400' :
                        waste!.waste_pct >= 10 ? 'bg-yellow-400' : 'bg-green-500'
                      }`} style={{ width: `${Math.min(100, Number(waste!.waste_pct))}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>0%</span><span>10% target</span><span>30%+</span>
                    </div>
                  </CardContent>
                </Card>

                {waste!.waste_health === 'critical' && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                    <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700">
                      Critical waste rate ({Number(waste!.waste_pct).toFixed(1)}%). Review cutting plans immediately.
                    </p>
                  </div>
                )}
                {waste!.waste_health === 'high' && (
                  <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl border border-orange-100">
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-orange-700">
                      High waste rate ({Number(waste!.waste_pct).toFixed(1)}%). Consider optimizing cut layouts.
                    </p>
                  </div>
                )}
                {waste!.waste_health === 'ok' && (
                  <div className="flex items-start gap-2 p-3 bg-green-50 rounded-xl border border-green-100">
                    <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-green-700">Waste rate is within acceptable limits.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </RoleGuard>
  );
}
