import { useCallback, useEffect, useRef, useState } from 'react';

const AUTO_CHECK_MS = 15 * 60_000;
const HOURLY_MS = 60 * 60_000;

export type UpdateCheck = 'ready' | 'current' | 'unavailable' | 'failed';

/**
 * The installed (Home Screen) app is resumed rather than reloaded, so the browser rarely looks for a new version
 * on its own. This asks for one when the app comes back to the foreground and once an hour, and exposes a manual
 * check. A downloaded version waits until the person taps Update, so it never swaps the app out mid-workout.
 */
export function useAppUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [checking, setChecking] = useState(false);
  const lastCheck = useRef(0);

  const watch = useCallback((registration: ServiceWorkerRegistration) => {
    if (registration.waiting) setWaiting(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
      });
    });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready.then(watch).catch(() => undefined);
  }, [watch]);

  const check = useCallback(async (): Promise<UpdateCheck> => {
    if (!('serviceWorker' in navigator)) return 'unavailable';
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'unavailable';
    setChecking(true);
    lastCheck.current = Date.now();
    try {
      await registration.update();
      const installing = registration.installing;
      if (installing && installing.state !== 'installed') {
        await new Promise<void>((resolve) => {
          const done = () => { if (installing.state === 'installed' || installing.state === 'redundant') resolve(); };
          installing.addEventListener('statechange', done);
          done();
        });
      }
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
        return 'ready';
      }
      return 'current';
    } catch {
      return 'failed';
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > AUTO_CHECK_MS) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), HOURLY_MS);
    onVisible();
    return () => { document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer); };
  }, [check]);

  /** Activates the downloaded version and reloads into it. */
  const apply = useCallback(() => {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting]);

  return { updateReady: waiting !== null, checking, check, apply };
}
