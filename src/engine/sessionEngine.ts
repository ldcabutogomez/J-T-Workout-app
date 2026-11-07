import { stampFor } from './cycles';
import type {
  DayPrescription,
  LoggedExercise,
  LoggedSet,
  UserProfile,
  WorkoutSession,
} from '../types';
import { calculateSetLoad, getDayPrescription, normalizeWeight, resolveTrainingMax, roundLoad } from './jnt2Engine';
import { EXTRA_SLOT_PREFIX, EXTRA_TIER, isExtra, programExercises, requiredExercises } from './extras';
import { slug } from '../lib/slug';
import { countsTowardStats } from './sessionValidity';
import { suggestFromHistory, suggestRmLoadFor } from './suggestions';
import { loadNotationFor } from '../program/loadNotation';

function copy<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

export function missingTrainingMaxes(prescription: DayPrescription, profile: UserProfile): string[] {
  const missing = new Set<string>();
  for (const exercise of prescription.exercises) {
    for (const set of exercise.prescribedSets) {
      if (set.loadBasis.kind !== 'training_max' || set.loadBasis.variationId) continue; // a variation's loads stay unset until its TM is entered
      if (resolveTrainingMax(profile, set.loadBasis.key, set.loadBasis.block).value === null) {
        missing.add(`${set.loadBasis.block === 1 ? 'Block 1' : 'Block 2'} ${set.loadBasis.key.replace('_', ' ')} TM`);
      }
    }
  }
  return [...missing];
}

/**
 * Where the workbook leaves a weight to the lifter ("Find nRM" and accessory "?"), pre-fill an
 * editable suggestion: from the training max for T1 RM sets, from last time for everything else.
 */
function suggestedLoad(
  slot: DayPrescription['exercises'][number],
  set: DayPrescription['exercises'][number]['prescribedSets'][number],
  profile: UserProfile,
  history: WorkoutSession[],
): { load: number; source: 'tm' | 'history' } | null {
  if (set.type !== 'rm_target' && set.type !== 'test') return null;
  if (set.loadBasis.kind !== 'user_selected') return null;
  if (set.suggestFrom) {
    // A swapped main lift (Belted Squat for Back Squat) has its own history: use it when there is one.
    if (slot.swappedFrom) {
      const own = suggestFromHistory(slot.exerciseId, set.prescribedReps, history, profile.unit, profile.equipmentIncrement);
      if (own !== null) return { load: own, source: 'history' };
    }
    const load = suggestRmLoadFor(profile, set.suggestFrom, set.prescribedReps);
    return load === null ? null : { load, source: 'tm' };
  }
  const load = suggestFromHistory(slot.exerciseId, set.prescribedReps, history, profile.unit, profile.equipmentIncrement);
  // Only this exercise's own history counts. Nothing is converted from a different exercise.
  return load === null ? null : { load, source: 'history' };
}

export function createWorkoutSession(
  profile: UserProfile,
  prescription: DayPrescription,
  now = Date.now(),
  allowMissingTrainingMaxes = false,
  history: WorkoutSession[] = [],
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
    swappedFrom: slot.swappedFrom ? { ...slot.swappedFrom } : undefined,
    ...(slot.swapReview ? { swapReview: { ...slot.swapReview } } : {}),
    loadNotation: loadNotationFor(slot.exerciseId, slot.exerciseName),
    sets: slot.prescribedSets.map((set) => {
      const computed = calculateSetLoad(set, profile);
      const suggestion = computed === null ? suggestedLoad(slot, set, profile, history) : null;
      return {
        setId: `${slot.slotId}-s${set.setNumber}`,
        type: set.type,
        prescribedReps: set.prescribedReps,
        actualReps: null,
        load: computed ?? suggestion?.load ?? null,
        unit: profile.unit,
        rir: 2,
        isAmrap: set.isAmrap,
        completed: false,
        ...(suggestion ? { suggested: suggestion.source } : {}),
      };
    }),
  }));
  const preferred = profile.exerciseOrder?.[`W${prescription.week}D${prescription.dayNumber}`] ?? [];
  const rank = new Map(preferred.map((id, index) => [id, index]));
  exercises.sort((a, b) => (rank.get(a.slotId) ?? 10_000) - (rank.get(b.slotId) ?? 10_000));

  return {
    sessionId: `session-${profile.id}-w${prescription.week}-d${prescription.dayNumber}-${now}`,
    ...stampFor(profile),
    profileId: profile.id,
    week: prescription.week,
    day: prescription.dayNumber,
    startTime: now,
    updatedTime: now,
    timer: { accumulatedMs: 0, runningSince: now },
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
      exerciseSwaps: copy(profile.exerciseSwaps),
    },
    exercises,
  };
}

