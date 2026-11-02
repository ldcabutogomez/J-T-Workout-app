import type { WorkoutSession } from '../types';

/** A real, fully completed session: the only kind that supports rewards and completion claims. */
export function validCompleted(session: WorkoutSession): boolean {
  return session.status === 'completed'
    && Boolean(session.completedTime)
    && !session.isSkipped
    && !session.isPartial
    && !session.isDemo;
}

/** Start of the local calendar week (Monday 00:00) as a timestamp. */
export function weekStart(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

const loggedSets = (session: WorkoutSession) => session.exercises.flatMap((exercise) => exercise.sets);

export const completedSetCount = (session: WorkoutSession) => loggedSets(session).filter((set) => set.completed).length;
export const plannedSetCount = (session: WorkoutSession) => loggedSets(session).length;

/**
 * Sessions whose logged work counts toward stats (pounds lifted, PRs, session totals, the leaderboard):
 * finished workouts and partial ones that have at least one logged set. Skipped, demo and active drafts never count.
 */
export function countsTowardStats(session: WorkoutSession): boolean {
  if (session.isSkipped || session.isDemo) return false;
  if (validCompleted(session)) return true;
  return session.status === 'partial' && Boolean(session.completedTime) && completedSetCount(session) > 0;
}

/**
 * How much of a session counts toward the weekly goal, compliance and streak: 1 for a finished workout,
 * the share of planned sets that were logged for a partial one, and 0 for anything else.
 */
export function sessionCredit(session: WorkoutSession): number {
  if (validCompleted(session)) return 1;
  if (!countsTowardStats(session)) return 0;
  const planned = plannedSetCount(session);
  return planned === 0 ? 0 : Math.min(1, completedSetCount(session) / planned);
}

/** Session credit per calendar week (Mon-Sun), keyed by week start. The one weekly-goal definition. */
export function weeklyCounts(sessions: WorkoutSession[]): Map<number, number> {
  const counts = new Map<number, number>();
  const seen = new Set<string>();
  for (const session of sessions) {
    const credit = sessionCredit(session);
    if (credit <= 0 || seen.has(session.sessionId)) continue;
    seen.add(session.sessionId);
    const key = weekStart(session.completedTime ?? session.startTime);
    counts.set(key, (counts.get(key) ?? 0) + credit);
  }
  return counts;
}

/** Credit totals are fractional once partial workouts count; show at most one decimal ("2.8"). */
export const fmtCount = (value: number): string => String(Number(value.toFixed(1)));

/** True once a (possibly fractional) weekly total reaches the goal, tolerating float error. */
export const meetsGoal = (count: number, goal: number): boolean => count >= goal - 1e-9;
