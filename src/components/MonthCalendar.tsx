import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProfileSchedule, UserProfile, WorkoutSession } from '../types';
import { addMonths, fromDateKey, mondayOf, monthGrid, monthStartOf, rangeAgenda, WEEKDAY_LABELS, type AgendaItem, type DateKey } from '../engine/schedule';

interface MonthCalendarProps {
  schedule: ProfileSchedule;
  profile?: UserProfile;
  history: WorkoutSession[];
  today: DateKey;
  /** The Monday of the week shown in the list below the month. */
  selectedMonday: DateKey;
  onSelectDate: (date: DateKey) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One colour per main lift, so a glance at the month shows the training split. Full class names so Tailwind keeps them. */
interface LiftStyle { label: string; fill: string; ring: string; half: string }
const LIFT_STYLES: Record<string, LiftStyle> = {
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

function dotClass(item: AgendaItem): string {
  const style = LIFT_STYLES[liftFamily(item.lift)];
  if (item.status === 'completed') return style.fill;
  if (item.status === 'partial') return style.half;
  if (item.status === 'skipped') return 'border-muted bg-sunk';
  if (item.status === 'missed') return 'border-bad bg-bad/20';
  return style.ring;
}

/**
 * A month at a glance, in the style of a training log: one dot per workout, coloured by lift. A filled dot is
 * finished, a ring is planned, a faded fill is partial and a red ring is missed. Tapping a day shows its week in the
 * schedule list below, where workouts are moved.
 */
export function MonthCalendar({ schedule, profile, history, today, selectedMonday, onSelectDate }: MonthCalendarProps) {
  const [month, setMonth] = useState<DateKey>(() => monthStartOf(selectedMonday));
  const rows = useMemo(() => monthGrid(month), [month]);
  const first = rows[0][0].date;
  const days = useMemo(() => rangeAgenda(schedule, history, first, rows.length * 7, today, profile), [schedule, history, first, rows.length, today, profile]);
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const title = `${MONTH_NAMES[fromDateKey(month).getMonth()]} ${fromDateKey(month).getFullYear()}`;
  const thisMonth = monthStartOf(today);

  const label = (date: DateKey, items: AgendaItem[]) => {
    const d = fromDateKey(date);
    const lead = `${WEEKDAY_LABELS[(d.getDay() + 6) % 7]} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
    return items.length === 0 ? `${lead}, rest day` : `${lead}: ${items.map((item) => `Day ${item.day} ${item.lift}, ${STATUS_WORD[item.status]}`).join('; ')}`;
  };

  return (
    <section className="card p-4" aria-labelledby="month-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="month-heading" className="text-lg font-black">{title}</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-sunk text-ink"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => { setMonth(thisMonth); onSelectDate(today); }} disabled={month === thisMonth} className="min-h-11 rounded-xl bg-sunk px-3 text-xs font-bold text-ink disabled:opacity-50">Current month</button>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-sunk text-ink"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted" aria-hidden>
        {WEEKDAY_LABELS.map((weekday) => <span key={weekday}>{weekday.slice(0, 1)}</span>)}
      </div>
      <div className="mt-1 space-y-1" role="grid" aria-label={`${title} training calendar`}>
        {rows.map((row) => (
          <div key={row[0].date} role="row" className="grid grid-cols-7 gap-1">
            {row.map((cell) => {
              const day = byDate.get(cell.date);
              const items = day?.items ?? [];
              const inSelectedWeek = mondayOf(cell.date) === selectedMonday;
              const isToday = cell.date === today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  role="gridcell"
                  data-day={cell.date}
                  aria-label={label(cell.date, items)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-selected={inSelectedWeek}
                  onClick={() => onSelectDate(cell.date)}
                  className={`flex min-h-12 flex-col items-center justify-start gap-1 rounded-xl border pb-1 pt-1.5 transition-colors ${isToday ? 'border-accent' : 'border-transparent'} ${inSelectedWeek ? 'bg-sunk' : 'bg-transparent'} ${cell.inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`text-sm leading-none ${isToday ? 'font-black text-accent-ink' : 'font-semibold text-ink'}`}>{fromDateKey(cell.date).getDate()}</span>
                  <span className="flex min-h-2.5 items-center justify-center gap-0.5" aria-hidden>
                    {items.map((item) => <span key={item.key} className={`h-2.5 w-2.5 rounded-full border-2 ${dotClass(item)}`} />)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Calendar key">
        {(['squat', 'bench', 'deadlift', 'press'] as const).map((family) => (
          <li key={family} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full border-2 ${LIFT_STYLES[family].fill}`} aria-hidden />{LIFT_STYLES[family].label}</li>
        ))}
        <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-ink-2 bg-transparent" aria-hidden />Planned</li>
        <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-ink-2 bg-ink-2" aria-hidden />Done</li>
        <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-bad bg-bad/20" aria-hidden />Missed</li>
      </ul>
    </section>
  );
}
