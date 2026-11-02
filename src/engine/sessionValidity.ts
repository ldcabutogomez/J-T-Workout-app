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

/** Valid completed sessions per calendar week (Mon-Sun), keyed by week start. The one weekly-goal definition. */
export function weeklyCounts(sessions: WorkoutSession[]): Map<number, number> {
  const counts = new Map<number, number>();
  const seen = new Set<string>();
  for (const session of sessions.filter(validCompleted)) {
    if (seen.has(session.sessionId)) continue;
    seen.add(session.sessionId);
    const key = weekStart(session.completedTime ?? session.startTime);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
