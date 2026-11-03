import type { SessionHighlights, SessionResult, UnlockedBadge, WorkoutSession } from '../types';
import { findAllComparableResults, isVerifiedCycleComplete } from './encouragement';
import { countsTowardStats, meetsGoal, validCompleted, weekStart, weeklyCounts } from './sessionValidity';

export { weekStart };
import { normalizeWeight } from './jnt2Engine';

export type BadgeIconKey =
  | 'rocket' | 'flame' | 'dumbbell' | 'medal' | 'trophy' | 'star' | 'party' | 'calendar' | 'calendar-check' | 'zap' | 'crown'
  | 'weight' | 'target' | 'gem' | 'award' | 'sunrise' | 'moon' | 'refresh' | 'users' | 'handshake'
  | 'battery' | 'snowflake' | 'flower' | 'sun' | 'leaf' | 'drumstick' | 'tree';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: BadgeIconKey;
}

export type Season = 'winter' | 'spring' | 'summer' | 'fall';
/** Finished workouts needed within one season for its badge. */
export const SEASON_TARGET = 10;

/** Meteorological seasons in local time. December belongs to the winter that ends the following February. */
export function seasonOf(timestamp: number): { season: Season; year: number } {
  const date = new Date(timestamp);
  const month = date.getMonth();
  if (month === 11) return { season: 'winter', year: date.getFullYear() + 1 };
  if (month <= 1) return { season: 'winter', year: date.getFullYear() };
  if (month <= 4) return { season: 'spring', year: date.getFullYear() };
  if (month <= 7) return { season: 'summer', year: date.getFullYear() };
  return { season: 'fall', year: date.getFullYear() };
}

/** US Thanksgiving: the fourth Thursday of November. */
export function thanksgivingDate(year: number): number {
  const firstOfNovember = new Date(year, 10, 1).getDay();
  return 1 + ((4 - firstOfNovember + 7) % 7) + 21;
}

/** Holiday weeks are the calendar week (Monday to Sunday, the same weeks as the weekly goal) that contains the holiday. */
export const isThanksgivingWeek = (timestamp: number): boolean => {
  const year = new Date(timestamp).getFullYear();
  return weekStart(timestamp) === weekStart(new Date(year, 10, thanksgivingDate(year), 12).getTime());
};

export const isChristmasWeek = (timestamp: number): boolean => {
  const year = new Date(timestamp).getFullYear();
  return weekStart(timestamp) === weekStart(new Date(year, 11, 25, 12).getTime());
};

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
  // Lifting milestones
  { id: 'volume_50k', name: 'Fifty Thousand', description: 'Lift 50,000 lb in total', icon: 'weight' },
  { id: 'volume_100k', name: 'Six Figures', description: 'Lift 100,000 lb in total', icon: 'weight' },
  { id: 'volume_250k', name: 'Quarter Million', description: 'Lift 250,000 lb in total', icon: 'gem' },
  { id: 'volume_500k', name: 'Half a Million', description: 'Lift 500,000 lb in total', icon: 'gem' },
  { id: 'prs_5', name: 'Record Setter', description: 'Set 5 all-time PRs', icon: 'target' },
  { id: 'prs_10', name: 'PR Machine', description: 'Set 10 all-time PRs', icon: 'target' },
  { id: 'prs_25', name: 'Always Improving', description: 'Set 25 all-time PRs', icon: 'award' },
  // Consistency
  { id: 'perfect_week', name: 'Perfect Week', description: 'Finish all 4 workouts in one week', icon: 'calendar-check' },
  { id: 'comeback', name: 'Comeback', description: 'Train again after 2 weeks away', icon: 'refresh' },
  { id: 'streak_12', name: 'Quarter Strong', description: 'Hit your weekly goal 12 weeks in a row', icon: 'flame' },
  { id: 'streak_24', name: 'Half-Year Habit', description: 'Hit your weekly goal 24 weeks in a row', icon: 'crown' },
  { id: 'early_bird', name: 'Early Bird', description: 'Start a workout before 7 am', icon: 'sunrise' },
  { id: 'night_owl', name: 'Night Owl', description: 'Finish a workout after 9 pm', icon: 'moon' },
  // Duo badges, earned together with your partner
  { id: 'duo_same_day', name: 'Gym Buddies', description: 'Train on the same day as your partner', icon: 'users' },
  { id: 'duo_both_goal', name: 'Team Goal', description: 'Both hit your weekly goal in the same week', icon: 'handshake' },
  { id: 'duo_streak', name: 'Dynamic Duo', description: 'Both on a 4-week streak at once', icon: 'zap' },
  // Awarded by the app when you reach the level (levelBadges in xp.ts), not from workout history.
  { id: 'the_battery', name: 'The Battery', description: 'Reach level 3', icon: 'battery' },
  // Seasonal: finish enough workouts in one season. Each also unlocks a matching flair.
  { id: 'season_winter', name: 'Winter Warrior', description: `Finish ${SEASON_TARGET} workouts in one winter (Dec to Feb)`, icon: 'snowflake' },
  { id: 'season_spring', name: 'Spring Bloom', description: `Finish ${SEASON_TARGET} workouts in one spring (Mar to May)`, icon: 'flower' },
  { id: 'season_summer', name: 'Summer Shredder', description: `Finish ${SEASON_TARGET} workouts in one summer (Jun to Aug)`, icon: 'sun' },
  { id: 'season_fall', name: 'Fall Grinder', description: `Finish ${SEASON_TARGET} workouts in one fall (Sep to Nov)`, icon: 'leaf' },
  // Holidays: train during the holiday week. Each also unlocks a matching flair.
  { id: 'holiday_thanksgiving', name: 'Gobble Gains', description: 'Finish a workout during Thanksgiving week (Mon to Sun)', icon: 'drumstick' },
  { id: 'holiday_christmas', name: 'Merry Liftmas', description: 'Finish a workout during Christmas week (Mon to Sun)', icon: 'tree' },
];

