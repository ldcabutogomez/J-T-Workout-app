import type { EncouragementTone, Gender, TrainingMaxKey, UserProfile, WeightUnit } from '../types';
import { defaultSchedule, withTrainingDays } from '../engine/schedule';
import { defaultThemeForId } from './theme';
import { tmProblem } from './validateTm';

export interface WizardInput {
  name: string;
  gender?: Gender;
  unit: WeightUnit;
  barbellWeight: number;
  equipmentIncrement: number;
  /** Block 1 training maxes. Any may be left out ("skip for now"). */
  trainingMaxes: Partial<Record<TrainingMaxKey, number | ''>>;
  /** Weekday (0 = Monday) for program Day 1 to Day 4. */
  trainingDays: number[];
  weeklyGoalSessions: number;
  tone: EncouragementTone;
}

export const defaultsForUnit = (unit: WeightUnit) =>
  unit === 'kg' ? { barbellWeight: 20, equipmentIncrement: 2.5 } : { barbellWeight: 45, equipmentIncrement: 5 };

export const DEFAULT_TRAINING_DAYS = [0, 1, 3, 4]; // Mon, Tue, Thu, Fri

export function newProfileId(now: number = Date.now(), random: () => number = Math.random): string {
  return `profile-${now.toString(36)}${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

/** What stops the wizard from finishing, in words; an empty list means it can be built. */
export function wizardProblems(input: WizardInput): string[] {
  const problems: string[] = [];
  if (input.name.trim().length === 0) problems.push('Enter a name.');
  if (input.gender !== 'male' && input.gender !== 'female') problems.push('Choose a gender.');
  if (!(input.barbellWeight >= 0) || !Number.isFinite(input.barbellWeight)) problems.push('Barbell weight must be zero or more.');
  if (!(input.equipmentIncrement > 0) || !Number.isFinite(input.equipmentIncrement)) problems.push('Smallest plate jump must be more than zero.');
  for (const [key, value] of Object.entries(input.trainingMaxes)) {
    const problem = tmProblem(value as number | '', input.unit);
    if (problem?.level === 'error') problems.push(`${key.replace('_', ' ')}: ${problem.message}`);
  }
  if (new Set(input.trainingDays).size !== 4) problems.push('Pick four different training days.');
  return problems;
}

/** Turns the wizard's answers into a saved-shape profile. Pure: the id and clock are passed in. */
export function buildProfileFromWizard(input: WizardInput, now: number = Date.now(), id: string = newProfileId(now)): UserProfile {
  const trainingMaxes = Object.fromEntries(
    Object.entries(input.trainingMaxes).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0),
  ) as Partial<Record<TrainingMaxKey, number>>;
  const base: UserProfile = {
    id,
    name: input.name.trim().slice(0, 40),
    gender: input.gender,
    unit: input.unit,
    equipmentIncrement: input.equipmentIncrement,
    barbellWeight: input.barbellWeight,
    tone: input.tone,
    currentWeek: 1,
    currentDay: 1,
    trainingMaxes,
    weeklyGoalSessions: input.weeklyGoalSessions,
    colorTheme: defaultThemeForId(id),
  };
  return { ...base, schedule: withTrainingDays(defaultSchedule(base, now, []), input.trainingDays) };
}
