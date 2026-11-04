import assert from 'node:assert/strict';
import test from 'node:test';
import { getDayPrescription } from '../src/program/prescriptions';
import { exerciseNameFor, getSwapOptions, swapKey } from '../src/program/swapOptions';
import { createWorkoutSession, finalizeSession, logSet, swapExercise, undoSet } from '../src/engine/sessionEngine';
import { findAllComparableResults } from '../src/engine/encouragement';
import { suggestRmLoad } from '../src/engine/suggestions';
import { weekAgenda, planFromToday } from '../src/engine/schedule';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

const slotOf = (week: number, day: number, slotId: string, p = profile()) =>
  getDayPrescription(week, day, p).exercises.find((item) => item.slotId === slotId)!;
const withSwap = (slotId: string, original: string, alternative: string, extra = {}) =>
  profile({ exerciseSwaps: { [swapKey(slotId, original)]: alternative }, ...extra });
const names = (options: ReturnType<typeof getSwapOptions>) => options?.alternatives.map((a) => a.name);

test('every main lift offers its own alternatives, in work and test weeks alike', () => {
  assert.deepEqual(names(getSwapOptions(slotOf(1, 1, 'd1-t1-primary'))), ['Pause Squat', 'Belted Squat', 'Safety Bar Squat', 'Box Squat', 'Front Squat']);
  assert.deepEqual(names(getSwapOptions(slotOf(1, 2, 'd2-t1-primary'))), ['Pause Bench Press', 'Spoto Press', 'Sling Shot Bench', 'DB Bench Press', 'Floor Press']);
  assert.deepEqual(names(getSwapOptions(slotOf(1, 3, 'd3-t1-primary'))), ['Pause Squat', 'Belted Squat', 'Safety Bar Squat', 'Box Squat', 'Front Squat']);
  assert.deepEqual(names(getSwapOptions(slotOf(7, 3, 'd3-t1-primary'))), ['Sumo Deadlift', 'Trap Bar Deadlift', 'Rack Pull', 'Romanian Deadlift', 'Hip Thrust'], 'RDL and hip thrust rescale sets and reps');
  assert.deepEqual(names(getSwapOptions(slotOf(1, 4, 'd4-t1-secondary'))), ['Bench Press', 'Pause Bench Press', 'Floor Press']);
  for (const week of [1, 6, 7, 12]) assert.equal(getSwapOptions(slotOf(week, 1, 'd1-t1-primary'))?.group, 'main', `week ${week}`);
  assert.equal(getSwapOptions(slotOf(6, 2, 'd2-t1-primary'))?.alternatives.length, 5, 'test weeks too');
  assert.ok(getSwapOptions(slotOf(7, 3, 'd3-t1-primary'))!.alternatives.every((item) => item.fit === 'direct' || item.fit === 'conditional'));
});

test('Bench Press and Sling Shot Bench swap with each other in both directions', () => {
  const toSling = slotOf(1, 2, 'd2-t1-primary', withSwap('d2-t1-primary', 'bench-press', 'sling-shot-bench'));
  assert.equal(toSling.exerciseName, 'Sling Shot Bench');
  assert.equal(toSling.swappedFrom?.exerciseName, 'Bench Press');
  const toBench = slotOf(1, 4, 'd4-t1-secondary', withSwap('d4-t1-secondary', 'sling-shot-bench', 'bench-press'));
  assert.equal(toBench.exerciseName, 'Bench Press');
  assert.equal(toBench.exerciseId, 'bench-press');
  assert.equal(getSwapOptions(toBench)!.selectedId, 'bench-press');
  assert.equal(getSwapOptions(toBench)!.original.exerciseName, 'Sling Shot Bench', 'the program lift stays reachable');
});

