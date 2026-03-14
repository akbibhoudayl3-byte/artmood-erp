'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { STATION_COLORS, STATION_ORDER } from '@/lib/constants';
import { ArrowLeft, BarChart3, TrendingUp, RefreshCw, Download, Clock, Activity } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StationCount {
  station: string;
  count: number;
}

interface PanelRow {
  part_name: string | null;
  part_code: string | null;
  current_station: string;
  last_scan_time: string | null;
  production_order_id: string;
  order_name: string | null;
  client_name: string | null;
  reference_code: string | null;
}

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------
function exportCSV(rows: PanelRow[]) {
  const header = ['Part Name', 'Part Code', 'Station', 'Last Scan', 'Order', 'Client', 'Reference'];
  const csvRows = [
    header.join(','),
    ...rows.map((r) =>
      [
        `"${r.part_name || ''}"`,
        `"${r.part_code || ''}"`,
        r.current_station,
        r.last_scan_time ? new Date(r.last_scan_time).toLocaleString() : '',
        `"${r.order_name || ''}"`,
        `"${r.client_name || ''}"`,
        `"${r.reference_code || ''}"`,
      ].join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `production-tracking-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ProductionTrackingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [stationCounts, setStationCounts] = useState<StationCount[]>([]);
  const [panels, setPanels] = useState<PanelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPanels, setTotalPanels] = useState(0);
  const [completedPanels, setCompletedPanels] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Data loading — single query with order + project join
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    // Fetch panels with order and project details joined
    const { data } = await supabase
      .from('production_parts')
      .select(`
        part_name,
        part_code,
        current_station,
        last_scan_time,
        production_order_id,
        production_order:production_orders(
          name,
          project:projects(client_name, reference_code)
        )
      `)
      .order('last_scan_time', { ascending: false });

    const rows: PanelRow[] = (data || []).map((p: any) => {
      const order = Array.isArray(p.production_order) ? p.production_order[0] : p.production_order;
      const project = order ? (Array.isArray(order.project) ? order.project[0] : order.project) : null;
      return {
        part_name: p.part_name,
        part_code: p.part_code,
        current_station: p.current_station,
        last_scan_time: p.last_scan_time,
        production_order_id: p.production_order_id,
        order_name: order?.name || null,
        client_name: project?.client_name || null,
        reference_code: project?.reference_code || null,
      };
    });

    // Aggregate station counts client-side
    const countMap: Record<string, number> = {};
    rows.forEach((p) => {
      countMap[p.current_station] = (countMap[p.current_station] || 0) + 1;
    });

    setStationCounts(STATION_ORDER.map((s) => ({ station: s, count: countMap[s] || 0 })));
    setTotalPanels(rows.length);
    setCompletedPanels(countMap['packing'] || 0);
    setPanels(rows);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30 seconds (toggle-able)
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(loadData, 30_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, loadData]);

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------
  const maxCount = Math.max(...stationCounts.map((s) => s.count), 1);
  const progressPercent = totalPanels > 0 ? Math.round((completedPanels / totalPanels) * 100) : 0;

  const visiblePanels = selectedStation
    ? panels.filter((p) => p.current_station === selectedStation)
    : panels;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-xl w-48" />
        <div className="h-24 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker'] as any[]}>
      <div className="space-y-4">

        {/* ================================================================ */}
        {/* HEADER                                                           */}
        {/* ================================================================ */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/production')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[#1a1a2e]">{t('tracking.title')}</h1>
            <p className="text-xs text-[#64648B] flex items-center gap-1">
              <Clock size={11} />
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                autoRefresh
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Activity size={12} />
              {autoRefresh ? 'Live 30s' : 'Paused'}
            </button>
            {/* Manual refresh */}
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            {/* CSV Export */}
            <button
              onClick={() => exportCSV(visiblePanels)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E2F52] text-white rounded-xl text-xs font-medium hover:bg-[#1B2A4A] transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* OVERALL PROGRESS                                                  */}
        {/* ================================================================ */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-green-500" />
                <span className="text-sm font-semibold">{t('tracking.overall_progress')}</span>
              </div>
              <span className="text-lg font-bold text-[#1a1a2e]">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="h-3 rounded-full transition-all duration-700"
                style={{
                  width: progressPercent + '%',
                  background: progressPercent === 100 ? '#22c55e' : '#C9956B',
                }}
              />
            </div>
            <p className="text-xs text-[#64648B] mt-1">
              {completedPanels} / {totalPanels} {t('sheets.panels')} at packing
            </p>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* STATION PIPELINE — horizontal bar chart                          */}
        {/* ================================================================ */}
        <Card>
          <CardContent>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-[#C9956B]" />
              {t('tracking.pipeline')}
              <span className="text-xs font-normal text-[#64648B] ml-auto">
                Click a station to filter the table below
              </span>
            </h3>
            <div className="space-y-2">
              {stationCounts.map(({ station, count }) => {
                const isSelected = selectedStation === station;
                return (
                  <button
                    key={station}
                    onClick={() => setSelectedStation(isSelected ? null : station)}
                    className={`w-full flex items-center gap-3 group transition-all rounded-lg p-1 ${
                      isSelected ? 'ring-2 ring-offset-1' : 'hover:bg-gray-50'
                    }`}
                    style={{ ringColor: STATION_COLORS[station] }}
                  >
                    <span
                      className="w-20 text-xs font-semibold text-right shrink-0"
                      style={{ color: STATION_COLORS[station] }}
                    >
                      {station.toUpperCase()}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="h-6 rounded-full transition-all flex items-center justify-end pr-2"
                        style={{
                          width: count > 0 ? (count / maxCount * 100) + '%' : '0',
                          backgroundColor: STATION_COLORS[station],
                          minWidth: count > 0 ? '30px' : '0',
                          opacity: isSelected ? 1 : 0.85,
                        }}
                      >
                        {count > 0 && <span className="text-[10px] font-bold text-white">{count}</span>}
                      </div>
                    </div>
                    {count === 0 && (
                      <span className="text-xs text-gray-400 ml-1">0</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* STATION QUICK-ACCESS TILES                                        */}
        {/* ================================================================ */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {STATION_ORDER.map((station) => {
            const count = stationCounts.find((s) => s.station === station)?.count || 0;
            const isSelected = selectedStation === station;
            return (
              <button
                key={station}
                onClick={() => setSelectedStation(isSelected ? null : station)}
                className="p-3 rounded-xl text-center transition-all hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: isSelected ? STATION_COLORS[station] : STATION_COLORS[station] + '20',
                  borderColor: STATION_COLORS[station],
                  borderWidth: 1,
                  color: isSelected ? '#ffffff' : STATION_COLORS[station],
                }}
              >
                <p className="text-lg font-bold">{count}</p>
                <p className="text-[9px] font-semibold uppercase">{station}</p>
              </button>
            );
          })}
        </div>

        {/* ================================================================ */}
        {/* PANEL TABLE — filtered by selected station                        */}
        {/* ================================================================ */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#1a1a2e]">
                {selectedStation
                  ? `Parts at ${selectedStation.toUpperCase()} (${visiblePanels.length})`
                  : `All Parts (${visiblePanels.length})`}
              </h3>
              {selectedStation && (
                <button
                  onClick={() => setSelectedStation(null)}
                  className="text-xs text-[#64648B] hover:text-[#1a1a2e]"
                >
                  Clear filter
                </button>
              )}
            </div>

            {visiblePanels.length === 0 ? (
              <p className="text-sm text-[#64648B] text-center py-6">No parts found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-gray-100">
                      <th className="pb-2 pr-3 font-semibold text-[#64648B]">Part</th>
                      <th className="pb-2 pr-3 font-semibold text-[#64648B]">Station</th>
                      <th className="pb-2 pr-3 font-semibold text-[#64648B]">Client</th>
                      <th className="pb-2 font-semibold text-[#64648B]">Last Scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePanels.slice(0, 200).map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 pr-3">
                          <p className="font-medium text-[#1a1a2e]">{row.part_name || '—'}</p>
                          {row.part_code && (
                            <p className="text-[10px] text-[#64648B] font-mono">{row.part_code}</p>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                            style={{ backgroundColor: STATION_COLORS[row.current_station] || '#999' }}
                          >
                            {row.current_station.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <p className="font-medium text-[#1a1a2e]">{row.client_name || '—'}</p>
                          {row.reference_code && (
                            <p className="text-[10px] text-[#64648B] font-mono">{row.reference_code}</p>
                          )}
                        </td>
                        <td className="py-1.5 text-[#64648B]">
                          {row.last_scan_time
                            ? new Date(row.last_scan_time).toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visiblePanels.length > 200 && (
                  <p className="text-xs text-[#64648B] text-center mt-2 pt-2 border-t">
                    Showing 200 of {visiblePanels.length} — export CSV for the full list
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
