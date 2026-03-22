'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { loadAllTasks } from '@/lib/services/task.service';
import { WORKFLOW_STATIONS, WORKFLOW_STATION_COLORS } from '@/lib/config/workflow';
import type { TaskBoardItem } from '@/types/production';

interface StationStats {
  key: string;
  label: string;
  total: number;
  in_progress: number;
  completed: number;
  pending: number;
  paused: number;
  activeWorkers: Set<string>;
}

function StationsOverviewPage() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    const res = await loadAllTasks();
    if (res.success) {
      setTasks(res.data || []);
    } else {
      setError(res.error || 'Failed to load tasks');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const stationStats = useMemo<StationStats[]>(() => {
    return WORKFLOW_STATIONS.map((s) => {
      const stationTasks = tasks.filter((t) => t.station_code === s.key);
      const activeWorkers = new Set<string>();
      let inProgress = 0;
      let completed = 0;
      let pending = 0;
      let paused = 0;

      for (const t of stationTasks) {
        if (t.status === 'in_progress') {
          inProgress++;
          if (t.assigned_to) activeWorkers.add(t.assigned_to);
        } else if (t.status === 'completed') {
          completed++;
        } else if (t.status === 'pending') {
          pending++;
        } else if (t.status === 'paused') {
          paused++;
        }
      }

      return {
        key: s.key,
        label: s.label,
        total: stationTasks.length,
        in_progress: inProgress,
        completed,
        pending,
        paused,
        activeWorkers,
      };
    });
  }, [tasks]);

  const totalActive = tasks.filter((t) => t.status === 'in_progress').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1a1a2e] dark:text-white">Stations Overview</h1>
          {!loading && (
            <p className="text-sm text-[#64648B]">
              {totalActive} active task{totalActive !== 1 ? 's' : ''} across all stations
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={fetchTasks} disabled={loading}>
          Refresh
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Station grid */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stationStats.map((station) => (
            <Card
              key={station.key}
              onClick={() => router.push(`/production/tasks?station=${station.key}`)}
              className="!rounded-2xl overflow-hidden"
            >
              <div
                className="h-1.5"
                style={{ backgroundColor: WORKFLOW_STATION_COLORS[station.key] || '#6B7280' }}
              />
              <CardContent className="space-y-3">
                {/* Station name */}
                <p className="font-bold text-[#1a1a2e] dark:text-white text-sm leading-tight">
                  {station.label}
                </p>

                {/* Big active number */}
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#1a1a2e] dark:text-white">
                    {station.total}
                  </span>
                  <span className="text-xs text-[#64648B]">tasks</span>
                </div>

                {/* Breakdown */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-600 font-medium">In Progress</span>
                    <span className="font-semibold text-[#1a1a2e] dark:text-white">{station.in_progress}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Pending</span>
                    <span className="font-semibold text-[#1a1a2e] dark:text-white">{station.pending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-yellow-600">Paused</span>
                    <span className="font-semibold text-[#1a1a2e] dark:text-white">{station.paused}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-600">Completed</span>
                    <span className="font-semibold text-[#1a1a2e] dark:text-white">{station.completed}</span>
                  </div>
                </div>

                {/* Active workers */}
                {station.activeWorkers.size > 0 && (
                  <div className="pt-2 border-t border-[#F0EDE8] dark:border-white/5">
                    <span className="text-xs text-[#64648B]">
                      {station.activeWorkers.size} worker{station.activeWorkers.size !== 1 ? 's' : ''} active
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StationsOverviewPageWrapper() {
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager']}>
      <StationsOverviewPage />
    </RoleGuard>
  );
}
