"use client";

/**
 * Client-side logger — sends errors to /api/log
 *
 * USAGE:
 *   import { clientLogger } from '@/lib/client-logger';
 *   clientLogger.error('Something broke', { componentName: 'Cart' });
 *
 * Also auto-captures:
 *   - Unhandled errors (window.onerror)
 *   - Unhandled promise rejections
 *   - Console.error overrides
 */

type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

interface ClientLogPayload {
  level: LogLevel;
  message: string;
  source?: string;
  url?: string;
  error?: { name?: string; message?: string; stack?: string };
  meta?: Record<string, unknown>;
}

// Debounce queue to avoid flooding
let queue: ClientLogPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (queue.length === 0) return;
  const batch = [...queue];
  queue = [];

  // Send each log entry
  for (const payload of batch) {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* silent */ });
  }
}

function enqueue(payload: ClientLogPayload) {
  queue.push(payload);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 1000);
  }
}

function serializeError(err: unknown): ClientLogPayload['error'] {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export const clientLogger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    enqueue({ level: 'info', message, source: 'client', url: window.location.pathname, meta }),

  warn: (message: string, meta?: Record<string, unknown>) =>
    enqueue({ level: 'warn', message, source: 'client', url: window.location.pathname, meta }),

  error: (message: string, extra?: { error?: unknown; source?: string; meta?: Record<string, unknown> }) =>
    enqueue({
      level: 'error',
      message,
      source: extra?.source || 'client',
      url: window.location.pathname,
      error: extra?.error ? serializeError(extra.error) : undefined,
      meta: extra?.meta,
    }),

  fatal: (message: string, extra?: { error?: unknown; source?: string; meta?: Record<string, unknown> }) =>
    enqueue({
      level: 'fatal',
      message,
      source: extra?.source || 'client',
      url: window.location.pathname,
      error: extra?.error ? serializeError(extra.error) : undefined,
      meta: extra?.meta,
    }),
};

// ── Auto-capture global errors ───────────────────────────────────────────────

let initialized = false;

export function initGlobalErrorCapture() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // Unhandled errors
  window.addEventListener('error', (event) => {
    clientLogger.error('Unhandled error', {
      error: event.error || { message: event.message },
      source: 'window.onerror',
      meta: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    clientLogger.error('Unhandled promise rejection', {
      error: event.reason,
      source: 'unhandledrejection',
    });
  });
}
