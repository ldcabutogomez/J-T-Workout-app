import type { UserProfile, WorkoutSession } from '../types';
import { countResults, deriveHighlights } from './achievements';
import { countsTowardStats, validCompleted, weeklyCounts, meetsGoal } from './sessionValidity';

export const XP_PER_SET = 10;
export const XP_PER_WORKOUT = 50;
export const XP_PER_PR = 100;
export const XP_PER_GOAL_WEEK = 50;
export const XP_PER_BADGE = 75;

/** Total XP needed to reach `level`: 100, 300, 600, 1000 ... for levels 2, 3, 4, 5. */
export const xpForLevel = (level: number): number => (level <= 1 ? 0 : 50 * (level - 1) * level);

const TITLES = ['Rookie', 'Regular', 'Grinder', 'Lifter', 'Iron Hand', 'Veteran', 'Powerhouse', 'Legend'];
export const levelTitle = (level: number): string => TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))];

export interface LevelInfo {
  xp: number;
  level: number;
  title: string;
  /** XP earned inside the current level, and what the level needs in all. */
  into: number;
  span: number;
  pct: number;
}

export function levelFromXp(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= safe) level += 1;
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const into = safe - floor;
  return { xp: safe, level, title: levelTitle(level), into, span, pct: Math.round((into / span) * 100) };
}

/**
 * XP is derived from history and badges on read, never stored, so it can't drift: edits, undo and imports
 * all stay consistent. Sets and PRs count for partial workouts too; the workout and weekly bonuses need a finished one.
 */
export function computeXp(history: WorkoutSession[], profile: Pick<UserProfile, 'weeklyGoalSessions' | 'unlockedBadges'>): number {
  const counted = history.filter(countsTowardStats);
  const derived = deriveHighlights(history);
  let xp = 0;
  for (const session of counted) {
    const highlights = derived.get(session.sessionId);
    xp += (highlights?.setsCompleted ?? 0) * XP_PER_SET;
    xp += countResults(highlights?.results ?? [], 'all_time_pr') * XP_PER_PR;
    if (validCompleted(session)) xp += XP_PER_WORKOUT;
  }
  const goal = Math.max(1, profile.weeklyGoalSessions ?? 4);
  for (const count of weeklyCounts(counted).values()) if (meetsGoal(count, goal)) xp += XP_PER_GOAL_WEEK;
  xp += (profile.unlockedBadges?.length ?? 0) * XP_PER_BADGE;
  return xp;
}

export const levelFor = (history: WorkoutSession[], profile: Pick<UserProfile, 'weeklyGoalSessions' | 'unlockedBadges'>): LevelInfo =>
  levelFromXp(computeXp(history, profile));

export const BATTERY_LEVEL = 3;

/** Badges that are earned by reaching a level rather than from workout history. */
export const levelBadges = (level: number): string[] => (level >= BATTERY_LEVEL ? ['the_battery'] : []);
