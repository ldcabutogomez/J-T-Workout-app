import type { SessionHighlights, UnlockedBadge, WorkoutSession } from '../types';
import { findAllComparableResults, isVerifiedCycleComplete, validCompleted } from './encouragement';
import { normalizeWeight } from './jnt2Engine';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const BADGES: BadgeDefinition[] = [
  { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', icon: '🚀' },
  { id: 'sessions_5', name: 'Getting Rolling', description: 'Complete 5 workouts', icon: '🔥' },
  { id: 'sessions_10', name: 'Double Digits', description: 'Complete 10 workouts', icon: '💪' },
  { id: 'sessions_25', name: 'Quarter Century', description: 'Complete 25 workouts', icon: '🏅' },
  { id: 'sessions_50', name: 'Iron Habit', description: 'Complete 50 workouts', icon: '🏆' },
  { id: 'first_pr', name: 'New Best', description: 'Set your first comparable PR', icon: '⭐' },
  { id: 'triple_pr', name: 'PR Party', description: 'Set 3 PRs in one workout', icon: '🎉' },
  { id: 'streak_2', name: 'Two-Week Streak', description: 'Hit your weekly goal 2 weeks in a row', icon: '📅' },
  { id: 'streak_4', name: 'Month of Consistency', description: 'Hit your weekly goal 4 weeks in a row', icon: '🗓️' },
  { id: 'streak_8', name: 'Unstoppable', description: 'Hit your weekly goal 8 weeks in a row', icon: '⚡' },
  { id: 'cycle_complete', name: 'Cycle Complete', description: 'Finish all 48 sessions', icon: '👑' },
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

export function computeHighlights(session: WorkoutSession, history: WorkoutSession[]): SessionHighlights {
  const prs = findAllComparableResults(session, history).map((r) => ({
    exerciseId: r.exerciseId,
    exerciseName: r.exerciseName,
    reps: r.reps,
    load: r.load,
    unit: r.unit,
    previousBest: r.previousBest,
    kind: r.kind,
  }));
  const end = session.completedTime ?? Date.now();
  return {
    prs,
    totalVolume: computeTotalVolume(session),
    setsCompleted: countCompletedSets(session),
    durationMs: Math.max(0, end - session.startTime),
  };
}

/** Start of the local calendar week (Monday 00:00) as a timestamp. */
export function weekStart(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
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
  const goal = Math.max(1, weeklyGoal);
  const counts = new Map<number, number>();
  for (const s of sessions.filter(validCompleted)) {
    const key = weekStart(s.completedTime ?? s.startTime);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
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
  const priorPrCount = history
    .filter((s) => s.sessionId !== current.sessionId && s.highlights)
    .reduce((sum, s) => sum + (s.highlights?.prs.length ?? 0), 0);
  const currentPrs = current.highlights?.prs.length ?? 0;
  const earned: string[] = [];
  if (total >= 1) earned.push('first_workout');
  for (const n of [5, 10, 25, 50]) if (total >= n) earned.push(`sessions_${n}`);
  if (priorPrCount + currentPrs >= 1) earned.push('first_pr');
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

