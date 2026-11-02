import assert from 'node:assert/strict';
import test from 'node:test';
import { convertProfileUnit, convertWeight, getDayPrescription } from '../src/engine/jnt2Engine';
import {
  allRequiredSetsLogged,
  chooseBackoffLoad,
  createWorkoutSession,
  finalizeSession,
  logSet,
  makeSkippedSession,
  missingTrainingMaxes,
  nextProgramPosition,
  undoSet,
} from '../src/engine/sessionEngine';
import { profile } from './helpers';

test('missing and invalid block training maxes prevent session generation', () => {
  const missingBlock1 = profile({ trainingMaxes: { squat: 200 } });
  const day1 = getDayPrescription(1, 1, missingBlock1);
  assert.deepEqual(missingTrainingMaxes(day1, missingBlock1), ['Block 1 deadlift TM']);
  assert.throws(() => createWorkoutSession(missingBlock1, day1), /deadlift TM/);

  // Block 2 falls back to the Block 1 value for any lift whose Block 2 value is not saved yet.
  const defaulted = profile({ block2ConfirmedTMs: { squat: 210 } });
  const day3 = getDayPrescription(7, 3, defaulted);
  assert.deepEqual(missingTrainingMaxes(day3, defaulted), []);
  const fromBlock1 = createWorkoutSession(defaulted, day3);
  const t2a = fromBlock1.exercises.find((e) => e.slotId === 'd3-t2a')!;
  assert.ok(t2a.sets.every((set) => set.load !== null), 'Block 2 T2a loads are filled from the Block 1 TM');

  // Still missing (and still blocking) when neither block has a value for the lift.
  const neither = profile({ trainingMaxes: { squat: 200, bench: 180, deadlift: 300, ohp: 120 }, block2ConfirmedTMs: { squat: 210 } });
  assert.deepEqual(missingTrainingMaxes(getDayPrescription(7, 3, neither), neither), ['Block 2 front squat TM']);
  assert.throws(() => createWorkoutSession(neither, getDayPrescription(7, 3, neither)), /front squat TM/);

  const invalid = profile({ trainingMaxes: { ...profile().trainingMaxes, deadlift: Number.NaN } });
  assert.throws(() => createWorkoutSession(invalid, getDayPrescription(1, 1, invalid)), /deadlift TM/);
});

test('block-two target RM mismatch requires an explicit saved back-off decision', () => {
  const p = profile({ currentWeek: 7 });
  let session = createWorkoutSession(p, getDayPrescription(7, 1, p), 100);
  const exercise = session.exercises.find((item) => item.slotId === 'd1-t1-primary')!;
  session = logSet(session, exercise.slotId, exercise.sets[0].setId, 5, 200, 1, 101);
  const changed = session.exercises.find((item) => item.slotId === exercise.slotId)!;
  assert.equal(changed.targetRM, 6);
  assert.equal(changed.achievedRMReps, 5);
  assert.equal(changed.manualLoadDecisionPending, true);
  assert.ok(changed.sets.filter((set) => set.type === 'backoff').every((set) => set.load === null));
  assert.equal(allRequiredSetsLogged(session), false);

  session = chooseBackoffLoad(session, exercise.slotId, 165, 102);
  const decided = session.exercises.find((item) => item.slotId === exercise.slotId)!;
  assert.equal(decided.manualLoadDecisionPending, false);
  assert.equal(decided.manualBackoffLoad, 165);
  assert.ok(decided.sets.filter((set) => set.type === 'backoff').every((set) => set.load === 165 && set.userLoadOverride));
});

test('matching target RM calculates from achieved load and correction preserves completed history and overrides', () => {
  const p = profile({ currentWeek: 7 });
  let session = createWorkoutSession(p, getDayPrescription(7, 1, p), 100);
  const slotId = 'd1-t1-primary';
  let exercise = session.exercises.find((item) => item.slotId === slotId)!;
  session = logSet(session, slotId, exercise.sets[0].setId, 6, 200, 1, 101);
  exercise = session.exercises.find((item) => item.slotId === slotId)!;
  assert.ok(exercise.sets.filter((set) => set.type === 'backoff').every((set) => set.load === 170));

  session = logSet(session, slotId, exercise.sets[1].setId, 3, 170, 2, 102);
  exercise = session.exercises.find((item) => item.slotId === slotId)!;
  session = logSet(session, slotId, exercise.sets[2].setId, 3, 165, 2, 103);
  exercise = session.exercises.find((item) => item.slotId === slotId)!;
  session = undoSet(session, slotId, exercise.sets[0].setId, 104);
  exercise = session.exercises.find((item) => item.slotId === slotId)!;
  assert.equal(exercise.sets[1].completed, true);
  assert.equal(exercise.sets[1].load, 170);
  assert.equal(exercise.sets[2].completed, true);
  assert.equal(exercise.sets[2].load, 165);
  assert.equal(exercise.sets[2].userLoadOverride, true);
  assert.ok(exercise.sets.slice(3).every((set) => set.load === null));

  session = logSet(session, slotId, exercise.sets[0].setId, 6, 210, 1, 105);
  exercise = session.exercises.find((item) => item.slotId === slotId)!;
  assert.equal(exercise.sets[1].load, 170, 'completed set is historical fact');
  assert.equal(exercise.sets[2].load, 165, 'completed user override is preserved');
  assert.ok(exercise.sets.slice(3).every((set) => set.load === 180));
});

