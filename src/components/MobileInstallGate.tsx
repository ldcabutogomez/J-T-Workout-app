import { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Share2 } from 'lucide-react';
import { isAppleMobile } from '../lib/installMode';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function MobileInstallGate({ hasData, onExport }: { hasData: boolean; onExport: () => Promise<void> }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const apple = isAppleMobile();

  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);

  const exportData = async () => {
    setExporting(true);
    try { await onExport(); } finally { setExporting(false); }
  };

  return (
    <main className="min-h-screen bg-paper p-4 text-ink flex items-center justify-center">
      <section className="card w-full max-w-md p-6 shadow-lg">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent"><Download className="h-6 w-6" aria-hidden /></span>
        <p className="eyebrow mt-4">Install before setup</p>
        <h1 className="mt-1 text-3xl font-black">Keep your workout data with the app</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">On phones, the browser and Home Screen app can keep separate local data. Install first, then enter your profile and training maxes inside the app.</p>

        {hasData && (
          <div className="alert-warn mt-4">
            <strong className="block">You already have browser data</strong>
            <p className="mt-1 text-xs">Export it now. After opening the Home Screen app, choose Import existing backup before creating a new profile.</p>
            <button type="button" disabled={exporting} onClick={() => void exportData()} className="btn-secondary mt-3 w-full"><DatabaseBackup className="h-4 w-4" />{exporting ? 'Preparing backup…' : 'Export browser backup'}</button>
          </div>
        )}

        {prompt ? (
          <button type="button" onClick={async () => { await prompt.prompt(); await prompt.userChoice; }} className="btn-primary mt-5 w-full">Install app</button>
        ) : apple ? (
          <ol className="mt-5 space-y-3 rounded-2xl bg-sunk p-4 text-sm text-ink-2">
            <li className="flex gap-3"><Share2 className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden /><span>Open this page in Safari and tap <strong>Share</strong>.</span></li>
            <li className="pl-8">Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            <li className="pl-8">Close this browser tab and open J&amp;T 2.0 from its new icon.</li>
          </ol>
        ) : (
          <div className="alert-ok mt-5"><strong>Use your browser menu</strong><p className="mt-1 text-xs">Choose Install app or Add to Home Screen, then open J&amp;T 2.0 from its icon.</p></div>
        )}
        <p className="mt-4 text-xs text-muted">Nothing has been deleted. Existing browser data stays here until you clear this browser&apos;s website data.</p>
      </section>
    </main>
  );
}