test('a swapped main lift keeps its sets, reps and percentages, but never the program lift\'s training max', () => {
  for (const [week, day, slotId, original, alt] of [[1, 1, 'd1-t1-primary', 'back-squat', 'belted-squat'], [3, 2, 'd2-t1-primary', 'bench-press', 'pause-bench-press'], [8, 3, 'd3-t1-primary', 'deadlift', 'sumo-deadlift'], [6, 1, 'd1-t1-primary', 'back-squat', 'box-squat']] as const) {
    const base = slotOf(week, day, slotId);
    const swapped = slotOf(week, day, slotId, withSwap(slotId, original, alt));
    assert.notEqual(swapped.exerciseId, base.exerciseId);
    assert.deepEqual(swapped.prescribedSets.map((set) => [set.type, set.prescribedReps, set.percentage]), base.prescribedSets.map((set) => [set.type, set.prescribedReps, set.percentage]), `Week ${week} Day ${day}: sets, reps and percentages are untouched`);
    assert.equal(swapped.setCount, base.setCount);
    assert.deepEqual(swapped.sourceRefs, base.sourceRefs);
    assert.equal(swapped.loadBasis?.kind, base.loadBasis?.kind);
    for (const set of swapped.prescribedSets) {
      if (set.loadBasis.kind === 'training_max') assert.equal(set.loadBasis.variationId, alt, 'a TM basis belongs to the variation');
      assert.ok(!set.suggestFrom || set.suggestFrom.variationId === alt, 'the top set is never seeded from the program lift');
    }
  }
  // Block 1: back-offs stay unset until the variation has its own TM. 140 would be the Back Squat TM talking.
  const p = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const session = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  const squat = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(squat.exerciseName, 'Belted Squat');
  assert.deepEqual(squat.sets.map((set) => set.load), [null, null, null, null]);
  const withTm = { ...p, variationTrainingMaxes: { 'belted-squat:1': 150 } };
  const seeded = createWorkoutSession(withTm, getDayPrescription(1, 1, withTm), 1_000).exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(seeded.sets[1].load, 105, '70% of the Belted Squat TM');
  assert.equal(seeded.sets[0].load, suggestRmLoad(150, 10, 5), 'the first set is suggested from the variation TM');
  assert.equal(seeded.sets[0].suggested, 'tm');
});

test('Block 2 swaps keep achieved-RM back-offs, and a swap does not carry over when the program changes the lift', () => {
  const p = withSwap('d3-t1-primary', 'back-squat', 'front-squat');
  assert.equal(slotOf(2, 3, 'd3-t1-primary', p).exerciseId, 'front-squat');
  assert.equal(slotOf(8, 3, 'd3-t1-primary', p).exerciseId, 'deadlift', 'Week 8 Day 3 is Deadlift, so the squat swap does not apply');

  const block2 = withSwap('d1-t1-primary', 'back-squat', 'safety-bar-squat');
  let session = createWorkoutSession(block2, getDayPrescription(8, 1, block2), 1_000);
  const exercise = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(exercise.exerciseName, 'Safety Bar Squat');
  session = logSet(session, 'd1-t1-primary', exercise.sets[0].setId, exercise.sets[0].prescribedReps, 300, 2, 2_000);
  const after = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.ok(after.sets[1].load !== null && after.sets[1].load > 0, 'back-offs follow the logged top set');
  assert.equal(after.achievedRMWeight, 300);
});

test('an alternative already in the same day is unavailable, and the prescription path agrees', () => {
  // Block 1 Day 4 has Push Press as an accessory, so it is not offered for Military Press that week.
  const press = getDayPrescription(1, 4).exercises.find((e) => e.slotId === 'd4-t1-primary')!;
  const others = getDayPrescription(1, 4).exercises.filter((e) => e !== press && e.status === 'work').map((e) => e.exerciseId);
  assert.ok(others.includes('push-press'));
  const blocked = getSwapOptions(press, others)!.alternatives.find((item) => item.id === 'push-press')!;
  assert.match(blocked.disabledReason ?? '', /already in this workout/);
  assert.equal(getSwapOptions(press, [])!.alternatives.find((item) => item.id === 'push-press')!.disabledReason, undefined, 'without the duplicate it is available');
  // Through the real prescription path the stored swap is flagged, never silently applied or dropped.
  const flagged = slotOf(1, 4, 'd4-t1-primary', withSwap('d4-t1-primary', 'military-press', 'push-press'));
  assert.equal(flagged.exerciseId, 'military-press');
  assert.equal(flagged.swapReview?.reason, 'duplicate');
  assert.equal(flagged.swapReview?.storedId, 'push-press');
  // The one already selected always stays selectable.
  const selected = { ...press, exerciseId: 'push-press', exerciseName: 'Push Press', swappedFrom: { exerciseId: 'military-press', exerciseName: 'Military Press' } };
  assert.equal(getSwapOptions(selected, others)!.alternatives.find((item) => item.id === 'push-press')!.disabledReason, undefined);
});