export const DUO_BADGE_IDS = ['duo_same_day', 'duo_both_goal', 'duo_streak'];
const LB_PER_KG = 2.20462;

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
  const counted = history.filter(countsTowardStats);
  return new Map(counted.map((session) => [session.sessionId, computeHighlights(session, counted)]));
}

export const countResults = (results: SessionResult[], kind: SessionResult['kind']) =>
  results.filter((result) => result.kind === kind).length;

/** Headline for the completion summary. Never calls an improvement a personal best. */
export function summaryHeadline(results: SessionResult[], celebrate: boolean): string {
  if (!celebrate) return 'Partial workout saved';
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
  const goalMet = meetsGoal(weeklyCount, goal);

  let streakWeeks = goalMet ? 1 : 0;
  let cursor = new Date(thisWeek);
  for (;;) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    if (meetsGoal(counts.get(cursor.getTime()) ?? 0, goal)) streakWeeks += 1;
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
  // Badges recognise finished workouts only. Partial workouts count toward leaderboard stats but not here.
  const streak = computeStreak(completed, weeklyGoal, now).streakWeeks;
  const derived = deriveHighlights(all);
  const finishedIds = new Set(completed.map((s) => s.sessionId));
  const allTimePrs = (id: string) => countResults(derived.get(id)?.results ?? [], 'all_time_pr');
  const totalPrs = [...derived.keys()].filter((id) => finishedIds.has(id)).reduce((sum, id) => sum + allTimePrs(id), 0);
  const currentPrs = allTimePrs(current.sessionId);
  const earned: string[] = [];
  const volumeLb = completed.reduce((sum, session) => {
    const volume = derived.get(session.sessionId)?.totalVolume ?? 0;
    return sum + (session.settingsSnapshot.unit === 'kg' ? volume * LB_PER_KG : volume);
  }, 0);
  for (const n of [50, 100, 250, 500]) if (volumeLb >= n * 1000) earned.push(`volume_${n}k`);
  for (const n of [5, 10, 25]) if (totalPrs >= n) earned.push(`prs_${n}`);
  if ([...weeklyCounts(completed).values()].some((count) => count >= 4)) earned.push('perfect_week');
  const times = completed.map((s) => s.completedTime ?? s.startTime).sort((a, b) => a - b);
  if (times.some((time, i) => i > 0 && time - times[i - 1] >= 14 * 86_400_000)) earned.push('comeback');
  if (completed.some((s) => new Date(s.startTime).getHours() < 7)) earned.push('early_bird');
  if (completed.some((s) => new Date(s.completedTime ?? s.startTime).getHours() >= 21)) earned.push('night_owl');
  for (const n of [12, 24]) if (streak >= n) earned.push(`streak_${n}`);
  const perSeason = new Map<string, number>();
  for (const time of times) {
    const { season, year } = seasonOf(time);
    const key = `${season}-${year}`;
    perSeason.set(key, (perSeason.get(key) ?? 0) + 1);
  }
  for (const season of ['winter', 'spring', 'summer', 'fall'] as const) {
    if ([...perSeason].some(([key, count]) => key.startsWith(`${season}-`) && count >= SEASON_TARGET)) earned.push(`season_${season}`);
  }
  if (times.some(isThanksgivingWeek)) earned.push('holiday_thanksgiving');
  if (times.some(isChristmasWeek)) earned.push('holiday_christmas');
  if (total >= 1) earned.push('first_workout');
  for (const n of [5, 10, 25, 40]) if (total >= n) earned.push(`sessions_${n}`);
  if (totalPrs >= 1) earned.push('first_pr');
  if (currentPrs >= 3) earned.push('triple_pr');
  for (const n of [2, 4, 8]) if (streak >= n) earned.push(`streak_${n}`);
  if (isVerifiedCycleComplete(current, history)) earned.push('cycle_complete');
  return earned;
}

/** What the duo badges need to know about one person. */
export interface DuoSide {
  lastSessionAt: number | null;
  goalMet: boolean;
  streakWeeks: number;
}

/** Duo badges are earned together, so they are judged from your row and each partner's row on the board. */
export function evaluateDuoBadges(me: DuoSide, partners: DuoSide[]): string[] {
  const earned = new Set<string>();
  for (const partner of partners) {
    if (me.lastSessionAt !== null && partner.lastSessionAt !== null
      && new Date(me.lastSessionAt).toDateString() === new Date(partner.lastSessionAt).toDateString()) earned.add('duo_same_day');
    if (me.goalMet && partner.goalMet) earned.add('duo_both_goal');
    if (me.streakWeeks >= 4 && partner.streakWeeks >= 4) earned.add('duo_streak');
  }
  return [...earned];
}

export function newlyUnlocked(
  earned: string[],
  existing: UnlockedBadge[] | undefined,
  at = Date.now(),
): UnlockedBadge[] {
  const have = new Set((existing ?? []).map((b) => b.id));
  return earned.filter((id) => !have.has(id)).map((id) => ({ id, unlockedAt: at }));
}

