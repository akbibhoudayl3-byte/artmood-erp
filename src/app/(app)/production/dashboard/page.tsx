'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { PRODUCTION_STATIONS, PRODUCTION_ISSUE_TYPES } from '@/lib/constants';
import {
  Factory,
  Maximize,
  Minimize,
  AlertTriangle,
  Clock,
  ScanLine,
  Package,
  RefreshCw,
} from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StationCount {
  station: string;
  count: number;
}

interface ActiveOrder {
  id: string;
  status: string;
  created_at: string;
  project: { client_name: string; reference_code: string } | null;
  total_parts: number;
  packed_parts: number;
}

interface OpenIssue {
  id: string;
  issue_type: string;
  severity: string;
  station: string | null;
  description: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Station visual config (bright, high-contrast for TV)
// ---------------------------------------------------------------------------
const STATION_TV_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending:  { bg: 'bg-gray-700',   border: 'border-gray-500',   text: 'text-gray-100' },
  saw:      { bg: 'bg-red-700',    border: 'border-red-400',    text: 'text-red-50' },
  cnc:      { bg: 'bg-orange-700', border: 'border-orange-400', text: 'text-orange-50' },
  edge:     { bg: 'bg-yellow-600', border: 'border-yellow-300', text: 'text-yellow-50' },
  assembly: { bg: 'bg-blue-700',   border: 'border-blue-400',   text: 'text-blue-50' },
  qc:       { bg: 'bg-purple-700', border: 'border-purple-400', text: 'text-purple-50' },
  packing:  { bg: 'bg-green-700',  border: 'border-green-400',  text: 'text-green-50' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function WorkshopDashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [stationCounts, setStationCounts] = useState<StationCount[]>([]);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [openIssues, setOpenIssues] = useState<OpenIssue[]>([]);
  const [todayScans, setTodayScans] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // -----------------------------------------------------------------------
  // Clock - update every second
  // -----------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // -----------------------------------------------------------------------
  // Fullscreen listener
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [partsRes, ordersRes, issuesRes, scansRes] = await Promise.all([
      // 1. Parts per station
      supabase
        .from('production_parts')
        .select('current_station'),

      // 2. Active orders with project info
      supabase
        .from('production_orders')
        .select('id, status, created_at, project:projects(client_name, reference_code)')
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(12),

      // 3. Open issues
      supabase
        .from('production_issues')
        .select('id, issue_type, severity, station, description, created_at')
        .eq('resolved', false)
        .order('created_at', { ascending: false }),

      // 4. Today's scans
      supabase
        .from('production_scans')
        .select('id', { count: 'exact', head: true })
        .gte('scanned_at', todayISO),
    ]);

    // -- Aggregate station counts --
    const counts: Record<string, number> = {};
    PRODUCTION_STATIONS.forEach((s) => (counts[s.key] = 0));
    (partsRes.data || []).forEach((p: { current_station: string }) => {
      const st = p.current_station;
      if (st in counts) counts[st] += 1;
    });
    setStationCounts(
      PRODUCTION_STATIONS.map((s) => ({ station: s.key, count: counts[s.key] || 0 }))
    );

    // -- Per-order progress (parts at packing / total) --
    const orderIds = (ordersRes.data || []).map((o: { id: string }) => o.id);
    let orderParts: { production_order_id: string; current_station: string }[] = [];
    if (orderIds.length > 0) {
      const { data } = await supabase
        .from('production_parts')
        .select('production_order_id, current_station')
        .in('production_order_id', orderIds);
      orderParts = data || [];
    }

    const ordersWithProgress: ActiveOrder[] = (ordersRes.data || []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (o: any) => {
        const parts = orderParts.filter((p) => p.production_order_id === o.id);
        const proj = Array.isArray(o.project) ? o.project[0] : o.project;
        return {
          id: o.id,
          status: o.status,
          created_at: o.created_at,
          project: proj || null,
          total_parts: parts.length,
          packed_parts: parts.filter((p) => p.current_station === 'packing').length,
        };
      }
    );
    setActiveOrders(ordersWithProgress);

    // -- Issues --
    setOpenIssues((issuesRes.data as OpenIssue[]) || []);

    // -- Scans --
    setTodayScans(scansRes.count || 0);

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Fullscreen toggle
  // -----------------------------------------------------------------------
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  function daysElapsed(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const criticalIssues = openIssues.filter((i) => i.severity === 'critical');
  const highIssues = openIssues.filter((i) => i.severity === 'high');
  const totalParts = stationCounts.reduce((s, c) => s + c.count, 0);

  const issueLabel = (type: string) => {
    const found = PRODUCTION_ISSUE_TYPES.find((t) => t.key === type);
    return found ? found.label : type.replace(/_/g, ' ');
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading && stationCounts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f0f23]">
        <div className="text-white text-2xl font-semibold animate-pulse">
          {t('common.loading')}...
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <div className="min-h-screen bg-[#0f0f23] text-white p-4 lg:p-6">
      {/* ================================================================ */}
      {/* HEADER BAR                                                       */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between mb-6 bg-gradient-to-r from-[#1a1a2e] via-[#16213e] to-[#1a1a2e] rounded-2xl px-6 py-4 border border-white/10">
        {/* Left: title */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#C9956B]/20 flex items-center justify-center">
            <Factory size={28} className="text-[#C9956B]" />
          </div>
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">{t('production.title')}</h1>
            <p className="text-lg text-white/50">{formatDate(currentTime)}</p>
          </div>
        </div>

        {/* Right: clock + controls */}
        <div className="flex items-center gap-6">
          {/* Live clock */}
          <div className="text-right">
            <div className="text-4xl lg:text-5xl font-mono font-bold tracking-wider text-[#C9956B]">
              {formatTime(currentTime)}
            </div>
            <div className="text-sm text-white/40 flex items-center justify-end gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Auto-refresh every 30s
            </div>
          </div>

          {/* Manual refresh */}
          <button
            onClick={fetchData}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Refresh now"
          >
            <RefreshCw size={24} />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* STATION WORKLOAD - large blocks                                  */}
      {/* ================================================================ */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white/70 mb-3 uppercase tracking-wider">
          {t('production.station_workload')}
          <span className="ml-3 text-white/40 text-lg font-normal lowercase">
            {totalParts} total parts
          </span>
        </h2>
        <div className="grid grid-cols-7 gap-3">
          {stationCounts.map(({ station, count }) => {
            const stationDef = PRODUCTION_STATIONS.find((s) => s.key === station);
            const colors = STATION_TV_COLORS[station] || STATION_TV_COLORS.pending;
            return (
              <div
                key={station}
                className={`${colors.bg} ${colors.border} border-2 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[160px] transition-all`}
              >
                <span className={`text-6xl lg:text-7xl font-black ${colors.text}`}>{count}</span>
                <span className={`text-xl lg:text-2xl font-bold mt-2 ${colors.text} uppercase tracking-wide`}>
                  {stationDef?.label || station}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================ */}
      {/* BOTTOM ROW: Active Orders | Issues | Today Stats                 */}
      {/* ================================================================ */}
      <div className="grid grid-cols-12 gap-4">
        {/* ----- Active Orders (7 cols) ----- */}
        <div className="col-span-7">
          <h2 className="text-xl font-semibold text-white/70 mb-3 uppercase tracking-wider">
            {t('production.active_orders')}
            <span className="ml-3 text-white/40 text-lg font-normal lowercase">
              {activeOrders.length} in progress
            </span>
          </h2>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
            {activeOrders.length === 0 && (
              <div className="col-span-full text-center text-white/30 text-2xl py-12">
                {t('common.no_results')}
              </div>
            )}
            {activeOrders.map((order) => {
              const progress =
                order.total_parts > 0
                  ? Math.round((order.packed_parts / order.total_parts) * 100)
                  : 0;
              const days = daysElapsed(order.created_at);
              return (
                <div
                  key={order.id}
                  className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
                >
                  <div>
                    <div className="text-2xl font-bold text-white truncate">
                      {order.project?.client_name || 'Unknown'}
                    </div>
                    <div className="text-lg text-[#C9956B] font-mono font-semibold">
                      {order.project?.reference_code || '-'}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-3xl font-black text-white">{progress}%</span>
                      <span className="text-lg text-white/50">
                        {order.packed_parts}/{order.total_parts} parts
                      </span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          background:
                            progress === 100
                              ? '#22c55e'
                              : progress >= 50
                              ? '#C9956B'
                              : '#3b82f6',
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-lg text-white/50">
                    <Clock size={18} />
                    <span>
                      {days} day{days !== 1 ? 's' : ''} elapsed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ----- Right column: Issues + Stats (5 cols) ----- */}
        <div className="col-span-5 flex flex-col gap-4">
          {/* Today's Activity */}
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0">
              <ScanLine size={36} className="text-blue-400" />
            </div>
            <div>
              <div className="text-5xl font-black text-white">{todayScans}</div>
              <div className="text-xl text-white/50">{t('production.scan_part')}</div>
            </div>
          </div>

          {/* Open Issues */}
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <AlertTriangle size={28} className="text-orange-400" />
                </div>
                <div>
                  <div className="text-4xl font-black text-white">{openIssues.length}</div>
                  <div className="text-lg text-white/50">{t('issues.open')}</div>
                </div>
              </div>

              {/* Severity summary badges */}
              <div className="flex flex-col items-end gap-1">
                {criticalIssues.length > 0 && (
                  <span className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 text-xl font-bold animate-pulse">
                    {criticalIssues.length} CRITICAL
                  </span>
                )}
                {highIssues.length > 0 && (
                  <span className="px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-lg font-bold">
                    {highIssues.length} HIGH
                  </span>
                )}
              </div>
            </div>

            {/* Issue list */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[280px]">
              {openIssues.length === 0 && (
                <div className="text-center text-white/30 text-xl py-8">{t('common.no_results')}</div>
              )}
              {openIssues.slice(0, 10).map((issue) => (
                <div
                  key={issue.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                    issue.severity === 'critical'
                      ? 'bg-red-900/30 border-red-500/50'
                      : issue.severity === 'high'
                      ? 'bg-orange-900/20 border-orange-500/30'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        issue.severity === 'critical'
                          ? 'bg-red-500 animate-pulse'
                          : issue.severity === 'high'
                          ? 'bg-orange-500'
                          : issue.severity === 'medium'
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`}
                    />
                    <span className="text-lg font-semibold text-white truncate">
                      {issueLabel(issue.issue_type)}
                    </span>
                  </div>
                  <StatusBadge status={issue.severity} className="text-base" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Footer: last refresh time                                        */}
      {/* ================================================================ */}
      <div className="mt-4 text-center text-white/20 text-lg">
        Last refreshed at {formatTime(lastRefresh)}
      </div>
    </div>
      </RoleGuard>
  );
}
