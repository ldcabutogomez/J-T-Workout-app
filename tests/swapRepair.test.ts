import assert from 'node:assert/strict';
import test from 'node:test';
import { getDayPrescription } from '../src/program/prescriptions';
import { SWAP_RULES, getSwapOptions, isSwapSupported, swapKey } from '../src/program/swapOptions';
import { loadNotationFor } from '../src/program/loadNotation';
import { clearSuggestedLoads, createWorkoutSession, finalizeSession, logSet, swapExercise, undoSet } from '../src/engine/sessionEngine';
import { lastLoggedFor } from '../src/engine/suggestions';
import { planFromToday, weekAgenda } from '../src/engine/schedule';
import type { WorkoutSession } from '../src/types';
import { profile } from './helpers';

const slotOf = (week: number, day: number, slotId: string, p = profile()) =>
  getDayPrescription(week, day, p).exercises.find((item) => item.slotId === slotId)!;
const withSwaps = (swaps: Array<[string, string, string]>, extra = {}) =>
  profile({ exerciseSwaps: Object.fromEntries(swaps.map(([slot, original, alt]) => [swapKey(slot, original), alt])), ...extra });
const session = (p: ReturnType<typeof profile>, week: number, day: number, history: WorkoutSession[] = [], now = 1_000) =>
  createWorkoutSession(p, getDayPrescription(week, day, p), now, false, history);
const exOf = (s: WorkoutSession, slotId: string) => s.exercises.find((e) => e.slotId === slotId)!;
const done = (s: WorkoutSession, slotId: string, reps: number, load: number, at: number) =>
  finalizeSession(logSet(s, slotId, exOf(s, slotId).sets[0].setId, reps, load, 2, at), at + 1);

test('first-time DB Fly gets no load converted from Pec Fly, and its own logged history is used later', () => {
  const base = profile();
  const pec = done(session(base, 1, 2), 'd2-t3c', 20, 100, 2_000);
  const p = withSwaps([['d2-t3c', 'pec-flye', 'db-fly']]);
  const first = session(p, 1, 2, [pec], 3_000);
  assert.equal(exOf(first, 'd2-t3c').exerciseId, 'db-fly');
  assert.deepEqual(exOf(first, 'd2-t3c').sets.map((set) => set.load), [null, null, null, null], 'before: 50 from a 0.5 factor');
  const fly = done(first, 'd2-t3c', 12, 20, 4_000);
  const later = session(p, 2, 2, [pec, fly], 5_000);
  const set1 = exOf(later, 'd2-t3c').sets[0];
  assert.equal(set1.suggested, 'history');
  assert.equal(set1.load, 20, 'DB Fly\'s own 20 x 12 at the week-2 target');
  assert.deepEqual(lastLoggedFor('db-fly', [pec, fly]), { load: 20, reps: 12, unit: 'lb', completedAt: fly.completedTime ?? fly.startTime, notation: 'per_dumbbell' });
  assert.equal(exOf(session(base, 2, 2, [pec, fly], 5_000), 'd2-t3c').exerciseId, 'pec-flye');
});

test('Week 1 Day 3 back squat to front squat inherits no squat TM', () => {
  const p = withSwaps([['d3-t1-primary', 'back-squat', 'front-squat']]);
  const s = exOf(session(p, 1, 3), 'd3-t1-primary');
  assert.equal(s.exerciseId, 'front-squat');
  assert.deepEqual(s.sets.map((set) => set.load), [null, null, null, null], 'the back squat TM is not borrowed');
  const tm = { ...p, variationTrainingMaxes: { 'front-squat:1': 150 } };
  const seeded = exOf(session(tm, 1, 3), 'd3-t1-primary');
  assert.equal(seeded.sets[1].load, 105);
  assert.equal(p.trainingMaxes.squat, 200, 'the program TM is untouched');
});

