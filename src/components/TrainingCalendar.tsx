import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Dumbbell, Footprints } from 'lucide-react';
import type { ProfileSchedule, RunSession, UserProfile, WorkoutSession } from '../types';
import {
  fromDateKey,
  mondayOf,
  monthStartOf,
  rangeAgenda,
  weeksBehind,
  type AgendaItem,
  type DateKey,
  type Slot,
} from '../engine/schedule';
import { calendarDotClass, MonthCalendar } from './MonthCalendar';
import { STATUS_TEXT, WeekCalendar } from './WeekCalendar';
import { formatRunDistance, formatRunDuration, formatRunPace, RUN_TYPE_LABELS, runDateKey } from '../engine/runs';

interface TrainingCalendarProps {
  schedule: ProfileSchedule;
  profile?: UserProfile;
  history: WorkoutSession[];
  runs: RunSession[];
  today: DateKey;
  onMove: (slot: Slot, date: DateKey) => void;
  onOpenMove: (slot: Slot) => void;
  onCatchUp: () => void;
}

const statusClass = (item: AgendaItem) =>
  item.status === 'completed' ? 'text-ok'
    : item.status === 'partial' || item.status === 'today' ? 'text-accent-ink'
      : item.status === 'missed' ? 'text-bad'
        : 'text-muted';

const finished = (item: AgendaItem) => item.status === 'completed' || item.status === 'partial' || item.status === 'skipped';

/** Garmin-style month overview with one selected-day summary and an optional full scheduling editor. */
export function TrainingCalendar({ schedule, profile, history, runs, today, onMove, onOpenMove, onCatchUp }: TrainingCalendarProps) {
  const [month, setMonth] = useState<DateKey>(() => monthStartOf(today));
  const [selectedDate, setSelectedDate] = useState<DateKey>(today);
  const [editorOpen, setEditorOpen] = useState(false);
  const selectedDay = useMemo(() => rangeAgenda(schedule, history, selectedDate, 1, today, profile)[0], [schedule, history, selectedDate, today, profile]);
  const selectedRuns = useMemo(() => runs.filter((run) => runDateKey(run) === selectedDate), [runs, selectedDate]);
  const behind = weeksBehind(schedule, history, today);
  const selected = fromDateKey(selectedDate);
  const selectedLabel = selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const chooseMonth = (next: DateKey) => {
    setMonth(next);
    setSelectedDate(next);
  };

  const chooseEditorWeek = (nextMonday: DateKey) => {
    setSelectedDate(nextMonday);
    setMonth(monthStartOf(nextMonday));
  };

  return (
    <div className="space-y-3">
      {behind > 0 && (
        <div className="alert-warn text-sm">
          <p><strong>You're {behind === 1 ? 'a week' : `${behind} weeks`} behind.</strong> Your unfinished workouts are dated in the past.</p>
          <button type="button" onClick={() => { onCatchUp(); setMonth(monthStartOf(today)); setSelectedDate(today); }} className="mt-2 min-h-11 rounded-xl bg-accent px-3 text-xs font-black text-on-accent">Move plan to this week</button>
        </div>
      )}

      <MonthCalendar
        schedule={schedule}
        profile={profile}
        history={history}
        runs={runs}
        today={today}
        month={month}
        selectedDate={selectedDate}
        onMonthChange={chooseMonth}
        onSelectDate={setSelectedDate}
      />

      <section className="card overflow-hidden" aria-labelledby="selected-day-heading">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-sunk/70 px-4 py-3">
          <div><p className="eyebrow">Selected day</p><h2 id="selected-day-heading" className="text-lg font-black">{selectedLabel}</h2></div>
          <CalendarDays className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
        </div>
        <div className="space-y-2 p-4">
          {selectedDay.items.length === 0 && selectedRuns.length === 0 ? (
            <div className="flex min-h-20 items-center gap-3 rounded-2xl border border-dashed border-line bg-paper p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunk text-muted"><CalendarDays className="h-5 w-5" aria-hidden /></span>
              <div><strong className="text-sm text-ink">Recovery day</strong><p className="mt-0.5 text-xs text-muted">No workout is scheduled or recorded on this date.</p></div>
            </div>
          ) : <>
          {selectedDay.items.map((item) => (
            <article key={item.key} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
              <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${calendarDotClass(item)}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black">Day {item.day} · {item.lift}</h3>
                <p className="mt-0.5 text-xs text-muted">Program week {item.week} · <span className={`font-bold ${statusClass(item)}`}>{STATUS_TEXT[item.status]}</span></p>
              </div>
              {!finished(item) && <button type="button" onClick={() => onOpenMove({ week: item.week, day: item.day })} className="min-h-11 shrink-0 rounded-xl bg-accent px-3 text-xs font-black text-on-accent"><Dumbbell className="mr-1 inline h-3.5 w-3.5" aria-hidden />Manage</button>}
            </article>
          ))}
          {selectedRuns.map((run) => (
            <article key={run.runId} className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold-ink"><Footprints className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black">{RUN_TYPE_LABELS[run.runType]} run</h3>
                <p className="mt-0.5 text-xs text-muted">{formatRunDistance(run.distanceMeters, run.distanceUnit)} · {formatRunDuration(run.durationSeconds)} · {formatRunPace(run.durationSeconds, run.distanceMeters, run.distanceUnit)}</p>
                {run.effort && <p className="mt-0.5 text-xs text-muted">Effort {run.effort}/10</p>}
                {run.notes && <p className="mt-1 line-clamp-2 text-xs text-ink-2">{run.notes}</p>}
              </div>
            </article>
          ))}
          </>}
        </div>
      </section>

      <button type="button" aria-expanded={editorOpen} onClick={() => setEditorOpen((open) => !open)} className="btn-secondary w-full">
        {editorOpen ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        {editorOpen ? 'Hide week schedule' : 'Edit week schedule'}
      </button>

      {editorOpen && (
        <WeekCalendar
          schedule={schedule}
          profile={profile}
          history={history}
          today={today}
          monday={mondayOf(selectedDate)}
          onMondayChange={chooseEditorWeek}
          onMove={onMove}
          onOpenMove={onOpenMove}
          onCatchUp={onCatchUp}
          showCatchUpAlert={false}
        />
      )}
    </div>
  );
}
