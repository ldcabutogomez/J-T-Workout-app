import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallButton({ activeWorkout }: { activeWorkout: boolean }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [serviceWorkerError, setServiceWorkerError] = useState('');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as BeforeInstallPromptEvent); };
    const appInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    const swError = (event: Event) => setServiceWorkerError(String((event as CustomEvent).detail || 'Service worker registration failed.'));
    window.addEventListener('jnt2-sw-error', swError);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then((registration) => {
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
          });
        });
      });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
      window.removeEventListener('jnt2-sw-error', swError);
    };
  }, []);

  const applyUpdate = () => {
    if (!waiting || activeWorkout) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (serviceWorkerError) return <span role="alert" className="px-2 py-1 rounded-lg bg-rose-950 text-rose-300 text-[9px]" title={serviceWorkerError}>Offline setup failed</span>;
  if (waiting) return <button disabled={activeWorkout} onClick={applyUpdate} className="px-2.5 py-1.5 rounded-xl bg-sky-900 disabled:bg-slate-800 text-[10px] font-bold text-sky-100" title={activeWorkout ? 'Finish the active workout before applying the update' : 'Apply downloaded app update'}>{activeWorkout ? 'Update waiting' : 'Apply update'}</button>;
  if (prompt) return <button onClick={async () => { await prompt.prompt(); if ((await prompt.userChoice).outcome === 'accepted') setPrompt(null); }} className="px-2.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-[10px] font-black"><Download className="inline w-3 h-3 mr-1" />Install</button>;
  if (ios && !installed) return <><button onClick={() => setShowIos(true)} className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-[10px] font-bold">Install</button>{showIos && <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"><div className="max-w-xs bg-slate-900 border border-slate-700 rounded-3xl p-5"><h2 className="font-black">Install on iPhone or iPad</h2><ol className="list-decimal list-inside text-xs text-slate-300 mt-3 space-y-2"><li>Open this page in Safari.</li><li>Tap Share.</li><li>Choose Add to Home Screen.</li></ol><p className="text-[10px] text-slate-500 mt-3">This is guidance only; no iPhone installation was performed by the automated test suite.</p><button onClick={() => setShowIos(false)} className="w-full mt-4 min-h-11 bg-slate-800 rounded-xl text-xs font-bold">Close</button></div></div>}</>;
  if (installed) return <span title="Running in standalone mode" className="text-emerald-400"><CheckCircle2 className="w-4 h-4" /></span>;
  return null;
}