test('Week 7 deadlift to sumo: top set unset, back-offs follow the logged top set', () => {
  const p = withSwaps([['d3-t1-primary', 'deadlift', 'sumo-deadlift']]);
  let s = session(p, 7, 3);
  const ex = exOf(s, 'd3-t1-primary');
  assert.equal(ex.exerciseId, 'sumo-deadlift');
  assert.equal(ex.sets[0].load, null, 'before: 265 from the deadlift TM');
  s = logSet(s, 'd3-t1-primary', ex.sets[0].setId, 6, 200, 2, 2_000);
  assert.deepEqual(exOf(s, 'd3-t1-primary').sets.slice(1).map((set) => set.load), [170, 170, 170, 170, 170]);
  const edited = logSet(s, 'd3-t1-primary', ex.sets[0].setId, 6, 180, 2, 2_100);
  assert.equal(exOf(edited, 'd3-t1-primary').sets[1].load, 155, 'editing the top set moves the back-offs');
  const missed = logSet(s, 'd3-t1-primary', ex.sets[0].setId, 4, 200, 2, 2_200);
  assert.equal(exOf(missed, 'd3-t1-primary').manualLoadDecisionPending, true, 'a missed rep target still needs an explicit decision');
});

test('Week 12 deadlift cannot be replaced by walking lunge or other legs and hinges', () => {
  for (const id of ['walking-lunge', 'leg-press', 'hack-squat', 'bulgarian-split-squat']) {
    const slot = slotOf(12, 3, 'd3-t1-primary', withSwaps([['d3-t1-primary', 'deadlift', id]]));
    assert.equal(slot.exerciseId, 'deadlift', id);
    assert.equal(slot.status, 'test');
    assert.equal(slot.swapReview?.storedId, id);
    assert.equal(slot.swapReview?.reason, 'ineligible');
    assert.equal(isSwapSupported('deadlift', id), false);
  }
  const reviewed = exOf(session(withSwaps([['d3-t1-primary', 'deadlift', 'walking-lunge']]), 12, 3), 'd3-t1-primary');
  assert.equal(reviewed.swapReview?.storedName, 'Walking Lunge');
  assert.equal(reviewed.exerciseName, 'Deadlift');
});

test('leg curl to hip thrust and leg extension to RDL are different-job pairs, never applied or called direct', () => {
  for (const [slotId, original, alt] of [['d1-t3b', 'leg-curl', 'hip-thrust'], ['d1-t3b', 'leg-curl', 'romanian-deadlift'], ['d1-t3c', 'leg-extension', 'hip-thrust'], ['d1-t3c', 'leg-extension', 'romanian-deadlift']] as const) {
    const options = getSwapOptions(slotOf(1, 1, slotId))!;
    const option = options.alternatives.find((item) => item.id === alt)!;
    assert.equal(option.fit, 'different', `${original} -> ${alt}`);
    assert.ok(option.disabledReason);
    const applied = slotOf(1, 1, slotId, withSwaps([[slotId, original, alt]]));
    assert.equal(applied.exerciseId, original);
    assert.equal(applied.swapReview?.reason, 'ineligible');
  }
  for (const slotId of ['d1-t3b', 'd1-t3c']) assert.ok(getSwapOptions(slotOf(1, 1, slotId))!.alternatives.every((item) => item.fit === 'different'), 'no direct or conditional option');
  // Press-to-fly and row-to-vertical-pull are not offered as direct either.
  assert.equal(getSwapOptions(slotOf(1, 2, 'd2-t3c'))!.alternatives.find((item) => item.id === 'db-pullover')!.fit, 'different');
  assert.equal(getSwapOptions(slotOf(1, 1, 'd1-t2c'))!.alternatives.find((item) => item.id === 'pull-ups')!.fit, 'different');
  assert.ok(!getSwapOptions(slotOf(1, 2, 'd2-t3c'))!.alternatives.some((item) => item.id === 'db-bench-press'), 'a press is not a fly replacement');
});

test('every rule has an explicit fit, and no pair is invented from group membership', () => {
  for (const rule of SWAP_RULES) assert.ok(['direct', 'conditional', 'different'].includes(rule.fit), `${rule.original} -> ${rule.replacement}`);
  const keys = SWAP_RULES.map((rule) => `${rule.original}>${rule.replacement}`);
  assert.equal(new Set(keys).size, keys.length, 'one rule per pair');
});

