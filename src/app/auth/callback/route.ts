import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth callback route.
 *
 * 1. PKCE / OAuth code exchange  (URL has ?code=...)
 *    Exchange code for session server-side, set cookies, redirect to `next`.
 *
 * 2. Post-password-login relay  (no code)
 *    Verify session is visible server-side, redirect to `next`.
 *    Falls back to login with error if session not found.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const safeNext = next.startsWith('/') ? next : '/dashboard';

  // -- PKCE / OAuth code exchange -----------------------------------------
  if (code) {
    const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectResponse;

    console.error('[auth/callback] code exchange error:', error.message);
    return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`);
  }

  // -- Session relay (no code) --------------------------------------------
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll() { /* relay: read-only */ },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (user && !userError) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  console.warn('[auth/callback] no server-side session:', userError?.message ?? 'no user');
  return NextResponse.redirect(`${origin}/auth/login?error=session_not_found`);
}
