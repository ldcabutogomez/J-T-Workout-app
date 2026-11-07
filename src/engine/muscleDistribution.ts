import type { WeightUnit, WorkoutSession } from '../types';
import { normalizeWeight } from './jnt2Engine';
import { EXERCISE_MUSCLES, type MuscleGroup } from './muscles';

export const RADAR_REGIONS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Quads', 'Posterior + core'] as const;
export type RadarRegion = (typeof RADAR_REGIONS)[number];

const regionOf = (muscle: MuscleGroup): RadarRegion => {
  if (muscle === 'chest') return 'Chest';
  if (['lats', 'upper_back', 'traps', 'rear_delts'].includes(muscle)) return 'Back';
  if (['front_delts', 'side_delts'].includes(muscle)) return 'Shoulders';
  if (['biceps', 'triceps', 'forearms'].includes(muscle)) return 'Arms';
  if (muscle === 'quads') return 'Quads';
  return 'Posterior + core';
};

export function muscleVolumeDistribution(sessions: WorkoutSession[], unit: WeightUnit): Record<RadarRegion, number> {
  const totals = Object.fromEntries(RADAR_REGIONS.map((region) => [region, 0])) as Record<RadarRegion, number>;
  for (const session of sessions) for (const exercise of session.exercises) {
    const rawId = exercise.exerciseId.startsWith('custom-') ? exercise.exerciseId.slice(7) : exercise.exerciseId;
    const mapping = EXERCISE_MUSCLES[rawId];
    if (!mapping) continue;
    const targets = [...mapping.primary.map((muscle) => ({ muscle, weight: 1 })), ...mapping.secondary.map((muscle) => ({ muscle, weight: 0.5 }))];
    const weightTotal = targets.reduce((sum, target) => sum + target.weight, 0) || 1;
    for (const set of exercise.sets) {
      if (!set.completed || set.actualReps === null || set.load === null) continue;
      const volume = normalizeWeight(set.load, set.unit, unit) * set.actualReps;
      for (const target of targets) totals[regionOf(target.muscle)] += volume * target.weight / weightTotal;
    }
  }
  for (const region of RADAR_REGIONS) totals[region] = Math.round(totals[region]);
  return totals;
}
