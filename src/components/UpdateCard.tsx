import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { UpdateCheck } from '../lib/appUpdate';

const MESSAGES: Record<UpdateCheck, string> = {
  ready: 'A new version is ready. Tap Update now.',
  current: 'You have the latest version.',
  unavailable: 'Updates only work in the installed app, not in a browser tab.',
  failed: "Couldn't check for updates. Try again when you're online.",
};

/** Settings > App version: a manual "check for updates" for the installed app. */
export function UpdateCard({ updateReady, checking, onCheck, onUpdate, activeWorkout }: {
  updateReady: boolean;
  checking: boolean;
  onCheck: () => Promise<UpdateCheck>;
  onUpdate: () => void;
  activeWorkout: boolean;
}) {
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const message = updateReady ? MESSAGES.ready : result ? MESSAGES[result] : null;
  return (
    <section className="card p-5 space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-black"><RefreshCw className="h-5 w-5" aria-hidden /> App updates</h2>
      {updateReady ? (
        <button type="button" disabled={activeWorkout} onClick={onUpdate} className="btn-primary w-full">{activeWorkout ? 'Finish your workout to update' : 'Update now'}</button>
      ) : (
        <button type="button" disabled={checking} onClick={() => void onCheck().then(setResult)} className="btn-secondary w-full">{checking ? 'Checking…' : 'Check for updates'}</button>
      )}
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </section>
  );
}
