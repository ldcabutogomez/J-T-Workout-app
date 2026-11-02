import { useMemo } from 'react';
import type { ProfileSchedule, WorkoutSession } from '../types';
import { mondayOf, weekAgenda, type DateKey } from '../engine/schedule';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week at a glance on Today: one cell per day, a dot per workout. Tap to open the full calendar. */
export function WeekStrip({ schedule, history, today, onOpen }: { schedule: ProfileSchedule; history: WorkoutSession[]; today: DateKey; onOpen: () => void }) {
  const days = useMemo(() => weekAgenda(schedule, history, mondayOf(today), today), [schedule, history, today]);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="This week's schedule. Open the calendar."
      className="card flex w-full items-stretch justify-between gap-1 p-3 text-left"
    >
      {days.map((day, index) => (
        <span key={day.date} className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 ${day.isToday ? 'bg-accent/10' : ''}`}>
          <span className={`text-xs font-semibold ${day.isToday ? 'text-accent-ink' : 'text-muted'}`}>{LETTERS[index]}</span>
          <span className={`font-display text-base leading-none ${day.isToday ? 'text-accent-ink' : 'text-ink'}`}>{day.dayOfMonth}</span>
          <span className="flex min-h-5 flex-col items-center justify-center gap-0.5" aria-hidden>
            {day.items.length === 0 && <span className="h-1.5 w-1.5 rounded-full bg-line" />}
            {day.items.map((item) => (
              <span
                key={item.key}
                className={`rounded px-1 text-xs font-bold leading-4 ${
                  item.status === 'completed' ? 'bg-ok text-on-accent'
                    : item.status === 'partial' ? 'bg-ok/30 text-ok'
                      : item.status === 'skipped' ? 'bg-sunk text-muted'
                        : item.status === 'missed' ? 'bg-bad/15 text-bad'
                          : 'bg-accent text-on-accent'}`}
              >
                D{item.day}
              </span>
            ))}
          </span>
        </span>
      ))}
    </button>
  );
}
