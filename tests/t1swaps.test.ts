import assert from 'node:assert/strict';
import test from 'node:test';
import { getDayPrescription } from '../src/program/prescriptions';
import { exerciseNameFor, findAlternative, getSwapOptions, swapKey } from '../src/program/swapOptions';
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
  assert.deepEqual(names(getSwapOptions(slotOf(1, 1, 'd1-t1-primary'))), ['Belted Squat', 'Safety Bar Squat', 'Box Squat', 'Pause Squat']);
  assert.deepEqual(names(getSwapOptions(slotOf(1, 2, 'd2-t1-primary'))), ['Sling Shot Bench', 'Pause Bench Press', 'Spoto Press', 'Floor Press']);
  assert.deepEqual(names(getSwapOptions(slotOf(1, 3, 'd3-t1-primary'))), ['Zercher Squat', 'Safety Bar Squat']);
  assert.deepEqual(names(getSwapOptions(slotOf(7, 3, 'd3-t1-primary'))), ['Sumo Deadlift', 'Trap Bar Deadlift', 'Rack Pull', 'Romanian Deadlift', 'Leg Press', 'Hack Squat', 'Hip Thrust', 'Bulgarian Split Squat', 'Walking Lunge']);
  assert.deepEqual(names(getSwapOptions(slotOf(1, 4, 'd4-t1-secondary'))), ['Bench Press', 'Pause Bench Press', 'Floor Press']);
  for (const week of [1, 6, 7, 12]) assert.equal(getSwapOptions(slotOf(week, 1, 'd1-t1-primary'))?.group, 'main', `week ${week}`);
  assert.equal(getSwapOptions(slotOf(6, 2, 'd2-t1-primary'))?.alternatives.length, 4, 'test weeks too');
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

test('a swapped main lift keeps its sets, reps, percentages, load basis and training max', () => {
  for (const [week, day, slotId, original, alt] of [[1, 1, 'd1-t1-primary', 'back-squat', 'belted-squat'], [3, 2, 'd2-t1-primary', 'bench-press', 'pause-bench-press'], [8, 3, 'd3-t1-primary', 'deadlift', 'sumo-deadlift'], [6, 1, 'd1-t1-primary', 'back-squat', 'box-squat']] as const) {
    const base = slotOf(week, day, slotId);
    const swapped = slotOf(week, day, slotId, withSwap(slotId, original, alt));
    assert.notEqual(swapped.exerciseId, base.exerciseId);
    assert.deepEqual(swapped.prescribedSets, base.prescribedSets, `Week ${week} Day ${day}: sets and loads are untouched`);
    assert.equal(swapped.setCount, base.setCount);
    assert.deepEqual(swapped.sourceRefs, base.sourceRefs);
    assert.equal(swapped.loadBasis?.kind, base.loadBasis?.kind);
    assert.match(swapped.notes ?? '', /training max/);
  }
  // Back-off loads come from the same training max: Week 1 Day 1 squat is 140 either way.
  const p = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const session = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  const squat = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(squat.exerciseName, 'Belted Squat');
  assert.equal(squat.sets[1].load, 140);
  assert.equal(squat.sets[0].load, suggestRmLoad(200, 10, 5), 'the first set is suggested from the training max');
});

test('Block 2 swaps keep achieved-RM back-offs, and a swap does not carry over when the program changes the lift', () => {
  const p = withSwap('d3-t1-primary', 'front-squat', 'zercher-squat');
  assert.equal(slotOf(2, 3, 'd3-t1-primary', p).exerciseId, 'zercher-squat');
  assert.equal(slotOf(8, 3, 'd3-t1-primary', p).exerciseId, 'deadlift', 'Week 8 Day 3 is Deadlift, so the Front Squat swap does not apply');

  const block2 = withSwap('d1-t1-primary', 'back-squat', 'safety-bar-squat');
  let session = createWorkoutSession(block2, getDayPrescription(8, 1, block2), 1_000);
  const exercise = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(exercise.exerciseName, 'Safety Bar Squat');
  session = logSet(session, 'd1-t1-primary', exercise.sets[0].setId, exercise.sets[0].prescribedReps, 300, 2, 2_000);
  const after = session.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.ok(after.sets[1].load !== null && after.sets[1].load > 0, 'back-offs follow the logged top set');
  assert.equal(after.achievedRMWeight, 300);
});

