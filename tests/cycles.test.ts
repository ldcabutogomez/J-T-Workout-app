import assert from 'node:assert/strict';
import test from 'node:test';
import { FIRST_CYCLE_ID, buildNextCycleProfile, cycleNumber, cycleOf, historyForCycle, nextCycleId, profileCycleId, summarizeCycle } from '../src/engine/cycles';
import { firstUndone, doneSlots, missedCount, nextWorkout, positionAfter, weekAgenda } from '../src/engine/schedule';
import { createWorkoutSession, makeSkippedSession } from '../src/engine/sessionEngine';
import { isVerifiedCycleComplete } from '../src/engine/encouragement';
import { getDayPrescription } from '../src/program/prescriptions';
import { StorageService } from '../src/storage/db';
import type { UserProfile, WorkoutSession } from '../src/types';
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
const MONDAY = new Date(2024, 4, 13, 9).getTime();
const p = profile();

function whole(cycleId: string | undefined, week: number, day: number, at: number): WorkoutSession {
  const s = completeSession(p, week, day, at);
  if (cycleId) s.cycleId = cycleId;
  s.sessionId = `${cycleId ?? 'c1'}-w${week}d${day}`;
  s.completedTime = at;
  return s;
}
const fullCycle = (cycleId: string | undefined, start: number) =>
  Array.from({ length: 12 }, (_, w) => Array.from({ length: 4 }, (_, d) => whole(cycleId, w + 1, d + 1, start + (w * 7 + d) * DAY))).flat();

test('sessions without a cycle id belong to the first cycle, and ids parse', () => {
  assert.equal(cycleOf({}), FIRST_CYCLE_ID);
  assert.equal(cycleOf({ cycleId: 'c3' }), 'c3');
  assert.equal(profileCycleId({}), 'c1');
  assert.equal(cycleNumber('c12'), 12);
  assert.equal(nextCycleId('c1'), 'c2');
  assert.equal(nextCycleId('c9'), 'c10');
});

test('new sessions are stamped only after the first cycle, so first-cycle records are unchanged', () => {
  const first = createWorkoutSession(p, getDayPrescription(1, 1, p), 1_000);
  assert.equal('cycleId' in first, false);
  const second = { ...p, cycleId: 'c2' };
  assert.equal(createWorkoutSession(second, getDayPrescription(1, 1, second), 1_000).cycleId, 'c2');
  assert.equal(makeSkippedSession(second, getDayPrescription(1, 1, second), 1_000).cycleId, 'c2');
});

test('a finished first cycle leaves the second cycle with a clean calendar when history is filtered by cycle', () => {
  const c1 = fullCycle(undefined, MONDAY - 100 * DAY);
  const c2 = [whole('c2', 1, 1, MONDAY)];
  const all = [...c1, ...c2];
  // Unfiltered, the merged history says every slot is done: this is the collision cycles avoid.
  assert.equal(firstUndone(doneSlots(all)), null);
  const only2 = historyForCycle(all, 'c2');
  assert.equal(only2.length, 1);
  assert.deepEqual(firstUndone(doneSlots(only2)), { week: 1, day: 2 });
  const schedule = buildNextCycleProfile({ ...p, cycleCompleted: true }, c1, { trainingMaxes: p.trainingMaxes, trainingDays: [0, 1, 3, 4], startDate: '2024-05-13', keepSwaps: true, now: MONDAY }).schedule!;
  assert.equal(nextWorkout(schedule, only2, '2024-05-14')?.day, 2, 'next up is Day 2 of the new cycle');
  assert.equal(missedCount(schedule, only2, '2024-05-14'), 0);
  const week1 = weekAgenda(schedule, only2, '2024-05-13', '2024-05-14').flatMap((d) => d.items);
  assert.equal(week1.find((i) => i.day === 1)?.status, 'completed');
  assert.equal(week1.find((i) => i.day === 2)?.status, 'today');
  assert.deepEqual(positionAfter(only2, only2[0]), { currentWeek: 1, currentDay: 2, cycleCompleted: false });
});

test('completing all 48 workouts counts per cycle, so a second cycle can finish too', () => {
  const c1 = fullCycle(undefined, MONDAY - 400 * DAY);
  const c2 = fullCycle('c2', MONDAY);
  const last = c2[c2.length - 1];
  assert.equal(isVerifiedCycleComplete(last, [...c1, ...c2]), true, 'cycle 2 completes even though cycle 1 already had all 48');
  assert.equal(isVerifiedCycleComplete(c1[c1.length - 1], c1), true);
  assert.equal(isVerifiedCycleComplete(c2[3], [...c1, ...c2.slice(0, 10)]), false, 'cycle 1 being complete does not complete cycle 2');
});

