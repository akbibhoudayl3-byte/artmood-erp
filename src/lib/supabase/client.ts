import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client.
 *
 * PROXY STRATEGY:
 * All browser→Supabase HTTP calls are intercepted by the custom fetch below
 * and rerouted through /supabase-proxy/* on our own Next.js server.
 * The Next.js rewrite (next.config.ts) proxies these server-side to Supabase.
 *
 * Why: The browser (ISP / restricted network) may not resolve *.supabase.co DNS,
 * causing ERR_NAME_NOT_RESOLVED on getUser(), causing blank dashboard.
 *
 * The REAL supabaseUrl is still passed as the first argument so that
 * @supabase/auth-js derives the correct storageKey / cookie name
 * (sb-emeznqaweezgsqavxkuu-auth-token), ensuring browser and server
 * clients share the same session cookie.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createBrowserClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, options?: RequestInit) => {
          // Redirect all Supabase API calls through our server-side proxy.
          if (url instanceof Request) {
            const proxied = url.url.replace(supabaseUrl, '/supabase-proxy');
            return fetch(new Request(proxied, url), options);
          }
          const proxied = url.toString().replace(supabaseUrl, '/supabase-proxy');
          return fetch(proxied, options);
        },
      },
    }
  );
}