test('changing exercise mid-session clears typed, unlogged loads and leaves completed work blocked', () => {
  const base = profile();
  const hist = done(session(base, 1, 2), 'd2-t3c', 20, 100, 2_000);
  let s = session(base, 1, 2, [hist], 3_000);
  const ex = exOf(s, 'd2-t3c');
  assert.ok(ex.sets[0].load !== null, 'Pec Fly starts from its own history');
  ex.sets[2].load = 77; // a value typed into a set that is not logged yet
  ex.sets[2].userLoadOverride = true;
  const p = withSwaps([['d2-t3c', 'pec-flye', 'db-fly']]);
  const swapped = swapExercise(s, 'd2-t3c', p, [hist]);
  assert.deepEqual(exOf(swapped, 'd2-t3c').sets.map((set) => set.load), [null, null, null, null]);
  assert.ok(exOf(swapped, 'd2-t3c').sets.every((set) => !set.userLoadOverride && !set.suggested));
  // Completed sets stay attached to the exercise they were logged on.
  const logged = logSet(swapped, 'd2-t3c', exOf(swapped, 'd2-t3c').sets[0].setId, 15, 20, 2, 4_000);
  assert.throws(() => swapExercise(logged, 'd2-t3c', base, [hist]), /Completed sets stay attached to DB Fly/);
  assert.equal(exOf(logged, 'd2-t3c').exerciseId, 'db-fly');
  assert.equal(exOf(undoSet(logged, 'd2-t3c', exOf(logged, 'd2-t3c').sets[0].setId), 'd2-t3c').exerciseId, 'db-fly');
  assert.ok(s.exercises.length > 0);
});

test('reps are never changed silently: incompatible swaps are unavailable and notes always match the target', () => {
  // Week 5 incline bench is a 6RM; Cable Chest Press runs 8-20 reps.
  const slot5 = slotOf(5, 2, 'd2-t2b');
  assert.equal(slot5.repTarget, 6);
  const cable5 = getSwapOptions(slot5)!.alternatives.find((item) => item.id === 'cable-chest-press')!;
  assert.match(cable5.disabledReason ?? '', /programmed for 6 reps/);
  const stored = slotOf(5, 2, 'd2-t2b', withSwaps([['d2-t2b', 'incline-bench', 'cable-chest-press']]));
  assert.equal(stored.exerciseId, 'incline-bench');
  assert.equal(stored.swapReview?.reason, 'reps');
  assert.equal(stored.repTarget, 6);
  // Week 1 is a 15RM, inside the range: it applies with the original prescription untouched.
  const original1 = slotOf(1, 2, 'd2-t2b');
  const swapped1 = slotOf(1, 2, 'd2-t2b', withSwaps([['d2-t2b', 'incline-bench', 'cable-chest-press']]));
  assert.equal(swapped1.exerciseId, 'cable-chest-press');
  assert.deepEqual(swapped1.prescribedSets.map((set) => set.prescribedReps), original1.prescribedSets.map((set) => set.prescribedReps));
  // Every applicable rule, every week and day: the prescription is the original's and no note names another target.
  let applied = 0;
  for (const rule of SWAP_RULES) {
    for (let week = 1; week <= 12; week++) for (let day = 1; day <= 4; day++) {
      const base = getDayPrescription(week, day).exercises.filter((e) => e.exerciseId.replace(/flye/g, 'fly') === rule.original || e.exerciseId === rule.original);
      for (const orig of base) {
        const swapped = slotOf(week, day, orig.slotId, withSwaps([[orig.slotId, orig.exerciseId, rule.replacement]]));
        if (swapped.exerciseId !== rule.replacement) continue;
        if (rule.scheme) continue; // rescaling rules change reps on purpose; see the scheme tests
        applied++;
        assert.equal(swapped.repTarget, orig.repTarget);
        assert.deepEqual(swapped.prescribedSets.map((set) => set.prescribedReps), orig.prescribedSets.map((set) => set.prescribedReps));
        const claimed = /Initial (\d+)RM/.exec(swapped.notes ?? '');
        if (claimed) assert.equal(Number(claimed[1]), swapped.repTarget, `${rule.replacement} wk${week} d${day}`);
      }
    }
  }
  assert.ok(applied > 50, 'the sweep covered real swaps');
});

