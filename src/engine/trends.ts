import type { WeightUnit, WorkoutSession } from '../types';
import { normalizeWeight } from './jnt2Engine';
import { computeTotalVolume, countResults, deriveHighlights, loggedDurationMs } from './achievements';
import { validCompleted, weekStart } from './sessionValidity';

export interface TrendPoint {
  /** Timestamp the point sits at (a workout's finish, or a week's Monday). */
  at: number;
  value: number;
  /** Set on a point that was a personal best for the series so far. */
  best?: boolean;
  label?: string;
}

export type AnalyticsRange = '4w' | '12w' | 'all';

export interface AnalyticsWindow {
  start: number;
  end: number;
  previousStart?: number;
  previousEnd?: number;
}

export interface AnalyticsTotals {
  workouts: number;
  volume: number;
  prs: number;
  averageDurationMinutes: number | null;
  durationCoverage: number;
}

export interface AnalyticsSummary {
  current: AnalyticsTotals;
  previous: AnalyticsTotals | null;
}

export interface ActivityDay {
  at: number;
  count: number;
  future: boolean;
}

export interface AnalyticsInsight {
  kind: 'volume' | 'strength' | 'consistency' | 'schedule' | 'start';
  title: string;
  body: string;
}

const RANGE_WEEKS: Record<Exclude<AnalyticsRange, 'all'>, number> = { '4w': 4, '12w': 12 };

/** Calendar arithmetic in local time, so week/day bins stay correct across daylight-saving changes. */
function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function localDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const finishedAt = (session: WorkoutSession) => session.completedTime ?? session.startTime;

/** The selected calendar window, ending after the current Sunday. */
export function analyticsWindow(range: AnalyticsRange, history: WorkoutSession[], now = Date.now()): AnalyticsWindow {
  const thisWeek = weekStart(now);
  const end = addLocalDays(thisWeek, 7);
  if (range === 'all') {
    const first = history.filter(validCompleted).reduce<number | null>((earliest, session) => {
      const at = weekStart(finishedAt(session));
      return earliest === null ? at : Math.min(earliest, at);
    }, null);
    return { start: first ?? thisWeek, end };
  }
  const weeks = RANGE_WEEKS[range];
  const start = addLocalDays(thisWeek, -7 * (weeks - 1));
  return { start, end, previousStart: addLocalDays(start, -7 * weeks), previousEnd: start };
}

function sessionsInWindow(history: WorkoutSession[], start: number, end: number): WorkoutSession[] {
  return history.filter((session) => validCompleted(session) && finishedAt(session) >= start && finishedAt(session) < end);
}

/** Completed sessions in the selected range, oldest first. */
export function analyticsSessions(history: WorkoutSession[], range: AnalyticsRange, now = Date.now()): WorkoutSession[] {
  const window = analyticsWindow(range, history, now);
  return sessionsInWindow(history, window.start, window.end).sort((a, b) => finishedAt(a) - finishedAt(b));
}

function totalsFor(sessions: WorkoutSession[], history: WorkoutSession[], unit: WeightUnit): AnalyticsTotals {
  const highlights = deriveHighlights(history);
  const durations = sessions.map(loggedDurationMs).filter((duration) => duration > 0);
  return {
    workouts: sessions.length,
    volume: Math.round(sessions.reduce((sum, session) => sum + normalizeWeight(computeTotalVolume(session), session.settingsSnapshot.unit, unit), 0)),
    prs: sessions.reduce((sum, session) => sum + countResults(highlights.get(session.sessionId)?.results ?? [], 'all_time_pr'), 0),
    averageDurationMinutes: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length / 60_000) : null,
    durationCoverage: durations.length,
  };
}

/** Headline totals and, for fixed ranges, the immediately preceding equal-length period. */
export function analyticsSummary(history: WorkoutSession[], unit: WeightUnit, range: AnalyticsRange, now = Date.now()): AnalyticsSummary {
  const window = analyticsWindow(range, history, now);
  const current = totalsFor(sessionsInWindow(history, window.start, window.end), history, unit);
  const previous = window.previousStart !== undefined && window.previousEnd !== undefined
    ? totalsFor(sessionsInWindow(history, window.previousStart, window.previousEnd), history, unit)
    : null;
  return { current, previous };
}

