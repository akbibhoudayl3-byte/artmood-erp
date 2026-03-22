'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormModal from '@/components/ui/FormModal';
import {
  loadMyTasks,
  startTask,
  completeTask,
  pauseTask,
  resumeTask,
  submitQCResult,
} from '@/lib/services/task.service';
import { WORKFLOW_STATION_COLORS, WORKFLOW_STATIONS, QC_RESULTS } from '@/lib/config/workflow';
import type { TaskBoardItem, QCResult } from '@/types/production';

function useLiveDuration(startedAt: string | null): string {
  const [display, setDisplay] = useState(() => calcDuration(startedAt));

  useEffect(() => {
    if (!startedAt) return;
    setDisplay(calcDuration(startedAt));
    const interval = setInterval(() => {
      setDisplay(calcDuration(startedAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return display;
}

function calcDuration(startedAt: string | null): string {
  if (!startedAt) return '';
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TaskCard({
  task,
  onStart,
  onComplete,
  onPause,
  onResume,
  actionLoading,
}: {
  task: TaskBoardItem;
  onStart: () => void;
  onComplete: () => void;
  onPause: () => void;
  onResume: () => void;
  actionLoading: boolean;
}) {
  const duration = useLiveDuration(task.status === 'in_progress' ? task.started_at : null);

  return (
    <Card>
      <CardContent className="space-y-3">
        {/* Station badge */}
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: WORKFLOW_STATION_COLORS[task.station_code] || '#6B7280' }}
          >
            {task.station_name}
          </span>
          <StatusBadge status={task.status} />
        </div>

        {/* Order info */}
        <div>
          <p className="font-semibold text-[#1a1a2e] dark:text-white text-base">
            {task.order_name || 'Untitled Order'}
          </p>
          <p className="text-sm text-[#64648B]">{task.client_name || 'No client'}</p>
        </div>

        {/* Duration for in_progress */}
        {task.status === 'in_progress' && duration && (
          <div className="flex items-center gap-2 text-blue-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-sm font-medium">{duration}</span>
          </div>
        )}

        {/* BIG action buttons */}
        <div className="flex gap-2">
          {task.status === 'pending' && (
            <Button
              variant="success"
              size="xl"
              fullWidth
              className="!h-14 !text-lg"
              loading={actionLoading}
              onClick={onStart}
            >
              Start
            </Button>
          )}
          {task.status === 'in_progress' && (
            <>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                className="!h-14 !text-lg"
                loading={actionLoading}
                onClick={onComplete}
              >
                Complete
              </Button>
              <Button
                variant="secondary"
                size="xl"
                className="!h-14 !text-lg !bg-yellow-50 !text-yellow-700 !border-yellow-200 hover:!bg-yellow-100"
                loading={actionLoading}
                onClick={onPause}
              >
                Pause
              </Button>
            </>
          )}
          {task.status === 'paused' && (
            <Button
              variant="success"
              size="xl"
              fullWidth
              className="!h-14 !text-lg"
              loading={actionLoading}
              onClick={onResume}
            >
              Resume
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MyTasksPage() {
  const { profile } = useAuth();
  const { t } = useLocale();

  const [tasks, setTasks] = useState<TaskBoardItem[]>([]);
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
    if (!profile?.id) return;
    setLoading(true);
    const res = await loadMyTasks(profile.id);
    if (res.success) {
      setTasks(res.data || []);
    } else {
      setError(res.error || 'Failed to load tasks');
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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

  const reworkStations = WORKFLOW_STATIONS.filter((s) =>
    ['DESIGN_CHECK', 'CUTTING', 'EDGE_BANDING', 'DRILLING', 'ASSEMBLY'].includes(s.key),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1a1a2e] dark:text-white">My Tasks</h1>
          {!loading && (
            <p className="text-sm text-[#64648B]">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={fetchTasks} disabled={loading}>
          Refresh
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={success} type="success" onDismiss={() => setSuccess(null)} autoDismiss={3000} />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[#F5F3F0] dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#64648B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[#1a1a2e] dark:text-white font-semibold mb-1">No tasks assigned</p>
              <p className="text-sm text-[#64648B]">You have no pending tasks right now.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      {!loading && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              actionLoading={actionLoading === task.id}
              onStart={() =>
                handleAction(() => startTask(task.id, profile!.id), task.id, 'Task started')
              }
              onComplete={() => handleComplete(task)}
              onPause={() => handleAction(() => pauseTask(task.id), task.id, 'Task paused')}
              onResume={() =>
                handleAction(() => resumeTask(task.id, profile!.id), task.id, 'Task resumed')
              }
            />
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

export default function MyTasksPageWrapper() {
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker', 'worker']}>
      <MyTasksPage />
    </RoleGuard>
  );
}