test('a swapped lift has its own PR history, and the program lift\'s history is untouched', () => {
  const p = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const prior = completeSession(profile(), 1, 1, 1_000);
  prior.sessionId = 'back-squat-session';
  const belted = createWorkoutSession(p, getDayPrescription(2, 1, p), 5_000);
  const top = belted.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  const done = { ...finalizeSession(logSet(belted, 'd1-t1-primary', top.sets[0].setId, 8, 250, 2, 6_000), 7_000), status: 'completed' as const, isPartial: false };
  const result = findAllComparableResults(done, [prior]).find((r) => r.exerciseId === 'belted-squat')!;
  assert.equal(result.kind, 'benchmark', 'the first Belted Squat is a benchmark, not compared with Back Squat');
});

test('a swapped lift suggests its own last weight when there is history, and otherwise nothing', () => {
  const p = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const first = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  const top = first.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(top.sets[0].load, null, 'no Belted Squat history or TM: no load from the Back Squat TM');
  assert.equal(top.sets[0].suggested, undefined);
  const logged = finalizeSession(logSet(first, 'd1-t1-primary', top.sets[0].setId, 10, 180, 2, 2_000), 3_000);
  const next = createWorkoutSession(p, getDayPrescription(2, 1, p), 10_000, false, [logged]);
  const second = next.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(second.sets[0].suggested, 'history');
  assert.ok(second.sets[0].load !== null && second.sets[0].load >= 180 - 5, 'near what Belted Squat did last time');
  // The program lift keeps using the training max.
  const plain = createWorkoutSession(profile(), getDayPrescription(2, 1), 10_000, false, [logged]);
  assert.equal(plain.exercises.find((e) => e.slotId === 'd1-t1-primary')!.sets[0].suggested, 'tm');
});

test('swapping a main lift during a workout works until a set is logged, and clears loads that belonged to the old lift', () => {
  const base = profile();
  let session = createWorkoutSession(base, getDayPrescription(1, 1, base), 1_000);
  const original = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(original.sets[1].load, 140);
  session = logSet(session, 'd1-t1-primary', original.sets[0].setId, 10, 130, 2, 1_500);
  session = undoSet(session, 'd1-t1-primary', original.sets[0].setId);
  const swappedProfile = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const swapped = swapExercise(session, 'd1-t1-primary', swappedProfile);
  const exercise = swapped.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(exercise.exerciseName, 'Belted Squat');
  assert.deepEqual(exercise.sets.map((s) => s.load), [null, null, null, null], 'the Back Squat loads are gone');
  assert.equal(swapped.prescriptionSnapshot.exercises.find((e) => e.slotId === 'd1-t1-primary')!.exerciseId, 'belted-squat');

  const logged = logSet(swapped, 'd1-t1-primary', exercise.sets[0].setId, 10, 160, 2, 2_000);
  assert.throws(() => swapExercise(logged, 'd1-t1-primary', base), /Completed sets stay attached to Belted Squat/);
  const undone = undoSet(logged, 'd1-t1-primary', exercise.sets[0].setId);
  assert.equal(swapExercise(undone, 'd1-t1-primary', base).exercises.find((e) => e.slotId === 'd1-t1-primary')!.exerciseId, 'back-squat');
});

test('the calendar shows the swapped lift, and a finished workout keeps the lift that was done', () => {
  const p = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const schedule = planFromToday(1, [], '2024-05-13');
  const lift = (profileArg: typeof p | undefined, history: WorkoutSession[] = []) =>
    weekAgenda(schedule, history, '2024-05-13', '2024-05-13', profileArg).flatMap((d) => d.items).find((i) => i.key === 'W1D1')!.lift;
  assert.equal(lift(undefined), 'Back Squat');
  assert.equal(lift(p), 'Belted Squat');
  const session = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  const done = { ...session, status: 'completed' as const, completedTime: new Date(2024, 4, 13, 12).getTime() };
  assert.equal(lift(profile(), [done]), 'Belted Squat', 'what was actually done is what the calendar shows');
});

test('names resolve from ids, including main-lift alternatives', () => {
  assert.equal(exerciseNameFor('belted-squat'), 'Belted Squat');
  assert.equal(exerciseNameFor('back-squat'), 'Back Squat');
  assert.equal(exerciseNameFor('hip-thrust'), 'Hip Thrust');
  assert.equal(exerciseNameFor('some-new-lift'), 'Some New Lift');
  assert.equal(exerciseNameFor('rack-pull'), 'Rack Pull');
  assert.equal(exerciseNameFor('dips'), 'Dips');
});

