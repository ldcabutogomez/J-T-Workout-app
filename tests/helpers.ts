import type { UserProfile, WorkoutSession } from '../src/types';
import { createWorkoutSession, finalizeSession, logSet } from '../src/engine/sessionEngine';
import { getDayPrescription } from '../src/program/prescriptions';

export function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1', name: 'Test Lifter', unit: 'lb', equipmentIncrement: 5, barbellWeight: 45,
    tone: 'minimal', currentWeek: 1, currentDay: 1,
    trainingMaxes: { squat: 200, bench: 180, deadlift: 300, ohp: 120, front_squat: 160 },
    block2ConfirmedTMs: { squat: 210, bench: 190, deadlift: 320, ohp: 125, front_squat: 170 },
    ...overrides,
  };
}

export function completeSession(p = profile(), week = p.currentWeek, day = p.currentDay, now = 1_000): WorkoutSession {
  let session = createWorkoutSession(p, getDayPrescription(week, day, p), now);
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      const current = session.exercises.find((item) => item.slotId === exercise.slotId)!.sets.find((item) => item.setId === set.setId)!;
      const load = current.load ?? 100;
      session = logSet(session, exercise.slotId, set.setId, set.prescribedReps, load, 2, now + 1);
    }
  }
  return finalizeSession(session, now + 2);
}
