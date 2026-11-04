import type { LoadNotation } from '../types';

export const NOTATION_LABEL: Record<LoadNotation, string> = {
  barbell_total: 'total barbell load',
  per_dumbbell: 'per dumbbell',
  machine_stack: 'machine stack setting',
  cable_stack: 'cable stack setting',
  added_bodyweight: 'added bodyweight (0 = bodyweight only)',
  unspecified: 'notation not recorded',
};

/** Whether history for this notation only carries over to the same machine or setup. */
export const isSetupSpecific = (notation: LoadNotation | undefined): boolean => notation === 'machine_stack' || notation === 'cable_stack';

const BODYWEIGHT = new Set(['dips', 'push-ups', 'pull-ups', 'inverted-row']);

/**
 * How a load is entered for an exercise. Derived from the exercise, and written onto new sessions only:
 * logged history is never reinterpreted, so older sessions read as 'unspecified'.
 */
export function loadNotationFor(exerciseId: string, exerciseName: string): LoadNotation {
  const id = exerciseId.toLowerCase();
  const name = exerciseName.toLowerCase();
  if (BODYWEIGHT.has(id)) return 'added_bodyweight';
  if (/\bdb\b|dumbbell/.test(name) || /^db-|^one-arm-db|-db-/.test(id)) return 'per_dumbbell';
  if (/cable|face pull|pull ?down|pushdown|push down/.test(name)) return 'cable_stack';
  if (/machine|leg press|leg curl|leg extension|pec fl|pec deck|hip abduction|kickback|\bhack\b/.test(name)) return 'machine_stack';
  if (/split|lunge|goblet|step-?up/.test(name)) return 'unspecified';
  if (/squat|deadlift|\bbench\b|military|press|rack pull|ez bar|barbell|hip thrust/.test(name)) return 'barbell_total';
  return 'unspecified';
}
