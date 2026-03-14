'use client';

/**
 * WorkTimePage — Worker's daily time tracking panel
 *
 * Features:
 *  - GPS-enforced attendance check-in / check-out
 *  - Start / pause / resume / finish a work session on a task
 *  - Live elapsed timer
 *  - Today's session log with total worked hours
 *  - Geo-blocked banner with distance info
 *  - Role gate: pointage_required roles only + ceo/owner_admin can always view
 *
 * Deploy to: src/app/(app)/work-time/page.tsx
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkSession, StartSessionParams } from '@/lib/hooks/useWorkSession';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  Clock, MapPin, Play, Pause, Square, CheckCircle2,
  LogIn, LogOut, AlertTriangle, ShieldX, Loader2,
  ChevronRight, Plus, X, BarChart2,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  production:     'Production',
  cutting:        'Découpe',
  edge_banding:   'Chant',
  assembly:       'Assemblage',
  finishing:      'Finition',
  installation:   'Installation',
  quality_check:  'Contrôle qualité',
  administrative: 'Administratif',
  other:          'Autre',
};

const TASK_TYPES = Object.entries(TASK_TYPE_LABELS);

// ── Geo-blocked error banner ──────────────────────────────────────────────────
function GeoError({ message, distanceM, radiusM }: { message: string; distanceM?: number; radiusM?: number }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm">
      <ShieldX size={20} className="text-red-500 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="font-semibold text-red-700">Location check failed</p>
        <p className="text-red-600">{message}</p>
        {distanceM !== undefined && radiusM !== undefined && (
          <p className="text-xs text-red-500 font-mono">
            You are {Math.round(distanceM)} m away — allowed: {radiusM} m
          </p>
        )}
      </div>
    </div>
  );
}

// ── Start session modal ───────────────────────────────────────────────────────
function StartSessionModal({
  onConfirm, onClose, loading,
}: {
  onConfirm: (params: StartSessionParams) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [taskType,      setTaskType]      = useState('production');
  const [stage,         setStage]         = useState('');
  const [notes,         setNotes]         = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a2e]">Start Work Session</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={18} className="text-[#64648B]" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">Task Type</label>
          <select
            value={taskType}
            onChange={e => setTaskType(e.target.value)}
            className="w-full px-3 py-2.5 border border-[#E8E5E0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]"
          >
            {TASK_TYPES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
            Workflow Stage <span className="font-normal text-[#64648B]">(optional)</span>
          </label>
          <input
            type="text"
            value={stage}
            onChange={e => setStage(e.target.value)}
            placeholder="e.g. Panel 3, Cabinet A…"
            className="w-full px-3 py-2.5 border border-[#E8E5E0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
            Notes <span className="font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 border border-[#E8E5E0] rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-[#E8E5E0] rounded-xl text-sm font-medium text-[#64648B] hover:bg-[#F5F3F0] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ task_type: taskType, workflow_stage: stage || undefined, notes: notes || undefined })}
            disabled={loading}
            className="flex-1 py-2.5 bg-[#C9956B] text-white rounded-xl text-sm font-semibold hover:bg-[#B8845A] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {loading ? 'Starting…' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkTimePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const {
    todayEvents, isCheckedIn, lastCheckIn, lastCheckOut,
    activeSession, todaySessions, todayWorkedMinutes,
    loading, actionLoading, gpsLoading, error, clearError,
    checkIn, checkOut, startSession, pauseSession, resumeSession, finishSession,
    elapsedSeconds,
  } = useWorkSession();

  const [showStartModal, setShowStartModal]   = useState(false);
  const [showFinishNotes, setShowFinishNotes] = useState(false);
  const [finishNotes,     setFinishNotes]     = useState('');

  const isActing = actionLoading || gpsLoading;

  async function handleStartSession(params: StartSessionParams) {
    const result = await startSession(params);
    if (result) setShowStartModal(false);
  }

  async function handleFinish() {
    const ok = await finishSession(finishNotes || undefined);
    if (ok) { setShowFinishNotes(false); setFinishNotes(''); }
  }

  return (
    <RoleGuard allowedRoles={[
      'worker','workshop_worker','installer','designer','operations_manager',
      'logistics','workshop_manager','owner_admin','ceo',
    ] as any[]}>
      <div className="space-y-5 pb-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight flex items-center gap-2">
            <Clock size={22} className="text-[#C9956B]" />
            My Time
          </h1>
          <p className="text-sm text-[#64648B] mt-0.5">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-24 bg-gray-100 rounded-2xl" />
            <div className="h-32 bg-gray-100 rounded-2xl" />
          </div>
        )}

        {!loading && (
          <>
            {/* GPS notice */}
            <div className="flex items-center gap-2 text-xs text-[#64648B] bg-[#F5F3F0] rounded-xl px-3 py-2">
              <MapPin size={13} className="text-[#C9956B] shrink-0" />
              <span>Location is verified for all actions (150 m radius)</span>
            </div>

            {/* Error banner */}
            {error && (
              <div>
                <GeoError
                  message={error.message}
                  distanceM={error.distance_meters}
                  radiusM={error.radius_meters}
                />
                <button onClick={clearError} className="mt-2 text-xs text-[#64648B] underline">Dismiss</button>
              </div>
            )}

            {/* ── Attendance section ── */}
            <div className="bg-white rounded-2xl border border-[#E8E5E0] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#F0EDE8] bg-[#FAFAF9] flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1a1a2e]">Attendance</span>
                {isCheckedIn && !lastCheckOut && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Checked In
                  </span>
                )}
                {lastCheckOut && (
                  <span className="text-xs text-[#64648B] bg-[#F5F3F0] px-2.5 py-1 rounded-full">
                    Checked Out
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                {lastCheckIn && (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 size={15} />
                    <span>In: <strong>{fmtTime(lastCheckIn.event_time)}</strong></span>
                    {lastCheckIn.distance_meters != null && (
                      <span className="text-xs text-[#64648B]">({Math.round(lastCheckIn.distance_meters)} m)</span>
                    )}
                  </div>
                )}
                {lastCheckOut && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <LogOut size={15} />
                    <span>Out: <strong>{fmtTime(lastCheckOut.event_time)}</strong></span>
                  </div>
                )}
                {!isCheckedIn && !lastCheckOut && (
                  <p className="text-sm text-[#64648B]">Not checked in yet today.</p>
                )}

                {/* Check-in / Check-out button */}
                {!lastCheckOut && (
                  <button
                    onClick={isCheckedIn ? () => checkOut() : () => checkIn()}
                    disabled={isActing}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isCheckedIn
                        ? 'bg-gray-100 text-[#64648B] hover:bg-gray-200'
                        : 'bg-[#C9956B] text-white hover:bg-[#B8845A]'
                    }`}
                  >
                    {isActing ? (
                      <><Loader2 size={16} className="animate-spin" /> Getting GPS…</>
                    ) : isCheckedIn ? (
                      <><LogOut size={16} /> Check Out</>
                    ) : (
                      <><LogIn size={16} /> Check In</>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* ── Active session ── */}
            {activeSession && (
              <div className={`rounded-2xl border-2 overflow-hidden ${
                activeSession.status === 'active'
                  ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-white'
                  : 'border-amber-300 bg-gradient-to-br from-amber-50 to-white'
              }`}>
                <div className="px-4 py-3 border-b border-current/10 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1a1a2e]">
                    {TASK_TYPE_LABELS[activeSession.task_type] ?? activeSession.task_type}
                    {activeSession.workflow_stage && (
                      <span className="ml-2 text-xs text-[#64648B]">— {activeSession.workflow_stage}</span>
                    )}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    activeSession.status === 'active'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {activeSession.status === 'active' ? '● Active' : '⏸ Paused'}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Elapsed timer */}
                  {activeSession.status === 'active' && (
                    <div className="text-center">
                      <span className="text-4xl font-mono font-bold text-[#1a1a2e] tabular-nums">
                        {fmtElapsed(elapsedSeconds)}
                      </span>
                      <p className="text-xs text-[#64648B] mt-1">
                        Started {fmtTime(activeSession.started_at)}
                      </p>
                    </div>
                  )}
                  {activeSession.status === 'paused' && (
                    <div className="text-center">
                      <p className="text-sm text-amber-700 font-medium">Session paused</p>
                      <p className="text-xs text-[#64648B]">Resume to continue tracking</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {activeSession.status === 'active' && (
                      <button
                        onClick={() => pauseSession()}
                        disabled={isActing}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-100 text-amber-800 rounded-xl text-sm font-semibold hover:bg-amber-200 disabled:opacity-50 transition-colors"
                      >
                        {isActing ? <Loader2 size={15} className="animate-spin" /> : <Pause size={15} />}
                        Pause
                      </button>
                    )}
                    {activeSession.status === 'paused' && (
                      <button
                        onClick={() => resumeSession()}
                        disabled={isActing}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-100 text-blue-800 rounded-xl text-sm font-semibold hover:bg-blue-200 disabled:opacity-50 transition-colors"
                      >
                        {isActing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                        Resume
                      </button>
                    )}

                    {/* Finish with optional notes */}
                    <button
                      onClick={() => setShowFinishNotes(prev => !prev)}
                      disabled={isActing}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isActing ? <Loader2 size={15} className="animate-spin" /> : <Square size={15} />}
                      Finish
                    </button>
                  </div>

                  {/* Finish notes textarea */}
                  {showFinishNotes && (
                    <div className="space-y-2">
                      <textarea
                        value={finishNotes}
                        onChange={e => setFinishNotes(e.target.value)}
                        rows={2}
                        placeholder="Notes on completion (optional)…"
                        className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <button
                        onClick={handleFinish}
                        disabled={isActing}
                        className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                      >
                        {isActing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Confirm Finish
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Start new session button ── */}
            {!activeSession && isCheckedIn && (
              <button
                onClick={() => setShowStartModal(true)}
                disabled={isActing}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#1a1a2e] text-white rounded-2xl text-sm font-semibold hover:bg-[#2a2a3e] disabled:opacity-50 transition-colors"
              >
                <Plus size={18} />
                Start Work Session
              </button>
            )}

            {!isCheckedIn && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Check in first before starting a work session.</span>
              </div>
            )}

            {/* ── Today's sessions ── */}
            {todaySessions.length > 0 && (
              <div className="rounded-2xl border border-[#E8E5E0] bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-[#F0EDE8] bg-[#FAFAF9] flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1a1a2e]">Today's Sessions</span>
                  <span className="text-xs font-medium text-[#C9956B]">
                    {fmtDuration(todayWorkedMinutes)} total
                  </span>
                </div>
                <div className="divide-y divide-[#F0EDE8]">
                  {[...todaySessions]
                    .filter(s => s.status === 'finished')
                    .reverse()
                    .map(session => (
                      <div key={session.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[#1a1a2e]">
                            {TASK_TYPE_LABELS[session.task_type] ?? session.task_type}
                            {session.workflow_stage && (
                              <span className="ml-1.5 text-xs text-[#64648B]">— {session.workflow_stage}</span>
                            )}
                          </p>
                          <p className="text-xs text-[#64648B]">
                            {fmtTime(session.started_at)}
                            {session.finished_at && ` → ${fmtTime(session.finished_at)}`}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[#1a1a2e]">
                          {session.total_minutes ? fmtDuration(session.total_minutes) : '—'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Link to reports for managers */}
            {['owner_admin','ceo','operations_manager','workshop_manager'].includes(profile?.role ?? '') && (
              <button
                onClick={() => router.push('/hr/work-time')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-[#E8E5E0] hover:bg-[#F5F3F0] transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-[#1a1a2e]">
                  <BarChart2 size={16} className="text-[#C9956B]" />
                  Team Work Time Reports
                </span>
                <ChevronRight size={16} className="text-[#64648B]" />
              </button>
            )}
          </>
        )}

        {/* Start session modal */}
        {showStartModal && (
          <StartSessionModal
            onConfirm={handleStartSession}
            onClose={() => setShowStartModal(false)}
            loading={isActing}
          />
        )}
      </div>
    </RoleGuard>
  );
}
