import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomWorkoutSession } from '../src/engine/customWorkouts';
import { muscleVolumeDistribution } from '../src/engine/muscleDistribution';
import { formatWorkoutElapsed, stopWorkoutTimer, toggleWorkoutTimer, workoutElapsedMs } from '../src/lib/workoutTimer';
import type { CustomWorkoutTemplate } from '../src/types';
import { profile } from './helpers';

test('workout timer excludes paused time and freezes when stopped', () => {
  const session = createCustomWorkoutSession(profile(), {
    id: 'timer-template', name: 'Timer', createdAt: 1_000, updatedAt: 1_000,
    exercises: [{ id: 'squat-row', exerciseId: 'back-squat', name: 'Squat', sets: [{ id: 'set-1', mode: 'standard', reps: 5 }] }],
  }, 1_000);
  const paused = toggleWorkoutTimer(session, 61_000);
  assert.equal(workoutElapsedMs(paused, 121_000), 60_000);
  const resumed = toggleWorkoutTimer(paused, 121_000);
  const stopped = stopWorkoutTimer(resumed, 151_000);
  assert.equal(workoutElapsedMs(stopped, 999_000), 90_000);
  assert.equal(formatWorkoutElapsed(90_000), '1:30');
});

test('custom workout snapshots standard, failure, and drop sets without advancing the program', () => {
  const template: CustomWorkoutTemplate = {
    id: 'custom-1', name: 'Leg finisher', createdAt: 2_000, updatedAt: 2_000,
    exercises: [{
      id: 'squat-row', exerciseId: 'squat', name: 'Squat',
      sets: [
        { id: 'standard', mode: 'standard', reps: 5 },
        { id: 'failure', mode: 'failure', reps: 0 },
        { id: 'drop', mode: 'drop', reps: 8, stages: 3 },
      ],
    }],
  };
  const session = createCustomWorkoutSession(profile({ currentWeek: 7, currentDay: 3 }), template, 2_000);
  assert.equal(session.workoutKind, 'custom');
  assert.equal(session.customName, 'Leg finisher');
  assert.equal(session.exercises[0].sets.length, 5);
  assert.equal(session.exercises[0].sets[1].customMode, 'failure');
  assert.equal(session.exercises[0].sets[1].rir, 0);
  assert.deepEqual(session.exercises[0].sets.slice(2).map((set) => set.dropStage), [0, 1, 2]);
  assert.equal(session.week, 1, 'custom sessions are intentionally outside the J&T schedule');
});

test('muscle radar distributes completed load and ignores unfinished sets', () => {
  const session = createCustomWorkoutSession(profile(), {
    id: 'radar-template', name: 'Radar', createdAt: 1, updatedAt: 1,
    exercises: [{ id: 'squat-row', exerciseId: 'back-squat', name: 'Squat', sets: [{ id: 'set-1', mode: 'standard', reps: 5 }] }],
  }, 1);
  session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], completed: true, actualReps: 5, load: 100 };
  session.exercises[0].sets.push({ ...session.exercises[0].sets[0], setId: 'unfinished', completed: false, actualReps: 100, load: 100 });
  const result = muscleVolumeDistribution([session], 'lb');
  assert.equal(Object.values(result).reduce((sum, value) => sum + value, 0), 500);
  assert.ok(result.Quads > 0);
  assert.ok(result['Posterior + core'] > 0);
});
