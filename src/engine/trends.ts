import type { WeightUnit, WorkoutSession } from '../types';
import { normalizeWeight } from './jnt2Engine';
import { computeTotalVolume } from './achievements';
import { validCompleted, weekStart } from './sessionValidity';

export interface TrendPoint {
  /** Timestamp the point sits at (a workout's finish, or a week's Monday). */
  at: number;
  value: number;
  /** Set on a point that was a personal best for the series so far. */
  best?: boolean;
  label?: string;
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
