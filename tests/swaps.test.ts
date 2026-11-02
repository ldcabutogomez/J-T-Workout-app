import assert from 'node:assert/strict';
import test from 'node:test';
import { getDayPrescription } from '../src/program/prescriptions';
import { getSwapOptions, swapKey } from '../src/program/swapOptions';
import { createWorkoutSession, finalizeSession, logSet, swapExercise, undoSet } from '../src/engine/sessionEngine';
import { findComparableResult } from '../src/engine/encouragement';
import { StorageService } from '../src/storage/db';
import { profile } from './helpers';

const slotOf = (week: number, day: number, slotId: string, p = profile()) =>
  getDayPrescription(week, day, p).exercises.find((item) => item.slotId === slotId)!;

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

test('accessories swap within their own group; T2a lifts stay fixed; main lifts have their own list', () => {
  assert.equal(getSwapOptions(slotOf(1, 1, 'd1-t1-primary'))?.group, 'main', 'Tier 1 lifts are swappable too');
  assert.equal(getSwapOptions(slotOf(1, 1, 'd1-t2a')), null);
  assert.equal(getSwapOptions(slotOf(1, 1, 'd1-t3d')), null, 'DB Hammer Curl has no swap group');

  const legPress = getSwapOptions(slotOf(1, 1, 'd1-t2b'))!;
  assert.equal(legPress.group, 'lower');
  assert.ok(['hip-thrust', 'romanian-deadlift', 'bulgarian-split-squat', 'step-ups'].every((id) => legPress.alternatives.some((a) => a.id === id)));
  assert.ok(!legPress.alternatives.some((a) => a.id === 'dips' || a.id === 'pull-ups'));

  const incline = getSwapOptions(slotOf(1, 2, 'd2-t2b'))!;
  assert.equal(incline.group, 'chest');
  assert.ok(incline.alternatives.some((a) => a.id === 'dips') && incline.alternatives.some((a) => a.id === 'db-bench-press'));

  const row = getSwapOptions(slotOf(1, 1, 'd1-t2c'))!;
  assert.equal(row.group, 'pull');
  assert.ok(row.alternatives.some((a) => a.id === 'pull-ups'));
});

test('a swap changes identity but keeps sets, reps, and source references', () => {
  const original = slotOf(1, 1, 'd1-t2b');
  const p = profile({ exerciseSwaps: { [swapKey('d1-t2b', original.exerciseId)]: 'hip-thrust' } });
  const swapped = slotOf(1, 1, 'd1-t2b', p);
  assert.equal(swapped.exerciseId, 'hip-thrust');
  assert.equal(swapped.exerciseName, 'Hip Thrust');
  assert.deepEqual(swapped.swappedFrom, { exerciseId: original.exerciseId, exerciseName: original.exerciseName });
  assert.equal(swapped.setCount, original.setCount);
  assert.equal(swapped.repTarget, original.repTarget);
  assert.deepEqual(swapped.prescribedSets, original.prescribedSets);
  assert.deepEqual(swapped.sourceRefs, original.sourceRefs);
  assert.equal(getSwapOptions(swapped)!.selectedId, 'hip-thrust');
});

test('bodyweight alternatives carry a load hint', () => {
  const original = slotOf(1, 2, 'd2-t2b');
  const p = profile({ exerciseSwaps: { [swapKey('d2-t2b', original.exerciseId)]: 'dips' } });
  assert.match(slotOf(1, 2, 'd2-t2b', p).notes ?? '', /Bodyweight/);
});

test('a remembered swap does not leak into a block where the slot holds a different exercise', () => {
  const block1 = slotOf(1, 3, 'd3-t2b');
  const block2 = slotOf(7, 3, 'd3-t2b');
  assert.notEqual(block1.exerciseId, block2.exerciseId);
  const p = profile({ exerciseSwaps: { [swapKey('d3-t2b', block1.exerciseId)]: 'bulgarian-split-squat' } });
  assert.equal(slotOf(1, 3, 'd3-t2b', p).exerciseId, 'bulgarian-split-squat');
  assert.equal(slotOf(7, 3, 'd3-t2b', p).exerciseId, block2.exerciseId);
});

test('a manual customization wins over a swap, and invalid swaps are ignored', () => {
  const original = slotOf(1, 1, 'd1-t2b');
  const key = swapKey('d1-t2b', original.exerciseId);
  const custom = profile({ exerciseCustomizations: { 'd1-t2b': 'My Split Squat' }, exerciseSwaps: { [key]: 'hip-thrust' } });
  assert.equal(slotOf(1, 1, 'd1-t2b', custom).exerciseId, 'custom-my-split-squat');
  // Cross-group swap (a pull alternative on a lower-body slot) is ignored.
  const cross = profile({ exerciseSwaps: { [key]: 'pull-ups' } });
  assert.equal(slotOf(1, 1, 'd1-t2b', cross).exerciseId, original.exerciseId);
});