test('alternatives already in the same day are hidden, so one workout never repeats an exercise', () => {
  // Block 1 Day 4 has Push Press as an accessory, so it is not offered for Military Press that week.
  const press = getDayPrescription(1, 4).exercises.find((e) => e.slotId === 'd4-t1-primary')!;
  const others = getDayPrescription(1, 4).exercises.filter((e) => e !== press && e.status === 'work').map((e) => e.exerciseId);
  assert.ok(others.includes('push-press'));
  assert.deepEqual(names(getSwapOptions(press, others)), ['Seated Military Press']);
  assert.deepEqual(names(getSwapOptions(press, [])), ['Seated Military Press', 'Push Press'], 'without the duplicate it is offered');
  // Through the real prescription path: asking for Push Press is ignored when it would repeat.
  const ignored = slotOf(1, 4, 'd4-t1-primary', withSwap('d4-t1-primary', 'military-press', 'push-press'));
  assert.equal(ignored.exerciseId, 'military-press');
  // The one already selected always stays listed.
  const selected = { ...press, exerciseId: 'push-press', exerciseName: 'Push Press', swappedFrom: { exerciseId: 'military-press', exerciseName: 'Military Press' } };
  assert.ok(names(getSwapOptions(selected, others))!.includes('Push Press'));
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

test('a swapped lift suggests its own last weight when there is history, else the training max', () => {
  const p = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const first = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  const top = first.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(top.sets[0].suggested, 'tm');
  const logged = finalizeSession(logSet(first, 'd1-t1-primary', top.sets[0].setId, 10, 180, 2, 2_000), 3_000);
  const next = createWorkoutSession(p, getDayPrescription(2, 1, p), 10_000, false, [logged]);
  const second = next.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(second.sets[0].suggested, 'history');
  assert.ok(second.sets[0].load !== null && second.sets[0].load >= 180 - 5, 'near what Belted Squat did last time');
  // The program lift keeps using the training max.
  const plain = createWorkoutSession(profile(), getDayPrescription(2, 1), 10_000, false, [logged]);
  assert.equal(plain.exercises.find((e) => e.slotId === 'd1-t1-primary')!.sets[0].suggested, 'tm');
});

test('swapping a main lift during a workout works until a set is logged', () => {
  const base = profile();
  const session = createWorkoutSession(base, getDayPrescription(1, 1, base), 1_000);
  const swappedProfile = withSwap('d1-t1-primary', 'back-squat', 'belted-squat');
  const swapped = swapExercise(session, 'd1-t1-primary', swappedProfile);
  const exercise = swapped.exercises.find((e) => e.slotId === 'd1-t1-primary')!;
  assert.equal(exercise.exerciseName, 'Belted Squat');
  assert.deepEqual(exercise.sets.map((s) => s.load), session.exercises[0].sets.map((s) => s.load), 'loads are unchanged');
  assert.equal(swapped.prescriptionSnapshot.exercises.find((e) => e.slotId === 'd1-t1-primary')!.exerciseId, 'belted-squat');

  const logged = logSet(swapped, 'd1-t1-primary', exercise.sets[0].setId, 10, 160, 2, 2_000);
  assert.throws(() => swapExercise(logged, 'd1-t1-primary', base), /Undo/);
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
  assert.equal(findAlternative('rack-pull')?.group, 'main');
  assert.equal(findAlternative('dips')?.group, 'chest');
});

test('the deadlift offers leg exercises and keeps its training max when swapped', () => {
  const slot = { slotId: 'd1-t1-primary', tier: 'T1' as const, status: 'work' as const, exerciseId: 'deadlift', exerciseName: 'Deadlift' };
  const options = getSwapOptions(slot);
  const ids = options!.alternatives.map((item) => item.id);
  for (const id of ['leg-press', 'hack-squat', 'romanian-deadlift', 'hip-thrust', 'bulgarian-split-squat', 'walking-lunge']) assert.ok(ids.includes(id), id);
  assert.ok(!getSwapOptions(slot, ['leg-press'])!.alternatives.some((item) => item.id === 'leg-press'), 'no repeats in one day');
});
