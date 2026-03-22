/**
 * General Logger — Centralized error & event logging for ArtMood ERP
 *
 * Captures errors from both server (API routes) and client (browser),
 * writes to a persistent log file + console, and provides structured
 * log entries for debugging.
 *
 * USAGE (Server):
 *   import { logger } from '@/lib/logger';
 *   logger.error('Payment failed', { orderId, error });
 *   logger.warn('Stock low', { itemId, qty });
 *   logger.info('Order created', { orderId });
 *
 * USAGE (API route wrapper):
 *   import { withLogging } from '@/lib/logger';
 *   export const GET = withLogging(async (req) => { ... });
 */

import { promises as fs } from 'fs';
import path from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;        // e.g. 'api/projects', 'client', 'middleware'
  userId?: string;
  url?: string;
  method?: string;
  statusCode?: number;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  };
  meta?: Record<string, unknown>;
  duration?: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_ROTATED_FILES = 5;

// ── In-memory buffer for batch writes ────────────────────────────────────────

let writeBuffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 2000; // flush every 2 seconds

// ── Ensure log directory exists ──────────────────────────────────────────────

let dirEnsured = false;
async function ensureLogDir() {
  if (dirEnsured) return;
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    dirEnsured = true;
  } catch { /* ignore */ }
}

// ── Log rotation ─────────────────────────────────────────────────────────────

async function rotateIfNeeded(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < MAX_LOG_SIZE) return;

    // Rotate: app.log -> app.log.1 -> app.log.2 ...
    for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
      const from = `${filePath}.${i}`;
      const to = `${filePath}.${i + 1}`;
      try { await fs.rename(from, to); } catch { /* ignore */ }
    }
    await fs.rename(filePath, `${filePath}.1`);
  } catch { /* file doesn't exist yet, no rotation needed */ }
}

// ── Write to file ────────────────────────────────────────────────────────────

async function flushBuffer() {
  if (writeBuffer.length === 0) return;
  const lines = writeBuffer.join('');
  writeBuffer = [];

  await ensureLogDir();

  try {
    await rotateIfNeeded(LOG_FILE);
    await fs.appendFile(LOG_FILE, lines, 'utf8');
  } catch (err) {
    console.error('[Logger] Failed to write log file:', err);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushBuffer();
  }, FLUSH_INTERVAL);
}

async function writeToFile(entry: LogEntry) {
  const line = JSON.stringify(entry) + '\n';
  writeBuffer.push(line);
  scheduleFlush();

  // Errors also go to error.log immediately
  if (entry.level === 'error' || entry.level === 'fatal') {
    await ensureLogDir();
    try {
      await rotateIfNeeded(ERROR_LOG_FILE);
      await fs.appendFile(ERROR_LOG_FILE, line, 'utf8');
    } catch { /* silent */ }
  }
}

// ── Format for console ───────────────────────────────────────────────────────

function formatConsole(entry: LogEntry): string {
  const ts = entry.timestamp.split('T')[1]?.replace('Z', '') ?? entry.timestamp;
  const level = entry.level.toUpperCase().padEnd(5);
  const src = entry.source ? ` [${entry.source}]` : '';
  const err = entry.error?.message ? ` — ${entry.error.message}` : '';
  return `${ts} ${level}${src} ${entry.message}${err}`;
}

// ── Serialize error objects ──────────────────────────────────────────────────

function serializeError(err: unknown): LogEntry['error'] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

// ── Core log function ────────────────────────────────────────────────────────

function log(level: LogLevel, message: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'message' | 'error'>> & { error?: unknown }) {
  const { error: rawError, ...rest } = extra ?? {};
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...rest,
    error: rawError ? serializeError(rawError) : undefined,
  };

  // Console output
  const formatted = formatConsole(entry);
  switch (level) {
    case 'error':
    case 'fatal':
      console.error(`[LOG] ${formatted}`);
      break;
    case 'warn':
      console.warn(`[LOG] ${formatted}`);
      break;
    default:
      console.log(`[LOG] ${formatted}`);
  }

  // File output (async, non-blocking)
  writeToFile(entry).catch(() => {});
}

// ── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    log('info', message, { meta }),

  warn: (message: string, meta?: Record<string, unknown>) =>
    log('warn', message, { meta }),

  error: (message: string, extra?: { error?: unknown; source?: string; userId?: string; url?: string; method?: string; statusCode?: number; meta?: Record<string, unknown> }) =>
    log('error', message, extra),

  fatal: (message: string, extra?: { error?: unknown; source?: string; userId?: string; url?: string; method?: string; meta?: Record<string, unknown> }) =>
    log('fatal', message, extra),

  /** Log an API request with timing */
  api: (method: string, url: string, statusCode: number, duration: number, extra?: { userId?: string; error?: unknown; source?: string }) => {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    log(level, `${method} ${url} ${statusCode} (${duration}ms)`, {
      method,
      url,
      statusCode,
      duration,
      ...extra,
    });
  },

  /** Flush any buffered logs immediately */
  flush: flushBuffer,
};

// ── API Route Wrapper ────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>;

/**
 * Wraps an API route handler with automatic error logging.
 * Catches unhandled errors, logs them, and returns a 500 response.
 *
 * @example
 * export const GET = withLogging(async (req) => {
 *   // ... your code
 *   return NextResponse.json({ ok: true });
 * });
 */
export function withLogging(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    const start = Date.now();
    const url = req.nextUrl.pathname;
    const method = req.method;

    try {
      const response = await handler(req, ctx);
      const duration = Date.now() - start;

      // Log slow requests (>3s) and errors
      if (response.status >= 400 || duration > 3000) {
        logger.api(method, url, response.status, duration, {
          source: `api${url}`,
        });
      }

      return response;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Unhandled exception in ${method} ${url}`, {
        error,
        source: `api${url}`,
        method,
        url,
        statusCode: 500,
        meta: { duration },
      });

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

// ── Read logs (for admin endpoint) ───────────────────────────────────────────

export interface LogQuery {
  level?: LogLevel;
  source?: string;
  limit?: number;
  since?: string; // ISO date
  search?: string;
}

export async function readLogs(query: LogQuery = {}): Promise<LogEntry[]> {
  const { level, source, limit = 100, since, search } = query;

  try {
    await ensureLogDir();
    const content = await fs.readFile(LOG_FILE, 'utf8').catch(() => '');
    if (!content) return [];

    const lines = content.trim().split('\n').filter(Boolean);
    let entries: LogEntry[] = [];

    // Parse from end (newest first)
    for (let i = lines.length - 1; i >= 0 && entries.length < limit * 2; i--) {
      try {
        const entry = JSON.parse(lines[i]) as LogEntry;
        entries.push(entry);
      } catch { /* skip malformed lines */ }
    }

    // Apply filters
    if (level) entries = entries.filter(e => e.level === level);
    if (source) entries = entries.filter(e => e.source?.includes(source));
    if (since) entries = entries.filter(e => e.timestamp >= since);
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter(e =>
        e.message.toLowerCase().includes(s) ||
        e.error?.message?.toLowerCase().includes(s) ||
        e.source?.toLowerCase().includes(s)
      );
    }

    return entries.slice(0, limit);
  } catch {
    return [];
  }
}
