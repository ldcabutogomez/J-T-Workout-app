import { MessageCircle, X } from 'lucide-react';
import type { CoachMessage } from '../engine/coach';

/** One coach message at a time, dismissible. Announced politely so it never interrupts. */
export function CoachCard({ message, onDismiss }: { message: CoachMessage; onDismiss: (id: string) => void }) {
  return (
    <section role="status" className="animate-slide-up flex items-start gap-3 rounded-3xl border border-line border-l-4 border-l-accent bg-surface p-4">
      <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Coach</p>
        <p className="mt-0.5 text-sm text-ink">{message.text}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(message.id)}
        aria-label="Dismiss coach message"
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
