import type { SessionHighlights, SessionResult, UnlockedBadge, WorkoutSession } from '../types';
import { findAllComparableResults, isVerifiedCycleComplete } from './encouragement';
import { validCompleted, weekStart, weeklyCounts } from './sessionValidity';

export { weekStart };
import { normalizeWeight } from './jnt2Engine';

export type BadgeIconKey = 'rocket' | 'flame' | 'dumbbell' | 'medal' | 'trophy' | 'star' | 'party' | 'calendar' | 'calendar-check' | 'zap' | 'crown';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: BadgeIconKey;
}

export const BADGES: BadgeDefinition[] = [
  { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', icon: 'rocket' },
  { id: 'sessions_5', name: 'Getting Rolling', description: 'Complete 5 workouts', icon: 'flame' },
  { id: 'sessions_10', name: 'Double Digits', description: 'Complete 10 workouts', icon: 'dumbbell' },
  { id: 'sessions_25', name: 'Quarter Century', description: 'Complete 25 workouts', icon: 'medal' },
  { id: 'sessions_40', name: 'Forty Strong', description: 'Complete 40 workouts', icon: 'trophy' },
  { id: 'first_pr', name: 'New Best', description: 'Set your first all-time PR', icon: 'star' },
  { id: 'triple_pr', name: 'PR Party', description: 'Set 3 all-time PRs in one workout', icon: 'party' },
  { id: 'streak_2', name: 'Two-Week Streak', description: 'Hit your weekly goal 2 weeks in a row', icon: 'calendar' },
  { id: 'streak_4', name: 'Month of Consistency', description: 'Hit your weekly goal 4 weeks in a row', icon: 'calendar-check' },
  { id: 'streak_8', name: 'Unstoppable', description: 'Hit your weekly goal 8 weeks in a row', icon: 'zap' },
  { id: 'cycle_complete', name: 'Cycle Complete', description: 'Finish all 48 sessions', icon: 'crown' },
];

export function computeTotalVolume(session: WorkoutSession): number {
  const unit = session.settingsSnapshot.unit;
  let total = 0;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!set.completed || set.actualReps === null || set.load === null) continue;
      total += set.actualReps * normalizeWeight(set.load, set.unit, unit);
    }
  }
  return Math.round(total);
}

export function countCompletedSets(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0);
}

/** First to last logged set. Draft age is ignored, so a draft left overnight does not inflate it. */
export function loggedDurationMs(session: WorkoutSession): number {
  const stamps = session.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.completed && typeof set.timestamp === 'number')
    .map((set) => set.timestamp as number);
  return stamps.length >= 2 ? Math.max(...stamps) - Math.min(...stamps) : 0;
}

export function computeHighlights(session: WorkoutSession, history: WorkoutSession[]): SessionHighlights {
  return {
    results: findAllComparableResults(session, history),
    totalVolume: computeTotalVolume(session),
    setsCompleted: countCompletedSets(session),
    durationMs: loggedDurationMs(session),
  };
}

/**
 * Highlights for every valid completed session, derived from history on read. Each session is
 * compared only against sessions completed before it, so edits can never leave stale PRs behind.
 */
export function deriveHighlights(history: WorkoutSession[]): Map<string, SessionHighlights> {
  const valid = history.filter(validCompleted);
  return new Map(valid.map((session) => [session.sessionId, computeHighlights(session, valid)]));
}

export const countResults = (results: SessionResult[], kind: SessionResult['kind']) =>
  results.filter((result) => result.kind === kind).length;

/** Headline for the completion summary. Never calls an improvement a personal best. */
export function summaryHeadline(results: SessionResult[], celebrate: boolean): string {
  if (!celebrate) return 'Session saved';
  if (countResults(results, 'all_time_pr')) return 'New personal best!';
  if (countResults(results, 'previous_improvement')) return 'Up from last time';
  if (countResults(results, 'matched_best')) return 'Matched your best';
  if (countResults(results, 'benchmark')) return 'Benchmark established';
  return 'Workout complete!';
}

export interface StreakInfo {
  weeklyCount: number;
  weeklyGoal: number;
  goalMet: boolean;
  streakWeeks: number;
}

/**
 * Streak = consecutive calendar weeks (Mon-Sun) with at least `weeklyGoal` completed sessions.
 * The current week counts once met, but an unmet current week does not break the streak.
 */
export function computeStreak(
  sessions: WorkoutSession[],
  weeklyGoal = 4,
  now = Date.now(),
): StreakInfo {
  return streakFromCounts(weeklyCounts(sessions), weeklyGoal, now);
}

/** Same streak rule as `computeStreak`, from per-week counts keyed by week start. Used for partner snapshots too. */
export function streakFromCounts(
  counts: Map<number, number>,
  weeklyGoal = 4,
  now = Date.now(),
): StreakInfo {
  const goal = Math.max(1, weeklyGoal);
  const thisWeek = weekStart(now);
  const weeklyCount = counts.get(thisWeek) ?? 0;
  const goalMet = weeklyCount >= goal;

  let streakWeeks = goalMet ? 1 : 0;
  let cursor = new Date(thisWeek);
  for (;;) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    if ((counts.get(cursor.getTime()) ?? 0) >= goal) streakWeeks += 1;
    else break;
  }
  return { weeklyCount, weeklyGoal: goal, goalMet, streakWeeks };
}

/**
 * Returns the ids of every badge earned given the session history (which must include
 * `current` if it is completed) and the current session's highlights.
 */
export function evaluateBadges(
  current: WorkoutSession,
  history: WorkoutSession[],
  weeklyGoal = 4,
  now = Date.now(),
): string[] {
  const all = [...history.filter((s) => s.sessionId !== current.sessionId), current];
  const completed = all.filter(validCompleted);
  const total = completed.length;
  const streak = computeStreak(all, weeklyGoal, now).streakWeeks;
  const derived = deriveHighlights(all);
  const allTimePrs = (id: string) => countResults(derived.get(id)?.results ?? [], 'all_time_pr');
  const totalPrs = [...derived.keys()].reduce((sum, id) => sum + allTimePrs(id), 0);
  const currentPrs = allTimePrs(current.sessionId);
  const earned: string[] = [];
  if (total >= 1) earned.push('first_workout');
  for (const n of [5, 10, 25, 40]) if (total >= n) earned.push(`sessions_${n}`);
  if (totalPrs >= 1) earned.push('first_pr');
  if (currentPrs >= 3) earned.push('triple_pr');
  for (const n of [2, 4, 8]) if (streak >= n) earned.push(`streak_${n}`);
  if (isVerifiedCycleComplete(current, history)) earned.push('cycle_complete');
  return earned;
}

export function newlyUnlocked(
  earned: string[],
  existing: UnlockedBadge[] | undefined,
  at = Date.now(),
): UnlockedBadge[] {
  const have = new Set((existing ?? []).map((b) => b.id));
  return earned.filter((id) => !have.has(id)).map((id) => ({ id, unlockedAt: at }));
}

