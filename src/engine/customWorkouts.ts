import type { CustomWorkoutTemplate, LoggedExercise, LoggedSet, UserProfile, WorkoutSession } from '../types';
import { getDayPrescription } from './jnt2Engine';
import { loadNotationFor } from '../program/loadNotation';
import { stampFor } from './cycles';

const copy = <T,>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

export function newCustomTemplate(now = Date.now()): CustomWorkoutTemplate {
  return { id: `custom-template-${now}`, name: 'My workout', exercises: [], createdAt: now, updatedAt: now };
}

export function createCustomWorkoutSession(profile: UserProfile, template: CustomWorkoutTemplate, now = Date.now()): WorkoutSession {
  if (!template.exercises.length) throw new Error('Add at least one exercise before starting this custom workout.');
  const exercises: LoggedExercise[] = template.exercises.map((exercise, exerciseIndex) => {
    const sets: LoggedSet[] = exercise.sets.flatMap((set, setIndex) => {
      const count = set.mode === 'drop' ? Math.max(2, Math.min(5, set.stages ?? 2)) : 1;
      return Array.from({ length: count }, (_, stage) => ({
        setId: `${exercise.id}-g${setIndex + 1}-s${stage + 1}`,
        type: 'straight' as const,
        prescribedReps: set.mode === 'failure' ? 0 : set.reps,
        actualReps: null,
        load: null,
        unit: profile.unit,
        rir: set.mode === 'failure' ? 0 : 2,
        completed: false,
        customMode: set.mode,
        ...(set.mode === 'drop' ? { dropGroupId: set.id, dropStage: stage } : {}),
      }));
    });
    return {
      isExtra: true,
      slotId: `custom-${exerciseIndex}-${exercise.id}`,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      tier: 'T3d',
      status: 'work',
      sourceRefs: [],
      loadNotation: loadNotationFor(exercise.exerciseId, exercise.name),
      sets,
    };
  });
  const placeholder = getDayPrescription(1, 1, profile);
  return {
    sessionId: `custom-session-${profile.id}-${now}`,
    ...stampFor(profile),
    workoutKind: 'custom', customName: template.name, customTemplateId: template.id,
    profileId: profile.id, week: 1, day: 1, startTime: now, updatedTime: now,
    timer: { accumulatedMs: 0, runningSince: now }, status: 'active', isPartial: false, isSkipped: false,
    prescriptionSnapshot: copy(placeholder),
    settingsSnapshot: {
      unit: profile.unit, equipmentIncrement: profile.equipmentIncrement, barbellWeight: profile.barbellWeight,
      trainingMaxes: copy(profile.trainingMaxes), block2ConfirmedTMs: copy(profile.block2ConfirmedTMs),
      exerciseCustomizations: copy(profile.exerciseCustomizations), exerciseSwaps: copy(profile.exerciseSwaps),
    },
    exercises,
  };
}
