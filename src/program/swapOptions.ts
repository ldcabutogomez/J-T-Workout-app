import type { ExerciseSlotPrescription, LoadBasis, SlotStatus, SwappedFrom, SwapReview, TierType } from '../types';
import { slug } from '../lib/slug';

/**
 * Swaps are decided by explicit pairs: the program exercise a slot started with, and a replacement. An exercise
 * on its own says nothing about what it can replace, so there is no group-wide list and no default fit.
 */

export type SwapGroup = 'chest' | 'lower' | 'pull' | 'shoulder' | 'main';

/** Same job, same job with a changed emphasis, or a different job (shown, but never applied automatically). */
export type SwapFit = 'direct' | 'conditional' | 'different';

export const SWAP_GROUP_LABELS: Record<SwapGroup, string> = {
  chest: 'Chest / push',
  lower: 'Lower body',
  pull: 'Back / pull',
  shoulder: 'Shoulders',
  main: 'Main lift',
};

/** Exercise identity only. What an exercise can replace lives in SWAP_RULES, per original. */
export const EXERCISES: Record<string, { name: string; bodyweight?: boolean }> = {
  'belted-squat': { name: 'Belted Squat' }, 'safety-bar-squat': { name: 'Safety Bar Squat' }, 'box-squat': { name: 'Box Squat' },
  'pause-squat': { name: 'Pause Squat' }, 'sling-shot-bench': { name: 'Sling Shot Bench' }, 'pause-bench-press': { name: 'Pause Bench Press' },
  'spoto-press': { name: 'Spoto Press' }, 'floor-press': { name: 'Floor Press' }, 'bench-press': { name: 'Bench Press' },
  'zercher-squat': { name: 'Zercher Squat' }, 'sumo-deadlift': { name: 'Sumo Deadlift' }, 'trap-bar-deadlift': { name: 'Trap Bar Deadlift' },
  'rack-pull': { name: 'Rack Pull' }, 'seated-military-press': { name: 'Seated Military Press' }, 'push-press': { name: 'Push Press' },
  'db-bench-press': { name: 'DB Bench Press' }, dips: { name: 'Dips', bodyweight: true }, 'push-ups': { name: 'Push-Ups', bodyweight: true },
  'incline-db-press': { name: 'Incline DB Press' }, 'cable-fly': { name: 'Cable Fly' }, 'db-fly': { name: 'DB Fly' },
  'cable-chest-press': { name: 'Cable Chest Press' }, 'db-pullover': { name: 'DB Pullover' },
  'hip-thrust': { name: 'Hip Thrust' }, 'romanian-deadlift': { name: 'Romanian Deadlift' }, 'bulgarian-split-squat': { name: 'Bulgarian Split Squat' },
  'step-ups': { name: 'Step-Ups' }, 'goblet-squat': { name: 'Goblet Squat' }, 'walking-lunge': { name: 'Walking Lunge' },
  'glute-kickback': { name: 'Glute Kickback' }, 'hip-abduction': { name: 'Hip Abduction' },
  'pull-ups': { name: 'Pull-Ups', bodyweight: true }, 'inverted-row': { name: 'Inverted Row', bodyweight: true }, 'one-arm-db-row': { name: 'One-Arm DB Row' },
  'cable-lateral-raise': { name: 'Cable Lateral Raise' }, 'upright-row': { name: 'Upright Row' },
  'bent-over-rear-delt-fly': { name: 'Bent-Over Rear Delt Fly' }, 'face-pull': { name: 'Face Pull' },
};

export interface SwapRule {
  /** Program exercise id (normalized: "flye" is "fly"). */
  original: string;
  replacement: string;
  fit: SwapFit;
  /** What changes versus the program exercise. */
  note?: string;
  /**
   * The rep range this exercise is programmed for. The slot's initial target must already sit inside it:
   * reps are never changed behind the lifter's back, so a swap outside the range is unavailable that week.
   */
  reps?: { min: number; max: number };
}

const D = 'direct' as const;
const C = 'conditional' as const;
const X = 'different' as const;

