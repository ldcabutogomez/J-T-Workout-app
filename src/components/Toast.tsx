export interface ToastItem {
  id: number;
  text: string;
  tone?: 'default' | 'pr' | 'badge';
}

const TONE_CLASS: Record<NonNullable<ToastItem['tone']>, string> = {
  default: 'border-line bg-surface text-ink',
  pr: 'border-accent/60 bg-accent/10 text-accent-ink',
  badge: 'border-ok/60 bg-ok/10 text-ok',
};

export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div
      aria-live="polite"
      data-keep-active
      className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-up rounded-2xl border px-4 py-2 text-sm font-bold shadow-lg backdrop-blur ${TONE_CLASS[t.tone ?? 'default']}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
