/**
 * POST /api/log — Receives client-side errors and logs them server-side
 * GET  /api/log — Returns recent logs (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger, readLogs, type LogLevel } from '@/lib/logger';
import { requireRole } from '@/lib/auth/server';

// ── POST: Client sends error logs ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { level, message, source, error, meta, url } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const validLevel: LogLevel = ['info', 'warn', 'error', 'fatal'].includes(level) ? level : 'error';

    logger.error(message, {
      source: source || 'client',
      url: url || req.nextUrl.pathname,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      meta: { ...meta, userAgent: req.headers.get('user-agent') },
    });

    // Override level if not error
    if (validLevel !== 'error') {
      logger[validLevel](message, { source: source || 'client', ...meta });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// ── GET: Admin reads logs ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Only CEO/admin can view logs
  const auth = await requireRole(['ceo']);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;

  const logs = await readLogs({
    level: (params.get('level') as LogLevel) || undefined,
    source: params.get('source') || undefined,
    limit: Math.min(parseInt(params.get('limit') || '100'), 500),
    since: params.get('since') || undefined,
    search: params.get('search') || undefined,
  });

  return NextResponse.json({ logs, count: logs.length });
}
