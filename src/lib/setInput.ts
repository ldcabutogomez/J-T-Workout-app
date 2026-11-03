/**
 * What is wrong with the reps and load typed into a set, in words, or null when they can be logged.
 * The engine rejects the same things with a RangeError; checking here puts the reason next to the field
 * instead of in a banner that disappears (and sits off-screen on a scrolled workout).
 */
export function setInputProblem(load: number | '', reps: number | ''): string | null {
  if (reps !== '') {
    const n = Number(reps);
    if (!Number.isFinite(n)) return 'Reps must be a number.';
    if (!Number.isInteger(n)) return 'Reps must be a whole number.';
    if (n < 0) return "Reps can't be negative.";
  }
  if (load !== '') {
    const n = Number(load);
    if (!Number.isFinite(n)) return 'Load must be a number.';
    if (n < 0) return "Load can't be negative.";
  }
  return null;
}
