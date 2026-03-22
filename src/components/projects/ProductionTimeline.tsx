'use client';

import { useEffect, useState } from 'react';
import { loadOrderTasks } from '@/lib/services/task.service';
import { WORKFLOW_STATION_COLORS } from '@/lib/config/workflow';
import { useLocale } from '@/lib/hooks/useLocale';
import { CheckCircle, Clock, Pause, AlertTriangle, RotateCcw } from 'lucide-react';
import type { TaskBoardItem } from '@/types/production';

interface Props {
  orderId: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle size={14} className="text-white" />,
  in_progress: <Clock size={14} className="text-white animate-pulse" />,
  paused: <Pause size={14} className="text-white" />,
  blocked: <AlertTriangle size={14} className="text-white" />,
  rework_sent: <RotateCcw size={14} className="text-white" />,
};

export default function ProductionTimeline({ orderId }: Props) {
  const { t } = useLocale();
  const [tasks, setTasks] = useState<TaskBoardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderTasks(orderId).then((res) => {
      if (res.success && res.data) {
        // Deduplicate: keep most recent task per station (for rework scenarios)
        const stationMap = new Map<string, TaskBoardItem>();
        for (const task of res.data) {
          const existing = stationMap.get(task.station_code);
          if (!existing || new Date(task.created_at) > new Date(existing.created_at)) {
            stationMap.set(task.station_code, task);
          }
        }
        // Sort by order_index
        const sorted = Array.from(stationMap.values()).sort((a, b) => a.order_index - b.order_index);
        setTasks(sorted);
      }
      setLoading(false);
    });
  }, [orderId]);

  if (loading) return <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />;
  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const pct = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('timeline.production_timeline')}</h3>
        <span className="text-xs font-medium text-gray-500">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Timeline steps */}
      <div className="space-y-1">
        {tasks.map((task, i) => {
          const color = WORKFLOW_STATION_COLORS[task.station_code] || '#9CA3AF';
          const isActive = task.status === 'in_progress';
          const isDone = task.status === 'completed';
          const icon = STATUS_ICON[task.status];

          return (
            <div key={task.id} className="flex items-center gap-3">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                    isActive ? 'animate-pulse' : ''
                  }`}
                  style={{
                    backgroundColor: isDone || isActive || task.status === 'paused' || task.status === 'blocked' || task.status === 'rework_sent' ? color : 'transparent',
                    borderColor: color,
                  }}
                >
                  {icon || (
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.status === 'pending' ? color : 'white' }} />
                  )}
                </div>
                {i < tasks.length - 1 && (
                  <div className="w-0.5 h-4" style={{ backgroundColor: isDone ? color : '#E5E7EB' }} />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isDone ? 'text-gray-700' : isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {task.station_name}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {task.assignee_name && <span>{task.assignee_name}</span>}
                  {task.duration_minutes && <span>{task.duration_minutes}min</span>}
                  {task.rework_count > 0 && (
                    <span className="text-orange-500 font-medium">↻ {task.rework_count}</span>
                  )}
                </div>
              </div>

              {/* Status */}
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isDone ? 'bg-green-100 text-green-700' :
                  isActive ? 'bg-blue-100 text-blue-700' :
                  task.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                  task.status === 'blocked' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-400'
                }`}
              >
                {t(`task_status.${task.status}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
