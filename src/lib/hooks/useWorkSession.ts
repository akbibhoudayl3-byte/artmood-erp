'use client';

/**
 * useWorkSession — Client-side work time + attendance hook
 *
 * Manages:
 *   - Today's attendance status (checked in / checked out)
 *   - Active work session (start / pause / resume / finish)
 *   - GPS collection via navigator.geolocation
 *   - API calls to /api/work-time/attendance and /api/work-time/session
 *
 * Deploy to: src/lib/hooks/useWorkSession.ts
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AttendanceEvent {
  id:              string;
  event_type:      'check_in' | 'check_out';
  event_time:      string;
  location_name?:  string;
  distance_meters?: number;
}

export interface WorkSession {
  id:              string;
  task_type:       string;
  workflow_stage?: string | null;
  location_type:   string;
  started_at:      string;
  finished_at?:    string | null;
  total_minutes?:  number | null;
  status:          'active' | 'paused' | 'finished' | 'cancelled';
  project_id?:     string | null;
}

export interface WorkSessionError {
  message: string;
  code?:   string;
  distance_meters?: number;
  radius_meters?:   number;
}

export interface UseWorkSessionReturn {
  // Attendance state
  todayEvents:      AttendanceEvent[];
  isCheckedIn:      boolean;
  lastCheckIn:      AttendanceEvent | null;
  lastCheckOut:     AttendanceEvent | null;

  // Work session state
  activeSession:    WorkSession | null;
  todaySessions:    WorkSession[];
  todayWorkedMinutes: number;

  // Loading / error
  loading:          boolean;
  actionLoading:    boolean;
  gpsLoading:       boolean;
  error:            WorkSessionError | null;
  clearError:       () => void;

  // Actions
  checkIn:          (projectId?: string) => Promise<boolean>;
  checkOut:         (projectId?: string) => Promise<boolean>;
  startSession:     (params: StartSessionParams) => Promise<WorkSession | null>;
  pauseSession:     () => Promise<boolean>;
  resumeSession:    () => Promise<boolean>;
  finishSession:    (notes?: string) => Promise<boolean>;
  cancelSession:    () => Promise<boolean>;

  // Elapsed timer (seconds since session started, minus pauses)
  elapsedSeconds:   number;
}

export interface StartSessionParams {
  task_type:        string;
  workflow_stage?:  string;
  project_id?:      string;
  installation_id?: string;
  notes?:           string;
}

// ── GPS helper ──────────────────────────────────────────────────────────────

function getGPS(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!navigator?.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat:      pos.coords.latitude,
        lng:      pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useWorkSession(): UseWorkSessionReturn {
  const [todayEvents,   setTodayEvents]   = useState<AttendanceEvent[]>([]);
  const [todaySessions, setTodaySessions] = useState<WorkSession[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [error,         setError]         = useState<WorkSessionError | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const today = new Date().toISOString().split('T')[0];

  // ── Derived state ──────────────────────────────────────────────────────────
  const isCheckedIn  = todayEvents.some(e => e.event_type === 'check_in');
  const lastCheckIn  = [...todayEvents].reverse().find(e => e.event_type === 'check_in') ?? null;
  const lastCheckOut = [...todayEvents].reverse().find(e => e.event_type === 'check_out') ?? null;
  const activeSession = todaySessions.find(s => s.status === 'active' || s.status === 'paused') ?? null;
  const todayWorkedMinutes = todaySessions
    .filter(s => s.status === 'finished' && s.total_minutes)
    .reduce((sum, s) => sum + (s.total_minutes ?? 0), 0);

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeSession?.status === 'active') {
      const startMs = new Date(activeSession.started_at).getTime();
      const update  = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      update();
      timerRef.current = setInterval(update, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeSession?.id, activeSession?.status, activeSession?.started_at]);

  // ── Load today's data ──────────────────────────────────────────────────────
  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const [attendanceRes, sessionsRes] = await Promise.all([
        fetch(`/api/work-time/attendance?date=${today}`),
        fetch(`/api/work-time/session?date=${today}`),
      ]);
      if (attendanceRes.ok) {
        const d = await attendanceRes.json();
        setTodayEvents(d.events ?? []);
      }
      if (sessionsRes.ok) {
        const d = await sessionsRes.json();
        setTodaySessions(d.sessions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { loadToday(); }, [loadToday]);

  // ── GPS + API wrapper ──────────────────────────────────────────────────────
  async function withGps<T>(
    fn: (coords: { lat: number; lng: number; accuracy: number } | null) => Promise<T>
  ): Promise<T> {
    setGpsLoading(true);
    const coords = await getGPS();
    setGpsLoading(false);
    return fn(coords);
  }

  // ── checkIn ───────────────────────────────────────────────────────────────
  const checkIn = useCallback(async (projectId?: string): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      return await withGps(async (coords) => {
        if (!coords) {
          setError({ message: 'Could not obtain GPS. Please enable location services.' });
          return false;
        }
        const res = await fetch('/api/work-time/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'check_in',
            user_lat:   coords.lat,
            user_lng:   coords.lng,
            accuracy_m: coords.accuracy,
            project_id: projectId ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError({ message: data.reason ?? data.error ?? 'Check-in failed', code: data.code, distance_meters: data.distance_meters, radius_meters: data.radius_meters });
          return false;
        }
        await loadToday();
        return true;
      });
    } finally {
      setActionLoading(false);
    }
  }, [loadToday]);

  // ── checkOut ──────────────────────────────────────────────────────────────
  const checkOut = useCallback(async (projectId?: string): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      return await withGps(async (coords) => {
        if (!coords) {
          setError({ message: 'Could not obtain GPS. Please enable location services.' });
          return false;
        }
        const res = await fetch('/api/work-time/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'check_out',
            user_lat:   coords.lat,
            user_lng:   coords.lng,
            accuracy_m: coords.accuracy,
            project_id: projectId ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError({ message: data.reason ?? data.error ?? 'Check-out failed', code: data.code, distance_meters: data.distance_meters, radius_meters: data.radius_meters });
          return false;
        }
        await loadToday();
        return true;
      });
    } finally {
      setActionLoading(false);
    }
  }, [loadToday]);

  // ── startSession ──────────────────────────────────────────────────────────
  const startSession = useCallback(async (params: StartSessionParams): Promise<WorkSession | null> => {
    setActionLoading(true);
    setError(null);
    try {
      return await withGps(async (coords) => {
        if (!coords) {
          setError({ message: 'Could not obtain GPS location.' });
          return null;
        }
        const res = await fetch('/api/work-time/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...params, user_lat: coords.lat, user_lng: coords.lng, accuracy_m: coords.accuracy }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError({ message: data.reason ?? data.error ?? 'Failed to start session', code: data.code, distance_meters: data.distance_meters, radius_meters: data.radius_meters });
          return null;
        }
        await loadToday();
        return data as WorkSession;
      });
    } finally {
      setActionLoading(false);
    }
  }, [loadToday]);

  // ── Session lifecycle (pause / resume / finish / cancel) ──────────────────
  async function sessionAction(
    action: 'pause' | 'resume' | 'finish' | 'cancel',
    notes?: string
  ): Promise<boolean> {
    if (!activeSession) return false;
    setActionLoading(true);
    setError(null);
    try {
      if (action === 'cancel') {
        const res = await fetch(`/api/work-time/session/${activeSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError({ message: data.error ?? 'Action failed' });
          return false;
        }
        await loadToday();
        return true;
      }

      return await withGps(async (coords) => {
        if (!coords) {
          setError({ message: 'Could not obtain GPS location.' });
          return false;
        }
        const res = await fetch(`/api/work-time/session/${activeSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, user_lat: coords.lat, user_lng: coords.lng, accuracy_m: coords.accuracy, notes }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError({ message: data.reason ?? data.error ?? 'Action failed', distance_meters: data.distance_meters, radius_meters: data.radius_meters });
          return false;
        }
        await loadToday();
        return true;
      });
    } finally {
      setActionLoading(false);
    }
  }

  const pauseSession  = useCallback(() => sessionAction('pause'),  [activeSession, loadToday]);
  const resumeSession = useCallback(() => sessionAction('resume'), [activeSession, loadToday]);
  const finishSession = useCallback((notes?: string) => sessionAction('finish', notes), [activeSession, loadToday]);
  const cancelSession = useCallback(() => sessionAction('cancel'), [activeSession, loadToday]);

  return {
    todayEvents, isCheckedIn, lastCheckIn, lastCheckOut,
    activeSession, todaySessions, todayWorkedMinutes,
    loading, actionLoading, gpsLoading, error, clearError,
    checkIn, checkOut, startSession, pauseSession, resumeSession, finishSession, cancelSession,
    elapsedSeconds,
  };
}
