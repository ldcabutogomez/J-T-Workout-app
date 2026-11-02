import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../lib/useDialog';
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
  if (ios && !installed) return <><button onClick={() => setShowIos(true)} className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-[10px] font-bold">Install</button>{showIos && <IosInstallDialog onClose={() => setShowIos(false)} />}</>;
  if (installed) return <span title="Running in standalone mode" className="text-emerald-400"><CheckCircle2 className="w-4 h-4" /></span>;
  return null;
}

// Rendered in a portal: the app header uses backdrop-blur, which would otherwise turn this
// "fixed" overlay into a header-sized box and clip the top of the instructions.
function IosInstallDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialog({ onClose });
  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/85 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ios-install-title" className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-5">
          <h2 id="ios-install-title" className="text-lg font-black text-white">Install on iPhone or iPad</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 mt-3 space-y-2">
            <li>Open this page in <strong>Safari</strong> (not Chrome).</li>
            <li>Tap the <strong>Share</strong> button (the square with an arrow, at the bottom of the screen).</li>
            <li>Scroll down and choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
            <li>Open the app from your Home Screen. Let it load once while online so it works offline.</li>
          </ol>
          <button onClick={onClose} className="w-full mt-4 min-h-12 bg-slate-800 rounded-xl text-sm font-bold">Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
