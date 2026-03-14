'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPendingCount, getPendingActions, markSynced, clearOldActions } from '@/lib/utils/offline-storage';
import { createClient } from '@/lib/supabase/client';

interface OfflineState {
  isOnline: boolean;
  pendingActions: number;
  syncing: boolean;
  lastSyncAt: Date | null;
  syncNow: () => Promise<void>;
}

export function useOffline(): OfflineState {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingActions, setPendingActions] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      syncNow();
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Check pending count periodically
    const interval = setInterval(async () => {
      try {
        const count = await getPendingCount();
        setPendingActions(count);
      } catch {
        // IndexedDB may not be available
      }
    }, 10000);

    // Initial count
    getPendingCount().then(setPendingActions).catch(() => {});

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (syncing || !navigator.onLine) return;

    setSyncing(true);
    try {
      const supabase = createClient();
      const actions = await getPendingActions();

      for (const action of actions) {
        try {
          switch (action.type) {
            case 'insert':
              await supabase.from(action.table).insert(action.data);
              break;
            case 'update':
              await supabase.from(action.table).update(action.data.updates).eq('id', action.data.id);
              break;
            case 'delete':
              await supabase.from(action.table).delete().eq('id', action.data.id);
              break;
            case 'rpc':
              await supabase.rpc(action.table, action.data);
              break;
          }
          await markSynced(action.id);
        } catch (err) {
          console.error('Sync failed for action:', action.id, err);
        }
      }

      // Clean up old synced actions
      await clearOldActions();

      const count = await getPendingCount();
      setPendingActions(count);
      setLastSyncAt(new Date());
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  return { isOnline, pendingActions, syncing, lastSyncAt, syncNow };
}
