import type { WorkoutSession } from '../types';
import { meetsGoal, weekStart, weeklyCounts } from './sessionValidity';

export interface BatteryDebuff {
  active: boolean;
  /** Timestamp the debuff ends (start of next Monday), when active. */
  until: number | null;
  /** Credit logged in the week that was missed, for the explanation. */
  missedCount: number;
}

const NONE: BatteryDebuff = { active: false, until: null, missedCount: 0 };

const shiftWeeks = (week: number, weeks: number): number => {
  const d = new Date(week);
  d.setDate(d.getDate() + 7 * weeks);
  return d.getTime();
};

/**
 * Miss last week's session goal and you wear The Battery for this whole week. It is derived from history,
 * never stored, so it clears by itself on Monday. Nobody is punished for the week they started in or earlier.
 */
export function batteryDebuff(history: WorkoutSession[], goal: number, now: number = Date.now()): BatteryDebuff {
  const counts = weeklyCounts(history);
  const thisWeek = weekStart(now);
  const lastWeek = shiftWeeks(thisWeek, -1);
  const firstWeek = Math.min(...counts.keys());
  if (counts.size === 0 || firstWeek >= lastWeek) return NONE;
  const missedCount = counts.get(lastWeek) ?? 0;
  if (meetsGoal(missedCount, goal)) return NONE;
  return { active: true, until: shiftWeeks(thisWeek, 1), missedCount };
}
