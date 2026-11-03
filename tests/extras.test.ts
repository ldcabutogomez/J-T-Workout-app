import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addExtraExercise, addExtraSet, allRequiredSetsLogged, cleanExerciseName, createWorkoutSession, finalizeSession, lastExtraSet,
  logSet, removeExtraExercise, removeExtraSet,
} from '../src/engine/sessionEngine';
import { isExtra, programExercises } from '../src/engine/extras';
import { sessionCredit, validCompleted } from '../src/engine/sessionValidity';
import { findAllComparableResults } from '../src/engine/encouragement';
import { computeTotalVolume } from '../src/engine/achievements';
import { computeXp } from '../src/engine/xp';
import { suggestFromHistory } from '../src/engine/suggestions';
import { getDayPrescription } from '../src/program/prescriptions';
import { knownExercises } from '../src/program/extraCatalog';
import { StorageService } from '../src/storage/db';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });

const DAY = 86_400_000;
const NOW = new Date(2024, 4, 15, 12).getTime();
const p = profile();

/** An in-progress workout with nothing logged yet. */
const fresh = () => createWorkoutSession(p, getDayPrescription(1, 1, p), NOW);

/** A finished, complete workout with an extra "Hip Abduction" logged as `sets` of [load, reps]. */
function withExtra(at: number, sets: Array<[number, number]>, id = 'x', unit: 'lb' | 'kg' = 'lb'): WorkoutSession {
  let s = addExtraExercise(completeSession(p, 1, 1, at), 'Hip Abduction', [], at);
  const slot = s.exercises[s.exercises.length - 1].slotId;
  sets.forEach(([load, reps], i) => {
    if (i > 0) s = addExtraSet(s, slot, at);
    const extra = s.exercises.find((e) => e.slotId === slot)!;
    s = logSet(s, slot, extra.sets[i].setId, reps, load, 2, at + i + 1);
  });
  s.sessionId = id;
  s.exercises.at(-1)!.sets.forEach((set) => { set.unit = unit; });
  const done = finalizeSession(s, at + 100);
  done.sessionId = id;
  return done;
}

test('adding an exercise appends a clean extra with one blank set and leaves the program alone', () => {
  const s = fresh();
  const next = addExtraExercise(s, '  Hip   Abduction ', [], NOW);
  const extra = next.exercises[next.exercises.length - 1];
  assert.equal(next.exercises.length, s.exercises.length + 1);
  assert.equal(extra.isExtra, true);
  assert.equal(extra.exerciseName, 'Hip Abduction');
  assert.equal(extra.exerciseId, 'hip-abduction', 'the slug matches the catalog id, so history is shared');
  assert.equal(extra.slotId, 'extra-hip-abduction');
  assert.equal(extra.tier, 'T3d');
  assert.deepEqual(extra.sourceRefs, []);
  assert.equal(extra.sets.length, 1);
  assert.equal(extra.sets[0].type, 'straight');
  assert.equal(extra.sets[0].completed, false);
  assert.equal(next.prescriptionSnapshot.exercises.some((e) => e.slotId === extra.slotId), false, 'never in the prescription');
  assert.equal(programExercises(next).length, s.exercises.length);
  assert.ok(next.exercises.slice(0, -1).every((e) => !isExtra(e)));
});

test('names are cleaned and checked, and an exercise can only be in a workout once', () => {
  assert.equal(cleanExerciseName('  a\u0000b <i>c</i>  '), 'ab ic/i');
  assert.equal(cleanExerciseName('x'.repeat(80)).length, 40);
  assert.throws(() => addExtraExercise(fresh(), 'a'), /name/);
  assert.throws(() => addExtraExercise(fresh(), '!!!'), /name|letters/);
  const s = fresh();
  assert.throws(() => addExtraExercise(s, s.exercises[0].exerciseName), /already in this workout/, 'a program exercise cannot be added again');
  const once = addExtraExercise(s, 'Leg Curl Machine', [], NOW);
  assert.throws(() => addExtraExercise(once, 'leg curl machine', [], NOW), /already in this workout/);
});

