import type { RunSession, WorkoutSession } from '../types';
import { deriveHighlights } from './achievements';
import { normalizeWeight } from './jnt2Engine';
import { programExercises } from './extras';
import { completedSetCount } from './sessionValidity';
import { formatRunDistance, formatRunDuration, formatRunPace } from './runs';

/** What a feed card shows. Stats only: never notes, set logs or loads. */
export type ActivitySummary =
  | { kind: 'workout'; title: string; week: number; day: number; sets: number; volumeLb: number; minutes: number | null; prs: string[]; partial: boolean }
  | { kind: 'run'; title: string; distance: string; duration: string; pace: string; effort?: number };

const MAX_MINUTES = 240;

export function workoutActivity(session: WorkoutSession, history: WorkoutSession[]): { sourceId: string; summary: ActivitySummary } | null {
  if (session.isDemo || session.isSkipped || session.status === 'skipped') return null;
  const sets = completedSetCount(session);
  if (sets === 0) return null;
  const derived = deriveHighlights([...history.filter((item) => item.sessionId !== session.sessionId), session]).get(session.sessionId);
  const prs = (derived?.results ?? []).filter((result) => result.kind === 'all_time_pr').map((result) => result.exerciseName).slice(0, 3);
  const minutes = session.completedTime && session.completedTime > session.startTime
    ? Math.round((session.completedTime - session.startTime) / 60_000) : null;
  return {
    sourceId: `w:${session.sessionId}`,
    summary: {
      kind: 'workout',
      title: programExercises(session)[0]?.exerciseName ?? `Day ${session.day}`,
      week: session.week, day: session.day, sets,
      volumeLb: Math.round(normalizeWeight(derived?.totalVolume ?? 0, session.settingsSnapshot.unit, 'lb')),
      minutes: minutes !== null && minutes <= MAX_MINUTES ? minutes : null,
      prs, partial: session.isPartial,
    },
  };
}

export function runActivity(run: RunSession): { sourceId: string; summary: ActivitySummary } {
  return {
    sourceId: `r:${run.runId}`,
    summary: {
      kind: 'run', title: 'Run',
      distance: formatRunDistance(run.distanceMeters, run.distanceUnit),
      duration: formatRunDuration(run.durationSeconds),
      pace: formatRunPace(run.durationSeconds, run.distanceMeters, run.distanceUnit),
      ...(run.effort !== undefined ? { effort: run.effort } : {}),
    },
  };
}

/** Validates a summary read from the server; a malformed one is dropped, never rendered. */
export function parseActivitySummary(raw: unknown): ActivitySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x.slice(0, 80) : null);
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);
  const title = str(r.title);
  if (title === null) return null;
  if (r.kind === 'run') {
    const distance = str(r.distance), duration = str(r.duration), pace = str(r.pace);
    if (distance === null || duration === null || pace === null) return null;
    const effort = num(r.effort);
    return { kind: 'run', title, distance, duration, pace, ...(effort !== null ? { effort } : {}) };
  }
  if (r.kind === 'workout') {
    const week = num(r.week), day = num(r.day), sets = num(r.sets), volumeLb = num(r.volumeLb);
    if (week === null || day === null || sets === null || volumeLb === null) return null;
    const prs = Array.isArray(r.prs) ? r.prs.map(str).filter((x): x is string => x !== null).slice(0, 3) : [];
    return { kind: 'workout', title, week, day, sets, volumeLb, minutes: num(r.minutes), prs, partial: r.partial === true };
  }
  return null;
}
