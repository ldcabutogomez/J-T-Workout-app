import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

export const wakeLockSupported = (): boolean =>
  typeof navigator !== 'undefined' && Boolean((navigator as WakeLockNavigator).wakeLock);

/**
 * Keeps the screen on while `active` is true, so the phone doesn't lock between sets. The browser drops the lock
 * whenever the page is hidden, so it is asked for again when the page comes back. It is a convenience only:
 * unsupported browsers, a low battery or a refusal all fail silently and the app works exactly as before.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return;
      try {
        const lock = await (navigator as WakeLockNavigator).wakeLock!.request('screen');
        if (cancelled) { void lock.release().catch(() => undefined); return; }
        sentinel = lock;
        lock.addEventListener?.('release', () => { if (sentinel === lock) sentinel = null; });
      } catch { /* refused: fine */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    void acquire();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
