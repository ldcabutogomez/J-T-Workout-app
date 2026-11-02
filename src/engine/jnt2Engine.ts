import type {
  LoadBasis,
  ProgramSetPrescription,
  TrainingMaxKey,
  UserProfile,
  WeightUnit,
} from '../types';

export {
  getDayPrescription,
  getOriginalDayPrescription,
  PRESCRIPTION_DATASET,
  WORKBOOK_AMBIGUITIES,
} from '../program/prescriptions';

export const REQUIRED_TRAINING_MAXES: Array<{ key: TrainingMaxKey; label: string }> = [
  { key: 'squat', label: 'Squat' },
  { key: 'bench', label: 'Bench Press' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'ohp', label: 'Military Press' },
  { key: 'front_squat', label: 'Front Squat' },
];

export function roundLoad(value: number, increment: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Load must be a finite, non-negative number.');
  if (!Number.isFinite(increment) || increment <= 0) throw new RangeError('Equipment increment must be greater than zero.');
  const rounded = Math.round(value / increment) * increment;
  return Number(rounded.toFixed(4));
}

export function getTrainingMax(profile: UserProfile, basis: Extract<LoadBasis, { kind: 'training_max' }>): number | null {
  const source = basis.block === 1 ? profile.trainingMaxes : profile.block2ConfirmedTMs;
  const value = source?.[basis.key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function calculateSetLoad(
  set: ProgramSetPrescription,
  profile: UserProfile,
  achievedRmLoad?: number,
): number | null {
  if (!set.percentage) return null;
  if (set.loadBasis.kind === 'training_max') {
    const tm = getTrainingMax(profile, set.loadBasis);
    return tm === null ? null : roundLoad(tm * set.percentage, profile.equipmentIncrement);
  }
  if (set.loadBasis.kind === 'achieved_rm') {
    return typeof achievedRmLoad === 'number'
      ? roundLoad(achievedRmLoad * set.percentage, profile.equipmentIncrement)
      : null;
  }
  return null;
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Weight must be a finite, non-negative number.');
  if (from === to) return value;
  return from === 'lb' ? value * 0.45359237 : value / 0.45359237;
}

export function normalizeWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  return Number(convertWeight(value, from, to).toFixed(4));
}

export function convertProfileUnit(profile: UserProfile, unit: WeightUnit): UserProfile {
  if (profile.unit === unit) return profile;
  const increment = unit === 'lb' ? 5 : 2.5;
  const convertMap = (source?: Partial<Record<TrainingMaxKey, number>>) => {
    if (!source) return undefined;
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        key,
        roundLoad(convertWeight(value, profile.unit, unit), increment),
      ]),
    ) as Partial<Record<TrainingMaxKey, number>>;
  };
  return {
    ...profile,
    unit,
    equipmentIncrement: increment,
    barbellWeight: unit === 'lb' ? 45 : 20,
    trainingMaxes: convertMap(profile.trainingMaxes) ?? {},
    block2ConfirmedTMs: convertMap(profile.block2ConfirmedTMs),
  };
}

export function calculateBarbellPlates(
  targetWeight: number,
  barbellWeight: number,
  unit: WeightUnit,
): { plate: number; countPerSide: number }[] {
  const availablePlates = unit === 'lb'
    ? [45, 35, 25, 10, 5, 2.5]
    : [25, 20, 15, 10, 5, 2.5, 1.25];
  let remaining = Math.max(0, (targetWeight - barbellWeight) / 2);
  const result: { plate: number; countPerSide: number }[] = [];
  for (const plate of availablePlates) {
    const count = Math.floor((remaining + 1e-9) / plate);
    if (count > 0) {
      result.push({ plate, countPerSide: count });
      remaining -= count * plate;
    }
  }
  return result;
}