test('the deadlift no longer offers leg exercises or hinges as automatic replacements', () => {
  const slot = { slotId: 'd1-t1-primary', tier: 'T1' as const, status: 'work' as const, exerciseId: 'deadlift', exerciseName: 'Deadlift' };
  const ids = getSwapOptions(slot)!.alternatives.map((item) => item.id);
  assert.deepEqual(ids, ['sumo-deadlift', 'trap-bar-deadlift', 'rack-pull', 'romanian-deadlift', 'hip-thrust']);
  for (const id of ['leg-press', 'hack-squat', 'bulgarian-split-squat', 'walking-lunge']) assert.ok(!ids.includes(id), id);
});

test('deadlift to RDL or hip thrust rescales sets and reps, with loads only from the replacement', () => {
  for (const [alt, minReps, maxReps] of [['romanian-deadlift', 6, 10], ['hip-thrust', 8, 12]] as const) {
    for (const week of [7, 8, 9, 10, 11]) {
      const base = slotOf(week, 3, 'd3-t1-primary');
      const swapped = slotOf(week, 3, 'd3-t1-primary', withSwap('d3-t1-primary', 'deadlift', alt));
      assert.equal(swapped.exerciseId, alt, `${alt} wk${week}`);
      assert.equal(swapped.swapReview, undefined);
      assert.equal(swapped.setCount, swapped.prescribedSets.length);
      assert.equal(swapped.repTarget, swapped.prescribedSets[0].prescribedReps);
      assert.ok(swapped.prescribedSets.every((set) => set.prescribedReps >= minReps && set.prescribedReps <= maxReps), `${alt} wk${week} reps`);
      const work = (s: typeof base) => s.prescribedSets.reduce((sum, set) => sum + set.prescribedReps, 0);
      assert.ok(work(swapped) >= work(base), 'total reps never drop below the heavy scheme');
      assert.ok(swapped.prescribedSets.filter((set) => set.type === 'backoff').every((set) => set.loadBasis.kind === 'achieved_rm' && (set.percentage ?? 2) < 1), 'back-offs stay a fraction of the logged top set');
    }
    const test12 = slotOf(12, 3, 'd3-t1-primary', withSwap('d3-t1-primary', 'deadlift', alt));
    assert.equal(test12.exerciseId, 'deadlift', '1RM test week is not rescaled');
    assert.equal(test12.swapReview?.reason, 'reps');
    const option = getSwapOptions(slotOf(12, 3, 'd3-t1-primary'))!.alternatives.find((item) => item.id === alt)!;
    assert.ok(option.disabledReason && option.schemeSummary);
  }
});

test('bench press to DB bench press: own training max, per-dumbbell loads, and never on a 1RM test week', () => {
  const swapped = slotOf(1, 2, 'd2-t1-primary', withSwap('d2-t1-primary', 'bench-press', 'db-bench-press'));
  assert.equal(swapped.exerciseId, 'db-bench-press');
  assert.equal(swapped.swapReview, undefined);
  const base = slotOf(1, 2, 'd2-t1-primary');
  assert.deepEqual(swapped.prescribedSets.map((set) => set.prescribedReps), base.prescribedSets.map((set) => set.prescribedReps), 'the program reps are kept');
  assert.deepEqual(swapped.loadBasis, { kind: 'training_max', key: 'bench', block: 1, variationId: 'db-bench-press' });
  const sessionNoTm = createWorkoutSession(withSwap('d2-t1-primary', 'bench-press', 'db-bench-press'), getDayPrescription(1, 2, withSwap('d2-t1-primary', 'bench-press', 'db-bench-press')), 1_000);
  const logged = sessionNoTm.exercises.find((e) => e.slotId === 'd2-t1-primary')!;
  assert.ok(logged.sets.slice(1).every((set) => set.load === null), 'the barbell bench TM is not borrowed');
  assert.equal(logged.loadNotation, 'per_dumbbell');
  for (const week of [6, 12]) {
    const test = slotOf(week, 2, 'd2-t1-primary', withSwap('d2-t1-primary', 'bench-press', 'db-bench-press'));
    assert.equal(test.exerciseId, 'bench-press', `week ${week} is a test week`);
    assert.equal(getSwapOptions(slotOf(week, 2, 'd2-t1-primary'))!.alternatives.find((item) => item.id === 'db-bench-press')?.disabledReason !== undefined, true);
  }
});