/**
 * Replaces the exercise in a slot with whatever the profile's swaps now say (or reverts it). Nothing logged is ever
 * relabeled: once any set in the slot is completed the swap is refused. Every unlogged load is cleared, including
 * values the lifter typed, because they belonged to the previous exercise; the new exercise is reseeded from its own history.
 */
export function swapExercise(session: WorkoutSession, slotId: string, profile: UserProfile, history: WorkoutSession[] = []): WorkoutSession {
  if (session.isEditingCompleted) throw new Error('Exercises cannot be swapped while editing a completed session.');
  const exercise = findExercise(session, slotId);
  if (exercise.sets.some((set) => set.completed)) {
    throw new Error(`Completed sets stay attached to ${exercise.exerciseName}. Undo them, or finish this workout, before replacing it.`);
  }
  const slot = getDayPrescription(session.week, session.day, profile).exercises.find((item) => item.slotId === slotId);
  if (!slot) throw new Error(`Unknown exercise slot: ${slotId}`);

  const next = copy(session);
  const logged = findExercise(next, slotId);
  logged.exerciseId = slot.exerciseId;
  logged.exerciseName = slot.exerciseName;
  logged.notes = slot.notes;
  logged.swappedFrom = slot.swappedFrom ? { ...slot.swappedFrom } : undefined;
  logged.swapReview = slot.swapReview ? { ...slot.swapReview } : undefined;
  logged.loadNotation = loadNotationFor(slot.exerciseId, slot.exerciseName);
  logged.loadBasis = slot.loadBasis ? copy(slot.loadBasis) : undefined;
  logged.targetRM = slot.repTarget ?? undefined;
  logged.manualBackoffLoad = undefined;
  logged.manualLoadDecisionPending = undefined;
  logged.rmMismatchWarning = undefined;
  logged.achievedRMWeight = undefined;
  logged.achievedRMReps = undefined;
  for (const set of logged.sets) {
    const prescribed = slot.prescribedSets.find((item) => `${slot.slotId}-s${item.setNumber}` === set.setId);
    if (!prescribed) continue;
    set.prescribedReps = prescribed.prescribedReps;
    set.userLoadOverride = undefined;
    const computed = calculateSetLoad(prescribed, profile);
    const suggestion = computed === null ? suggestedLoad(slot, prescribed, profile, history) : null;
    set.load = computed ?? suggestion?.load ?? null;
    set.suggested = suggestion?.source;
  }
  const snapshot = next.prescriptionSnapshot.exercises.find((item) => item.slotId === slotId);
  if (snapshot) Object.assign(snapshot, copy(slot));
  next.settingsSnapshot.exerciseSwaps = copy(profile.exerciseSwaps);
  next.updatedTime = Date.now();
  return next;
}

