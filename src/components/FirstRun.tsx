import { useRef, useState } from 'react';
import { Dumbbell, Upload } from 'lucide-react';

export function FirstRun({ onCreate, onImport }: { onCreate: () => void; onImport: (json: string) => Promise<{ success: boolean; message: string }> }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="min-h-screen bg-paper p-4 text-ink flex items-center justify-center">
      <section className="card w-full max-w-md p-6 shadow-lg">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent"><Dumbbell className="h-6 w-6" aria-hidden /></span>
        <p className="eyebrow mt-4">J&amp;T 2.0</p><h1 className="mt-1 text-3xl font-black">Welcome to your training app</h1>
        <p className="mt-2 text-sm text-ink-2">Create a new local profile, or restore the backup you exported before installing.</p>
        <button type="button" onClick={onCreate} className="btn-primary mt-5 w-full">Create my profile</button>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-secondary mt-2 w-full"><Upload className="h-4 w-4" />{busy ? 'Importing…' : 'Import existing backup'}</button>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          setBusy(true); const result = await onImport(await file.text()); setBusy(false);
          setStatus({ text: result.message, error: !result.success });
        }} />
        {status && <p role={status.error ? 'alert' : 'status'} className={`mt-3 text-sm ${status.error ? 'text-bad' : 'text-ok'}`}>{status.text}</p>}
      </section>
    </main>
  );
}