/** One local-calendar cell per day, including visibly marked future days in the current week. */
export function activityDays(history: WorkoutSession[], range: AnalyticsRange, now = Date.now()): ActivityDay[] {
  const window = analyticsWindow(range, history, now);
  const counts = new Map<number, number>();
  for (const session of sessionsInWindow(history, window.start, window.end)) {
    const day = localDayStart(finishedAt(session));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const today = localDayStart(now);
  const days: ActivityDay[] = [];
  for (let cursor = window.start; cursor < window.end; cursor = addLocalDays(cursor, 1)) {
    days.push({ at: cursor, count: counts.get(cursor) ?? 0, future: cursor > today });
  }
  return days;
}

function weeklyPoints(window: AnalyticsWindow, values: Map<number, number>): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let cursor = window.start; cursor < window.end; cursor = addLocalDays(cursor, 7)) {
    points.push({ at: cursor, value: values.get(cursor) ?? 0 });
  }
  return points;
}

/** Total weight lifted for every calendar week in the selected analytics range. */
export function analyticsVolumeByWeek(history: WorkoutSession[], unit: WeightUnit, range: AnalyticsRange, now = Date.now()): TrendPoint[] {
  const window = analyticsWindow(range, history, now);
  const totals = new Map<number, number>();
  for (const session of sessionsInWindow(history, window.start, window.end)) {
    const week = weekStart(finishedAt(session));
    const volume = normalizeWeight(computeTotalVolume(session), session.settingsSnapshot.unit, unit);
    totals.set(week, (totals.get(week) ?? 0) + volume);
  }
  for (const [week, value] of totals) totals.set(week, Math.round(value));
  return weeklyPoints(window, totals);
}

/** All-time PRs earned in each calendar week of the selected range. */
export function prsByWeek(history: WorkoutSession[], range: AnalyticsRange, now = Date.now()): TrendPoint[] {
  const window = analyticsWindow(range, history, now);
  const highlights = deriveHighlights(history);
  const totals = new Map<number, number>();
  for (const session of sessionsInWindow(history, window.start, window.end)) {
    const week = weekStart(finishedAt(session));
    const count = countResults(highlights.get(session.sessionId)?.results ?? [], 'all_time_pr');
    totals.set(week, (totals.get(week) ?? 0) + count);
  }
  return weeklyPoints(window, totals);
}

/** Timestamp-backed active workout duration, one point per eligible session. */
export function workoutDurationSeries(history: WorkoutSession[], range: AnalyticsRange, now = Date.now()): TrendPoint[] {
  return analyticsSessions(history, range, now).flatMap((session) => {
    const duration = loggedDurationMs(session);
    return duration > 0 ? [{ at: finishedAt(session), value: Math.max(1, Math.round(duration / 60_000)) }] : [];
  });
}

/** Filter an already-derived time series to the shared analytics range. */
export function seriesInRange(points: TrendPoint[], history: WorkoutSession[], range: AnalyticsRange, now = Date.now()): TrendPoint[] {
  const window = analyticsWindow(range, history, now);
  return points.filter((point) => point.at >= window.start && point.at < window.end);
}

/** Short, deterministic observations. Claims are restricted to the same defensible data used by the charts. */
export function analyticsInsights(
  history: WorkoutSession[],
  unit: WeightUnit,
  weeklyGoal: number,
  range: AnalyticsRange,
  now = Date.now(),
): AnalyticsInsight[] {
  const sessions = analyticsSessions(history, range, now);
  if (sessions.length === 0) return [{ kind: 'start', title: 'Your story starts here', body: 'Complete a workout to unlock training insights and comparisons.' }];

  const insights: AnalyticsInsight[] = [];
  const summary = analyticsSummary(history, unit, range, now);
  if (summary.previous && (summary.current.volume > 0 || summary.previous.volume > 0)) {
    if (summary.previous.volume === 0) {
      insights.push({ kind: 'volume', title: 'Volume baseline established', body: `You logged ${summary.current.volume.toLocaleString()} ${unit} in this period.` });
    } else {
      const change = Math.round(((summary.current.volume - summary.previous.volume) / summary.previous.volume) * 100);
      const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'even';
      insights.push({
        kind: 'volume',
        title: direction === 'even' ? 'Volume is holding steady' : `Volume is ${direction} ${Math.abs(change)}%`,
        body: `Compared with the previous ${range === '4w' ? 'four' : 'twelve'} weeks. Training phase and recovery can both affect this number.`,
      });
    }
  }

  let strongest: { name: string; change: number; pct: number } | null = null;
  for (const exercise of trendableExercises(history, unit)) {
    const points = seriesInRange(e1rmSeries(history, exercise.id, unit), history, range, now);
    if (points.length < 2) continue;
    const change = points[points.length - 1].value - points[0].value;
    if (change <= 0) continue;
    const pct = Math.round((change / points[0].value) * 100);
    if (!strongest || pct > strongest.pct) strongest = { name: exercise.name, change, pct };
  }
  if (strongest) insights.push({
    kind: 'strength',
    title: `${strongest.name} is trending up`,
    body: `Estimated 1RM increased by ${Number(strongest.change.toFixed(1))} ${unit} (${strongest.pct}%) across this view.`,
  });

  const window = analyticsWindow(range, history, now);
  const weekly = new Map<number, number>();
  for (const session of sessions) {
    const week = weekStart(finishedAt(session));
    weekly.set(week, (weekly.get(week) ?? 0) + 1);
  }
  const weekCount = Math.max(1, Math.round((window.end - window.start) / (7 * 86_400_000)));
  const goalsHit = [...weekly.values()].filter((count) => count >= Math.max(1, weeklyGoal)).length;
  const thisWeekCount = weekly.get(weekStart(now)) ?? 0;
  insights.push({
    kind: 'consistency',
    title: goalsHit > 0 ? `${goalsHit} of ${weekCount} weekly goals hit` : 'Build the next goal week',
    body: thisWeekCount >= weeklyGoal
      ? `This week's ${weeklyGoal}-workout goal is complete.`
      : `${thisWeekCount} of ${weeklyGoal} completed workouts logged this week.`,
  });

  if (insights.length < 3) {
    const weekdays = new Map<number, number>();
    for (const session of sessions) {
      const day = new Date(finishedAt(session)).getDay();
      weekdays.set(day, (weekdays.get(day) ?? 0) + 1);
    }
    const favourite = [...weekdays].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (favourite) {
      const name = new Date(2024, 0, 7 + favourite[0]).toLocaleDateString(undefined, { weekday: 'long' });
      insights.push({ kind: 'schedule', title: `${name} is your training day`, body: `${favourite[1]} completed workout${favourite[1] === 1 ? '' : 's'} landed on a ${name} in this view.` });
    }
  }
  return insights.slice(0, 3);
}

