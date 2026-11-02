import assert from 'node:assert/strict';
import test from 'node:test';
import { warmupSets } from '../src/engine/warmup';
import { createWorkoutSession } from '../src/engine/sessionEngine';
import { computeTotalVolume, countCompletedSets } from '../src/engine/achievements';
import { getDayPrescription } from '../src/program/prescriptions';
import { profile } from './helpers';

const base = { barbell: 45, increment: 5 };
const loads = (steps: ReturnType<typeof warmupSets>) => steps.map((s) => s.load);

test('standard ramp: bar, 40%, 60%, 80% rounded to the plate increment', () => {
  const steps = warmupSets({ topLoad: 160, topReps: 10, ...base });
  assert.deepEqual(loads(steps), [45, 65, 95, 130]);
  assert.deepEqual(steps.map((s) => s.reps), [10, 5, 3, 2]);
  assert.deepEqual(steps.map((s) => s.id), ['w1', 'w2', 'w3', 'w4']);
  assert.deepEqual(steps.map((s) => s.label), ['Bar', '40%', '60%', '80%']);
});

test('heavy days (1 to 3 reps, including tests) ramp through 90% singles', () => {
  const steps = warmupSets({ topLoad: 225, topReps: 1, ...base });
  assert.deepEqual(loads(steps), [90, 135, 170, 205]);
  assert.deepEqual(steps.map((s) => s.reps), [5, 3, 2, 1]);
  assert.equal(warmupSets({ topLoad: 225, topReps: 3, ...base }).length, 4);
});

test('light, unknown, and bar-only tops collapse sensibly', () => {
  assert.deepEqual(loads(warmupSets({ topLoad: 60, topReps: 10, ...base })), [45, 50], 'duplicates at the bar are merged');
  assert.deepEqual(loads(warmupSets({ topLoad: null, topReps: 10, ...base })), [45], 'unknown load: just the bar');
  assert.deepEqual(warmupSets({ topLoad: 45, topReps: 10, ...base }), [], 'top set is the empty bar');
  assert.ok(loads(warmupSets({ topLoad: 160, topReps: 10, ...base })).every((l) => l < 160), 'never reaches the working weight');
});

test('step ids stay stable when the ramp is recalculated for a different top load', () => {
  const a = warmupSets({ topLoad: 160, topReps: 10, ...base });
  const b = warmupSets({ topLoad: 180, topReps: 10, ...base });
  assert.deepEqual(a.map((s) => s.id), b.map((s) => s.id));
  assert.notDeepEqual(loads(a), loads(b));
});

test('kg ramp uses the kg bar and increment', () => {
  const steps = warmupSets({ topLoad: 100, topReps: 8, barbell: 20, increment: 2.5 });
  assert.deepEqual(loads(steps), [20, 40, 60, 80]);
});

test('warm-ups are not work: ticking them changes no volume, set count, or set structure', () => {
  const p = profile();
  const session = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  const squat = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  const setsBefore = squat.sets.length;
  squat.warmupsDone = ['w1', 'w2', 'w3', 'w4'];
  assert.equal(squat.sets.length, setsBefore);
  assert.equal(computeTotalVolume(session), 0);
  assert.equal(countCompletedSets(session), 0);
});
