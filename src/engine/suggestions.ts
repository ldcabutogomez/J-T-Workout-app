import type { ProgramSetPrescription, TrainingMaxKey, UserProfile, WeightUnit, WorkoutSession } from '../types';
import { normalizeWeight, resolveTrainingMax, roundLoad } from './jnt2Engine';

/** Epley estimate: the load you could lift for `reps`, given a one-rep max. */
const loadForReps = (oneRm: number, reps: number) => oneRm / (1 + reps / 30);

/**
 * Starting load for a lifter-chosen "Find nRM" set. The workbook defines a training max as an estimated
 * daily 2RM, so estimate the 1RM from it and scale to the target reps. Approximate by design: the
 * lifter edits it, and it never replaces the workbook's own percentage formulas.
 */
export function suggestRmLoad(trainingMax: number, targetReps: number, increment: number): number {
  const oneRm = trainingMax * (1 + 2 / 30);
  return roundLoad(loadForReps(oneRm, Math.max(1, targetReps)), increment);
}

export function suggestRmLoadFor(
  profile: UserProfile,
  suggestFrom: NonNullable<ProgramSetPrescription['suggestFrom']>,
  targetReps: number,
): number | null {
  const { value } = resolveTrainingMax(profile, suggestFrom.key as TrainingMaxKey, suggestFrom.block);
  return value === null ? null : suggestRmLoad(value, targetReps, profile.equipmentIncrement);
}

/** Sessions that carry real logged work (finished or partial), newest first. */
function usableHistory(history: WorkoutSession[], excludeSessionId?: string): WorkoutSession[] {
  return history
    .filter((s) => s.sessionId !== excludeSessionId
      && (s.status === 'completed' || s.status === 'partial')
      && !s.isSkipped && !s.isDemo)
    .sort((a, b) => (b.completedTime ?? b.startTime) - (a.completedTime ?? a.startTime));
}

/**
 * Starting load for an exercise the workbook leaves to the lifter: the most recent logged top set for
 * that exercise, rescaled to today's rep target. Null the first time the exercise appears.
 */
export function suggestFromHistory(
  exerciseId: string,
  targetReps: number,
  history: WorkoutSession[],
  unit: WeightUnit,
  increment: number,
): number | null {
  for (const session of usableHistory(history)) {
    for (const exercise of session.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      const top = exercise.sets.find((set) => set.completed
        && (set.type === 'rm_target' || set.type === 'test')
        && set.load !== null && set.actualReps !== null && set.actualReps > 0 && set.load > 0);
      if (!top || top.load === null || top.actualReps === null) continue;
      const load = normalizeWeight(top.load, top.unit, unit);
      const oneRm = load * (1 + top.actualReps / 30);
      return roundLoad(loadForReps(oneRm, Math.max(1, targetReps)), increment);
    }
  }
  return null;
}
