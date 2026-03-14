'use client';

/**
 * dashboard_page_optimized.tsx
 *
 * Optimized dashboard — replaces 13 parallel Supabase queries with ONE RPC call.
 *
 * Deploy to: src/app/(app)/dashboard/page.tsx
 *
 * Requires:  dashboard_rpc.sql deployed first (creates get_dashboard_summary function)
 *
 * Query count:
 *   Before: 13 parallel + 3 CEO + 3 Finance = up to 19 queries   (~800ms)
 *   After:  1 RPC      + 3 CEO + 3 Finance = up to 7 queries     (~300ms)
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import HealthMeter from '@/components/dashboard/HealthMeter';
import StatCard from '@/components/dashboard/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import type { BusinessHealth, Lead, CalendarEvent } from '@/types/database';
import { useRealtimeMulti } from '@/lib/hooks/useRealtime';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  Users, FolderKanban, Factory, Wallet, AlertTriangle, Calendar,
  Wrench, TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle,
  RefreshCw, Activity, CreditCard, UserPlus, Package
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface ActivityItem {
  id: string;
  type: 'payment' | 'lead' | 'order' | 'installation';
  label: string;
  sublabel: string;
  amount?: number;
  timestamp: string;
  icon: React.ReactNode;
  iconBg: string;
}

export default function DashboardPage() {
  const { profile, isCeo, canViewFinance } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [stats, setStats] = useState({
    activeProjects: 0,
    newLeads: 0,
    pendingQuotes: 0,
    inProduction: 0,
    installationsThisWeek: 0,
    overduePayments: 0,
    monthRevenue: 0,
    monthExpenses: 0,
    totalPipelineValue: 0,
    conversionRate: 0,
    completedThisMonth: 0,
  });
  const [health, setHealth] = useState<BusinessHealth | null>(null);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [monthlyData, setMonthlyData] = useState<{ month: string; income: number; expense: number }[]>([]);
  const [brainStats, setBrainStats] = useState({ lossCount: 0, criticalCount: 0, warnCount: 0, wasteAlerts: 0 });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  // Tick "X seconds ago" counter
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const loadDashboard = useCallback(async (isManualRefresh = false) => {
    if (!profile) return;
    if (isManualRefresh) setRefreshing(true);

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const weekStart = now.toISOString().split('T')[0];
      const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      // ── CORE LOAD: 1 RPC instead of 13 parallel queries ───────────────────────
      const { data: dash, error: dashError } = await supabase.rpc('get_dashboard_summary', {
        p_month_start: startOfMonth,
        p_week_start: weekStart,
        p_week_end: weekEnd,
        p_thirty_ago: thirtyDaysAgo,
      });

      if (dashError) {
        // Graceful fallback: if RPC doesn't exist yet, log and continue with zeros
        console.warn('Dashboard RPC not available — deploy dashboard_rpc.sql first.', dashError.message);
      } else if (dash) {
        const totalLeads = (dash.total_leads as number) || 1;
        const wonLeads = (dash.won_leads as number) || 0;

        setStats(prev => ({
          ...prev,
          activeProjects: (dash.active_projects as number) || 0,
          newLeads: (dash.new_leads as number) || 0,
          pendingQuotes: (dash.pending_quotes as number) || 0,
          inProduction: (dash.in_production as number) || 0,
          installationsThisWeek: (dash.installations_this_week as number) || 0,
          completedThisMonth: (dash.completed_this_month as number) || 0,
          conversionRate: Math.round((wonLeads / totalLeads) * 100),
        }));

        setRecentLeads((dash.recent_leads as Lead[]) || []);
        setUpcomingEvents((dash.upcoming_events as CalendarEvent[]) || []);

        // Build recent activity feed from RPC arrays
        const activityItems: ActivityItem[] = [];

        // Payments (finance users only)
        if (canViewFinance && Array.isArray(dash.recent_payments)) {
          (dash.recent_payments as any[]).forEach(p => {
            activityItems.push({
              id: `payment-${p.id}`,
              type: 'payment',
              label: `Payment received — ${p.client_name || 'Unknown'}`,
              sublabel: p.payment_type || 'payment',
              amount: Number(p.amount),
              timestamp: p.received_at,
              icon: <CreditCard size={14} />,
              iconBg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600',
            });
          });
        }

        // Lead activity
        if (Array.isArray(dash.recent_leads_activity)) {
          (dash.recent_leads_activity as any[]).forEach(l => {
            activityItems.push({
              id: `lead-${l.id}`,
              type: 'lead',
              label: `New lead — ${l.full_name}`,
              sublabel: `${l.city || ''} · ${l.status}`,
              timestamp: l.created_at,
              icon: <UserPlus size={14} />,
              iconBg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600',
            });
          });
        }

        // Production orders
        if (Array.isArray(dash.recent_orders)) {
          (dash.recent_orders as any[]).forEach(o => {
            activityItems.push({
              id: `order-${o.id}`,
              type: 'order',
              label: `Order: ${o.name}`,
              sublabel: `${o.client_name || ''} · ${o.status}`,
              timestamp: o.created_at,
              icon: <Package size={14} />,
              iconBg: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600',
            });
          });
        }

        activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setRecentActivity(activityItems.slice(0, 7));
      }

      // ── CEO EXTRAS (3 queries, CEO only) ──────────────────────────────────────
      if (isCeo) {
        const [
          { data: healthData },
          { data: profitData },
          { data: wasteData },
        ] = await Promise.all([
          supabase.from('v_business_health').select('*').single(),
          supabase.from('v_project_financial_intelligence')
            .select('profit_health')
            .not('status', 'in', '("cancelled","measurements","design")'),
          supabase.from('v_project_material_waste')
            .select('waste_pct,consumption_records')
            .gt('consumption_records', 0),
        ]);

        if (healthData) setHealth(healthData as BusinessHealth);

        setBrainStats({
          lossCount: profitData?.filter(p => p.profit_health === 'loss').length ?? 0,
          criticalCount: profitData?.filter(p => p.profit_health === 'critical').length ?? 0,
          warnCount: profitData?.filter(p => p.profit_health === 'warning').length ?? 0,
          wasteAlerts: wasteData?.filter(w => Number(w.waste_pct) >= 10).length ?? 0,
        });
      }

      // ── FINANCE EXTRAS (3 queries, finance users only) ────────────────────────
      if (canViewFinance) {
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];

        const [
          { data: ledgerData },
          { data: pipelineData },
          { data: chartData },
        ] = await Promise.all([
          supabase.from('ledger').select('type, amount').gte('date', startOfMonth),
          supabase.from('projects').select('total_amount, paid_amount').not('status', 'in', '("delivered","cancelled")'),
          supabase.from('ledger').select('date, type, amount').gte('date', sixMonthsAgo),
        ]);

        if (ledgerData) {
          const revenue = ledgerData.filter(l => l.type === 'income').reduce((s, l) => s + Number(l.amount), 0);
          const expenses = ledgerData.filter(l => l.type === 'expense').reduce((s, l) => s + Number(l.amount), 0);
          setStats(prev => ({ ...prev, monthRevenue: revenue, monthExpenses: expenses }));
        }

        if (pipelineData) {
          const totalPipeline = pipelineData.reduce((s, p) => s + Number(p.total_amount) - Number(p.paid_amount), 0);
          const overdueCount = pipelineData.filter(p => Number(p.total_amount) > 0 && Number(p.paid_amount) === 0).length;
          setStats(prev => ({ ...prev, totalPipelineValue: totalPipeline, overduePayments: overdueCount }));
        }

        if (chartData) {
          const grouped: Record<string, { income: number; expense: number }> = {};
          chartData.forEach(entry => {
            const month = entry.date.substring(0, 7);
            if (!grouped[month]) grouped[month] = { income: 0, expense: 0 };
            if (entry.type === 'income') grouped[month].income += Number(entry.amount);
            else grouped[month].expense += Number(entry.amount);
          });
          const months = Object.keys(grouped).sort();
          setMonthlyData(months.map(m => ({ month: m, ...grouped[m] })));
        }
      }

      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (err) {
      console.error('Dashboard load error:', err);
    }

    setLoading(false);
    setRefreshing(false);
  }, [profile, isCeo, canViewFinance]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Debounced realtime: 3-second cooldown to avoid spamming on bulk inserts
  const realtimeRef = { timer: null as ReturnType<typeof setTimeout> | null };
  useRealtimeMulti([
    { table: 'projects', callback: () => {
      if (realtimeRef.timer) clearTimeout(realtimeRef.timer);
      realtimeRef.timer = setTimeout(() => loadDashboard(), 3000);
    }},
    { table: 'leads', callback: () => {
      if (realtimeRef.timer) clearTimeout(realtimeRef.timer);
      realtimeRef.timer = setTimeout(() => loadDashboard(), 3000);
    }},
    { table: 'payments', callback: () => {
      if (realtimeRef.timer) clearTimeout(realtimeRef.timer);
      realtimeRef.timer = setTimeout(() => loadDashboard(), 3000);
    }},
  ]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 skeleton" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 skeleton" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 skeleton" />
          <div className="h-64 skeleton" />
        </div>
      </div>
    );
  }

  const netProfit = stats.monthRevenue - stats.monthExpenses;
  const maxChartVal = Math.max(...monthlyData.flatMap(d => [d.income, d.expense]), 1);

  function formatSecondsAgo(s: number) {
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  function formatActivityTime(ts: string) {
    const d = new Date(ts);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'] as any[]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] dark:text-white tracking-tight">
              {getGreeting(t)}, {profile?.full_name?.split(' ')[0]}
            </h1>
            <p className="text-sm text-[#64648B] mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-[#64648B] hidden sm:inline">
                Updated {formatSecondsAgo(secondsAgo)}
              </span>
            )}
            <button
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F3F0] dark:bg-white/10 text-[#64648B] hover:bg-[#EDE9E3] dark:hover:bg-white/15 transition-colors text-xs font-medium disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Business Health Meter */}
        {isCeo && health && <HealthMeter health={health} />}

        {/* Brain Alert Strip — CEO only */}
        {isCeo && (brainStats.lossCount + brainStats.criticalCount + brainStats.warnCount + brainStats.wasteAlerts) > 0 && (
          <button className="w-full text-left" onClick={() => router.push('/finance/intelligence')}>
            <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-red-50 hover:from-orange-100 hover:to-red-100 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-orange-700 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-orange-500" />
                    Factory Brain — Issues Detected
                  </span>
                  <span className="text-[10px] text-orange-400 font-medium">tap to review →</span>
                </div>
                <div className="flex gap-4">
                  {brainStats.lossCount > 0 && (
                    <div className="text-center">
                      <p className="text-xl font-black text-red-600">{brainStats.lossCount}</p>
                      <p className="text-[10px] text-red-500 font-medium">Loss</p>
                    </div>
                  )}
                  {brainStats.criticalCount > 0 && (
                    <div className="text-center">
                      <p className="text-xl font-black text-orange-600">{brainStats.criticalCount}</p>
                      <p className="text-[10px] text-orange-500 font-medium">Critical</p>
                    </div>
                  )}
                  {brainStats.warnCount > 0 && (
                    <div className="text-center">
                      <p className="text-xl font-black text-yellow-600">{brainStats.warnCount}</p>
                      <p className="text-[10px] text-yellow-600 font-medium">Warning</p>
                    </div>
                  )}
                  {brainStats.wasteAlerts > 0 && (
                    <div className="text-center border-l border-orange-200 pl-4 ml-1">
                      <p className="text-xl font-black text-orange-600">{brainStats.wasteAlerts}</p>
                      <p className="text-[10px] text-orange-500 font-medium">Waste</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label={t('dash.active_projects')}
            value={stats.activeProjects}
            icon={<FolderKanban size={20} />}
            onClick={() => router.push('/projects')}
          />
          <StatCard
            label={t('dash.new_leads')}
            value={stats.newLeads}
            subtitle={`${stats.conversionRate}% conversion`}
            icon={<Users size={20} />}
            onClick={() => router.push('/leads')}
          />
          <StatCard
            label={t('dash.in_production')}
            value={stats.inProduction}
            icon={<Factory size={20} />}
            onClick={() => router.push('/production')}
          />
          <StatCard
            label={t('dash.installations_7d')}
            value={stats.installationsThisWeek}
            icon={<Wrench size={20} />}
            onClick={() => router.push('/installation')}
          />
        </div>

        {/* Financial row */}
        {canViewFinance && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label={t('dash.month_revenue')}
                value={`${stats.monthRevenue.toLocaleString()} MAD`}
                icon={<TrendingUp size={20} className="text-emerald-500" />}
                onClick={() => router.push('/finance/cashflow')}
              />
              <StatCard
                label={t('dash.month_expenses')}
                value={`${stats.monthExpenses.toLocaleString()} MAD`}
                icon={<TrendingDown size={20} className="text-red-500" />}
                onClick={() => router.push('/finance/expenses')}
              />
              <StatCard
                label={t('dash.net_profit')}
                value={`${netProfit.toLocaleString()} MAD`}
                icon={<DollarSign size={20} className={netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'} />}
              />
              <StatCard
                label={t('dash.pipeline_value')}
                value={`${stats.totalPipelineValue.toLocaleString()} MAD`}
                subtitle={`${stats.overduePayments} awaiting deposit`}
                icon={<Wallet size={20} />}
              />
            </div>

            {/* Mini chart */}
            {monthlyData.length > 0 && (
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#1a1a2e] dark:text-white">Revenue vs Expenses (6 months)</h3>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-32">
                    {monthlyData.map(d => (
                      <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex gap-0.5 items-end h-24">
                          <div
                            className="flex-1 bg-emerald-400 rounded-t-sm min-h-[2px]"
                            style={{ height: `${(d.income / maxChartVal) * 100}%` }}
                            title={`Income: ${d.income.toLocaleString()}`}
                          />
                          <div
                            className="flex-1 bg-red-400 rounded-t-sm min-h-[2px]"
                            style={{ height: `${(d.expense / maxChartVal) * 100}%` }}
                            title={`Expense: ${d.expense.toLocaleString()}`}
                          />
                        </div>
                        <span className="text-[10px] text-[#64648B]">
                          {new Date(d.month + '-01').toLocaleDateString('en', { month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-[#64648B]">
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-400 rounded-sm" /> Revenue</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-400 rounded-sm" /> Expenses</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Quick metrics row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <CheckCircle size={20} className="text-emerald-500 mx-auto" />
            <p className="text-xl font-bold text-[#1a1a2e] dark:text-white mt-1">{stats.completedThisMonth}</p>
            <p className="text-[11px] text-[#64648B]">{t('dash.delivered_this_month')}</p>
          </Card>
          <Card className="p-4 text-center">
            <Clock size={20} className="text-[#C9956B] mx-auto" />
            <p className="text-xl font-bold text-[#1a1a2e] dark:text-white mt-1">{stats.pendingQuotes}</p>
            <p className="text-[11px] text-[#64648B]">{t('dash.pending_quotes')}</p>
          </Card>
          <Card className="p-4 text-center">
            <AlertTriangle size={20} className={stats.overduePayments > 0 ? 'text-red-500 mx-auto' : 'text-[#64648B] mx-auto'} />
            <p className="text-xl font-bold text-[#1a1a2e] dark:text-white mt-1">{stats.overduePayments}</p>
            <p className="text-[11px] text-[#64648B]">{t('dash.overdue_payments')}</p>
          </Card>
        </div>

        {/* Bottom grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Leads */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold text-[#1a1a2e] dark:text-white">{t('dash.recent_leads')}</h3>
              <button onClick={() => router.push('/leads')} className="text-sm text-[#C9956B] font-semibold hover:text-[#B8845A]">
                {t('dash.view_all')}
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {recentLeads.length === 0 ? (
                <p className="text-sm text-[#64648B] p-5">No leads yet</p>
              ) : (
                <div className="divide-y divide-[#F0EDE8] dark:divide-white/5">
                  {recentLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-[#FAFAF8] dark:hover:bg-white/5 cursor-pointer"
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#F5F3F0] dark:bg-white/10 flex items-center justify-center text-[#64648B] text-xs font-semibold">
                          {lead.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1a1a2e] dark:text-white">{lead.full_name}</p>
                          <p className="text-xs text-[#64648B]">{lead.city} {lead.source ? `- ${lead.source}` : ''}</p>
                        </div>
                      </div>
                      <StatusBadge status={lead.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold text-[#1a1a2e] dark:text-white">{t('dash.upcoming_events')}</h3>
              <button onClick={() => router.push('/calendar')} className="text-sm text-[#C9956B] font-semibold hover:text-[#B8845A]">
                {t('dash.view_calendar')}
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-[#64648B] p-5">No upcoming events</p>
              ) : (
                <div className="divide-y divide-[#F0EDE8] dark:divide-white/5">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="flex items-center gap-3.5 px-5 py-3.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <Calendar size={18} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1a1a2e] dark:text-white truncate">{event.title}</p>
                        <p className="text-xs text-[#64648B]">
                          {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <StatusBadge status={event.event_type} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Feed */}
        {recentActivity.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold text-[#1a1a2e] dark:text-white flex items-center gap-2">
                <Activity size={16} className="text-[#C9956B]" />
                Recent Activity
              </h3>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-[#F0EDE8] dark:divide-white/5">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a2e] dark:text-white truncate">{item.label}</p>
                      <p className="text-xs text-[#64648B]">{item.sublabel}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {item.amount !== undefined && (
                        <p className="text-sm font-semibold text-emerald-600">+{item.amount.toLocaleString()} MAD</p>
                      )}
                      <p className="text-[11px] text-[#64648B]">{formatActivityTime(item.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </RoleGuard>
  );
}

function getGreeting(t: (key: string) => string) {
  const h = new Date().getHours();
  if (h < 12) return t('dash.greeting_morning');
  if (h < 18) return t('dash.greeting_afternoon');
  return t('dash.greeting_evening');
}
