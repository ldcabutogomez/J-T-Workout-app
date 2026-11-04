import type { RunDistanceUnit, RunSession, RunType } from '../types';
import { toDateKey, type DateKey } from './schedule';

const METERS_PER_MILE = 1609.344;
const METERS_PER_KILOMETER = 1000;

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: 'Easy',
  tempo: 'Tempo',
  intervals: 'Intervals',
  long: 'Long run',
  other: 'Other',
};

export function distanceToMeters(distance: number, unit: RunDistanceUnit): number {
  return distance * (unit === 'mi' ? METERS_PER_MILE : METERS_PER_KILOMETER);
}

export function distanceFromMeters(meters: number, unit: RunDistanceUnit): number {
  return meters / (unit === 'mi' ? METERS_PER_MILE : METERS_PER_KILOMETER);
}

export function formatRunDistance(meters: number, unit: RunDistanceUnit): string {
  const distance = distanceFromMeters(meters, unit);
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(distance)} ${unit}`;
}

export function formatRunDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatRunPace(durationSeconds: number, distanceMeters: number, unit: RunDistanceUnit): string {
  const distance = distanceFromMeters(distanceMeters, unit);
  if (!(durationSeconds > 0) || !(distance > 0)) return '—';
  return `${formatRunDuration(durationSeconds / distance)} /${unit}`;
}

export const runDateKey = (run: Pick<RunSession, 'startTime'>): DateKey => toDateKey(new Date(run.startTime));

function localWeekStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function addLocalDays(at: number, days: number): number {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export interface RunSummary {
  count: number;
  distanceMeters: number;
  durationSeconds: number;
  averagePace: string;
  unit: RunDistanceUnit;
}

export function preferredRunUnit(runs: RunSession[]): RunDistanceUnit {
  return [...runs].sort((a, b) => b.startTime - a.startTime)[0]?.distanceUnit ?? 'mi';
}

export function currentWeekRunSummary(runs: RunSession[], now: number = Date.now(), unit = preferredRunUnit(runs)): RunSummary {
  const start = localWeekStart(now);
  const end = addLocalDays(start, 7);
  const current = runs.filter((run) => run.startTime >= start && run.startTime < end);
  const distanceMeters = current.reduce((sum, run) => sum + run.distanceMeters, 0);
  const durationSeconds = current.reduce((sum, run) => sum + run.durationSeconds, 0);
  return {
    count: current.length,
    distanceMeters,
    durationSeconds,
    averagePace: formatRunPace(durationSeconds, distanceMeters, unit),
    unit,
  };
}

export interface RunWeekPoint {
  startTime: number;
  count: number;
  distance: number;
}

/** Consecutive local calendar weeks, oldest first, for a compact mileage chart. */
export function runDistanceByWeek(runs: RunSession[], unit: RunDistanceUnit, weeks = 8, now: number = Date.now()): RunWeekPoint[] {
  const current = localWeekStart(now);
  return Array.from({ length: weeks }, (_, index) => {
    const startTime = addLocalDays(current, -7 * (weeks - 1 - index));
    const end = addLocalDays(startTime, 7);
    const inWeek = runs.filter((run) => run.startTime >= startTime && run.startTime < end);
    return {
      startTime,
      count: inWeek.length,
      distance: distanceFromMeters(inWeek.reduce((sum, run) => sum + run.distanceMeters, 0), unit),
    };
  });
}

export function newRunId(profileId: string, now: number = Date.now()): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `run-${profileId}-${now}-${suffix}`;
}
