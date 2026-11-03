import { useDialog } from '../lib/useDialog';
import { weekAgenda, weekdayName, type AgendaItem, type DateKey } from '../engine/schedule';

interface MoveSheetProps {
  item: AgendaItem;
  /** The seven days of this workout's week, from `weekAgenda`. */
  days: ReturnType<typeof weekAgenda>;
  today: DateKey;
  hasActiveWorkout: boolean;
  onChoose: (date: DateKey) => void;
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The keyboard- and screen-reader-friendly way to reschedule: pick a day instead of dragging. */
export function MoveSheet({ item, days, today, hasActiveWorkout, onChoose, onStart, onSkip, onClose }: MoveSheetProps) {
  const dialogRef = useDialog({ onClose });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Move workout"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 pb-[calc(2rem+env(safe-area-inset-bottom))]"
      >
        <h2 className="text-xl font-black">Day {item.day} · {item.lift}</h2>
        <p className="mt-0.5 text-sm text-muted">Week {item.week}. Currently {weekdayName(item.date)}. Choose a day this week.</p>

        <div role="radiogroup" aria-label="Day" className="mt-4 space-y-2">
          {days.map((day) => {
            const other = day.items.find((candidate) => candidate.key !== item.key);
            const finishedThere = other && (other.status === 'completed' || other.status === 'partial' || other.status === 'skipped');
            const disabled = day.date < today || Boolean(finishedThere);
            const checked = day.date === item.date;
            const detail = checked ? 'Current day' : finishedThere ? 'Already finished' : other ? `Swap with Day ${other.day} · ${other.lift}` : day.date < today ? 'Passed' : 'Free';
            const [, month, date] = day.date.split('-').map(Number);
            return (
              <button
                key={day.date}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChoose(day.date)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left disabled:opacity-40 ${checked ? 'border-accent bg-accent/10' : 'border-line bg-paper'}`}
              >
                <span className="text-sm font-bold text-ink">{day.weekday} {MONTHS[month - 1]} {date}{day.isToday ? ' · Today' : ''}</span>
                <span className="text-xs text-muted">{detail}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onStart} disabled={hasActiveWorkout} className="btn-primary col-span-2">Start now</button>
          {hasActiveWorkout && <p className="col-span-2 text-xs text-muted">Finish or discard your current workout before starting another.</p>}
          <button type="button" onClick={onSkip} className="btn-secondary">Skip workout</button>
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