test('two stored swaps cannot silently land on the same exercise; program repeats are untouched', () => {
  const p = withSwaps([['d1-t2c', 'chest-supported-row', 'one-arm-db-row'], ['d1-t3a', 'v-grip-cable-row', 'one-arm-db-row']]);
  const day = getDayPrescription(1, 1, p).exercises;
  assert.equal(day.find((e) => e.slotId === 'd1-t2c')!.exerciseId, 'one-arm-db-row');
  const second = day.find((e) => e.slotId === 'd1-t3a')!;
  assert.equal(second.exerciseId, 'v-grip-cable-row', 'the program exercise stays, nothing is dropped');
  assert.equal(second.swapReview?.reason, 'duplicate');
  // The picker uses the same rule: with the first swap in place, the second slot lists it as unavailable.
  const others = day.filter((e) => e.slotId !== 'd1-t3a' && e.status === 'work').map((e) => e.exerciseId);
  assert.match(getSwapOptions(second, others)!.alternatives.find((item) => item.id === 'one-arm-db-row')!.disabledReason ?? '', /already in this workout/);
  // The program itself repeats EZ Bar Curl on Day 3 (Block 2). That is not accidental, and an unrelated swap leaves it.
  const original = getDayPrescription(7, 3).exercises.map((e) => e.exerciseId);
  assert.equal(original.filter((id) => id === 'ez-bar-curl').length, 2);
  const unrelated = getDayPrescription(7, 3, withSwaps([['d3-t3a', 'wide-grip-cable-row', 'one-arm-db-row']])).exercises.map((e) => e.exerciseId);
  assert.equal(unrelated.filter((id) => id === 'ez-bar-curl').length, 2);
});

test('removing a profile swap leaves historical names, snapshots and calendar labels alone', () => {
  const p = withSwaps([['d1-t1-primary', 'back-squat', 'pause-squat']]);
  const finished = { ...done(session(p, 1, 1), 'd1-t1-primary', 10, 135, 2_000), status: 'completed' as const, completedTime: new Date(2024, 4, 13, 12).getTime() };
  const before = JSON.stringify(finished);
  const schedule = planFromToday(1, [], '2024-05-13');
  const lift = (profileArg: ReturnType<typeof profile> | undefined, history: WorkoutSession[]) =>
    weekAgenda(schedule, history, '2024-05-13', '2024-05-13', profileArg).flatMap((d) => d.items).find((i) => i.key === 'W1D1')!.lift;
  assert.equal(lift(p, [finished]), 'Pause Squat');
  for (const changed of [profile(), withSwaps([['d1-t1-primary', 'back-squat', 'box-squat']])]) {
    assert.equal(lift(changed, [finished]), 'Pause Squat', 'the calendar shows what was done');
    getDayPrescription(1, 1, changed);
  }
  assert.equal(JSON.stringify(finished), before);
  assert.equal(exOf(finished, 'd1-t1-primary').exerciseName, 'Pause Squat');
  assert.equal(finished.prescriptionSnapshot.exercises.find((e) => e.slotId === 'd1-t1-primary')!.exerciseId, 'pause-squat');
  // A finished session without exercises falls back to its own snapshot, then to the program lift: never today's swaps.
  const hollow = { ...finished, exercises: [] };
  assert.equal(lift(profile(), [hollow]), 'Pause Squat');
  const bare = { ...hollow, prescriptionSnapshot: { ...hollow.prescriptionSnapshot, exercises: [] } };
  assert.equal(lift(withSwaps([['d1-t1-primary', 'back-squat', 'box-squat']]), [bare]), 'Back Squat');
});

test('load notation is explicit for new sessions and unspecified for older ones', () => {
  assert.equal(loadNotationFor('db-fly', 'DB Fly'), 'per_dumbbell');
  assert.equal(loadNotationFor('pec-flye', 'Pec Flye'), 'machine_stack');
  assert.equal(loadNotationFor('cable-fly', 'Cable Fly'), 'cable_stack');
  assert.equal(loadNotationFor('dips', 'Dips'), 'added_bodyweight');
  assert.equal(loadNotationFor('back-squat', 'Back Squat'), 'barbell_total');
  assert.equal(loadNotationFor('walking-lunge', 'Walking Lunge'), 'unspecified');
  const s = session(profile(), 1, 2);
  assert.equal(exOf(s, 'd2-t3c').loadNotation, 'machine_stack');
  const legacy = structuredClone(done(s, 'd2-t3c', 20, 100, 2_000));
  delete (legacy.exercises.find((e) => e.slotId === 'd2-t3c') as { loadNotation?: string }).loadNotation;
  assert.equal(lastLoggedFor('pec-flye', [legacy])!.notation, 'unspecified');
  assert.equal(lastLoggedFor('pec-flye', [legacy])!.load, 100, 'the logged number is never reinterpreted');
  const cleared = clearSuggestedLoads(session(profile(), 1, 2, [legacy], 5_000), 'd2-t3c');
  assert.deepEqual(exOf(cleared, 'd2-t3c').sets.map((set) => set.load), [null, null, null, null]);
});