test('starting the next cycle resets the pointer, closes the old cycle and clears Block 2 maxes', () => {
  const done: UserProfile = {
    ...p, cycleCompleted: true, currentWeek: 12, currentDay: 4, block2ConfirmedTMs: { squat: 250 }, block2ConfirmedAt: 5,
    exerciseSwaps: { 'd1-t2b::x': 'hip-thrust' }, exerciseCustomizations: { a: 'b' },
  };
  const history = fullCycle(undefined, MONDAY - 100 * DAY);
  const keep = buildNextCycleProfile(done, history, { trainingMaxes: { squat: 230, bench: 190 }, trainingDays: [0, 2, 4, 5], startDate: '2024-05-13', keepSwaps: true, now: MONDAY });
  assert.equal(keep.cycleId, 'c2');
  assert.equal(keep.currentWeek, 1);
  assert.equal(keep.currentDay, 1);
  assert.equal(keep.cycleCompleted, undefined);
  assert.deepEqual(keep.trainingMaxes, { squat: 230, bench: 190 });
  assert.equal(keep.block2ConfirmedTMs, undefined);
  assert.equal(keep.block2ConfirmedAt, undefined);
  assert.deepEqual(keep.exerciseSwaps, { 'd1-t2b::x': 'hip-thrust' });
  assert.deepEqual(keep.schedule?.days, [0, 2, 4, 5]);
  assert.equal(keep.schedule?.anchor, '2024-05-13');
  assert.equal(keep.cycles?.length, 2);
  assert.equal(keep.cycles?.[0].finished, true);
  assert.equal(keep.cycles?.[0].endedAt, MONDAY);
  assert.deepEqual(keep.cycles?.[1], { id: 'c2', number: 2, startedAt: MONDAY });

  const reset = buildNextCycleProfile(done, history, { trainingMaxes: {}, trainingDays: [0, 1, 3, 4], startDate: '2024-05-13', keepSwaps: false, now: MONDAY });
  assert.equal(reset.exerciseSwaps, undefined);
  assert.equal(reset.exerciseCustomizations, undefined);
  // Ending early records the cycle as not finished.
  const early = buildNextCycleProfile({ ...p, cycleCompleted: false }, history.slice(0, 5), { trainingMaxes: {}, trainingDays: [0, 1, 3, 4], startDate: '2024-05-13', keepSwaps: true, now: MONDAY });
  assert.equal(early.cycles?.[0].finished, false);
  // Starting the third cycle keeps the earlier records.
  const third = buildNextCycleProfile(keep, [], { trainingMaxes: {}, trainingDays: [0, 1, 3, 4], startDate: '2024-06-03', keepSwaps: true, now: MONDAY + DAY });
  assert.deepEqual(third.cycles?.map((c) => c.id), ['c1', 'c2', 'c3']);
});

test('a cycle summary counts finished, partial and skipped separately', () => {
  const c1 = [whole(undefined, 1, 1, MONDAY), whole(undefined, 1, 2, MONDAY + DAY), { ...whole(undefined, 1, 3, MONDAY + 2 * DAY), isSkipped: true, status: 'skipped' as const }];
  assert.deepEqual(summarizeCycle([...c1, whole('c2', 1, 1, MONDAY + 9 * DAY)], 'c1'), { finished: 2, skipped: 1, partial: 0 });
});

test('startNewCycle saves the new profile once and refuses a repeat from a stale screen', async () => {
  const store = new StorageService('cycles-db', 'test_cycles');
  await store.saveProfile(p);
  const next = buildNextCycleProfile({ ...p, cycleCompleted: true }, [], { trainingMaxes: p.trainingMaxes, trainingDays: [0, 1, 3, 4], startDate: '2024-05-13', keepSwaps: true, now: MONDAY });
  await store.startNewCycle(next, 'c1');
  assert.equal((await store.getProfiles())[0].cycleId, 'c2');
  await assert.rejects(store.startNewCycle(next, 'c1'), /already started/);
  assert.equal((await store.getProfiles())[0].cycles?.length, 2, 'the double tap changed nothing');
});

test('cycle fields survive a backup round trip, and a bad cycle id is dropped', async () => {
  const store = new StorageService('cycles-bk', 'test_cycles_bk');
  const next = buildNextCycleProfile({ ...p, cycleCompleted: true }, [], { trainingMaxes: p.trainingMaxes, trainingDays: [0, 1, 3, 4], startDate: '2024-05-13', keepSwaps: true, now: MONDAY });
  await store.saveProfile(next);
  const target = new StorageService('cycles-bk2', 'test_cycles_bk2');
  assert.equal((await target.importBackup(await store.exportBackup(), 'replace-all')).success, true);
  assert.equal((await target.getProfiles())[0].cycleId, 'c2');
  const bad = JSON.parse(await store.exportBackup());
  bad.profiles[0].cycleId = 'nonsense';
  const other = new StorageService('cycles-bk3', 'test_cycles_bk3');
  await other.importBackup(JSON.stringify(bad), 'replace-all');
  assert.equal((await other.getProfiles())[0].cycleId, undefined);
});