/** Starts the slot's unlogged sets blank, for when the equipment changes and old loads no longer apply. */
export function clearSuggestedLoads(session: WorkoutSession, slotId: string): WorkoutSession {
  const next = copy(session);
  const exercise = findExercise(next, slotId);
  for (const set of exercise.sets) {
    if (set.completed) continue;
    set.load = null;
    set.suggested = undefined;
    set.userLoadOverride = undefined;
  }
  next.updatedTime = Date.now();
  return next;
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
  set.suggested = undefined;
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
  // Extras are optional by definition: an unlogged extra set never makes a finished workout partial.
  return requiredExercises(session).every((exercise) =>
    !exercise.manualLoadDecisionPending && exercise.sets.every((set) => set.completed),
  );
}

export function finalizeSession(session: WorkoutSession, now = Date.now()): WorkoutSession {
  const next = copy(session);
  const complete = allRequiredSetsLogged(next);
  // Nothing half-empty is saved: unlogged extra sets go, and so does an extra with no logged set.
  if (session.workoutKind !== 'custom') {
    next.exercises = next.exercises
      .map((exercise) => (isExtra(exercise) ? { ...exercise, sets: exercise.sets.filter((set) => set.completed) } : exercise))
      .filter((exercise) => !isExtra(exercise) || exercise.sets.length > 0);
  }
  // Editing history must not move the session into the present (week goal, PR chronology).
  next.completedTime = session.isEditingCompleted && session.completedTime ? session.completedTime : now;
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

export const NOTE_MAX = 500;

/** A note as it is stored: control characters removed (so pasted text can't break the layout) and capped at NOTE_MAX. */
export function cleanNote(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, NOTE_MAX);
}

/** Sets or clears the lifter's note on one exercise. An empty or all-space note removes the field. */
export function setExerciseNote(session: WorkoutSession, slotId: string, text: string, now = Date.now()): WorkoutSession {
  findExercise(session, slotId);
  const note = cleanNote(text);
  return {
    ...session,
    updatedTime: now,
    exercises: session.exercises.map((exercise) => {
      if (exercise.slotId !== slotId) return exercise;
      const { userNote: _old, ...rest } = exercise;
      return note.trim() ? { ...rest, userNote: note } : rest;
    }),
  };
}

/** Sets or clears the note for the whole workout. */
export function setSessionNote(session: WorkoutSession, text: string, now = Date.now()): WorkoutSession {
  const note = cleanNote(text);
  const { note: _old, ...rest } = session;
  return note.trim() ? { ...rest, note, updatedTime: now } : { ...rest, updatedTime: now };
}

export const EXTRA_NAME_MIN = 2;
export const EXTRA_NAME_MAX = 40;
const EXTRA_DEFAULT_REPS = 10;

/** An exercise name as it is stored: control characters and angle brackets removed, spaces tidied, capped. */
export function cleanExerciseName(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, EXTRA_NAME_MAX);
}

/** The most recent load and reps logged for an extra with this id, in `unit`, or null when it has no history. */
export function lastExtraSet(history: WorkoutSession[], exerciseId: string, unit: 'lb' | 'kg'): { load: number; reps: number } | null {
  const recent = history
    .filter((session) => countsTowardStats(session))
    .sort((a, b) => (b.completedTime ?? b.startTime) - (a.completedTime ?? a.startTime));
  for (const session of recent) {
    for (const exercise of session.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      const logged = [...exercise.sets].reverse().find((set) => set.completed && set.load !== null && set.load > 0 && set.actualReps !== null && set.actualReps > 0);
      if (logged && logged.load !== null && logged.actualReps !== null) {
        return { load: Math.round(normalizeWeight(logged.load, logged.unit, unit) * 100) / 100, reps: logged.actualReps };
      }
    }
  }
  return null;
}

function blankExtraSet(exercise: LoggedExercise, number: number, unit: 'lb' | 'kg', load: number | null, reps: number): LoggedSet {
  return {
    setId: `${exercise.slotId}-s${number}`,
    type: 'straight',
    prescribedReps: reps,
    actualReps: null,
    load,
    unit,
    rir: 2,
    completed: false,
  };
}

