import { useCallback, useEffect, useRef, useState } from 'react';

const AUTO_CHECK_MS = 15 * 60_000;
const HOURLY_MS = 60 * 60_000;

const BUILD = typeof __APP_BUILD__ === 'undefined' ? 'dev' : __APP_BUILD__;

/** True when the server is serving a newer build than the one running. Never for dev builds, or when offline. */
async function serverHasNewerBuild(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (BUILD === 'dev') return false;
  try {
    // A unique URL and no-store: older installed copies cache same-origin files, and this must always hit the network.
    const response = await fetchImpl(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return false;
    const { build } = (await response.json()) as { build?: unknown };
    return typeof build === 'string' && build !== BUILD;
  } catch {
    return false;
  }
}

export type UpdateCheck = 'ready' | 'current' | 'unavailable' | 'failed';

/**
 * The installed (Home Screen) app is resumed rather than reloaded, so the browser rarely looks for a new version
 * on its own. This asks for one when the app comes back to the foreground and once an hour, and exposes a manual
 * check. A downloaded version waits until the person taps Update, so it never swaps the app out mid-workout.
 */
export function useAppUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [stale, setStale] = useState(false);
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
    lastCheck.current = Date.now();
    // The version file is the primary signal: it works even when the service worker is slow to notice a new build.
    const newer = await serverHasNewerBuild();
    if (newer) setStale(true);
    if (!('serviceWorker' in navigator)) return newer ? 'ready' : 'unavailable';
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return newer ? 'ready' : 'unavailable';
    setChecking(true);
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
      return newer ? 'ready' : 'current';
    } catch {
      return newer ? 'ready' : 'failed';
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
    if (waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    // A newer build exists but its service worker has not finished downloading: reload, and the page itself
    // is fetched from the network first, so the new version loads either way.
    void navigator.serviceWorker?.getRegistration().then((registration) => registration?.update()).catch(() => undefined)
      .finally(() => window.location.reload());
  }, [waiting]);

  return { updateReady: waiting !== null || stale, checking, check, apply };
}
