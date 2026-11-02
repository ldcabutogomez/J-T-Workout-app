import type { ExerciseSlotPrescription, LoadBasis, SlotStatus, SwappedFrom, TierType } from '../types';
import { slug } from '../lib/slug';

export type SwapGroup = 'chest' | 'lower' | 'pull';

export interface SwapAlternative {
  id: string;
  name: string;
  bodyweight?: boolean;
}

export const SWAP_GROUP_LABELS: Record<SwapGroup, string> = {
  chest: 'Chest / push',
  lower: 'Lower body',
  pull: 'Back / pull',
};

// Ids are slug(name), matching the program's own ids (for example "DB Bench Press"), so history is shared.
export const SWAP_ALTERNATIVES: Record<SwapGroup, SwapAlternative[]> = {
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
const PROGRAM_GROUP: Record<string, SwapGroup> = {
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

export function getSwapOptions(slot: SwappableSlot): SwapOptions | null {
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
  for (const group of Object.keys(SWAP_ALTERNATIVES) as SwapGroup[]) {
    const alternative = SWAP_ALTERNATIVES[group].find((item) => item.id === alternativeId);
    if (alternative) return { group, alternative };
  }
  return null;
}

/** Applies the profile's remembered swap to a program slot, if one is set and still valid for it. */
export function applySwap(
  slot: ExerciseSlotPrescription,
  swaps: Record<string, string> | undefined,
): ExerciseSlotPrescription {
  if (!swaps) return slot;
  const options = getSwapOptions(slot);
  if (!options) return slot;
  const alternativeId = swaps[swapKey(slot.slotId, slot.exerciseId)];
  const alternative = alternativeId ? options.alternatives.find((item) => item.id === alternativeId) : undefined;
  if (!alternative) return slot;
  const hint = alternative.bodyweight ? ' Bodyweight: enter 0, or the added weight.' : '';
  return {
    ...slot,
    exerciseId: alternative.id,
    exerciseName: alternative.name,
    swappedFrom: options.original,
    notes: `${slot.notes ?? ''}${hint}`.trim() || undefined,
  };
}

export { slug };
