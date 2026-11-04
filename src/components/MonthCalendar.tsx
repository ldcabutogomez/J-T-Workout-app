import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProfileSchedule, RunSession, UserProfile, WorkoutSession } from '../types';
import { addMonths, fromDateKey, monthGrid, monthStartOf, rangeAgenda, WEEKDAY_LABELS, type AgendaItem, type DateKey } from '../engine/schedule';
import { formatRunDistance, RUN_TYPE_LABELS, runDateKey } from '../engine/runs';

interface MonthCalendarProps {
  schedule: ProfileSchedule;
  profile?: UserProfile;
  history: WorkoutSession[];
  runs: RunSession[];
  today: DateKey;
  month: DateKey;
  selectedDate: DateKey;
  onMonthChange: (month: DateKey) => void;
  onSelectDate: (date: DateKey) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One colour per main lift, so a glance at the month shows the training split. Full class names so Tailwind keeps them. */
interface LiftStyle { label: string; fill: string; ring: string; half: string }
export const LIFT_STYLES: Record<string, LiftStyle> = {
  squat: { label: 'Squat', fill: 'bg-accent border-accent', ring: 'border-accent bg-transparent', half: 'border-accent bg-accent/40' },
  bench: { label: 'Bench', fill: 'bg-cobalt border-cobalt', ring: 'border-cobalt bg-transparent', half: 'border-cobalt bg-cobalt/40' },
  deadlift: { label: 'Deadlift', fill: 'bg-teal border-teal', ring: 'border-teal bg-transparent', half: 'border-teal bg-teal/40' },
  press: { label: 'Press', fill: 'bg-violet border-violet', ring: 'border-violet bg-transparent', half: 'border-violet bg-violet/40' },
  other: { label: 'Other', fill: 'bg-muted border-muted', ring: 'border-muted bg-transparent', half: 'border-muted bg-muted/40' },
};

/** Which colour a workout gets, from the lift it actually trains (a swapped lift keeps its family). */
export function liftFamily(lift: string): keyof typeof LIFT_STYLES {
  const name = lift.toLowerCase();
  if (name.includes('deadlift') || name.includes('rack pull')) return 'deadlift';
  if (name.includes('squat')) return 'squat';
  if (name.includes('bench') || name.includes('floor press') || name.includes('spoto')) return 'bench';
  if (name.includes('press')) return 'press';
  return 'other';
}

const STATUS_WORD: Record<AgendaItem['status'], string> = {
  completed: 'done', partial: 'partial', skipped: 'skipped', missed: 'missed', today: 'planned', upcoming: 'planned',
};

export function calendarDotClass(item: AgendaItem): string {
  const style = LIFT_STYLES[liftFamily(item.lift)];
  if (item.status === 'completed') return style.fill;
  if (item.status === 'partial') return style.half;
  return style.ring;
}

/**
 * A month at a glance: lift-coloured filled balls are completed, faded balls are partial and rings are planned.
 * Missed and skipped workouts stay out of the visual layer but remain in the day's accessible label and detail card.
 */
export function MonthCalendar({ schedule, profile, history, runs, today, month, selectedDate, onMonthChange, onSelectDate }: MonthCalendarProps) {
  const rows = useMemo(() => monthGrid(month), [month]);
  const first = rows[0][0].date;
  const days = useMemo(() => rangeAgenda(schedule, history, first, rows.length * 7, today, profile), [schedule, history, first, rows.length, today, profile]);
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const runsByDate = useMemo(() => {
    const grouped = new Map<DateKey, RunSession[]>();
    runs.forEach((run) => grouped.set(runDateKey(run), [...(grouped.get(runDateKey(run)) ?? []), run]));
    return grouped;
  }, [runs]);
  const title = `${MONTH_NAMES[fromDateKey(month).getMonth()]} ${fromDateKey(month).getFullYear()}`;
  const thisMonth = monthStartOf(today);

  const changeMonth = (next: DateKey) => {
    onMonthChange(next);
    onSelectDate(next);
  };

  const label = (date: DateKey, items: AgendaItem[], dayRuns: RunSession[]) => {
    const d = fromDateKey(date);
    const lead = `${WEEKDAY_LABELS[(d.getDay() + 6) % 7]} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
    const details = [
      ...items.map((item) => `Day ${item.day} ${item.lift}, ${STATUS_WORD[item.status]}`),
      ...dayRuns.map((run) => `${RUN_TYPE_LABELS[run.runType]} run, ${formatRunDistance(run.distanceMeters, run.distanceUnit)}`),
    ];
    return details.length === 0 ? `${lead}, rest day` : `${lead}: ${details.join('; ')}`;
  };

  return (
    <section className="card p-4" aria-labelledby="month-heading">
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
        <button type="button" onClick={() => changeMonth(addMonths(month, -1))} aria-label="Previous month" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-sunk text-ink"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-center">
          <h2 id="month-heading" className="text-xl font-black">{title}</h2>
          <button type="button" onClick={() => { onMonthChange(thisMonth); onSelectDate(today); }} disabled={month === thisMonth && selectedDate === today} className="mt-0.5 text-xs font-bold text-accent-ink disabled:text-muted">Today</button>
        </div>
        <button type="button" onClick={() => changeMonth(addMonths(month, 1))} aria-label="Next month" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-sunk text-ink"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted" aria-hidden>
        {WEEKDAY_LABELS.map((weekday) => <span key={weekday}>{weekday.slice(0, 1)}</span>)}
      </div>
      <div className="mt-1 space-y-1" role="grid" aria-label={`${title} training calendar`}>
        {rows.map((row) => (
          <div key={row[0].date} role="row" className="grid grid-cols-7 gap-1">
            {row.map((cell) => {
              if (!cell.inMonth) return <span key={cell.date} role="gridcell" aria-hidden className="min-h-14" />;
              const day = byDate.get(cell.date);
              const items = day?.items ?? [];
              const dayRuns = runsByDate.get(cell.date) ?? [];
              const visibleItems = items.filter((item) => item.status === 'completed' || item.status === 'partial' || item.status === 'today' || item.status === 'upcoming');
              const shownItems = visibleItems.slice(0, 3);
              const shownRuns = dayRuns.slice(0, Math.max(0, 3 - shownItems.length));
              const overflow = visibleItems.length + dayRuns.length - shownItems.length - shownRuns.length;
              const isSelected = cell.date === selectedDate;
              const isToday = cell.date === today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  role="gridcell"
                  data-day={cell.date}
                  aria-label={label(cell.date, items, dayRuns)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-selected={isSelected}
                  onClick={() => onSelectDate(cell.date)}
                  className={`flex min-h-14 flex-col items-center justify-start gap-1 rounded-xl border pb-1 pt-1.5 transition-colors ${isSelected ? 'border-line bg-sunk' : 'border-transparent bg-transparent'}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none ${isToday ? 'border-2 border-accent font-black text-accent-ink' : 'font-semibold text-ink'}`}>{fromDateKey(cell.date).getDate()}</span>
                  <span className="flex min-h-3 items-center justify-center gap-0.5" aria-hidden>
                    {shownItems.map((item) => <span key={item.key} data-workout-dot data-family={liftFamily(item.lift)} data-state={item.status === 'completed' ? 'done' : item.status === 'partial' ? 'partial' : 'planned'} className={`h-3 w-3 rounded-full border-2 ${calendarDotClass(item)}`} />)}
                    {shownRuns.map((run) => <span key={run.runId} data-run-dot data-state="done" className="h-3 w-3 rounded-full border-2 border-gold bg-gold" />)}
                    {overflow > 0 && <span className="text-[9px] font-black leading-none text-muted">+{overflow}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Calendar key">
        {(['squat', 'bench', 'deadlift', 'press'] as const).map((family) => (
          <li key={family} className="flex items-center gap-1"><span className={`h-3 w-3 rounded-full border-2 ${LIFT_STYLES[family].fill}`} aria-hidden />{LIFT_STYLES[family].label}</li>
        ))}
        <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-gold bg-gold" aria-hidden />Run</li>
        <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-ink-2 bg-transparent" aria-hidden />Planned</li>
        <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-ink-2 bg-ink-2" aria-hidden />Done</li>
      </ul>
    </section>
  );
}
