'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // Show errors passed back from the auth/callback relay
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get('error');
    if (errParam === 'session_not_found') {
      setError('Sign-in succeeded but the server could not verify your session. Please try again.');
    } else if (errParam === 'auth_callback_failed') {
      setError('Authentication callback failed. Please try again.');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 10-second timeout prevents infinite spinner on slow/broken network
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout. Check your network and try again.')), 10000)
      );

      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeout,
      ]);

      if (result.error) {
        setError(result.error.message || 'Authentication failed');
        setLoading(false);
        return;
      }

      // With the Supabase proxy in place, signInWithPassword() reaches Supabase
      // via our server. Session is stored in cookies. Navigate to dashboard.
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/dashboard';
      window.location.href = next;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B2A4A] via-[#1E2F52] to-[#162240] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#C9956B]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#C9956B]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full" />
      </div>

      <div className="w-full max-w-[380px] relative z-10 animate-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#C9956B] to-[#B8845A] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-[#C9956B]/20">
            <span className="text-white text-2xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ArtMood</h1>
          <p className="text-white/40 text-sm mt-1 font-medium">Factory Operating System</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white/[0.08] backdrop-blur-xl rounded-3xl p-7 border border-white/10 shadow-2xl space-y-5">
          <div className="text-center mb-1">
            <h2 className="text-lg font-semibold text-white">Welcome back</h2>
            <p className="text-sm text-white/50">Sign in to your account</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-white/70 mb-1.5">Email</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#C9956B]/40 focus:border-[#C9956B]/50"
              />
            </div>

            <div className="w-full">
              <label className="block text-sm font-medium text-white/70 mb-1.5">Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#C9956B]/40 focus:border-[#C9956B]/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#C9956B] to-[#B8845A] text-white font-semibold rounded-xl shadow-lg shadow-[#C9956B]/25 hover:shadow-xl hover:shadow-[#C9956B]/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-8 font-medium tracking-wide">
          ArtMood Factory OS v1.0
        </p>
      </div>
    </div>
  );
}