export const SWAP_RULES: SwapRule[] = [
  // Tier 1. A swapped main lift keeps that day's sets, reps and percentages; its loads never come from the program lift's TM.
  { original: 'back-squat', replacement: 'pause-squat', fit: D },
  { original: 'back-squat', replacement: 'belted-squat', fit: C, note: 'Belt-supported squat: a different load than the back squat.' },
  { original: 'back-squat', replacement: 'safety-bar-squat', fit: C, note: 'A different bar position changes how heavy it feels.' },
  { original: 'back-squat', replacement: 'box-squat', fit: C, note: 'The box changes depth and the stretch at the bottom.' },
  { original: 'bench-press', replacement: 'pause-bench-press', fit: D },
  { original: 'bench-press', replacement: 'spoto-press', fit: D },
  { original: 'bench-press', replacement: 'sling-shot-bench', fit: C, note: 'The sling assists the press, so loads run higher.' },
  { original: 'bench-press', replacement: 'floor-press', fit: C, note: 'Shorter range of motion than the bench press.' },
  { original: 'front-squat', replacement: 'zercher-squat', fit: C, note: 'Loaded in the elbows, so it limits at a different point.' },
  { original: 'front-squat', replacement: 'safety-bar-squat', fit: C, note: 'A different bar position changes how heavy it feels.' },
  { original: 'deadlift', replacement: 'sumo-deadlift', fit: D },
  { original: 'deadlift', replacement: 'trap-bar-deadlift', fit: C, note: 'A different handle position changes how heavy it feels.' },
  { original: 'deadlift', replacement: 'rack-pull', fit: C, note: 'Starts above the floor, so loads run higher.' },
  { original: 'military-press', replacement: 'seated-military-press', fit: D },
  { original: 'military-press', replacement: 'push-press', fit: C, note: 'Leg drive assists the press.' },
  { original: 'sling-shot-bench', replacement: 'bench-press', fit: C, note: 'No sling assistance, so loads run lower.' },
  { original: 'sling-shot-bench', replacement: 'pause-bench-press', fit: C, note: 'No sling assistance, so loads run lower.' },
  { original: 'sling-shot-bench', replacement: 'floor-press', fit: C, note: 'No sling assistance and a shorter range.' },

  // Chest / push.
  { original: 'pec-fly', replacement: 'cable-fly', fit: D, reps: { min: 10, max: 20 } },
  { original: 'pec-fly', replacement: 'db-fly', fit: D, reps: { min: 10, max: 20 } },
  { original: 'pec-fly', replacement: 'db-pullover', fit: X, note: 'Works the chest and lats through a different path. It is not a fly.' },
  { original: 'incline-bench', replacement: 'incline-db-press', fit: D },
  { original: 'incline-bench', replacement: 'cable-chest-press', fit: C, reps: { min: 8, max: 20 }, note: 'Cable resistance and stability differ from the barbell.' },
  { original: 'incline-bench', replacement: 'db-bench-press', fit: C, note: 'Flat instead of incline, so the emphasis moves.' },
  { original: 'incline-bench', replacement: 'dips', fit: C, note: 'Bodyweight and a different angle.' },
  { original: 'incline-bench', replacement: 'push-ups', fit: C, note: 'Bodyweight and a different angle.' },
  { original: 'incline-bench', replacement: 'db-pullover', fit: X, note: 'Not a press.' },
  { original: 'db-bench-press', replacement: 'incline-db-press', fit: D },
  { original: 'db-bench-press', replacement: 'cable-chest-press', fit: C, reps: { min: 8, max: 20 }, note: 'Cable resistance and stability differ from dumbbells.' },
  { original: 'db-bench-press', replacement: 'dips', fit: C, note: 'Bodyweight and a different angle.' },
  { original: 'db-bench-press', replacement: 'push-ups', fit: C, note: 'Bodyweight and a different angle.' },

  // Shoulders.
  { original: 'machine-lateral-raise', replacement: 'cable-lateral-raise', fit: D, reps: { min: 10, max: 25 } },
  { original: 'machine-lateral-raise', replacement: 'upright-row', fit: C, reps: { min: 10, max: 20 }, note: 'Side delts and upper traps. Keep it only if it feels comfortable on the shoulders.' },
  { original: 'rear-delt-fly', replacement: 'bent-over-rear-delt-fly', fit: D, reps: { min: 10, max: 25 } },
  { original: 'rear-delt-fly', replacement: 'face-pull', fit: C, reps: { min: 12, max: 25 }, note: 'More upper back than rear delt, and the cable feels different.' },

  // Lower body. Curls and extensions have no supported replacement here: a hinge or a squat is a different job.
  { original: 'single-leg-press', replacement: 'bulgarian-split-squat', fit: D },
  { original: 'single-leg-press', replacement: 'walking-lunge', fit: D },
  { original: 'single-leg-press', replacement: 'step-ups', fit: C, note: 'Lighter, balance-limited loading.' },
  { original: 'single-leg-press', replacement: 'goblet-squat', fit: C, note: 'Two legs, and limited by what you can hold.' },
  { original: 'single-leg-press', replacement: 'hip-thrust', fit: X, note: 'A hip extension, not a knee-dominant press.' },
  { original: 'single-leg-press', replacement: 'romanian-deadlift', fit: X, note: 'A hinge, not a press.' },
  { original: 'single-leg-press', replacement: 'glute-kickback', fit: X, note: 'Isolates hip extension.' },
  { original: 'single-leg-press', replacement: 'hip-abduction', fit: X, note: 'Trains the hip abductors.' },
  { original: 'back-step-lunge', replacement: 'walking-lunge', fit: D },
  { original: 'back-step-lunge', replacement: 'bulgarian-split-squat', fit: D },
  { original: 'back-step-lunge', replacement: 'step-ups', fit: C, note: 'Lighter, balance-limited loading.' },
  { original: 'back-step-lunge', replacement: 'goblet-squat', fit: C, note: 'Two legs, and limited by what you can hold.' },
  { original: 'back-step-lunge', replacement: 'hip-thrust', fit: X, note: 'A hip extension, not a lunge.' },
  { original: 'back-step-lunge', replacement: 'romanian-deadlift', fit: X, note: 'A hinge, not a lunge.' },
  { original: 'back-step-lunge', replacement: 'glute-kickback', fit: X, note: 'Isolates hip extension.' },
  { original: 'back-step-lunge', replacement: 'hip-abduction', fit: X, note: 'Trains the hip abductors.' },
  { original: 'stiff-leg-deadlift', replacement: 'romanian-deadlift', fit: D },
  { original: 'stiff-leg-deadlift', replacement: 'hip-thrust', fit: C, note: 'Glutes without the hamstring stretch under load.' },
  { original: 'stiff-leg-deadlift', replacement: 'glute-kickback', fit: X, note: 'Isolates hip extension.' },
  { original: 'leg-curl', replacement: 'hip-thrust', fit: X, note: 'A hip extension. It does not train the knee-flexing hamstring work of a curl.' },
  { original: 'leg-curl', replacement: 'romanian-deadlift', fit: X, note: 'A hinge, not a knee flexion.' },
  { original: 'leg-extension', replacement: 'hip-thrust', fit: X, note: 'A hip extension. It does not train the quads.' },
  { original: 'leg-extension', replacement: 'romanian-deadlift', fit: X, note: 'A hinge, not a knee extension.' },

  // Back / pull.
  ...['chest-supported-row', 'v-grip-cable-row', 'wide-grip-cable-row'].flatMap((original): SwapRule[] => [
    { original, replacement: 'one-arm-db-row', fit: D },
    { original, replacement: 'inverted-row', fit: C, note: 'Bodyweight, with the load set by body angle.' },
    { original, replacement: 'pull-ups', fit: X, note: 'A vertical pull, not a row.' },
  ]),
  ...['v-grip-lat-pull-down', 'lat-pull-down', 'wide-grip-lat-pull-down'].flatMap((original): SwapRule[] => [
    { original, replacement: 'pull-ups', fit: C, note: 'Bodyweight: enter 0, or the added weight.' },
    { original, replacement: 'one-arm-db-row', fit: X, note: 'A row, not a vertical pull.' },
    { original, replacement: 'inverted-row', fit: X, note: 'A row, not a vertical pull.' },
  ]),
];

