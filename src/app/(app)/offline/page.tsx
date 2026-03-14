'use client';

import { useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { WifiOff, RefreshCcw, Wifi } from 'lucide-react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-green-50">
        <Card>
          <CardContent>
            <div className="text-center py-8 px-6">
              <Wifi size={64} className="mx-auto mb-4 text-green-500" />
              <h1 className="text-2xl font-bold text-green-800 mb-2">Back Online!</h1>
              <p className="text-green-600 mb-6">Connection restored. Redirecting...</p>
              <Button onClick={() => window.location.href = '/'}>
                <RefreshCcw className="w-4 h-4 mr-2" /> Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card>
        <CardContent>
          <div className="text-center py-8 px-6 max-w-md">
            <WifiOff size={64} className="mx-auto mb-4 text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">You are Offline</h1>
            <p className="text-gray-500 mb-4">
              No internet connection detected. Some features may be limited.
            </p>
            <div className="space-y-3 text-left mb-6">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-500">✓</span>
                <span>View cached pages</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-500">✓</span>
                <span>Queue scans for later upload</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-yellow-500">⏳</span>
                <span>Actions will sync when online</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-500">✗</span>
                <span>Real-time updates paused</span>
              </div>
            </div>
            <Button onClick={() => window.location.reload()}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
