'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import type { ProductionOrder, ProductionOrderStatus } from '@/types/database';
import { useRealtime } from '@/lib/hooks/useRealtime';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  Factory,
  ScanLine,
  AlertTriangle,
  Monitor,
  Wrench,
  Play,
  CheckCircle2,
  Clock,
  PackageOpen,
  ArrowRight,
  RefreshCw,
  TrendingDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OrderWithProject = ProductionOrder & {
  project: { id: string; client_name: string; reference_code: string } | null;
  part_count: number;
  packed_count: number;
};

type FilterTab = 'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysElapsed(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function isThisWeek(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - now.getDay());
  return d >= startOfWeek;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ProductionPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [orders, setOrders] = useState<OrderWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const isWorker = profile?.role === 'workshop_worker';

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    // Fetch all orders with project join
    const { data: ordersData, error } = await supabase
      .from('production_orders')
      .select('*, project:projects(id, client_name, reference_code)')
      .order('status', { ascending: true }) // in_progress first alphabetically, then pending, etc.
      .order('created_at', { ascending: false });

    if (error || !ordersData) {
      setLoading(false);
      return;
    }

    // Fetch part counts per order (single query, aggregate client-side)
    const orderIds = ordersData.map((o) => o.id);
    let partRows: { production_order_id: string; current_station: string }[] = [];
    if (orderIds.length > 0) {
      const { data } = await supabase
        .from('production_parts')
        .select('production_order_id, current_station')
        .in('production_order_id', orderIds);
      partRows = data || [];
    }

    const countMap: Record<string, { total: number; packed: number }> = {};
    partRows.forEach((p) => {
      if (!countMap[p.production_order_id]) {
        countMap[p.production_order_id] = { total: 0, packed: 0 };
      }
      countMap[p.production_order_id].total += 1;
      if (p.current_station === 'packing') {
        countMap[p.production_order_id].packed += 1;
      }
    });

    const enriched: OrderWithProject[] = ordersData.map((o: any) => {
      const proj = Array.isArray(o.project) ? o.project[0] : o.project;
      const counts = countMap[o.id] || { total: 0, packed: 0 };
      return {
        ...o,
        project: proj || null,
        part_count: counts.total,
        packed_count: counts.packed,
      };
    });

    // Sort: in_progress first, then pending, then others; within same status newest first
    enriched.sort((a, b) => {
      const priority: Record<string, number> = { in_progress: 0, pending: 1, on_hold: 2, completed: 3, cancelled: 4 };
      const pa = priority[a.status] ?? 5;
      const pb = priority[b.status] ?? 5;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setOrders(enriched);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time subscription: refresh when orders or parts change
  useRealtime('production_orders', () => loadData());
  useRealtime('production_parts', () => loadData());

  // -----------------------------------------------------------------------
  // Derived stats
  // -----------------------------------------------------------------------
  const totalOrders = orders.length;
  const inProgress = orders.filter((o) => o.status === 'in_progress').length;
  const completedThisWeek = orders.filter(
    (o) => o.status === 'completed' && o.completed_at && isThisWeek(o.completed_at)
  ).length;
  const delayedCount = orders.filter(
    (o) => o.status === 'in_progress' && daysElapsed(o.created_at) > 14
  ).length;

  // -----------------------------------------------------------------------
  // Filtered list
  // -----------------------------------------------------------------------
  const filteredOrders =
    activeFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === activeFilter);

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalOrders },
    { key: 'pending', label: 'Pending', count: orders.filter((o) => o.status === 'pending').length },
    { key: 'in_progress', label: 'In Progress', count: inProgress },
    { key: 'completed', label: 'Completed', count: orders.filter((o) => o.status === 'completed').length },
    { key: 'cancelled', label: 'Cancelled', count: orders.filter((o) => o.status === 'cancelled').length },
  ];

  // -----------------------------------------------------------------------
  // Worker view — keep existing simple scan UI
  // -----------------------------------------------------------------------
  if (isWorker) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('production.my_tasks')}</h1>

        <button
          onClick={() => router.push('/production/scan')}
          className="w-full py-8 bg-gradient-to-b from-[#1E2F52] to-[#1B2A4A] text-white rounded-2xl flex flex-col items-center gap-2 active:scale-[0.98] shadow-lg shadow-[#1B2A4A]/20"
        >
          <ScanLine size={48} />
          <span className="text-lg font-semibold">{t('production.scan_part')}</span>
          <span className="text-sm text-white/60">Scan to update station</span>
        </button>

        <button
          onClick={() => router.push('/production/issues')}
          className="w-full py-6 bg-gradient-to-b from-orange-500 to-orange-600 text-white rounded-2xl flex flex-col items-center gap-2 active:scale-[0.98] shadow-lg shadow-orange-500/20"
        >
          <AlertTriangle size={36} />
          <span className="text-lg font-semibold">{t('production.report_issue')}</span>
          <span className="text-sm text-white/60">Missing material, wrong dimension, etc.</span>
        </button>

        <h2 className="font-semibold text-[#1a1a2e] mt-6">Today&apos;s Tasks</h2>
        <p className="text-sm text-[#64648B]">Tasks assigned to you will appear here</p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Manager / CEO view
  // -----------------------------------------------------------------------
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker'] as any[]}>
      <div className="space-y-5">

        {/* ================================================================ */}
        {/* HEADER                                                           */}
        {/* ================================================================ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('production.title')}</h1>
            <p className="text-sm text-[#64648B]">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200"
              title={`Last refresh: ${lastRefresh.toLocaleTimeString()}`}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => router.push('/production/dashboard')}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1E2F52] text-white rounded-xl text-sm font-medium hover:bg-[#1B2A4A]"
            >
              <Monitor size={14} /> TV
            </button>
            <button
              onClick={() => router.push('/production/tracking')}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100"
            >
              <ScanLine size={14} /> Tracking
            </button>
            <button
              onClick={() => router.push('/production/maintenance')}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-100"
            >
              <Wrench size={14} /> Maintenance
            </button>
            <button
              onClick={() => router.push('/production/issues')}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-100"
            >
              <AlertTriangle size={14} /> Issues
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* QUICK STATS ROW — 4 cards                                        */}
        {/* ================================================================ */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 skeleton rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Active Orders */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Play size={16} className="text-blue-500" />
                <span className="text-xs font-medium text-blue-600">Active Orders</span>
              </div>
              <p className="text-3xl font-bold text-blue-700">{inProgress}</p>
              <p className="text-xs text-blue-500 mt-1">{totalOrders} total orders</p>
            </div>

            {/* Delayed */}
            <div className={`${delayedCount > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} border rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className={delayedCount > 0 ? 'text-red-500' : 'text-gray-400'} />
                <span className={`text-xs font-medium ${delayedCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>Delayed (&gt;14d)</span>
              </div>
              <p className={`text-3xl font-bold ${delayedCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{delayedCount}</p>
              <p className={`text-xs mt-1 ${delayedCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>in_progress orders</p>
            </div>

            {/* Completed This Week */}
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={16} className="text-green-500" />
                <span className="text-xs font-medium text-green-600">Done This Week</span>
              </div>
              <p className="text-3xl font-bold text-green-700">{completedThisWeek}</p>
              <p className="text-xs text-green-500 mt-1">orders completed</p>
            </div>

            {/* Pending (queue) */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={16} className="text-amber-500" />
                <span className="text-xs font-medium text-amber-600">In Queue</span>
              </div>
              <p className="text-3xl font-bold text-amber-700">
                {orders.filter((o) => o.status === 'pending').length}
              </p>
              <p className="text-xs text-amber-500 mt-1">pending orders</p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* FILTER TABS                                                       */}
        {/* ================================================================ */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeFilter === tab.key
                  ? 'bg-[#1E2F52] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeFilter === tab.key ? 'bg-white/20 text-white' : 'bg-white text-gray-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ================================================================ */}
        {/* ORDER LIST                                                        */}
        {/* ================================================================ */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
          </div>
        ) : filteredOrders.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <Factory size={40} className="text-gray-300" />
            </div>
            <p className="text-[#1a1a2e] font-semibold text-lg">No production orders</p>
            <p className="text-[#64648B] text-sm mt-1 max-w-xs">
              {activeFilter === 'all'
                ? 'No orders have been created yet. Orders are created from a project page.'
                : `No ${activeFilter.replace('_', ' ')} orders at the moment.`}
            </p>
            <button
              onClick={() => router.push('/projects')}
              className="mt-5 flex items-center gap-2 px-4 py-2 bg-[#1E2F52] text-white rounded-xl text-sm font-medium hover:bg-[#1B2A4A]"
            >
              Go to Projects <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredOrders.map((order) => {
              const progress =
                order.part_count > 0
                  ? Math.round((order.packed_count / order.part_count) * 100)
                  : 0;
              const days = daysElapsed(order.created_at);
              const isDelayed = order.status === 'in_progress' && days > 14;

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.99] ${
                    isDelayed ? 'border-red-200' : 'border-[#E8E5E0]'
                  }`}
                  onClick={() => router.push(`/projects/${order.project?.id}/production`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      {/* Row 1: ref + status */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-[#64648B]">
                          {order.project?.reference_code || '—'}
                        </span>
                        {isDelayed && (
                          <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                            DELAYED
                          </span>
                        )}
                      </div>

                      {/* Row 2: client name + order name */}
                      <p className="text-sm font-semibold text-[#1a1a2e] truncate">
                        {order.project?.client_name || 'Unknown client'}
                      </p>
                      {order.name && (
                        <p className="text-xs text-[#64648B] truncate mt-0.5">{order.name}</p>
                      )}

                      {/* Row 3: dates */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-[#64648B]">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          Created {formatDate(order.created_at)}
                        </span>
                        {order.started_at && (
                          <span>{days}d elapsed</span>
                        )}
                        {order.completed_at && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 size={11} />
                            {formatDate(order.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: status badge */}
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <StatusBadge status={order.status} />
                      {order.part_count > 0 && (
                        <span className="text-xs text-[#64648B] flex items-center gap-1">
                          <PackageOpen size={11} />
                          {order.part_count} parts
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar — only show if there are parts */}
                  {order.part_count > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#64648B]">
                          {order.packed_count} / {order.part_count} at packing
                        </span>
                        <span className="text-xs font-semibold text-[#1a1a2e]">{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${progress}%`,
                            background:
                              progress === 100
                                ? '#22c55e'
                                : progress >= 60
                                ? '#C9956B'
                                : '#3b82f6',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/projects/${order.project?.id}/production`);
                      }}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#1E2F52] hover:underline"
                    >
                      View Details <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
