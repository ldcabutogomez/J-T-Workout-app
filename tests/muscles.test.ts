import assert from 'node:assert/strict';
import test from 'node:test';
import { workoutActivity } from '../src/engine/activity';
import { EXERCISE_MUSCLES, musclesForWorkout, parseMuscleIntensities } from '../src/engine/muscles';
import { knownExercises } from '../src/program/extraCatalog';
import { PRESCRIPTION_DATASET } from '../src/program/prescriptions';
import type { LoggedExercise } from '../src/types';
import { completeSession, profile } from './helpers';

test('every program, swap, and suggested exercise has an explicit muscle mapping', () => {
  const ids = new Set(knownExercises().map((exercise) => exercise.id));
  for (const day of PRESCRIPTION_DATASET) for (const exercise of day.exercises) ids.add(exercise.exerciseId);
  assert.deepEqual([...ids].filter((id) => !EXERCISE_MUSCLES[id]).sort(), []);
});

test('completed primary and secondary work becomes a normalized three-level map', () => {
  const session = completeSession(profile(), 1, 1);
  session.exercises = [{
    slotId: 'bench', exerciseId: 'bench-press', exerciseName: 'Bench Press', tier: 'T1', status: 'work', sourceRefs: [],
    sets: [
      { setId: '1', type: 'straight', prescribedReps: 5, actualReps: 5, load: 100, unit: 'lb', completed: true },
      { setId: '2', type: 'straight', prescribedReps: 5, actualReps: 5, load: 100, unit: 'lb', completed: true },
      { setId: '3', type: 'straight', prescribedReps: 5, actualReps: null, load: null, unit: 'lb', completed: false },
    ],
  } as LoggedExercise];
  assert.deepEqual(musclesForWorkout(session), { chest: 3, triceps: 3, front_delts: 2 });
});

test('known custom names and extras count, while unknown custom exercises are ignored safely', () => {
  const session = completeSession(profile(), 1, 1);
  const done = [{ setId: '1', type: 'straight' as const, prescribedReps: 10, actualReps: 10, load: 20, unit: 'lb' as const, completed: true }];
  session.exercises = [
    { slotId: 'known', exerciseId: 'custom-biceps-curl', exerciseName: 'Biceps Curl', tier: 'T3a', status: 'work', sourceRefs: [], sets: done, isExtra: true },
    { slotId: 'unknown', exerciseId: 'custom-mystery-move', exerciseName: 'Mystery Move', tier: 'T3b', status: 'work', sourceRefs: [], sets: done, isExtra: true },
  ];
  assert.deepEqual(musclesForWorkout(session), { biceps: 3, forearms: 2 });
});

test('workout posts include only the aggregate map and the public parser drops bad entries', () => {
  const session = completeSession(profile(), 1, 1);
  const post = workoutActivity(session, []);
  assert.ok(post?.summary.muscles);
  assert.ok(!JSON.stringify(post?.summary).includes('exerciseId'));
  assert.deepEqual(parseMuscleIntensities({ chest: 3, lats: 1, made_up: 2, quads: 8 }), { chest: 3, lats: 1 });
  assert.equal(parseMuscleIntensities('bad'), undefined);
});
