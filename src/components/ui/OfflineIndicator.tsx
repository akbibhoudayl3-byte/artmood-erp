'use client';

import { useOffline } from '@/lib/hooks/useOffline';
import { WifiOff, Cloud, CloudOff, Loader2, RefreshCcw } from 'lucide-react';

export default function OfflineIndicator() {
  const { isOnline, pendingActions, syncing, syncNow } = useOffline();

  if (isOnline && pendingActions === 0) return null;

  return (
    <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium transition-all ${
      !isOnline
        ? 'bg-red-500 text-white'
        : syncing
        ? 'bg-blue-500 text-white'
        : pendingActions > 0
        ? 'bg-yellow-500 text-white'
        : 'bg-green-500 text-white'
    }`}>
      {!isOnline ? (
        <>
          <WifiOff size={16} />
          <span>Offline</span>
          {pendingActions > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
              {pendingActions} queued
            </span>
          )}
        </>
      ) : syncing ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span>Syncing...</span>
        </>
      ) : pendingActions > 0 ? (
        <>
          <Cloud size={16} />
          <span>{pendingActions} pending</span>
          <button
            onClick={syncNow}
            className="ml-1 p-1 hover:bg-white/20 rounded-full"
            title="Sync now"
          >
            <RefreshCcw size={14} />
          </button>
        </>
      ) : null}
    </div>
  );
}
