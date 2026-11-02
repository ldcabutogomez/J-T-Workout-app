import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { ProfileSchedule, WorkoutSession } from '../types';
import { addDays, fromDateKey, mondayOf, slotDate, weekAgenda, weeksBehind, type AgendaItem, type DateKey, type Slot } from '../engine/schedule';
import { fmtCount } from '../engine/sessionValidity';
import { useDragMove } from '../lib/useDragMove';

interface WeekCalendarProps {
  schedule: ProfileSchedule;
  history: WorkoutSession[];
  today: DateKey;
  onMove: (slot: Slot, date: DateKey) => void;
  onOpenMove: (slot: Slot) => void;
  onCatchUp: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (key: DateKey) => `${MONTHS[fromDateKey(key).getMonth()]} ${fromDateKey(key).getDate()}`;

export const STATUS_TEXT: Record<AgendaItem['status'], string> = {
  completed: 'Done',
  partial: 'Partial',
  skipped: 'Skipped',
  missed: 'Missed',
  today: 'Today',
  upcoming: 'Planned',
};

const statusClass = (item: AgendaItem) =>
  item.status === 'completed' ? 'text-ok'
    : item.status === 'missed' ? 'text-bad'
      : item.status === 'today' ? 'text-accent-ink'
        : 'text-muted';

/** One calendar week, Monday to Sunday. Unfinished workouts drag between days; the Move button does the same without dragging. */
export function WeekCalendar({ schedule, history, today, onMove, onOpenMove, onCatchUp }: WeekCalendarProps) {
  const [monday, setMonday] = useState<DateKey>(() => mondayOf(today));
  const days = useMemo(() => weekAgenda(schedule, history, monday, today), [schedule, history, monday, today]);
  const behind = weeksBehind(schedule, history, today);
  const items = days.flatMap((day) => day.items);
  const programWeeks = [...new Set(items.map((item) => item.week))];

  const find = (key: string) => items.find((item) => item.key === key);
  const { drag, bind } = useDragMove({
    canDrop: (key, date) => {
      const item = find(key);
      if (!item || item.status === 'completed' || item.status === 'partial' || item.status === 'skipped') return false;
      return date >= today && mondayOf(date) === mondayOf(slotDate(schedule, item.week, item.day));
    },
    onDrop: (key, date) => {
      const item = find(key);
      if (item) onMove({ week: item.week, day: item.day }, date);
    },
  });

  const sunday = addDays(monday, 6);
  const weekTitle = programWeeks.length === 0
    ? 'No workouts this week'
    : `Week ${programWeeks.length === 1 ? programWeeks[0] : `${programWeeks[0]}–${programWeeks[programWeeks.length - 1]}`} of 12`;

  return (
    <section className="card p-4" aria-labelledby="schedule-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="schedule-heading" className="text-lg font-black">Schedule</h2>
          <p className="text-xs text-muted">{weekTitle} · {dayLabel(monday)} – {dayLabel(sunday)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-sunk text-ink"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => setMonday(mondayOf(today))} disabled={monday === mondayOf(today)} className="min-h-11 rounded-xl bg-sunk px-3 text-xs font-bold text-ink disabled:opacity-50">This week</button>
          <button type="button" onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-sunk text-ink"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>

      {behind > 0 && (
        <div className="alert-warn mt-3 text-sm">
          <p><strong>You're {behind === 1 ? 'a week' : `${behind} weeks`} behind.</strong> Your unfinished workouts are dated in the past.</p>
          <button type="button" onClick={onCatchUp} className="mt-2 min-h-11 rounded-xl bg-accent px-3 text-xs font-black text-on-accent">Move plan to this week</button>
        </div>
      )}

      <p className="mt-3 text-xs text-muted">Press and hold a workout, then drag it to another day this week. Or tap Move.</p>

      <ol className="mt-2 space-y-2" aria-label="Week schedule">
        {days.map((day) => {
          const allowed = drag?.overDate === day.date;
          return (
            <li
              key={day.date}
              data-date={day.date}
              aria-label={`${day.weekday} ${dayLabel(day.date)}`}
              className={`flex gap-3 rounded-2xl border p-2 transition-colors ${allowed ? 'border-accent bg-accent/10' : day.isToday ? 'border-accent/50 bg-surface' : 'border-line bg-surface'} ${day.isPast && !day.items.length ? 'opacity-60' : ''}`}
            >
              <div className="w-11 shrink-0 pt-1 text-center">
                <p className={`text-xs font-semibold uppercase ${day.isToday ? 'text-accent-ink' : 'text-muted'}`}>{day.weekday}</p>
                <p className={`font-display text-xl leading-none ${day.isToday ? 'text-accent-ink' : 'text-ink'}`}>{day.dayOfMonth}</p>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {day.items.length === 0 && (
                  <p className="flex min-h-11 items-center text-sm text-muted">{allowed ? 'Drop here' : 'Rest'}</p>
                )}
                {day.items.map((item) => {
                  const finished = item.status === 'completed' || item.status === 'partial' || item.status === 'skipped';
                  const dragging = drag?.key === item.key;
                  return (
                    <div
                      key={item.key}
                      data-slot={item.key}
                      {...(finished ? {} : bind(item.key))}
                      style={{
                        touchAction: finished ? undefined : 'pan-y',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                        transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                        zIndex: dragging ? 40 : undefined,
                        pointerEvents: dragging ? 'none' : undefined,
                      }}
                      className={`relative flex min-h-14 items-center gap-2 rounded-xl border p-2 ${item.group === 'legs' ? 'border-l-4 border-l-accent' : 'border-l-4 border-l-ink-2'} ${finished ? 'border-line bg-sunk/60' : 'border-line bg-paper'} ${dragging ? 'scale-[1.02] shadow-lg ring-2 ring-accent' : ''}`}
                    >
                      {!finished && <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">Day {item.day} · {item.lift}</p>
                        <p className="text-xs text-muted">
                          <span>{item.group === 'legs' ? 'Legs' : 'Upper'}</span>
                          <span aria-hidden> · </span>
                          <span className={`font-semibold ${statusClass(item)}`}>
                            {item.status === 'completed' && <Check className="mr-0.5 inline h-3 w-3" aria-hidden />}
                            {STATUS_TEXT[item.status]}{item.status === 'partial' && item.credit ? ` ${fmtCount(item.credit * 100)}%` : ''}
                          </span>
                        </p>
                      </div>
                      {!finished && (
                        <button
                          type="button"
                          onClick={() => onOpenMove({ week: item.week, day: item.day })}
                          aria-label={`Move Week ${item.week} Day ${item.day}`}
                          className="min-h-11 shrink-0 rounded-xl bg-sunk px-3 text-xs font-bold text-ink"
                        >
                          Move
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
