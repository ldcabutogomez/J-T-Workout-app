import type { WorkoutSession } from '../types';

export const MUSCLE_GROUPS = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'traps', 'lats', 'upper_back',
  'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'spinal_erectors', 'glutes',
  'hip_abductors', 'hip_adductors', 'quads', 'hamstrings', 'calves',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
/** How hard a muscle was worked relative to the hardest-worked muscle in that workout: a whole number from 1 to 100. */
export type MuscleIntensity = number;
export type MuscleIntensityMap = Partial<Record<MuscleGroup, MuscleIntensity>>;

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  traps: 'Traps',
  lats: 'Lats',
  upper_back: 'Upper back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  spinal_erectors: 'Spinal erectors',
  glutes: 'Glutes',
  hip_abductors: 'Hip abductors',
  hip_adductors: 'Hip adductors',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export interface ExerciseMuscles {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

const catalog: Record<string, ExerciseMuscles> = {};
const define = (ids: string[], primary: MuscleGroup[], secondary: MuscleGroup[] = []) => {
  for (const id of ids) catalog[id] = { primary, secondary };
};

// Horizontal presses and chest isolation.
define(['bench-press', 'pause-bench-press', 'spoto-press', 'floor-press', 'sling-shot-bench', 'legs-up-bench', 'db-bench-press', 'cable-chest-press', 'push-ups'], ['chest', 'triceps'], ['front_delts']);
define(['close-grip-bench', 'dips'], ['triceps', 'chest'], ['front_delts']);
define(['incline-bench', 'incline-db-press'], ['chest', 'front_delts'], ['triceps']);
define(['pec-flye', 'pec-fly', 'cable-fly', 'db-fly', 'chest-fly', 'machine-pec-deck', 'incline-db-fly', 'low-to-high-cable-fly', 'high-to-low-cable-fly'], ['chest'], ['front_delts']);
define(['db-pullover'], ['lats', 'chest'], ['triceps']);

// Shoulders and arms.
define(['military-press', 'seated-military-press', 'db-shoulder-press', 'push-press'], ['front_delts', 'side_delts', 'triceps'], ['traps']);
define(['machine-lateral-raise', 'cable-lateral-raise', 'lateral-raise'], ['side_delts'], ['traps']);
define(['rear-delt-fly', 'rear-delt-flye', 'bent-over-rear-delt-fly', 'cable-rear-delt-fly', 'chest-supported-db-rear-delt-fly', 'reverse-pec-deck'], ['rear_delts'], ['upper_back', 'traps']);
define(['face-pull'], ['rear_delts', 'upper_back'], ['traps', 'biceps']);
define(['upright-row'], ['side_delts', 'traps'], ['biceps']);
define(['biceps-curl', 'ez-bar-curl', 'preacher-curl'], ['biceps'], ['forearms']);
define(['db-hammer-curl', 'hammer-curl'], ['biceps', 'forearms']);
define(['cable-oh-tricep-ext', 'cable-tricep-push-down', 'triceps-pushdown', 'overhead-triceps-extension', 'skull-crushers'], ['triceps']);

// Back and pulling.
define(['chest-supported-row', 'v-grip-cable-row', 'wide-grip-cable-row', 'seated-cable-row', 'one-arm-db-row', 'inverted-row'], ['lats', 'upper_back'], ['rear_delts', 'biceps', 'forearms']);
define(['v-grip-lat-pull-down', 'lat-pull-down', 'wide-grip-lat-pull-down', 'lat-pulldown', 'pull-ups'], ['lats'], ['upper_back', 'biceps', 'forearms']);
define(['shrugs'], ['traps'], ['forearms']);

// Squats, presses and unilateral knee-dominant work.
define(['back-squat', 'pause-squat', 'box-squat', 'safety-bar-squat'], ['quads', 'glutes'], ['hip_adductors', 'abs', 'spinal_erectors']);
define(['belted-squat', 'hack-squat', 'leg-press', 'single-leg-press'], ['quads', 'glutes'], ['hip_adductors']);
define(['front-squat', 'zercher-squat', 'goblet-squat'], ['quads'], ['glutes', 'abs', 'upper_back']);
define(['back-step-lunge', 'walking-lunge', 'bulgarian-split-squat', 'step-ups'], ['quads', 'glutes'], ['hamstrings', 'hip_abductors', 'hip_adductors']);
define(['leg-extension'], ['quads']);

// Hinges and posterior chain.
define(['deadlift', '1-deficit-deadlift', '2-deficit-deadlift', 'trap-bar-deadlift'], ['glutes', 'hamstrings', 'spinal_erectors'], ['quads', 'upper_back', 'traps', 'forearms']);
define(['rack-pull'], ['glutes', 'spinal_erectors', 'upper_back'], ['hamstrings', 'traps', 'forearms']);
define(['sumo-deadlift'], ['glutes', 'quads', 'hip_adductors'], ['hamstrings', 'spinal_erectors', 'forearms']);
define(['romanian-deadlift', 'stiff-leg-deadlift'], ['hamstrings', 'glutes', 'spinal_erectors'], ['forearms']);
define(['back-extension'], ['spinal_erectors', 'glutes', 'hamstrings']);
define(['hip-thrust', 'glute-kickback'], ['glutes'], ['hamstrings']);
define(['leg-curl'], ['hamstrings']);
define(['hip-abduction'], ['hip_abductors', 'glutes']);
define(['hip-adduction'], ['hip_adductors']);

// Calves, core and loaded conditioning.
define(['standing-calf-raise', 'seated-calf-raise'], ['calves']);
define(['cable-crunch', 'hanging-leg-raise', 'ab-wheel'], ['abs'], ['obliques']);
define(['farmer-carry'], ['forearms', 'traps'], ['abs', 'obliques']);
define(['sled-push'], ['quads', 'glutes', 'calves'], ['hamstrings']);

export const EXERCISE_MUSCLES: Readonly<Record<string, ExerciseMuscles>> = catalog;

const knownMuscles = new Set<string>(MUSCLE_GROUPS);

/** Runtime-safe parser for the compact muscle vector stored in a public activity summary. */
export function parseMuscleIntensities(raw: unknown): MuscleIntensityMap | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const parsed: MuscleIntensityMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!knownMuscles.has(key) || typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) continue;
    parsed[key as MuscleGroup] = value;
  }
  return Object.keys(parsed).length ? parsed : undefined;
}

/**
 * Aggregates completed work into a privacy-safe muscle map of relative intensities (1 to 100). Exercise ids and set logs never leave
 * the device. Primary muscles receive one point per set; secondary muscles receive half a point.
 */
export function musclesForWorkout(session: WorkoutSession): MuscleIntensityMap | undefined {
  const scores = new Map<MuscleGroup, number>();
  for (const exercise of session.exercises) {
    const completedSets = exercise.sets.filter((set) => set.completed).length;
    if (!completedSets) continue;
    const rawId = exercise.exerciseId.startsWith('custom-') ? exercise.exerciseId.slice('custom-'.length) : exercise.exerciseId;
    const mapping = catalog[rawId];
    if (!mapping) continue;
    for (const group of mapping.primary) scores.set(group, (scores.get(group) ?? 0) + completedSets);
    for (const group of mapping.secondary) scores.set(group, (scores.get(group) ?? 0) + completedSets * 0.5);
  }
  const max = Math.max(0, ...scores.values());
  if (!max) return undefined;
  const result: MuscleIntensityMap = {};
  for (const [group, score] of scores) {
    result[group] = Math.max(1, Math.round((score / max) * 100));
  }
  return result;
}
