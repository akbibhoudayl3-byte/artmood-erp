/**
 * work_time_rate_limiter.ts
 *
 * Lightweight in-memory rate limiter for API routes.
 * Designed for the work-time API endpoints to prevent abuse / accidental
 * double-submission from workers checking in/out rapidly.
 *
 * Deploy to: src/lib/rate-limiter.ts
 *
 * Usage in an API route:
 *
 *   import { checkRateLimit } from '@/lib/rate-limiter';
 *   import { NextResponse } from 'next/server';
 *
 *   export async function POST(req: Request) {
 *     const limited = checkRateLimit(userId, 'work-time-clock', 30_000);
 *     if (limited) {
 *       return NextResponse.json(
 *         { error: 'Too many requests. Please wait 30 seconds.' },
 *         { status: 429 }
 *       );
 *     }
 *     // ... rest of handler
 *   }
 *
 * Notes:
 *   - In-memory only: resets on PM2 restart (intentional — lightweight)
 *   - Keyed by (userId, action) so different actions have separate limits
 *   - Sliding window: each call resets the timer for that key
 *   - Auto-cleanup: expired entries removed every 5 minutes to avoid memory leak
 *   - No external dependencies (no Redis, no file I/O)
 *   - Safe for serverless: each Node.js process holds its own map (acceptable
 *     for single-server deployments like this one)
 */

interface RateLimitEntry {
  lastCall: number;   // timestamp (ms)
  count: number;      // how many calls in the current window
}

// Global map: key = `${userId}:${action}` → last call timestamp + count
const rateLimitMap = new Map<string, RateLimitEntry>();

// Auto-cleanup: remove entries older than 10 minutes every 5 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return; // already running
  cleanupTimer = setInterval(() => {
    const tenMinAgo = Date.now() - 10 * 60_000;
    for (const [key, entry] of rateLimitMap.entries()) {
      if (entry.lastCall < tenMinAgo) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60_000);

  // Allow process to exit even if timer is running (for graceful shutdown)
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Check whether a request should be rate-limited.
 *
 * @param userId    The authenticated user's UUID (or IP address for unauthed routes)
 * @param action    A string key identifying the action (e.g. 'clock-in', 'clock-out')
 * @param windowMs  Minimum milliseconds between allowed calls (default: 30_000 = 30s)
 * @param maxCalls  Maximum allowed calls within the window (default: 1 — strict)
 *
 * @returns `true` if the request should be blocked (429), `false` if allowed.
 */
export function checkRateLimit(
  userId: string,
  action: string,
  windowMs: number = 30_000,
  maxCalls: number = 1,
): boolean {
  startCleanup();

  const key = `${userId}:${action}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry) {
    // First call from this user for this action
    rateLimitMap.set(key, { lastCall: now, count: 1 });
    return false; // allowed
  }

  const elapsed = now - entry.lastCall;

  if (elapsed >= windowMs) {
    // Window has expired — reset
    rateLimitMap.set(key, { lastCall: now, count: 1 });
    return false; // allowed
  }

  if (entry.count < maxCalls) {
    // Within window but under the max call limit
    rateLimitMap.set(key, { lastCall: now, count: entry.count + 1 });
    return false; // allowed
  }

  // Within window, over limit — block
  return true;
}

/**
 * Get the remaining cooldown time in seconds for a given key.
 * Useful for including a Retry-After header in 429 responses.
 *
 * @returns Remaining seconds (0 if not rate-limited)
 */
export function getRemainingCooldown(
  userId: string,
  action: string,
  windowMs: number = 30_000,
): number {
  const key = `${userId}:${action}`;
  const entry = rateLimitMap.get(key);

  if (!entry) return 0;

  const elapsed = Date.now() - entry.lastCall;
  const remaining = windowMs - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Manually clear a rate limit entry (e.g., after a successful operation
 * where you want to immediately re-allow — useful for admin overrides).
 */
export function clearRateLimit(userId: string, action: string): void {
  rateLimitMap.delete(`${userId}:${action}`);
}

/**
 * Suggested limits for ArtMood API routes:
 *
 * Clock-in / Clock-out:     30 seconds   (prevent double-tap)
 * Work session start/stop:  15 seconds   (prevent rapid toggles)
 * Stock movement:           10 seconds   (prevent duplicate movements)
 * Attendance event:         30 seconds   (GPS check-in debounce)
 * Payment creation:         60 seconds   (prevent duplicate payments)
 * Leave request:            30 seconds
 *
 * Example: checkRateLimit(userId, 'attendance-event', 30_000)
 *          checkRateLimit(userId, 'payment-create',   60_000)
 *          checkRateLimit(userId, 'stock-movement',   10_000)
 */

// ── Integration example for src/app/api/work-time/clock/route.ts ────────────
//
// import { checkRateLimit, getRemainingCooldown } from '@/lib/rate-limiter';
// import { createClient } from '@/lib/supabase/server';
// import { NextResponse } from 'next/server';
//
// export async function POST(req: Request) {
//   const supabase = createClient();
//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//
//   // Rate limit: 1 clock event per 30 seconds per user
//   const ACTION = 'work-time-clock';
//   const WINDOW = 30_000; // 30s
//
//   if (checkRateLimit(user.id, ACTION, WINDOW)) {
//     const retryAfter = getRemainingCooldown(user.id, ACTION, WINDOW);
//     return NextResponse.json(
//       { error: `Too many requests. Wait ${retryAfter}s before clocking again.` },
//       { status: 429, headers: { 'Retry-After': String(retryAfter) } }
//     );
//   }
//
//   // ... process clock event
//   const body = await req.json();
//   const { error } = await supabase.from('attendance_events').insert({
//     user_id: user.id,
//     event_type: body.event_type, // 'clock_in' | 'clock_out'
//     event_time: new Date().toISOString(),
//     location: body.location,
//   });
//
//   if (error) {
//     // Clear rate limit on error so user can retry immediately
//     clearRateLimit(user.id, ACTION);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
//
//   return NextResponse.json({ success: true });
// }