/**
 * Adds an exercise the program doesn't prescribe, with one blank set. The load starts at the last one logged for
 * the same exercise, if any. The name's slug is its id, so "Hip Abduction" typed here shares history with the same
 * exercise anywhere else in the app.
 */
export function addExtraExercise(session: WorkoutSession, name: string, history: WorkoutSession[] = [], now = Date.now()): WorkoutSession {
  const cleaned = cleanExerciseName(name);
  if (cleaned.length < EXTRA_NAME_MIN) throw new Error(`Give the exercise a name (at least ${EXTRA_NAME_MIN} characters).`);
  const exerciseId = slug(cleaned);
  if (!exerciseId) throw new Error('That name needs some letters or numbers.');
  if (session.exercises.some((exercise) => exercise.exerciseId === exerciseId)) throw new Error(`${cleaned} is already in this workout.`);
  const slotId = `${EXTRA_SLOT_PREFIX}${exerciseId}`;
  if (session.exercises.some((exercise) => exercise.slotId === slotId)) throw new Error(`${cleaned} is already in this workout.`);
  const unit = session.settingsSnapshot.unit;
  const last = lastExtraSet(history, exerciseId, unit);
  const exercise: LoggedExercise = {
    isExtra: true,
    slotId,
    exerciseId,
    tier: EXTRA_TIER,
    exerciseName: cleaned,
    status: 'work',
    sets: [],
    sourceRefs: [],
    loadNotation: loadNotationFor(exerciseId, cleaned),
  };
  exercise.sets = [blankExtraSet(exercise, 1, unit, last?.load ?? null, last?.reps ?? EXTRA_DEFAULT_REPS)];
  return { ...session, updatedTime: now, exercises: [...session.exercises, exercise] };
}

function findExtra(session: WorkoutSession, slotId: string): LoggedExercise {
  const exercise = findExercise(session, slotId);
  if (!isExtra(exercise)) throw new Error('Only exercises you added yourself can be changed this way.');
  return exercise;
}

/** Adds another blank set to an extra, starting from the previous set's load and reps. */
export function addExtraSet(session: WorkoutSession, slotId: string, now = Date.now()): WorkoutSession {
  const extra = findExtra(session, slotId);
  const previous = extra.sets[extra.sets.length - 1];
  const number = extra.sets.reduce((highest, set) => Math.max(highest, Number(set.setId.split('-s').pop()) || 0), 0) + 1;
  const next = blankExtraSet(extra, number, previous?.unit ?? session.settingsSnapshot.unit, previous?.load ?? null, previous?.actualReps ?? previous?.prescribedReps ?? EXTRA_DEFAULT_REPS);
  return {
    ...session,
    updatedTime: now,
    exercises: session.exercises.map((exercise) => (exercise.slotId === slotId ? { ...exercise, sets: [...exercise.sets, next] } : exercise)),
  };
}

/** Removes a set that hasn't been logged. A logged set is undone first, so a result is never deleted by accident. */
export function removeExtraSet(session: WorkoutSession, slotId: string, setId: string, now = Date.now()): WorkoutSession {
  const extra = findExtra(session, slotId);
  const set = extra.sets.find((item) => item.setId === setId);
  if (!set) throw new Error(`Unknown set: ${setId}`);
  if (set.completed) throw new Error('Undo this set before removing it.');
  return {
    ...session,
    updatedTime: now,
    exercises: session.exercises.map((exercise) => (exercise.slotId === slotId ? { ...exercise, sets: exercise.sets.filter((item) => item.setId !== setId) } : exercise)),
  };
}

/** Removes an added exercise. Refused while any of its sets is logged. */
export function removeExtraExercise(session: WorkoutSession, slotId: string, now = Date.now()): WorkoutSession {
  const extra = findExtra(session, slotId);
  if (extra.sets.some((set) => set.completed)) throw new Error('Undo its logged sets before removing this exercise.');
  return { ...session, updatedTime: now, exercises: session.exercises.filter((exercise) => exercise.slotId !== slotId) };
}
