import type { ExerciseSlotPrescription, LoadBasis, SlotStatus, SwappedFrom, TierType } from '../types';
import { slug } from '../lib/slug';

export type SwapGroup = 'chest' | 'lower' | 'pull' | 'main';

export interface SwapAlternative {
  id: string;
  name: string;
  bodyweight?: boolean;
}

export const SWAP_GROUP_LABELS: Record<SwapGroup, string> = {
  chest: 'Chest / push',
  lower: 'Lower body',
  pull: 'Back / pull',
  main: 'Main lift',
};

/**
 * Tier 1 alternatives, by the program's own lift. A swapped T1 lift keeps that day's sets, reps, percentages
 * and training max, so only the exercise changes. Ids are slug(name), so a lift shared with the program
 * (Bench Press on Day 2, Sling Shot Bench on Day 4) shares its history.
 */
export const T1_ALTERNATIVES: Record<string, SwapAlternative[]> = {
  'back-squat': [
    { id: 'belted-squat', name: 'Belted Squat' },
    { id: 'safety-bar-squat', name: 'Safety Bar Squat' },
    { id: 'box-squat', name: 'Box Squat' },
    { id: 'pause-squat', name: 'Pause Squat' },
  ],
  'bench-press': [
    { id: 'sling-shot-bench', name: 'Sling Shot Bench' },
    { id: 'pause-bench-press', name: 'Pause Bench Press' },
    { id: 'spoto-press', name: 'Spoto Press' },
    { id: 'floor-press', name: 'Floor Press' },
  ],
  'front-squat': [
    { id: 'zercher-squat', name: 'Zercher Squat' },
    { id: 'safety-bar-squat', name: 'Safety Bar Squat' },
  ],
  deadlift: [
    { id: 'sumo-deadlift', name: 'Sumo Deadlift' },
    { id: 'trap-bar-deadlift', name: 'Trap Bar Deadlift' },
    { id: 'rack-pull', name: 'Rack Pull' },
    { id: 'romanian-deadlift', name: 'Romanian Deadlift' },
    { id: 'leg-press', name: 'Leg Press' },
    { id: 'hack-squat', name: 'Hack Squat' },
    { id: 'hip-thrust', name: 'Hip Thrust' },
    { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat' },
    { id: 'walking-lunge', name: 'Walking Lunge' },
  ],
  'military-press': [
    { id: 'seated-military-press', name: 'Seated Military Press' },
    { id: 'push-press', name: 'Push Press' },
  ],
  'sling-shot-bench': [
    { id: 'bench-press', name: 'Bench Press' },
    { id: 'pause-bench-press', name: 'Pause Bench Press' },
    { id: 'floor-press', name: 'Floor Press' },
  ],
};

// Ids are slug(name), matching the program's own ids (for example "DB Bench Press"), so history is shared.
export const SWAP_ALTERNATIVES: Record<Exclude<SwapGroup, 'main'>, SwapAlternative[]> = {
  chest: [
    { id: 'db-bench-press', name: 'DB Bench Press' },
    { id: 'dips', name: 'Dips', bodyweight: true },
    { id: 'push-ups', name: 'Push-Ups', bodyweight: true },
    { id: 'incline-db-press', name: 'Incline DB Press' },
  ],
  lower: [
    { id: 'hip-thrust', name: 'Hip Thrust' },
    { id: 'romanian-deadlift', name: 'Romanian Deadlift' },
    { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat' },
    { id: 'step-ups', name: 'Step-Ups' },
    { id: 'goblet-squat', name: 'Goblet Squat' },
    { id: 'walking-lunge', name: 'Walking Lunge' },
  ],
  pull: [
    { id: 'pull-ups', name: 'Pull-Ups', bodyweight: true },
    { id: 'inverted-row', name: 'Inverted Row', bodyweight: true },
    { id: 'one-arm-db-row', name: 'One-Arm DB Row' },
  ],
};

// Program exercises that may be swapped, keyed by normalized slug.
const PROGRAM_GROUP: Record<string, Exclude<SwapGroup, 'main'>> = {
  'incline-bench': 'chest',
  'pec-fly': 'chest',
  'db-bench-press': 'chest',
  'single-leg-press': 'lower',
  'back-step-lunge': 'lower',
  'stiff-leg-deadlift': 'lower',
  'leg-curl': 'lower',
  'leg-extension': 'lower',
  'chest-supported-row': 'pull',
  'v-grip-cable-row': 'pull',
  'v-grip-lat-pull-down': 'pull',
  'lat-pull-down': 'pull',
  'wide-grip-cable-row': 'pull',
  'wide-grip-lat-pull-down': 'pull',
};

const SWAPPABLE_TIERS: TierType[] = ['T2b', 'T2c', 'T3a', 'T3b', 'T3c', 'T3d'];

const normalizeId = (exerciseId: string) => exerciseId.replace(/flye/g, 'fly');

/** The minimal slot shape shared by prescriptions and logged exercises. */
export interface SwappableSlot {
  slotId: string;
  tier: TierType;
  status: SlotStatus;
  loadBasis?: LoadBasis;
  exerciseId: string;
  exerciseName: string;
  swappedFrom?: SwappedFrom;
}

export interface SwapOptions {
  group: SwapGroup;
  original: SwappedFrom;
  /** Alternative id currently applied, or '' for the program default. */
  selectedId: string;
  alternatives: SwapAlternative[];
}

export function swapKey(slotId: string, originalExerciseId: string): string {
  return `${slotId}::${originalExerciseId}`;
}

/**
 * `otherIdsOnDay` are the exercises already in the day's other slots: an alternative that would repeat one is
 * hidden, so one workout never has the same exercise twice (the one currently selected always stays).
 */
export function getSwapOptions(slot: SwappableSlot, otherIdsOnDay: string[] = []): SwapOptions | null {
  if (slot.tier === 'T1') {
    // Main lifts keep their sets and percentages whatever their load basis, in work and test weeks alike.
    if (slot.status !== 'work' && slot.status !== 'test') return null;
    const original = slot.swappedFrom ?? { exerciseId: slot.exerciseId, exerciseName: slot.exerciseName };
    const list = T1_ALTERNATIVES[original.exerciseId];
    if (!list) return null;
    return {
      group: 'main',
      original,
      selectedId: slot.swappedFrom ? slot.exerciseId : '',
      alternatives: list.filter((item) => item.id !== original.exerciseId && (!otherIdsOnDay.includes(item.id) || item.id === slot.exerciseId)),
    };
  }
  if (!SWAPPABLE_TIERS.includes(slot.tier) || slot.status !== 'work' || slot.loadBasis?.kind !== 'user_selected') return null;
  const original = slot.swappedFrom ?? { exerciseId: slot.exerciseId, exerciseName: slot.exerciseName };
  const group = PROGRAM_GROUP[normalizeId(original.exerciseId)];
  if (!group) return null;
  return {
    group,
    original,
    selectedId: slot.swappedFrom ? slot.exerciseId : '',
    alternatives: SWAP_ALTERNATIVES[group].filter((item) => item.id !== original.exerciseId),
  };
}

export function findAlternative(alternativeId: string): { group: SwapGroup; alternative: SwapAlternative } | null {
  for (const group of Object.keys(SWAP_ALTERNATIVES) as Array<Exclude<SwapGroup, 'main'>>) {
    const alternative = SWAP_ALTERNATIVES[group].find((item) => item.id === alternativeId);
    if (alternative) return { group, alternative };
  }
  for (const list of Object.values(T1_ALTERNATIVES)) {
    const alternative = list.find((item) => item.id === alternativeId);
    if (alternative) return { group: 'main', alternative };
  }
  return null;
}

const T1_NAMES: Record<string, string> = {
  'back-squat': 'Back Squat', 'bench-press': 'Bench Press', 'front-squat': 'Front Squat', deadlift: 'Deadlift',
  'military-press': 'Military Press', 'sling-shot-bench': 'Sling Shot Bench',
};

/** A readable name for an exercise id, for lists that only have the id. */
export function exerciseNameFor(exerciseId: string): string {
  return T1_NAMES[exerciseId] ?? findAlternative(exerciseId)?.alternative.name
    ?? exerciseId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/** Applies the profile's remembered swap to a program slot, if one is set and still valid for it. */
export function applySwap(
  slot: ExerciseSlotPrescription,
  swaps: Record<string, string> | undefined,
  otherIdsOnDay: string[] = [],
): ExerciseSlotPrescription {
  if (!swaps) return slot;
  const options = getSwapOptions(slot, otherIdsOnDay);
  if (!options) return slot;
  const alternativeId = swaps[swapKey(slot.slotId, slot.exerciseId)];
  const alternative = alternativeId ? options.alternatives.find((item) => item.id === alternativeId) : undefined;
  if (!alternative) return slot;
  const hint = slot.tier === 'T1'
    ? ` Loads use your ${options.original.exerciseName} training max. Adjust the first set to what you can do today.`
    : alternative.bodyweight ? ' Bodyweight: enter 0, or the added weight.' : '';
  return {
    ...slot,
    exerciseId: alternative.id,
    exerciseName: alternative.name,
    swappedFrom: options.original,
    notes: `${slot.notes ?? ''}${hint}`.trim() || undefined,
  };
}

export { slug };
