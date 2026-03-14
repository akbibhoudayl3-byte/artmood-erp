'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type RealtimeCallback = (payload: any) => void;

/**
 * Subscribe to real-time changes on a Supabase table.
 * Automatically cleans up on unmount.
 */
export function useRealtime(
  table: string,
  callback: RealtimeCallback,
  filter?: string
) {
  const supabase = createClient();

  useEffect(() => {
    const channelName = `realtime-${table}-${filter || 'all'}-${Date.now()}`;

    let channel = supabase.channel(channelName);

    const config: any = {
      event: '*',
      schema: 'public',
      table,
    };

    if (filter) {
      config.filter = filter;
    }

    channel = channel.on('postgres_changes', config, (payload: any) => {
      callback(payload);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter]);
}

/**
 * Subscribe to multiple tables at once.
 */
export function useRealtimeMulti(
  subscriptions: { table: string; filter?: string; callback: RealtimeCallback }[]
) {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase.channel(`multi-${Date.now()}`);

    subscriptions.forEach(({ table, filter, callback }) => {
      const config: any = {
        event: '*',
        schema: 'public',
        table,
      };
      if (filter) config.filter = filter;
      channel.on('postgres_changes', config, callback);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