test('extra sets copy the previous set; only unlogged sets and untouched exercises can be removed', () => {
  let s = addExtraExercise(fresh(), 'Hip Abduction', [], NOW);
  const slot = 'extra-hip-abduction';
  s = logSet(s, slot, s.exercises.at(-1)!.sets[0].setId, 12, 80, 2, NOW + 1);
  s = addExtraSet(s, slot, NOW + 2);
  const sets = s.exercises.at(-1)!.sets;
  assert.equal(sets.length, 2);
  assert.equal(sets[1].load, 80, 'copies the load of the set before it');
  assert.equal(sets[1].prescribedReps, 12);
  assert.notEqual(sets[0].setId, sets[1].setId);
  assert.throws(() => removeExtraSet(s, slot, sets[0].setId), /Undo this set/);
  assert.equal(removeExtraSet(s, slot, sets[1].setId).exercises.at(-1)!.sets.length, 1);
  assert.throws(() => removeExtraExercise(s, slot), /Undo its logged sets/);
  const untouched = addExtraExercise(fresh(), 'Hip Abduction', [], NOW);
  assert.equal(removeExtraExercise(untouched, slot).exercises.length, fresh().exercises.length);
  assert.throws(() => addExtraSet(fresh(), fresh().exercises[0].slotId), /added yourself/, 'program exercises can not be changed this way');
  // Set ids stay unique after removing a middle set and adding again.
  let t = addExtraSet(addExtraSet(addExtraExercise(fresh(), 'Hip Abduction', [], NOW), slot), slot);
  t = removeExtraSet(t, slot, t.exercises.at(-1)!.sets[1].setId);
  t = addExtraSet(t, slot);
  const ids = t.exercises.at(-1)!.sets.map((x) => x.setId);
  assert.equal(new Set(ids).size, ids.length);
});

test('extras never decide whether a workout is finished, and unlogged extras are not saved', () => {
  const done = completeSession(p, 1, 1, NOW);
  const withBlank = addExtraSet(addExtraExercise(done, 'Hip Abduction', [], NOW), 'extra-hip-abduction');
  assert.equal(allRequiredSetsLogged(withBlank), true, 'an unlogged extra set does not count as required');
  const finished = finalizeSession(withBlank, NOW + 1);
  assert.equal(finished.status, 'completed');
  assert.equal(validCompleted(finished), true);
  assert.equal(finished.exercises.some(isExtra), false, 'an extra with nothing logged is dropped');
  // A program set left undone still makes it partial, however much extra work was logged.
  let partial = addExtraExercise(fresh(), 'Hip Abduction', [], NOW);
  partial = logSet(partial, 'extra-hip-abduction', partial.exercises.at(-1)!.sets[0].setId, 12, 80, 2, NOW + 1);
  const savedPartial = finalizeSession(partial, NOW + 5);
  assert.equal(savedPartial.status, 'partial');
  assert.equal(savedPartial.exercises.at(-1)!.sets.length, 1, 'the logged extra set is kept');
  assert.equal(sessionCredit(savedPartial), 0, 'extra sets earn no weekly credit');
});

test('extras do not change the credit of a finished workout, and a half-done program still earns its own share', () => {
  const full = withExtra(NOW, [[80, 12], [80, 10]]);
  assert.equal(sessionCredit(full), 1);
  const base = fresh();
  const firstProgramSet = base.exercises[0].sets[0];
  let half = logSet(base, base.exercises[0].slotId, firstProgramSet.setId, firstProgramSet.prescribedReps, 100, 2, NOW + 1);
  const programSets = programExercises(half).flatMap((e) => e.sets).length;
  const creditBefore = sessionCredit(finalizeSession(half, NOW + 9));
  half = addExtraExercise(half, 'Hip Abduction', [], NOW + 2);
  half = logSet(half, 'extra-hip-abduction', half.exercises.at(-1)!.sets[0].setId, 12, 80, 2, NOW + 3);
  assert.equal(sessionCredit(finalizeSession(half, NOW + 9)), creditBefore, 'adding logged extras does not raise the credit');
  assert.ok(Math.abs(creditBefore - 1 / programSets) < 1e-9);
});

