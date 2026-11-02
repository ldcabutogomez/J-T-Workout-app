import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestFromHistory, suggestRmLoad } from '../src/engine/suggestions';
import { createWorkoutSession, logSet } from '../src/engine/sessionEngine';
import { getDayPrescription } from '../src/program/prescriptions';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

test('RM-set suggestion is estimated from the training max and rounded to the plate increment', () => {
  // TM is an estimated daily 2RM: 1RM = TM x (1 + 2/30), nRM = 1RM / (1 + n/30).
  assert.equal(suggestRmLoad(200, 10, 5), 160);
  assert.equal(suggestRmLoad(200, 8, 5), 170);
  assert.equal(suggestRmLoad(200, 1, 5), 205, 'test weeks suggest a near-max single');
  assert.equal(suggestRmLoad(100, 5, 2.5), 92.5, 'kg increment');
});

test('history suggestion rescales the last logged top set to today\'s rep target, per exercise', () => {
  const prior = completeSession(profile(), 1, 1, 1_000);
  const squat = prior.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  Object.assign(squat.sets[0], { completed: true, actualReps: 12, load: 100, unit: 'lb', type: 'rm_target' });
  const history: WorkoutSession[] = [prior];
  // 1RM estimate 100 x (1 + 12/30) = 140.
  assert.equal(suggestFromHistory('back-squat', 15, history, 'lb', 5), 95);
  assert.equal(suggestFromHistory('back-squat', 6, history, 'lb', 5), 115);
  assert.equal(suggestFromHistory('front-squat', 6, history, 'lb', 5), null, 'a different exercise has no history');
  assert.equal(suggestFromHistory('back-squat', 6, [], 'lb', 5), null, 'blank the first time');
  assert.equal(suggestFromHistory('back-squat', 6, [{ ...prior, status: 'skipped', isSkipped: true }], 'lb', 5), null, 'skipped sessions are ignored');
  const kg = suggestFromHistory('back-squat', 12, history, 'kg', 2.5)!;
  assert.ok(Math.abs(kg - 45.4) < 2.6, `100 lb is about 45 kg (${kg})`);
});

test('new sessions pre-fill suggested loads, label them, and never touch workbook-computed loads', () => {
  const p = profile();
  const prior = completeSession(p, 1, 2, 1_000);
  const bench = prior.exercises.find((e) => e.slotId === 'd2-t2b')!;
  Object.assign(bench.sets[0], { completed: true, actualReps: 15, load: 60, unit: 'lb', type: 'rm_target' });

  const day1 = createWorkoutSession(p, getDayPrescription(1, 1, p), 5_000, false, [prior]);
  const squat = day1.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(squat.sets[0].load, 160, 'Find 10RM is suggested from the squat TM of 200');
  assert.equal(squat.sets[0].suggested, 'tm');
  assert.equal(squat.sets[1].load, 140, 'back-offs still use the workbook formula');
  assert.equal(squat.sets[1].suggested, undefined);
  const deficit = day1.exercises.find((e) => e.slotId === 'd1-t2a')!;
  assert.equal(deficit.sets[0].load, 150);
  assert.equal(deficit.sets[0].suggested, undefined);
  const legPress = day1.exercises.find((e) => e.slotId === 'd1-t2b')!;
  assert.equal(legPress.sets[0].load, null, 'no history for this exercise yet');

  const day2 = createWorkoutSession(p, getDayPrescription(1, 2, p), 6_000, false, [prior]);
  const incline = day2.exercises.find((e) => e.slotId === 'd2-t2b')!;
  assert.equal(incline.sets[0].suggested, 'history');
  assert.ok(incline.sets[0].load !== null && incline.sets[0].load > 0);

  // Logging clears the label and records the lifter's actual load.
  const logged = logSet(day1, 'd1-t1-primary', squat.sets[0].setId, 10, 165, 2, 7_000);
  const loggedSet = logged.exercises.find((e) => e.slotId === 'd1-t1-primary')!.sets[0];
  assert.equal(loggedSet.load, 165);
  assert.equal(loggedSet.suggested, undefined);
});

test('Sling Shot and Block 2 RM sets suggest from the right training max', () => {
  const p = profile();
  const slingShot = createWorkoutSession(p, getDayPrescription(1, 4, p), 1, false).exercises.find((e) => e.slotId === 'd4-t1-secondary')!;
  assert.equal(slingShot.sets[0].suggested, 'tm');
  assert.equal(slingShot.sets[0].load, suggestRmLoad(180, slingShot.sets[0].prescribedReps, 5), 'uses the bench TM');

  // Block 2 with no saved Block 2 TMs falls back to Block 1 values for the suggestion too.
  const onlyBlock1 = profile({ block2ConfirmedTMs: undefined });
  const week7 = createWorkoutSession(onlyBlock1, getDayPrescription(7, 1, onlyBlock1), 1, false).exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(week7.sets[0].load, suggestRmLoad(200, week7.sets[0].prescribedReps, 5));
});