const GROUP_OF: Record<string, SwapGroup> = {
  'incline-bench': 'chest', 'pec-fly': 'chest', 'db-bench-press': 'chest',
  'single-leg-press': 'lower', 'back-step-lunge': 'lower', 'stiff-leg-deadlift': 'lower', 'leg-curl': 'lower', 'leg-extension': 'lower',
  'chest-supported-row': 'pull', 'v-grip-cable-row': 'pull', 'v-grip-lat-pull-down': 'pull', 'lat-pull-down': 'pull',
  'wide-grip-cable-row': 'pull', 'wide-grip-lat-pull-down': 'pull',
  'machine-lateral-raise': 'shoulder', 'rear-delt-fly': 'shoulder',
};
const T1_ORIGINALS = new Set(['back-squat', 'bench-press', 'front-squat', 'deadlift', 'military-press', 'sling-shot-bench']);

const SWAPPABLE_TIERS: TierType[] = ['T2b', 'T2c', 'T3a', 'T3b', 'T3c', 'T3d'];
const normalizeId = (exerciseId: string) => exerciseId.replace(/flye/g, 'fly');

/** A replacement as the picker shows it. `disabledReason` is set when it cannot be applied to this slot today. */
export interface SwapAlternative {
  id: string;
  name: string;
  bodyweight?: boolean;
  fit: SwapFit;
  note?: string;
  reps?: { min: number; max: number };
  disabledReason?: string;
}

