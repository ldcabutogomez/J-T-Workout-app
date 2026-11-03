import type { WeightUnit } from '../types';

export interface TmProblem {
  /** `error` blocks saving; `warn` is shown but allowed, because an unusual number can be real. */
  level: 'error' | 'warn';
  message: string;
}

const LIMITS: Record<WeightUnit, { low: number; high: number }> = {
  lb: { low: 45, high: 1000 },
  kg: { low: 20, high: 450 },
};

/** What is wrong with a typed training max, or null. Empty is not a problem here: callers decide if it is required. */
export function tmProblem(value: number | '' | undefined, unit: WeightUnit): TmProblem | null {
  if (value === '' || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return { level: 'error', message: 'Enter a number.' };
  if (n <= 0) return { level: 'error', message: 'Must be more than zero.' };
  const { low, high } = LIMITS[unit];
  if (n > high * 1.5) return { level: 'error', message: `That is far above anything realistic (${high * 1.5} ${unit} max).` };
  if (n < low) return { level: 'warn', message: `That is lighter than an empty bar (about ${low} ${unit}). Double-check it.` };
  if (n > high) return { level: 'warn', message: 'That is very heavy. Double-check it.' };
  return null;
}