test('an extra has its own history: it prefills the last load (converted to your unit) and sets PRs', () => {
  const earlier = withExtra(NOW - 14 * DAY, [[40, 12], [45, 10]], 'e1', 'kg');
  const last = lastExtraSet([earlier], 'hip-abduction', 'lb');
  assert.ok(last && Math.abs(last.load - 99.21) < 0.1, `45 kg is about 99.2 lb, got ${last?.load}`);
  assert.equal(last?.reps, 10);
  assert.equal(lastExtraSet([earlier], 'hip-abduction', 'kg')?.load, 45);
  assert.equal(lastExtraSet([earlier], 'standing-calf-raise', 'lb'), null);
  const added = addExtraExercise(fresh(), 'Hip Abduction', [earlier], NOW);
  assert.equal(added.exercises.at(-1)!.sets[0].load, last!.load, 'the new set starts at the last load');

  // A heavier top set later is an all-time PR for the extra.
  const lighter = withExtra(NOW - 7 * DAY, [[100, 10]], 'e2');
  const heavier = withExtra(NOW, [[90, 10], [120, 10]], 'e3');
  const results = findAllComparableResults(heavier, [lighter]);
  const hip = results.find((r) => r.exerciseId === 'hip-abduction');
  assert.equal(hip?.kind, 'all_time_pr');
  assert.equal(hip?.load, 120, 'the heaviest set stands for the exercise, not the first');
  const nothing = findAllComparableResults(withExtra(NOW, [[60, 10]], 'e4'), [heavier]);
  assert.notEqual(nothing.find((r) => r.exerciseId === 'hip-abduction')?.kind, 'all_time_pr');
  assert.equal(suggestFromHistory?.name, 'suggestFromHistory');
});

test('extras add to volume and XP like any logged work', () => {
  const plain = completeSession(p, 1, 1, NOW);
  const extra = withExtra(NOW, [[100, 10]]);
  assert.equal(computeTotalVolume(extra) - computeTotalVolume(plain), 1000);
  assert.ok(computeXp([extra], p) > computeXp([plain], p));
});

test('extras are stored, restored from a backup, and validated', async () => {
  const store = new StorageService('extras-db', 'test_extras');
  await store.saveProfile(p);
  const session = withExtra(NOW, [[80, 12]]);
  await store.completeAndAdvance(session, p);
  const [saved] = await store.getSessionHistory(p.id, true);
  assert.equal(saved.exercises.at(-1)!.isExtra, true);
  assert.equal(saved.exercises.at(-1)!.sets[0].load, 80);
  const target = new StorageService('extras-db2', 'test_extras2');
  assert.equal((await target.importBackup(await store.exportBackup(), 'replace-all')).success, true);
  assert.equal((await target.getSessionHistory(p.id, true))[0].exercises.at(-1)!.isExtra, true);

  const bad = (change: (s: WorkoutSession) => void, id: string) => {
    const copy = structuredClone(session);
    copy.sessionId = id;
    change(copy);
    return copy;
  };
  const reject = (s: WorkoutSession) => assert.rejects(store.completeAndAdvance(s, p), /malformed/);
  await reject(bad((s) => { s.exercises.at(-1)!.slotId = s.prescriptionSnapshot.exercises[0].slotId; }, 'b1'));
  await reject(bad((s) => { s.exercises.at(-1)!.slotId = 'hip'; }, 'b2'));
  await reject(bad((s) => { s.exercises.at(-1)!.sets[0].type = 'rm_target'; }, 'b3'));
  await reject(bad((s) => { delete (s.exercises.at(-1) as { isExtra?: true }).isExtra; }, 'b4'));
  await reject(bad((s) => { (s.exercises.at(-1) as { isExtra?: unknown }).isExtra = false; }, 'b5'));
  await reject(bad((s) => { s.exercises.at(-1)!.sourceRefs = [{ sheet: 'J&T2.0', ranges: ['A1'] }]; }, 'b6'));
  await reject(bad((s) => { s.exercises[0].sourceRefs = []; }, 'b7'));
});

test('the exercise list offers the app catalog and common accessories, A to Z, without repeats', () => {
  const list = knownExercises();
  const ids = list.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('hip-abduction') && ids.includes('leg-curl') && ids.includes('standing-calf-raise'));
  assert.deepEqual([...list].sort((a, b) => a.name.localeCompare(b.name)), list);
});