export const DIFFERENT_JOB_REASON = 'Different job: needs a custom prescription (not available yet).';

/** The minimal slot shape shared by prescriptions and logged exercises. */
export interface SwappableSlot {
  slotId: string;
  tier: TierType;
  status: SlotStatus;
  loadBasis?: LoadBasis;
  exerciseId: string;
  exerciseName: string;
  swappedFrom?: SwappedFrom;
  /** The initial target-RM of the slot (a prescription calls it repTarget, a logged exercise targetRM). */
  repTarget?: number | null;
  targetRM?: number;
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

export const exerciseInfo = (exerciseId: string): { name: string; bodyweight?: boolean } | undefined => EXERCISES[exerciseId];

const T1_NAMES: Record<string, string> = {
  'back-squat': 'Back Squat', 'bench-press': 'Bench Press', 'front-squat': 'Front Squat', deadlift: 'Deadlift',
  'military-press': 'Military Press', 'sling-shot-bench': 'Sling Shot Bench',
};

/** A readable name for an exercise id, for lists that only have the id. */
export function exerciseNameFor(exerciseId: string): string {
  return T1_NAMES[exerciseId] ?? EXERCISES[exerciseId]?.name
    ?? exerciseId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const rulesFor = (originalId: string): SwapRule[] => SWAP_RULES.filter((rule) => rule.original === normalizeId(originalId));

/** Whether a stored swap is still a supported, automatically applicable pairing. */
export const isSwapSupported = (originalId: string, replacementId: string): boolean =>
  rulesFor(originalId).some((rule) => rule.replacement === replacementId && rule.fit !== 'different');

const isEligibleSlot = (slot: SwappableSlot): boolean => {
  if (slot.tier === 'T1') return slot.status === 'work' || slot.status === 'test';
  return SWAPPABLE_TIERS.includes(slot.tier) && slot.status === 'work' && slot.loadBasis?.kind === 'user_selected';
};

const repTargetOf = (slot: SwappableSlot): number | null => slot.repTarget ?? slot.targetRM ?? null;

/** Why a rule cannot be applied to this slot right now, or undefined when it can. */
function blockedReason(slot: SwappableSlot, rule: SwapRule, finalIdsOnDay: string[]): { reason: SwapReview['reason']; detail: string } | undefined {
  if (rule.fit === 'different') return { reason: 'ineligible', detail: DIFFERENT_JOB_REASON };
  const target = repTargetOf(slot);
  if (rule.reps && target !== null && (target < rule.reps.min || target > rule.reps.max)) {
    return { reason: 'reps', detail: `This slot is programmed for ${target} reps; ${exerciseNameFor(rule.replacement)} runs ${rule.reps.min}-${rule.reps.max}. Changing reps needs a custom prescription.` };
  }
  if (finalIdsOnDay.includes(rule.replacement)) {
    return { reason: 'duplicate', detail: `${exerciseNameFor(rule.replacement)} is already in this workout.` };
  }
  return undefined;
}

/**
 * `finalIdsOnDay` are the exercises the day's other slots end up with after every stored swap is applied, so the
 * picker and the prescription engine agree on what counts as a repeat. The selected alternative always stays.
 */
export function getSwapOptions(slot: SwappableSlot, finalIdsOnDay: string[] = []): SwapOptions | null {
  if (!isEligibleSlot(slot)) return null;
  const original = slot.swappedFrom ?? { exerciseId: slot.exerciseId, exerciseName: slot.exerciseName };
  const isT1 = slot.tier === 'T1';
  if (isT1 !== T1_ORIGINALS.has(original.exerciseId)) return null;
  const rules = rulesFor(original.exerciseId);
  if (rules.length === 0) return null;
  const group: SwapGroup = isT1 ? 'main' : GROUP_OF[normalizeId(original.exerciseId)] ?? 'lower';
  if (!isT1 && !GROUP_OF[normalizeId(original.exerciseId)]) return null;
  return {
    group,
    original,
    selectedId: slot.swappedFrom ? slot.exerciseId : '',
    alternatives: rules.map((rule): SwapAlternative => {
      const blocked = rule.replacement === slot.exerciseId ? undefined : blockedReason(slot, rule, finalIdsOnDay);
      return {
        id: rule.replacement,
        name: exerciseNameFor(rule.replacement),
        ...(EXERCISES[rule.replacement]?.bodyweight ? { bodyweight: true } : {}),
        fit: rule.fit,
        ...(rule.note ? { note: rule.note } : {}),
        ...(rule.reps ? { reps: rule.reps } : {}),
        ...(blocked ? { disabledReason: blocked.detail } : {}),
      };
    }),
  };
}

/**
 * Applies a rule to a program slot. Reps and sets are never touched. A main lift keeps that day's structure, but its
 * loads cannot come from the program lift's training max: Block 1 back-offs use the variation's own TM (unset until
 * the lifter enters it) and Block 2 back-offs follow the target-RM set actually logged.
 */
function applyRule(slot: ExerciseSlotPrescription, rule: SwapRule, original: SwappedFrom): ExerciseSlotPrescription {
  const info = EXERCISES[rule.replacement];
  const name = exerciseNameFor(rule.replacement);
  const t1 = slot.tier === 'T1';
  const variate = (basis: LoadBasis): LoadBasis => (t1 && basis.kind === 'training_max' ? { ...basis, variationId: rule.replacement } : basis);
  const hint = t1
    ? ` Set your own training max for ${name} to get loads; the ${original.exerciseName} training max is not used.`
    : info?.bodyweight ? ' Bodyweight: enter 0, or the added weight.' : '';
  const note = rule.note && rule.fit !== 'direct' ? ` ${rule.note}` : '';
  return {
    ...slot,
    exerciseId: rule.replacement,
    exerciseName: name,
    swappedFrom: original,
    ...(slot.loadBasis ? { loadBasis: variate(slot.loadBasis) } : {}),
    prescribedSets: slot.prescribedSets.map((set) => {
      const { suggestFrom, ...rest } = set;
      return {
        ...rest,
        loadBasis: variate(set.loadBasis),
        ...(t1 && suggestFrom ? { suggestFrom: { ...suggestFrom, variationId: rule.replacement } } : {}),
      };
    }),
    notes: `${slot.notes ?? ''}${hint}${note}`.trim() || undefined,
  };
}

/**
 * Applies the profile's remembered swaps to a day. Every slot's final exercise is settled together so two stored swaps
 * cannot accidentally land on the same exercise: the later slot keeps the program exercise and is flagged for review.
 * Program-intended repeats are never touched. A stored swap that no longer applies is flagged, never silently replaced.
 */
export function resolveDaySwaps(
  slots: ExerciseSlotPrescription[],
  swaps: Record<string, string> | undefined,
  skip: (slot: ExerciseSlotPrescription) => boolean = () => false,
): ExerciseSlotPrescription[] {
  if (!swaps || Object.keys(swaps).length === 0) return slots;
  const live = (slot: ExerciseSlotPrescription) => slot.status === 'work' || slot.status === 'test';
  const final = slots.map((slot) => slot.exerciseId);
  const chosen: Array<{ rule: SwapRule; original: SwappedFrom } | { review: SwapReview } | null> = slots.map(() => null);

  slots.forEach((slot, index) => {
    const stored = swaps[swapKey(slot.slotId, slot.exerciseId)];
    if (!stored || skip(slot) || !isEligibleSlot(slot)) return;
    const original = { exerciseId: slot.exerciseId, exerciseName: slot.exerciseName };
    const rule = rulesFor(slot.exerciseId).find((item) => item.replacement === stored);
    const storedName = exerciseNameFor(stored);
    const flag = (reason: SwapReview['reason'], detail: string) => { chosen[index] = { review: { storedId: stored, storedName, reason, detail } }; };
    if (!rule) { flag('ineligible', `${storedName} is no longer offered as a replacement for ${slot.exerciseName}.`); return; }
    const blocked = blockedReason(slot, rule, []);
    if (blocked) { flag(blocked.reason, blocked.detail); return; }
    chosen[index] = { rule, original };
    final[index] = rule.replacement;
  });

  // Settle collisions in slot order, against everyone else's current final exercise.
  slots.forEach((slot, index) => {
    const pick = chosen[index];
    if (!pick || !('rule' in pick)) return;
    // Earlier slots win. A later slot that only wants the same swap will be settled on its own turn.
    const clash = slots.some((other, j) => j !== index && live(other) && final[j] === pick.rule.replacement
      && !(j > index && chosen[j] !== null && 'rule' in (chosen[j] as object)));
    if (!clash) return;
    final[index] = slot.exerciseId;
    chosen[index] = { review: { storedId: pick.rule.replacement, storedName: exerciseNameFor(pick.rule.replacement), reason: 'duplicate', detail: `${exerciseNameFor(pick.rule.replacement)} is already in this workout.` } };
  });

  return slots.map((slot, index) => {
    const pick = chosen[index];
    if (!pick) return slot;
    if ('review' in pick) return { ...slot, swapReview: pick.review };
    return applyRule(slot, pick.rule, pick.original);
  });
}

export { slug };