test('3+ and 3MRS semantics preserve prescribed and achieved reps separately', () => {
  const p = profile();
  let session = createWorkoutSession(p, getDayPrescription(1, 1, p), 100);
  const main = session.exercises.find((item) => item.slotId === 'd1-t1-primary')!;
  const backoffs = main.sets.filter((set) => set.type === 'backoff');
  assert.equal(backoffs.length, 3);
  assert.equal(backoffs.filter((set) => set.isAmrap).length, 1);
  assert.equal(backoffs.at(-1)!.isAmrap, true);

  const accessory = session.exercises.find((item) => item.slotId === 'd1-t2b')!;
  assert.equal(accessory.sets.length, 4);
  assert.deepEqual(accessory.sets.map((set) => set.type), ['rm_target', 'mrs', 'mrs', 'mrs']);
  session = logSet(session, accessory.slotId, accessory.sets[0].setId, 15, 80, 1, 101);
  for (const [index, reps] of [12, 10, 8].entries()) {
    const updated = session.exercises.find((item) => item.slotId === accessory.slotId)!;
    session = logSet(session, accessory.slotId, updated.sets[index + 1].setId, reps, 80, 1, 102 + index);
  }
  const logged = session.exercises.find((item) => item.slotId === accessory.slotId)!;
  assert.deepEqual(logged.sets.map((set) => set.prescribedReps), [15, 15, 15, 15]);
  assert.deepEqual(logged.sets.map((set) => set.actualReps), [15, 12, 10, 8]);
});

test('declining an optional AMRAP does not make the workout unsuccessful', () => {
  const p = profile({ currentWeek: 6, currentDay: 1 });
  let session = createWorkoutSession(p, getDayPrescription(6, 1, p), 100);
  for (const exercise of session.exercises) {
    for (const original of exercise.sets) {
      const set = session.exercises.find((item) => item.slotId === exercise.slotId)!.sets.find((item) => item.setId === original.setId)!;
      session = logSet(session, exercise.slotId, set.setId, set.prescribedReps, set.load ?? 100, 2, 101, Boolean(set.isAmrap));
    }
  }
  assert.equal(finalizeSession(session).status, 'completed');

  const w1 = createWorkoutSession(profile(), getDayPrescription(1, 1), 200);
  const main = w1.exercises[0];
  const amrap = main.sets.find((set) => set.isAmrap)!;
  const declined = logSet(w1, main.slotId, amrap.setId, amrap.prescribedReps, amrap.load!, 2, 201, true);
  assert.equal(declined.exercises[0].sets.find((set) => set.setId === amrap.setId)!.amrapDeclined, true);
});

test('partial, skipped, and end-of-cycle positions are explicit', () => {
  const p = profile();
  const partial = finalizeSession(createWorkoutSession(p, getDayPrescription(1, 1), 1), 2);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.isPartial, true);
  const skipped = makeSkippedSession(p, getDayPrescription(1, 1), 3);
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.isSkipped, true);
  assert.deepEqual(nextProgramPosition(profile({ currentWeek: 1, currentDay: 4 })), { currentWeek: 2, currentDay: 1, cycleCompleted: false });
  assert.deepEqual(nextProgramPosition(profile({ currentWeek: 12, currentDay: 4 })), { currentWeek: 12, currentDay: 4, cycleCompleted: true });
  assert.deepEqual(nextProgramPosition(profile({ currentWeek: 12, currentDay: 4, cycleCompleted: true })), { currentWeek: 12, currentDay: 4, cycleCompleted: true });
});

test('unit changes convert profile loads and never merely relabel numbers', () => {
  const pounds = profile({ trainingMaxes: { squat: 220.462, bench: 110.231, deadlift: 330.693, ohp: 88.185, front_squat: 176.37 } });
  const metric = convertProfileUnit(pounds, 'kg');
  assert.equal(metric.unit, 'kg');
  assert.equal(metric.trainingMaxes.squat, 100);
  assert.equal(metric.equipmentIncrement, 2.5);
  assert.equal(metric.barbellWeight, 20);
  assert.ok(Math.abs(convertWeight(100, 'kg', 'lb') - 220.462262) < 0.001);
  const same = convertProfileUnit(metric, 'kg');
  assert.equal(same, metric);
});
