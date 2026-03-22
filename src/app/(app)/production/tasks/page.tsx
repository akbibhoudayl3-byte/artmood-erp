'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormModal from '@/components/ui/FormModal';
import {
  loadAllTasks,
  loadWorkers,
  startTask,
  completeTask,
  pauseTask,
  resumeTask,
  assignTask,
  submitQCResult,
} from '@/lib/services/task.service';
import { WORKFLOW_STATIONS, WORKFLOW_STATION_COLORS, QC_RESULTS } from '@/lib/config/workflow';
import type { TaskBoardItem, QCResult } from '@/types/production';

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TaskBoardPage() {
  const { profile, canManageProduction } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stationParam = searchParams.get('station') || '';

  const [tasks, setTasks] = useState<TaskBoardItem[]>([]);
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // QC Modal
  const [qcTask, setQcTask] = useState<TaskBoardItem | null>(null);
  const [qcResult, setQcResult] = useState<QCResult>('approved');
  const [qcReworkStation, setQcReworkStation] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [qcLoading, setQcLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const res = await loadAllTasks(stationParam || undefined);
    if (res.success) {
      setTasks(res.data || []);
    } else {
      setError(res.error || 'Failed to load tasks');
    }
    setLoading(false);
  }, [stationParam]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (canManageProduction) {
      loadWorkers().then((res) => {
        if (res.success) setWorkers(res.data || []);
      });
    }
  }, [canManageProduction]);

  const handleAction = async (
    action: () => Promise<{ success: boolean; error?: string }>,
    taskId: string,
    successMsg: string,
  ) => {
    setActionLoading(taskId);
    setError(null);
    const res = await action();
    if (res.success) {
      setSuccess(successMsg);
      await fetchTasks();
    } else {
      setError(res.error || 'Action failed');
    }
    setActionLoading(null);
  };

  const handleStart = (task: TaskBoardItem) =>
    handleAction(() => startTask(task.id, profile!.id), task.id, 'Task started');

  const handleComplete = (task: TaskBoardItem) => {
    if (task.station_code === 'QUALITY_CHECK') {
      setQcTask(task);
      setQcResult('approved');
      setQcReworkStation('');
      setQcNotes('');
      return;
    }
    handleAction(() => completeTask(task.id, profile!.id), task.id, 'Task completed');
  };

  const handlePause = (task: TaskBoardItem) =>
    handleAction(() => pauseTask(task.id), task.id, 'Task paused');

  const handleResume = (task: TaskBoardItem) =>
    handleAction(() => resumeTask(task.id, profile!.id), task.id, 'Task resumed');

  const handleAssign = async (taskId: string, workerId: string) => {
    setActionLoading(taskId);
    const res = await assignTask(taskId, workerId || null);
    if (res.success) {
      setSuccess('Worker assigned');
      await fetchTasks();
    } else {
      setError(res.error || 'Failed to assign');
    }
    setActionLoading(null);
  };

  const handleQCSubmit = async () => {
    if (!qcTask) return;
    setQcLoading(true);
    const res = await submitQCResult(
      qcTask.id,
      qcResult,
      qcResult === 'rework_required' ? qcReworkStation : undefined,
      qcNotes || undefined,
    );
    if (res.success) {
      setSuccess('QC result submitted');
      setQcTask(null);
      await fetchTasks();
    } else {
      setError(res.error || 'QC submission failed');
    }
    setQcLoading(false);
  };

  const setStation = (code: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (code) {
      params.set('station', code);
    } else {
      params.delete('station');
    }
    router.push(`/production/tasks?${params.toString()}`);
  };

  // Rework target stations: DESIGN_CHECK through ASSEMBLY
  const reworkStations = WORKFLOW_STATIONS.filter((s) =>
    ['DESIGN_CHECK', 'CUTTING', 'EDGE_BANDING', 'DRILLING', 'ASSEMBLY'].includes(s.key),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1a1a2e] dark:text-white">Task Board</h1>
        <Button variant="secondary" size="sm" onClick={fetchTasks} disabled={loading}>
          Refresh
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={success} type="success" onDismiss={() => setSuccess(null)} autoDismiss={3000} />

      {/* Station filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        <button
          onClick={() => setStation('')}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            !stationParam
              ? 'bg-[#1B2A4A] text-white'
              : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EBE8E3]'
          }`}
        >
          {canManageProduction ? 'All' : 'All Stations'}
        </button>
        {WORKFLOW_STATIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStation(s.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              stationParam === s.key
                ? 'text-white'
                : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EBE8E3]'
            }`}
            style={stationParam === s.key ? { backgroundColor: WORKFLOW_STATION_COLORS[s.key] } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Tasks */}
      {!loading && tasks.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-center text-[#64648B] py-8">No tasks found for this station.</p>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="space-y-3">
                {/* Top row: order info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1a1a2e] dark:text-white text-base truncate">
                      {task.order_name || 'Untitled Order'}
                    </p>
                    <p className="text-sm text-[#64648B] truncate">
                      {task.client_name || 'No client'}
                      {task.reference_code && (
                        <span className="text-gray-400 ml-2">{task.reference_code}</span>
                      )}
                    </p>
                  </div>
                  {task.rework_count > 0 && (
                    <span className="flex-shrink-0 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-lg">
                      Rework x{task.rework_count}
                    </span>
                  )}
                </div>

                {/* Station + Status row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: WORKFLOW_STATION_COLORS[task.station_code] || '#6B7280' }}
                  >
                    {task.station_name}
                  </span>
                  <StatusBadge status={task.status} />
                </div>

                {/* Assignee + Duration */}
                <div className="flex items-center justify-between text-sm">
                  <span className={task.assignee_name ? 'text-[#1a1a2e] dark:text-white' : 'text-red-500 font-medium'}>
                    {task.assignee_name || 'Unassigned'}
                  </span>
                  {task.status === 'in_progress' && task.started_at && (
                    <span className="text-blue-600 font-medium">{formatDuration(task.started_at)}</span>
                  )}
                </div>

                {/* Manager: Assign dropdown */}
                {canManageProduction && (
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-[#E8E5E0] dark:border-white/10 bg-white dark:bg-[#1a1a2e] text-sm"
                    value={task.assigned_to || ''}
                    onChange={(e) => handleAssign(task.id, e.target.value)}
                    disabled={actionLoading === task.id}
                  >
                    <option value="">Unassigned</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.full_name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {task.status === 'pending' && (
                    <Button
                      variant="success"
                      size="md"
                      fullWidth
                      className="min-h-12"
                      loading={actionLoading === task.id}
                      onClick={() => handleStart(task)}
                    >
                      Start
                    </Button>
                  )}
                  {task.status === 'in_progress' && (
                    <>
                      <Button
                        variant="primary"
                        size="md"
                        fullWidth
                        className="min-h-12"
                        loading={actionLoading === task.id}
                        onClick={() => handleComplete(task)}
                      >
                        Complete
                      </Button>
                      <Button
                        variant="secondary"
                        size="md"
                        className="min-h-12 !bg-yellow-50 !text-yellow-700 !border-yellow-200 hover:!bg-yellow-100"
                        loading={actionLoading === task.id}
                        onClick={() => handlePause(task)}
                      >
                        Pause
                      </Button>
                    </>
                  )}
                  {task.status === 'paused' && (
                    <Button
                      variant="success"
                      size="md"
                      fullWidth
                      className="min-h-12"
                      loading={actionLoading === task.id}
                      onClick={() => handleResume(task)}
                    >
                      Resume
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* QC Modal */}
      <FormModal
        isOpen={!!qcTask}
        onClose={() => setQcTask(null)}
        title="Quality Check Result"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setQcTask(null)} fullWidth>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleQCSubmit}
              loading={qcLoading}
              fullWidth
              disabled={qcResult === 'rework_required' && !qcReworkStation}
            >
              Submit
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* QC Result radios */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1a1a2e] dark:text-white">Result</label>
            {QC_RESULTS.map((r) => (
              <label
                key={r.key}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  qcResult === r.key
                    ? 'border-[#C9956B] bg-[#C9956B]/5'
                    : 'border-[#E8E5E0] dark:border-white/10 hover:bg-[#F5F3F0] dark:hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name="qcResult"
                  value={r.key}
                  checked={qcResult === r.key}
                  onChange={() => setQcResult(r.key as QCResult)}
                  className="accent-[#C9956B]"
                />
                <span className="text-sm font-medium text-[#1a1a2e] dark:text-white">{r.label}</span>
              </label>
            ))}
          </div>

          {/* Rework station selector */}
          {qcResult === 'rework_required' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1a1a2e] dark:text-white">
                Rework Station
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8E5E0] dark:border-white/10 bg-white dark:bg-[#1a1a2e] text-sm"
                value={qcReworkStation}
                onChange={(e) => setQcReworkStation(e.target.value)}
              >
                <option value="">Select station...</option>
                {reworkStations.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1a1a2e] dark:text-white">Notes</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-xl border border-[#E8E5E0] dark:border-white/10 bg-white dark:bg-[#1a1a2e] text-sm min-h-[80px] resize-none"
              placeholder="Optional notes..."
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}

export default function TaskBoardPageWrapper() {
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker', 'worker']}>
      <TaskBoardPage />
    </RoleGuard>
  );
}
