'use client';

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              setUpdateAvailable(true);
            }
          });
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data.type === 'SYNC_STARTED') {
            console.log('[SW] Background sync started');
          }
        });

        console.log('[SW] Service Worker registered');
      } catch (err) {
        console.error('[SW] Registration failed:', err);
      }
    }

    register();
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-blue-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
      <span className="text-sm font-medium">New version available!</span>
      <button
        onClick={() => {
          navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }}
        className="px-3 py-1 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50"
      >
        Update
      </button>
    </div>
  );
}
