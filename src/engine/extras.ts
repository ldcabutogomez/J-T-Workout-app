import type { LoggedExercise, LoggedSet, WorkoutSession } from '../types';

/**
 * An extra is an exercise the lifter adds to a workout on their own ("a la carte"): it lives only in
 * `session.exercises`, never in the prescription snapshot, and it never changes whether the workout counts as
 * finished or how much weekly credit it earns.
 */
export const EXTRA_SLOT_PREFIX = 'extra-';
export const EXTRA_TIER = 'T3d' as const;

export const isExtra = (exercise: Pick<LoggedExercise, 'isExtra'>): boolean => exercise.isExtra === true;

/** The program's own exercises: everything that decides completion, credit and progress. */
export const programExercises = (session: Pick<WorkoutSession, 'exercises'>): LoggedExercise[] =>
  session.exercises.filter((exercise) => !isExtra(exercise));

/**
 * The set that stands for an exercise in PRs, "last time" and records. A program lift uses its first logged
 * RM or test set, as always. An extra has only straight sets, so its heaviest logged set stands for it (ties go
 * to more reps). `usable` is the caller's own test of a logged set (completed, reps and load present, ...).
 */
export function findTopSet(exercise: LoggedExercise, usable: (set: LoggedSet) => boolean): LoggedSet | undefined {
  const candidates = exercise.sets.filter(usable);
  if (!isExtra(exercise)) return candidates.find((set) => set.type === 'rm_target' || set.type === 'test');
  return candidates
    .filter((set) => set.type === 'straight')
    .sort((a, b) => (b.load ?? 0) - (a.load ?? 0) || (b.actualReps ?? 0) - (a.actualReps ?? 0))[0];
}
