import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  onRetry: () => void;
  onExportRaw: () => Promise<void>;
  onStartFresh: () => Promise<void>;
}

/** Shown instead of an endless "Loading…" when the app can't open its local storage. Nothing is deleted without a confirm. */
export function StorageRecovery({ message, onRetry, onExportRaw, onStartFresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try { await action(); } catch (error) { setNote((error as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center p-4">
      <div role="alert" className="card w-full max-w-md space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bad/10 text-bad"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
          <h1 className="text-xl font-black">Can't open your data</h1>
        </div>
        <p className="text-sm text-ink-2">Your workouts are stored on this phone, and the app couldn't read them. Nothing has been deleted.</p>
        <p className="rounded-xl bg-sunk p-3 font-mono text-xs text-ink-2 break-words">{message}</p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-ink-2">
          <li>Close other tabs or windows of this app, then tap <strong>Try again</strong>.</li>
          <li>If it keeps failing, tap <strong>Save a copy of my data</strong> first.</li>
          <li>Only then consider <strong>Start fresh</strong>, which erases everything on this phone.</li>
        </ol>
        <div className="space-y-2">
          <button type="button" disabled={busy} onClick={onRetry} className="btn-primary w-full">Try again</button>
          <button type="button" disabled={busy} onClick={() => void run(onExportRaw)} className="btn-secondary w-full">Save a copy of my data</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => {
            if (window.confirm('Erase everything the app stores on this phone and start fresh? Save a copy first if you can. This cannot be undone.')) await onStartFresh();
          })} className="btn-danger w-full">Start fresh</button>
        </div>
        {note && <p role="status" className="text-xs text-bad">{note}</p>}
      </div>
    </div>
  );
}
