import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Exclude: _next internals, favicon, PWA files, static assets, Supabase proxy
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon|apple-icon|offline|supabase-proxy|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
};
