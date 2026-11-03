import type { TrainingMaxKey, UserProfile, WorkoutSession } from '../types';
import { planFromToday, withTrainingDays, type DateKey } from './schedule';

/**
 * A cycle is one run through the 12-week program. Sessions and profiles written before cycles existed carry no
 * cycle id and belong to the first cycle, so nothing stored needs rewriting.
 */
export const FIRST_CYCLE_ID = 'c1';

export const cycleOf = (session: Pick<WorkoutSession, 'cycleId'>): string => session.cycleId ?? FIRST_CYCLE_ID;
export const profileCycleId = (profile: Pick<UserProfile, 'cycleId'>): string => profile.cycleId ?? FIRST_CYCLE_ID;
export const cycleNumber = (id: string): number => Number(id.replace(/^c/, '')) || 1;
export const nextCycleId = (id: string): string => `c${cycleNumber(id) + 1}`;

/** The sessions of one cycle. Everything that matches workouts by Week/Day (the calendar, "next up", missed) uses this. */
export const historyForCycle = (history: WorkoutSession[], cycleId: string): WorkoutSession[] =>
  history.filter((session) => cycleOf(session) === cycleId);

/** `cycleId` to stamp on a new session: nothing for the first cycle, so those records stay byte-for-byte as before. */
export const stampFor = (profile: Pick<UserProfile, 'cycleId'>): { cycleId?: string } =>
  profileCycleId(profile) === FIRST_CYCLE_ID ? {} : { cycleId: profileCycleId(profile) };

export interface NewCycleOptions {
  /** Block 1 training maxes for the new cycle. */
  trainingMaxes: Partial<Record<TrainingMaxKey, number>>;
  /** Weekday (0 = Monday) for program Day 1 to Day 4. */
  trainingDays: number[];
  /** The day the cycle starts; Week 1 lands in this calendar week. */
  startDate: DateKey;
  /** Keep remembered exercise swaps and renamed accessories, or go back to the program's own exercises. */
  keepSwaps: boolean;
  now?: number;
}

/**
 * The profile as it should be after starting the next cycle. Pure: the finished cycle is closed in `cycles`
 * (and marked finished only if all 48 workouts were reached), Week 1 Day 1 is next, Block 2 training maxes are
 * cleared so they can't silently use stale numbers, and the calendar restarts at `startDate`.
 */
export function buildNextCycleProfile(profile: UserProfile, history: WorkoutSession[], options: NewCycleOptions): UserProfile {
  const now = options.now ?? Date.now();
  const currentId = profileCycleId(profile);
  const mine = historyForCycle(history, currentId);
  const startedAt = mine.reduce<number>((first, s) => Math.min(first, s.startTime), now);
  const known = profile.cycles ?? [{ id: currentId, number: cycleNumber(currentId), startedAt }];
  const closed = known.map((cycle) => (cycle.id === currentId ? { ...cycle, endedAt: now, finished: Boolean(profile.cycleCompleted) } : cycle));
  const id = nextCycleId(currentId);
  const next: UserProfile = {
    ...profile,
    cycleId: id,
    cycles: [...closed, { id, number: cycleNumber(id), startedAt: now }],
    currentWeek: 1,
    currentDay: 1,
    trainingMaxes: { ...options.trainingMaxes },
    schedule: withTrainingDays(planFromToday(1, [], options.startDate, options.trainingDays), options.trainingDays),
  };
  delete next.cycleCompleted;
  delete next.block2ConfirmedTMs;
  delete next.block2ConfirmedAt;
  if (!options.keepSwaps) {
    delete next.exerciseSwaps;
    delete next.exerciseCustomizations;
  }
  return next;
}

/** A short summary of a cycle for its review screen. */
export function summarizeCycle(history: WorkoutSession[], cycleId: string) {
  const sessions = historyForCycle(history, cycleId);
  const finished = sessions.filter((s) => s.status === 'completed' && !s.isPartial && !s.isSkipped && !s.isDemo);
  return {
    finished: finished.length,
    skipped: sessions.filter((s) => s.isSkipped).length,
    partial: sessions.filter((s) => s.status === 'partial').length,
  };
}
