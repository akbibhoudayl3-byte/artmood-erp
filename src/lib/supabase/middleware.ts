import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canAccess, canAccessApi } from '@/lib/auth/permissions';
import type { UserRole } from '@/types/database';

// Simple in-memory rate limiter (per IP, resets on server restart)
// For production, use Redis or Upstash
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;       // attempts
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    authAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

/** Apply security headers to any response */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  return response;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Public routes (no auth needed) ──────────────────────────────────────
  const publicRoutes = ['/auth/login', '/auth/reset', '/auth/callback'];
  const isPublic = publicRoutes.some(r => pathname.startsWith(r));
  const isStatic = pathname.startsWith('/supabase-proxy') || pathname.startsWith('/_next') || pathname === '/sw.js' || pathname === '/manifest.webmanifest' || pathname === '/offline' || pathname.startsWith('/icon') || pathname.startsWith('/apple-icon') || pathname.match(/\.(svg|png|jpg|ico|webp|woff2?)$/);

  if (isStatic) return NextResponse.next({ request });

  // ── Rate limit on auth endpoints ─────────────────────────────────────────
  if (pathname.startsWith('/auth/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '0.0.0.0';
    if (!checkRateLimit(ip)) {
      return applySecurityHeaders(new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Content-Type': 'text/plain',
        },
      }));
    }
  }

  // ── Build Supabase client with cookie passthrough ─────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Validate session ──────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Not logged in
  if (!user || authError) {
    if (isPublic) return applySecurityHeaders(supabaseResponse);
    // API routes: return 401 JSON (not a redirect — clients can't follow HTML redirects)
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(new NextResponse(
        JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ));
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.searchParams.set('next', pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Already logged in, trying to hit login page
  if (user && isPublic) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.searchParams.delete('next');
    return applySecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  // ── Fetch role (cached in cookie for performance) ─────────────────────────
  let role = request.cookies.get('artmood_role')?.value as UserRole | undefined;

  if (!role) {
    // Load from DB and cache in cookie (7-day expiry, HttpOnly)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!profileData?.is_active) {
      // Deactivated account — sign out
      await supabase.auth.signOut();
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      return applySecurityHeaders(NextResponse.redirect(loginUrl));
    }

    role = profileData?.role as UserRole;
    if (role) {
      supabaseResponse.cookies.set('artmood_role', role, {
        httpOnly: true,
        secure: true, // app runs on HTTPS — cookie must be secure
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }
  }

  if (!role) {
    // No profile found — deny access
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // ── RBAC: Check route permissions ─────────────────────────────────────────
  const isApiRoute = pathname.startsWith('/api/');

  const allowed = isApiRoute
    ? canAccessApi(role, pathname)
    : canAccess(role, pathname);

  if (!allowed) {
    if (isApiRoute) {
      return applySecurityHeaders(new NextResponse(
        JSON.stringify({ error: 'Forbidden', message: 'Insufficient permissions' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ));
    }
    // Redirect app routes to dashboard with error
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.searchParams.set('error', 'forbidden');
    return applySecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  // ── Apply security headers and return ──────────────────────────────────────
  return applySecurityHeaders(supabaseResponse);
}
