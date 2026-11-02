import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-14 left-4 right-4 z-40 bg-amber-500 text-slate-950 font-bold text-xs py-2 px-3 rounded-2xl shadow-xl flex items-center justify-center gap-2 animate-pulse">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Offline mode — local workout logging remains available.</span>
    </div>
  );
};