test('swapExercise rebuilds the logged exercise and snapshot together, and can revert', () => {
  const p = profile();
  const session = createWorkoutSession(p, getDayPrescription(1, 1, p), 10);
  const original = session.exercises.find((e) => e.slotId === 'd1-t2b')!;
  const swappedProfile = profile({ exerciseSwaps: { [swapKey('d1-t2b', original.exerciseId)]: 'step-ups' } });

  const swapped = swapExercise(session, 'd1-t2b', swappedProfile);
  const logged = swapped.exercises.find((e) => e.slotId === 'd1-t2b')!;
  const snap = swapped.prescriptionSnapshot.exercises.find((e) => e.slotId === 'd1-t2b')!;
  assert.equal(logged.exerciseId, 'step-ups');
  assert.equal(snap.exerciseId, 'step-ups');
  assert.deepEqual(logged.sets.map((s) => s.setId), original.sets.map((s) => s.setId));
  assert.equal(logged.swappedFrom?.exerciseId, original.exerciseId);
  assert.equal(session.exercises.find((e) => e.slotId === 'd1-t2b')!.exerciseId, original.exerciseId, 'input session is not mutated');

  const reverted = swapExercise(swapped, 'd1-t2b', profile());
  assert.equal(reverted.exercises.find((e) => e.slotId === 'd1-t2b')!.exerciseId, original.exerciseId);
  assert.equal(reverted.exercises.find((e) => e.slotId === 'd1-t2b')!.swappedFrom, undefined);
});

test('swapExercise refuses after a set is logged and allows it again after undo', () => {
  const p = profile();
  let session = createWorkoutSession(p, getDayPrescription(1, 1, p), 10);
  const exercise = session.exercises.find((e) => e.slotId === 'd1-t2b')!;
  const swappedProfile = profile({ exerciseSwaps: { [swapKey('d1-t2b', exercise.exerciseId)]: 'hip-thrust' } });
  session = logSet(session, 'd1-t2b', exercise.sets[0].setId, 15, 100, 2, 20);
  assert.throws(() => swapExercise(session, 'd1-t2b', swappedProfile), /Undo/);
  session = undoSet(session, 'd1-t2b', exercise.sets[0].setId);
  assert.equal(swapExercise(session, 'd1-t2b', swappedProfile).exercises.find((e) => e.slotId === 'd1-t2b')!.exerciseId, 'hip-thrust');
  assert.throws(() => swapExercise({ ...session, isEditingCompleted: true }, 'd1-t2b', swappedProfile), /editing/);
});

test('swapped session logs, finalizes, and round-trips through storage and backup', async () => {
  const original = slotOf(1, 1, 'd1-t2b');
  const p = profile({ exerciseSwaps: { [swapKey('d1-t2b', original.exerciseId)]: 'bulgarian-split-squat' } });
  let session = createWorkoutSession(p, getDayPrescription(1, 1, p), 10);
  const exercise = session.exercises.find((e) => e.slotId === 'd1-t2b')!;
  assert.equal(exercise.exerciseId, 'bulgarian-split-squat');
  session = logSet(session, 'd1-t2b', exercise.sets[0].setId, 15, 40, 2, 20);

  const source = new StorageService('swap-src', 'test_swap_src');
  await source.saveProfile(p);
  await source.saveActiveSession(session);
  const restored = await source.getActiveSession(p.id);
  assert.equal(restored?.exercises.find((e) => e.slotId === 'd1-t2b')?.swappedFrom?.exerciseId, original.exerciseId);

  const backup = await source.exportBackup();
  const target = new StorageService('swap-dst', 'test_swap_dst');
  assert.equal((await target.importBackup(backup, 'replace-all')).success, true);
  assert.deepEqual((await target.getProfiles())[0].exerciseSwaps, p.exerciseSwaps);

  const bad = JSON.parse(backup);
  bad.profiles[0].exerciseSwaps = { x: 5 };
  assert.equal((await target.importBackup(JSON.stringify(bad), 'replace-all')).success, false);
});

test('swapped and original exercises keep separate PR history', () => {
  const original = slotOf(1, 1, 'd1-t2b');
  const base = createWorkoutSession(profile(), getDayPrescription(1, 1, profile()), 10);
  const make = (id: string, exerciseId: string, load: number, time: number) => {
    const s = structuredClone(base);
    s.sessionId = id;
    const ex = s.exercises.find((e) => e.slotId === 'd1-t2b')!;
    ex.exerciseId = exerciseId;
    ex.sets.forEach((set, index) => Object.assign(set, { completed: true, actualReps: 15, load, type: index === 0 ? 'rm_target' : set.type }));
    s.exercises = [ex];
    s.status = 'completed';
    s.completedTime = time;
    return finalizeSession(s, time);
  };
  const history = [make('old', original.exerciseId, 200, 1000)];
  const swappedNow = make('now', 'hip-thrust', 100, 2000);
  assert.equal(findComparableResult(swappedNow, history), null, 'no cross-exercise comparison');
  const sameAgain = make('again', original.exerciseId, 220, 3000);
  assert.equal(findComparableResult(sameAgain, history)?.kind, 'all_time_pr');
});
