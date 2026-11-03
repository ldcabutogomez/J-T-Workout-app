import type { SessionResult, WorkoutSession } from '../types';

export type Celebration = 'cycle' | 'pr' | 'weekly_goal' | 'badge' | 'level' | 'finish' | 'none';

export const prRewardKey = (result: SessionResult) =>
  `pr:${result.exerciseId}:${result.reps}:${Number(result.load.toFixed(2))}`;

export const exerciseDoneKey = (slotId: string) => `exercise:${slotId}`;

export const hasDelivered = (session: WorkoutSession, key: string) =>
  Boolean(session.rewardsDelivered?.includes(key));

export const markDelivered = (session: WorkoutSession, key: string): WorkoutSession =>
  hasDelivered(session, key)
    ? session
    : { ...session, rewardsDelivered: [...(session.rewardsDelivered ?? []), key] };

interface CelebrationInput {
  celebrate: boolean;
  cycleComplete: boolean;
  results: SessionResult[];
  delivered: string[];
  weeklyGoalNewlyMet: boolean;
  newBadgeCount: number;
  leveledUp?: boolean;
}

/**
 * One major feedback sequence per completion. Anything already celebrated mid-workout, and
 * everything lower in priority, is shown quietly in the summary instead of stacking.
 */
export function pickPrimaryCelebration(input: CelebrationInput): Celebration {
  if (!input.celebrate) return 'none';
  if (input.cycleComplete) return 'cycle';
  const freshPr = input.results.some((result) => result.kind === 'all_time_pr' && !input.delivered.includes(prRewardKey(result)));
  if (freshPr) return 'pr';
  if (input.weeklyGoalNewlyMet) return 'weekly_goal';
  if (input.newBadgeCount > 0) return 'badge';
  if (input.leveledUp) return 'level';
  return 'finish';
}
