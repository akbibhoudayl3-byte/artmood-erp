'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectCost, ProjectEvent, Quote } from '@/types/crm';
import type { Payment } from '@/types/finance';

// ---------------------------------------------------------------------------
// Options & Result
// ---------------------------------------------------------------------------

export interface UseProjectLoaderOptions {
  /** Load payments for this project (default: false) */
  includePayments?: boolean;
  /** Load project_events timeline (default: false) */
  includeEvents?: boolean;
  /** Load quotes linked to this project (default: false) */
  includeQuotes?: boolean;
  /** Load project_costs entries (default: false) */
  includeCosts?: boolean;
}

export interface UseProjectLoaderResult {
  project: Project | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch all data */
  reload: () => void;
  // Optionally loaded related data (only present when requested via options):
  payments: Payment[];
  events: ProjectEvent[];
  quotes: Quote[];
  costs: ProjectCost[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Reusable hook that loads a project by ID with optional related data.
 *
 * Replaces the duplicated pattern across project sub-pages:
 *   1. Get `id` from `useParams()`
 *   2. Create supabase client
 *   3. Fetch project + optional relations in parallel
 *   4. Manage loading / error / not-found state
 *
 * Usage:
 * ```ts
 * const { project, loading, error, payments, reload } = useProjectLoader(
 *   id as string,
 *   { includePayments: true, includeQuotes: true }
 * );
 * ```
 */
export function useProjectLoader(
  projectId: string | undefined,
  options: UseProjectLoaderOptions = {},
): UseProjectLoaderResult {
  const supabase = createClient();

  const [project, setProject] = useState<Project | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setError('No project ID provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build list of parallel fetches ------------------------------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetches: (() => Promise<any>)[] = [
        // 0 - project (always loaded, with designer join like the main detail page)
        async () => supabase
          .from('projects')
          .select('*, designer:profiles!projects_designer_id_fkey(full_name)')
          .eq('id', projectId)
          .single(),
      ];

      if (options.includePayments) {
        fetches.push(async () =>
          supabase
            .from('payments')
            .select('*')
            .eq('project_id', projectId)
            .order('received_at', { ascending: false }),
        );
      }

      if (options.includeEvents) {
        fetches.push(async () =>
          supabase
            .from('project_events')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }),
        );
      }

      if (options.includeQuotes) {
        fetches.push(async () =>
          supabase
            .from('quotes')
            .select('*')
            .eq('project_id', projectId)
            .order('version', { ascending: false }),
        );
      }

      if (options.includeCosts) {
        fetches.push(async () =>
          supabase
            .from('project_costs')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }),
        );
      }

      const results = await Promise.all(fetches.map(fn => fn()));

      // Unpack results in the same order they were pushed --------------------------
      let idx = 0;

      // Project (always index 0)
      const projRes = results[idx++] as { data: Project | null; error: { message: string } | null };
      if (projRes.error) {
        setError(projRes.error.message);
        setProject(null);
      } else {
        setProject(projRes.data);
      }

      if (options.includePayments) {
        const res = results[idx++] as { data: Payment[] | null };
        setPayments(res.data ?? []);
      }

      if (options.includeEvents) {
        const res = results[idx++] as { data: ProjectEvent[] | null };
        setEvents(res.data ?? []);
      }

      if (options.includeQuotes) {
        const res = results[idx++] as { data: Quote[] | null };
        setQuotes(res.data ?? []);
      }

      if (options.includeCosts) {
        const res = results[idx++] as { data: ProjectCost[] | null };
        setCosts(res.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
    // We intentionally omit `options` from deps — callers should pass a stable
    // reference or the hook will re-fetch on every render.  The `reload` callback
    // lets callers imperatively refresh when needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    project,
    loading,
    error,
    reload: load,
    payments,
    events,
    quotes,
    costs,
  };
}
