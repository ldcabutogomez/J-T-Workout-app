import type {
  DayPrescription,
  LoggedExercise,
  LoggedSet,
  UserProfile,
  WorkoutSession,
} from '../types';
import { calculateSetLoad, roundLoad } from './jnt2Engine';

function copy<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

export function missingTrainingMaxes(prescription: DayPrescription, profile: UserProfile): string[] {
  const missing = new Set<string>();
  for (const exercise of prescription.exercises) {
    for (const set of exercise.prescribedSets) {
      if (set.loadBasis.kind !== 'training_max') continue;
      const values = set.loadBasis.block === 1 ? profile.trainingMaxes : profile.block2ConfirmedTMs;
      const value = values?.[set.loadBasis.key];
      if (!Number.isFinite(value) || (value ?? 0) <= 0) {
        missing.add(`${set.loadBasis.block === 1 ? 'Block 1' : 'Block 2'} ${set.loadBasis.key.replace('_', ' ')} TM`);
      }
    }
  }
  return [...missing];
}

export function createWorkoutSession(
  profile: UserProfile,
  prescription: DayPrescription,
  now = Date.now(),
  allowMissingTrainingMaxes = false,
): WorkoutSession {
  const missing = missingTrainingMaxes(prescription, profile);
  if (missing.length && !allowMissingTrainingMaxes) throw new Error(`Set up ${missing.join(', ')} before starting this session.`);

  const exercises: LoggedExercise[] = prescription.exercises.map((slot) => ({
    slotId: slot.slotId,
    exerciseId: slot.exerciseId,
    tier: slot.tier,
    exerciseName: slot.exerciseName,
    status: slot.status,
    targetRM: slot.repTarget ?? undefined,
    notes: slot.notes,
    sourceRefs: copy(slot.sourceRefs),
    loadBasis: slot.loadBasis ? copy(slot.loadBasis) : undefined,
    sets: slot.prescribedSets.map((set) => ({
      setId: `${slot.slotId}-s${set.setNumber}`,
      type: set.type,
      prescribedReps: set.prescribedReps,
      actualReps: null,
      load: calculateSetLoad(set, profile),
      unit: profile.unit,
      rir: 2,
      isAmrap: set.isAmrap,
      completed: false,
    })),
  }));

  return {
    sessionId: `session-${profile.id}-w${prescription.week}-d${prescription.dayNumber}-${now}`,
    profileId: profile.id,
    week: prescription.week,
    day: prescription.dayNumber,
    startTime: now,
    updatedTime: now,
    status: 'active',
    isPartial: false,
    isSkipped: false,
    prescriptionSnapshot: copy(prescription),
    settingsSnapshot: {
      unit: profile.unit,
      equipmentIncrement: profile.equipmentIncrement,
      barbellWeight: profile.barbellWeight,
      trainingMaxes: copy(profile.trainingMaxes),
      block2ConfirmedTMs: copy(profile.block2ConfirmedTMs),
      exerciseCustomizations: copy(profile.exerciseCustomizations),
    },
    exercises,
  };
}

function findExercise(session: WorkoutSession, slotId: string): LoggedExercise {
  const exercise = session.exercises.find((item) => item.slotId === slotId);
  if (!exercise) throw new Error(`Unknown exercise slot: ${slotId}`);
  return exercise;
}

function findSet(exercise: LoggedExercise, setId: string): LoggedSet {
  const set = exercise.sets.find((item) => item.setId === setId);
  if (!set) throw new Error(`Unknown set: ${setId}`);
  return set;
}

function backoffPercentage(session: WorkoutSession, slotId: string): number | undefined {
  return session.prescriptionSnapshot.exercises
    .find((item) => item.slotId === slotId)
    ?.prescribedSets.find((item) => item.loadBasis.kind === 'achieved_rm')?.percentage;
}

