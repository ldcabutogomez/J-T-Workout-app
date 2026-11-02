import assert from 'node:assert/strict';
import test from 'node:test';
import { getDayPrescription } from '../src/program/prescriptions';
import { createWorkoutSession, finalizeSession, makeSkippedSession } from '../src/engine/sessionEngine';
import { StorageService } from '../src/storage/db';
import type { WorkoutSession } from '../src/types';
import { profile } from './helpers';

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

let counter = 0;
function service(label: string) {
  counter += 1;
  return new StorageService(`isolated-${label}-${counter}`, `test_${label}_${counter}`);
}

test('active sessions autosave after rapid edits, restore after reload, and remain profile-isolated', async () => {
  const storage = service('autosave');
  const p1 = profile({ id: 'p1' });
  const p2 = profile({ id: 'p2', name: 'Partner 2' });
  await storage.saveProfile(p1);
  await storage.saveProfile(p2);
  const s1 = createWorkoutSession(p1, getDayPrescription(1, 1, p1), 10);
  const s2 = createWorkoutSession(p2, getDayPrescription(1, 1, p2), 20);
  await Promise.all([
    storage.saveActiveSession({ ...s1, updatedTime: 11 }),
    storage.saveActiveSession({ ...s1, updatedTime: 12 }),
    storage.saveActiveSession({ ...s1, updatedTime: 13 }),
    storage.saveActiveSession(s2),
  ]);
  const reloaded = new StorageService('unused-fallback-db', (storage as unknown as { fallbackPrefix: string }).fallbackPrefix);
  assert.equal((await reloaded.getActiveSession('p1'))!.updatedTime, 13);
  assert.equal((await reloaded.getActiveSession('p2'))!.sessionId, s2.sessionId);
  assert.notEqual((await reloaded.getActiveSession('p1'))!.profileId, (await reloaded.getActiveSession('p2'))!.profileId);
});

test('partial and skipped sessions advance exactly once; completed edits do not advance again', async () => {
  const storage = service('advance');
  const p = profile();
  await storage.saveProfile(p);
  const partial = finalizeSession(createWorkoutSession(p, getDayPrescription(1, 1, p), 10), 11);
  const first = await storage.completeAndAdvance(partial, p);
  assert.equal(first.advanced, true);
  assert.deepEqual([first.profile.currentWeek, first.profile.currentDay], [1, 2]);
  const duplicate = await storage.completeAndAdvance(partial, p);
  assert.equal(duplicate.advanced, false);
  assert.deepEqual([duplicate.profile.currentWeek, duplicate.profile.currentDay], [1, 2]);
  assert.equal((await storage.getSessionHistory(p.id)).length, 1);

  const editing = { ...first.session, isEditingCompleted: true };
  const edited = await storage.completeAndAdvance(editing, first.profile);
  assert.equal(edited.advanced, false);
  assert.deepEqual([edited.profile.currentWeek, edited.profile.currentDay], [1, 2]);

  const skipped = makeSkippedSession(first.profile, getDayPrescription(1, 2, first.profile), 20);
  const skippedResult = await storage.completeAndAdvance(skipped, first.profile);
  assert.equal(skippedResult.advanced, true);
  assert.deepEqual([skippedResult.profile.currentWeek, skippedResult.profile.currentDay], [1, 3]);
});

test('Week 12 Day 4 records completion without restarting or duplicating it', async () => {
  const storage = service('cycle');
  const p = profile({ currentWeek: 12, currentDay: 4 });
  await storage.saveProfile(p);
  const final = makeSkippedSession(p, getDayPrescription(12, 4, p), 10);
  const first = await storage.completeAndAdvance(final, p);
  assert.equal(first.profile.cycleCompleted, true);
  assert.deepEqual([first.profile.currentWeek, first.profile.currentDay], [12, 4]);
  const second = await storage.completeAndAdvance(final, p);
  assert.equal(second.advanced, false);
  assert.equal(second.profile.cycleCompleted, true);
  assert.equal((await storage.getSessionHistory(p.id)).length, 1);
});

test('backup round trip validates nested records and defines safe duplicate behavior', async () => {
  const source = service('backup-source');
  const p = profile();
  await source.saveProfile(p);
  const historical = makeSkippedSession(p, getDayPrescription(1, 1, p), 10);
  const advanced = await source.completeAndAdvance(historical, p);
  const active = createWorkoutSession(advanced.profile, getDayPrescription(1, 2, advanced.profile), 20);
  await source.saveActiveSession(active);
  const backup = await source.exportBackup();

  const target = service('backup-target');
  const imported = await target.importBackup(backup);
  assert.equal(imported.success, true);
  assert.equal((await target.getProfiles()).length, 1);
  assert.equal((await target.getSessionHistory(p.id)).length, 1);
  assert.equal((await target.getActiveSession(p.id))!.sessionId, active.sessionId);
  const duplicate = await target.importBackup(backup);
  assert.equal(duplicate.success, false);
  assert.match(duplicate.message, /duplicate IDs/);
  assert.equal((await target.getSessionHistory(p.id)).length, 1);
  const replaced = await target.importBackup(backup, 'replace-all');
  assert.equal(replaced.success, true);
  assert.equal((await target.getSessionHistory(p.id)).length, 1);
});

test('malformed profile, session, exercise, or set imports are rejected without partial overwrite', async () => {
  const source = service('malformed-source');
  const p = profile();
  await source.saveProfile(p);
  const active = createWorkoutSession(p, getDayPrescription(1, 1, p), 10);
  await source.saveActiveSession(active);
  const original = JSON.parse(await source.exportBackup()) as Record<string, unknown>;

  const cases: Array<(copy: any) => void> = [
    (copy) => { copy.profiles[0].unit = 'stone'; },
    (copy) => { copy.activeSessions[0].week = 13; },
    (copy) => { copy.activeSessions[0].settingsSnapshot.trainingMaxes.deadlift = 'heavy'; },
    (copy) => { copy.activeSessions[0].prescriptionSnapshot.exercises[0].prescribedSets[0].sourceRefs[0].ranges[0] = 'fake-cell'; },
    (copy) => { copy.activeSessions[0].exercises[0].tier = 'T9'; },
    (copy) => { copy.activeSessions[0].exercises[0].sets[0].actualReps = -1; },
    (copy) => { copy.activeSessions[0].exercises[0].sets.push({ ...copy.activeSessions[0].exercises[0].sets[0] }); },
  ];
  for (const mutate of cases) {
    const target = service('malformed-target');
    const sentinel = profile({ id: `sentinel-${counter}`, name: 'Sentinel' });
    await target.saveProfile(sentinel);
    const copy = structuredClone(original);
    mutate(copy);
    const result = await target.importBackup(JSON.stringify(copy), 'replace-all');
    assert.equal(result.success, false);
    assert.deepEqual((await target.getProfiles()).map((item) => item.id), [sentinel.id]);
  }
});

test('storage rejects malformed direct writes', async () => {
  const storage = service('direct-validation');
  const p = profile();
  await storage.saveProfile(p);
  const active = createWorkoutSession(p, getDayPrescription(1, 1, p), 10);
  const malformed = structuredClone(active) as WorkoutSession;
  malformed.exercises[0].sets[0].actualReps = -1;
  await assert.rejects(() => storage.saveActiveSession(malformed), /malformed/);
});
