import type { RunSession, WorkoutSession } from '../types';
import { deriveHighlights } from './achievements';
import { normalizeWeight } from './jnt2Engine';
import { programExercises } from './extras';
import { completedSetCount } from './sessionValidity';
import { formatRunDistance, formatRunDuration, formatRunPace } from './runs';
import { musclesForWorkout, parseMuscleIntensities, type MuscleIntensityMap } from './muscles';
import { workoutElapsedMs } from '../lib/workoutTimer';

export const WRAP_MAX = 200;

/** What a feed card shows. Stats and a short wrap-up only: never notes, set logs or loads. */
export type ActivitySummary =
  | { kind: 'workout'; title: string; week: number; day: number; sets: number; volumeLb: number; minutes: number | null; prs: string[]; partial: boolean; custom?: boolean; muscles?: MuscleIntensityMap; wrap?: string }
  | { kind: 'run'; title: string; distance: string; duration: string; pace: string; effort?: number; wrap?: string };

const MAX_MINUTES = 240;

export const clampWrap = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, WRAP_MAX);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A one-to-two line recap written from the workout's own numbers. */
export function buildWorkoutWrapUp(summary: Extract<ActivitySummary, { kind: 'workout' }>, streakWeeks = 0): string {
  const parts = [`${summary.partial ? 'Partial' : 'Finished'} ${summary.title}: ${plural(summary.sets, 'set')}, ${summary.volumeLb.toLocaleString('en-US')} lb${summary.minutes !== null ? ` in ${summary.minutes} min` : ''}.`];
  if (summary.prs.length) parts.push(`${summary.prs.length === 1 ? 'New PR' : 'New PRs'}: ${summary.prs.join(', ')}.`);
  else if (streakWeeks >= 2) parts.push(`${streakWeeks} weeks in a row hitting the goal.`);
  return clampWrap(parts.join(' '));
}

export function buildRunWrapUp(input: { distance: string; duration: string; pace: string; runType?: string; longestRecent?: boolean }): string {
  const kind = input.runType ? `${input.runType.toLowerCase()} run` : 'run';
  const parts = [`${input.distance} ${kind} in ${input.duration} at ${input.pace}.`];
  if (input.longestRecent) parts.push('Longest run in a while.');
  return clampWrap(parts.join(' '));
}

export function workoutActivity(session: WorkoutSession, history: WorkoutSession[], streakWeeks = 0): { sourceId: string; summary: Extract<ActivitySummary, { kind: 'workout' }> } | null {
  if (session.isDemo || session.isSkipped || session.status === 'skipped') return null;
  const sets = completedSetCount(session);
  if (sets === 0) return null;
  const derived = deriveHighlights([...history.filter((item) => item.sessionId !== session.sessionId), session]).get(session.sessionId);
  const prs = (derived?.results ?? []).filter((result) => result.kind === 'all_time_pr').map((result) => result.exerciseName).slice(0, 3);
  const elapsed = session.timer ? workoutElapsedMs(session, session.completedTime ?? session.updatedTime) : null;
  const minutes = elapsed !== null ? Math.round(elapsed / 60_000) : session.completedTime && session.completedTime > session.startTime
    ? Math.round((session.completedTime - session.startTime) / 60_000) : null;
  const muscles = musclesForWorkout(session);
  const summary: Extract<ActivitySummary, { kind: 'workout' }> = {
    kind: 'workout',
    title: session.workoutKind === 'custom' ? (session.customName ?? 'Custom workout') : (programExercises(session)[0]?.exerciseName ?? `Day ${session.day}`),
    week: session.week, day: session.day, sets,
    volumeLb: Math.round(normalizeWeight(derived?.totalVolume ?? 0, session.settingsSnapshot.unit, 'lb')),
    minutes: minutes !== null && minutes <= MAX_MINUTES ? minutes : null,
    prs, partial: session.isPartial, ...(session.workoutKind === 'custom' ? { custom: true } : {}),
    ...(muscles ? { muscles } : {}),
  };
  summary.wrap = buildWorkoutWrapUp(summary, streakWeeks);
  return { sourceId: `w:${session.sessionId}`, summary };
}

export function runActivity(run: RunSession, recentRuns: RunSession[] = [], wrap?: string): { sourceId: string; summary: Extract<ActivitySummary, { kind: 'run' }> } {
  const distance = formatRunDistance(run.distanceMeters, run.distanceUnit);
  const duration = formatRunDuration(run.durationSeconds);
  const pace = formatRunPace(run.durationSeconds, run.distanceMeters, run.distanceUnit);
  const earlier = recentRuns.filter((item) => item.runId !== run.runId && item.startTime < run.startTime).sort((x, y) => y.startTime - x.startTime).slice(0, 10);
  const longestRecent = earlier.length >= 2 && earlier.every((item) => item.distanceMeters < run.distanceMeters);
  const text = wrap !== undefined ? clampWrap(wrap) : buildRunWrapUp({ distance, duration, pace, longestRecent });
  return {
    sourceId: `r:${run.runId}`,
    summary: {
      kind: 'run', title: 'Run', distance, duration, pace,
      ...(run.effort !== undefined ? { effort: run.effort } : {}),
      ...(text ? { wrap: text } : {}),
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
  const wrap = typeof r.wrap === 'string' && clampWrap(r.wrap) ? { wrap: clampWrap(r.wrap) } : {};
  if (r.kind === 'run') {
    const distance = str(r.distance), duration = str(r.duration), pace = str(r.pace);
    if (distance === null || duration === null || pace === null) return null;
    const effort = num(r.effort);
    return { kind: 'run', title, distance, duration, pace, ...(effort !== null ? { effort } : {}), ...wrap };
  }
  if (r.kind === 'workout') {
    const week = num(r.week), day = num(r.day), sets = num(r.sets), volumeLb = num(r.volumeLb);
    if (week === null || day === null || sets === null || volumeLb === null) return null;
    const prs = Array.isArray(r.prs) ? r.prs.map(str).filter((x): x is string => x !== null).slice(0, 3) : [];
    const muscles = parseMuscleIntensities(r.muscles);
    return { kind: 'workout', title, week, day, sets, volumeLb, minutes: num(r.minutes), prs, partial: r.partial === true, ...(r.custom === true ? { custom: true } : {}), ...(muscles ? { muscles } : {}), ...wrap };
  }
  return null;
}
