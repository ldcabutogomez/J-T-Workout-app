import { roundLoad } from './jnt2Engine';

export interface WarmupStep {
  /** Stable per scheme position, so ticked steps survive the ramp being recalculated. */
  id: string;
  label: string;
  reps: number;
  load: number;
}

interface SchemeStep { pct: number; reps: number }

// pct 0 means the empty bar. The workbook has no warm-ups; these are an app addition.
const STANDARD: SchemeStep[] = [{ pct: 0, reps: 10 }, { pct: 0.4, reps: 5 }, { pct: 0.6, reps: 3 }, { pct: 0.8, reps: 2 }];
const HEAVY: SchemeStep[] = [{ pct: 0.4, reps: 5 }, { pct: 0.6, reps: 3 }, { pct: 0.75, reps: 2 }, { pct: 0.9, reps: 1 }];

interface WarmupInput {
  /** Load of the day's heaviest planned set (the lifter's RM set); null if not known yet. */
  topLoad: number | null;
  topReps: number;
  barbell: number;
  increment: number;
}

/** Ramp to the heaviest set: standard for rep work, heavier singles/doubles for 1-3 rep days and tests. */
export function warmupSets({ topLoad, topReps, barbell, increment }: WarmupInput): WarmupStep[] {
  if (topLoad === null || !(topLoad > 0)) {
    return barbell > 0 ? [{ id: 'w1', label: 'Bar', reps: 10, load: barbell }] : [];
  }
  if (topLoad <= barbell) return [];
  const scheme = topReps <= 3 ? HEAVY : STANDARD;
  const seen = new Set<number>();
  const steps: WarmupStep[] = [];
  scheme.forEach((step, index) => {
    const load = step.pct === 0 ? barbell : Math.max(barbell, roundLoad(topLoad * step.pct, increment));
    if (load >= topLoad || seen.has(load)) return;
    seen.add(load);
    steps.push({ id: `w${index + 1}`, label: load === barbell ? 'Bar' : `${Math.round(step.pct * 100)}%`, reps: step.reps, load });
  });
  return steps;
}