export function logSet(
  session: WorkoutSession,
  slotId: string,
  setId: string,
  actualReps: number,
  load: number,
  rir: number,
  now = Date.now(),
  amrapDeclined = false,
): WorkoutSession {
  if (!Number.isInteger(actualReps) || actualReps < 0) throw new RangeError('Actual reps must be a non-negative integer.');
  if (!Number.isFinite(load) || load < 0) throw new RangeError('Load must be a non-negative number.');
  const next = copy(session);
  const exercise = findExercise(next, slotId);
  const set = findSet(exercise, setId);
  const priorLoad = set.load;
  set.actualReps = actualReps;
  set.load = load;
  set.rir = rir;
  set.completed = true;
  set.timestamp = now;
  set.amrapDeclined = amrapDeclined || undefined;
  set.userLoadOverride = priorLoad !== null && Math.abs(priorLoad - load) > 1e-9 ? true : set.userLoadOverride;

  if (set.type === 'rm_target' || set.type === 'test') {
    exercise.achievedRMWeight = load;
    exercise.achievedRMReps = actualReps;
    const percentage = backoffPercentage(next, slotId);
    if (percentage) {
      const mismatch = actualReps !== set.prescribedReps;
      exercise.manualLoadDecisionPending = mismatch;
      exercise.rmMismatchWarning = mismatch
        ? `Target was ${set.prescribedReps} reps; ${actualReps} were logged. Choose the back-off load explicitly.`
        : undefined;
      for (const followup of exercise.sets.filter((item) => item.type === 'backoff' && !item.completed)) {
        if (followup.userLoadOverride) continue;
        followup.load = mismatch
          ? null
          : roundLoad(load * percentage, next.settingsSnapshot.equipmentIncrement);
      }
    }
    for (const followup of exercise.sets.filter((item) => item.type === 'mrs' && !item.completed)) {
      if (!followup.userLoadOverride) followup.load = load;
    }
  }

  next.updatedTime = now;
  return next;
}

export function chooseBackoffLoad(
  session: WorkoutSession,
  slotId: string,
  load: number,
  now = Date.now(),
): WorkoutSession {
  if (!Number.isFinite(load) || load <= 0) throw new RangeError('Back-off load must be greater than zero.');
  const next = copy(session);
  const exercise = findExercise(next, slotId);
  exercise.manualBackoffLoad = load;
  exercise.manualLoadDecisionPending = false;
  for (const set of exercise.sets.filter((item) => item.type === 'backoff' && !item.completed)) {
    set.load = load;
    set.userLoadOverride = true;
  }
  next.updatedTime = now;
  return next;
}

export function undoSet(
  session: WorkoutSession,
  slotId: string,
  setId: string,
  now = Date.now(),
): WorkoutSession {
  const next = copy(session);
  const exercise = findExercise(next, slotId);
  const set = findSet(exercise, setId);
  set.completed = false;
  set.actualReps = null;
  set.timestamp = undefined;
  set.amrapDeclined = undefined;
  if (set.type === 'rm_target' || set.type === 'test') {
    set.load = null;
    exercise.achievedRMWeight = undefined;
    exercise.achievedRMReps = undefined;
    exercise.rmMismatchWarning = undefined;
    exercise.manualLoadDecisionPending = exercise.sets.some((item) => item.type === 'backoff');
    exercise.manualBackoffLoad = undefined;
    for (const followup of exercise.sets.filter((item) => !item.completed && (item.type === 'backoff' || item.type === 'mrs'))) {
      if (!followup.userLoadOverride) followup.load = null;
    }
  }
  next.updatedTime = now;
  return next;
}

export function allRequiredSetsLogged(session: WorkoutSession): boolean {
  return session.exercises.every((exercise) =>
    !exercise.manualLoadDecisionPending && exercise.sets.every((set) => set.completed),
  );
}

export function finalizeSession(session: WorkoutSession, now = Date.now()): WorkoutSession {
  const next = copy(session);
  const complete = allRequiredSetsLogged(next);
  next.completedTime = now;
  next.updatedTime = now;
  next.status = complete ? 'completed' : 'partial';
  next.isPartial = !complete;
  next.isSkipped = false;
  return next;
}

export function makeSkippedSession(
  profile: UserProfile,
  prescription: DayPrescription,
  now = Date.now(),
): WorkoutSession {
  const session = createWorkoutSession(profile, prescription, now, true);
  session.completedTime = now;
  session.updatedTime = now;
  session.status = 'skipped';
  session.isSkipped = true;
  session.isPartial = false;
  return session;
}

export function nextProgramPosition(profile: UserProfile): Pick<UserProfile, 'currentWeek' | 'currentDay' | 'cycleCompleted'> {
  if (profile.cycleCompleted) return { currentWeek: 12, currentDay: 4, cycleCompleted: true };
  if (profile.currentWeek === 12 && profile.currentDay === 4) {
    return { currentWeek: 12, currentDay: 4, cycleCompleted: true };
  }
  if (profile.currentDay === 4) {
    return { currentWeek: profile.currentWeek + 1, currentDay: 1, cycleCompleted: false };
  }
  return { currentWeek: profile.currentWeek, currentDay: profile.currentDay + 1, cycleCompleted: false };
}
