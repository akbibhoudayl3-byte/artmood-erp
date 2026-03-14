import type { NextConfig } from 'next';

// ── Build-time environment validation ───────────────────────────────────────
// Fails loudly at build/start time if critical vars are missing or malformed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl) {
  throw new Error('[ArtMood] NEXT_PUBLIC_SUPABASE_URL is not set. Check .env.local.');
}
if (!supabaseUrl.startsWith('https://')) {
  throw new Error(`[ArtMood] NEXT_PUBLIC_SUPABASE_URL must start with https://, got: ${supabaseUrl.slice(0, 40)}`);
}
if (!supabaseUrl.includes('.supabase.co')) {
  throw new Error(`[ArtMood] NEXT_PUBLIC_SUPABASE_URL must contain .supabase.co, got: ${supabaseUrl.slice(0, 40)}`);
}
if (!supabaseKey || !supabaseKey.startsWith('eyJ')) {
  throw new Error('[ArtMood] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or does not look like a valid JWT.');
}

console.log('[ArtMood] ENV OK — Supabase URL:', supabaseUrl);

// ── Next.js config ──────────────────────────────────────────────────────────
const nextConfig: NextConfig = {
  /**
   * Supabase Proxy Rewrite
   *
   * Browser clients cannot always resolve *.supabase.co DNS (ISP filtering).
   * All browser→Supabase calls are routed through /supabase-proxy/* on our
   * own server. Next.js forwards these server-side to Supabase (EC2 DNS works).
   *
   * The real supabaseUrl is still passed to createBrowserClient() so that
   * auth-js derives the correct cookie name (sb-<ref>-auth-token). Only
   * the actual fetch() calls are intercepted and rerouted.
   */
  async rewrites() {
    return [
      {
        source: '/supabase-proxy/:path*',
        destination: `${supabaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