/** Epley estimate of a one-rep max. A single is itself. */
export function estimateOneRepMax(load: number, reps: number): number {
  if (!(load > 0) || !(reps >= 1)) return 0;
  return reps === 1 ? load : load * (1 + reps / 30);
}

/** Beyond this many reps the estimate is too loose to trend (high-rep sets say little about maximal strength). */
export const MAX_REPS_FOR_E1RM = 12;

/**
 * Best estimated 1RM per finished workout for one exercise, in `unit`, oldest first. Each workout contributes its
 * strongest completed set, so the line follows how strong you are, not how many sets you did.
 */
export function e1rmSeries(history: WorkoutSession[], exerciseId: string, unit: WeightUnit): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const session of history) {
    if (!validCompleted(session)) continue;
    let best = 0;
    for (const exercise of session.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      for (const set of exercise.sets) {
        if (!set.completed || set.actualReps === null || set.load === null) continue;
        if (set.actualReps < 1 || set.actualReps > MAX_REPS_FOR_E1RM) continue;
        best = Math.max(best, estimateOneRepMax(normalizeWeight(set.load, set.unit, unit), set.actualReps));
      }
    }
    if (best > 0) points.push({ at: session.completedTime ?? session.startTime, value: Math.round(best * 10) / 10 });
  }
  points.sort((a, b) => a.at - b.at);
  let top = 0;
  for (const point of points) {
    if (point.value > top) { top = point.value; point.best = true; }
  }
  return points;
}

/** Total weight lifted per calendar week (Monday start), in `unit`, with empty weeks between workouts shown as zero. */
export function volumeByWeek(history: WorkoutSession[], unit: WeightUnit, maxWeeks = 12): TrendPoint[] {
  const totals = new Map<number, number>();
  for (const session of history) {
    if (!validCompleted(session)) continue;
    const week = weekStart(session.completedTime ?? session.startTime);
    const volume = normalizeWeight(computeTotalVolume(session), session.settingsSnapshot.unit, unit);
    totals.set(week, (totals.get(week) ?? 0) + volume);
  }
  if (totals.size === 0) return [];
  const weeks = [...totals.keys()].sort((a, b) => a - b);
  const out: TrendPoint[] = [];
  const cursor = new Date(weeks[0]);
  while (cursor.getTime() <= weeks[weeks.length - 1]) {
    const key = cursor.getTime();
    out.push({ at: key, value: Math.round(totals.get(key) ?? 0) });
    cursor.setDate(cursor.getDate() + 7);
  }
  return out.slice(-maxWeeks);
}

/** The exercises that have at least one trendable set, with how many points each would have. */
export function trendableExercises(history: WorkoutSession[], unit: WeightUnit): Array<{ id: string; name: string; points: number }> {
  const names = new Map<string, string>();
  for (const session of history) {
    if (!validCompleted(session)) continue;
    for (const exercise of session.exercises) names.set(exercise.exerciseId, exercise.exerciseName);
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name, points: e1rmSeries(history, id, unit).length }))
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
