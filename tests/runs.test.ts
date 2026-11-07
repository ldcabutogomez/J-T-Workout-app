import assert from 'node:assert/strict';
import test from 'node:test';
import { currentWeekRunSummary, distanceFromMeters, distanceToMeters, formatRunDuration, formatRunPace, runDistanceByWeek } from '../src/engine/runs';
import { StorageService } from '../src/storage/db';
import { SCHEMA_VERSION } from '../src/storage/schema';
import type { RunSession } from '../src/types';
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

function run(overrides: Partial<RunSession> = {}): RunSession {
  return {
    runId: 'run-p1-1',
    profileId: 'p1',
    startTime: new Date(2026, 10, 3, 7, 30).getTime(),
    durationSeconds: 30 * 60,
    distanceMeters: distanceToMeters(3.1, 'mi'),
    distanceUnit: 'mi',
    runType: 'easy',
    effort: 5,
    source: 'manual',
    createdTime: 1,
    updatedTime: 1,
    ...overrides,
  };
}

test('run distance, duration, and pace formatting are consistent', () => {
  assert.ok(Math.abs(distanceFromMeters(distanceToMeters(3.1, 'mi'), 'mi') - 3.1) < 1e-9);
  assert.equal(formatRunDuration(1850), '30:50');
  assert.equal(formatRunDuration(3725), '1:02:05');
  assert.equal(formatRunPace(30 * 60, distanceToMeters(3, 'mi'), 'mi'), '10:00 /mi');
  assert.equal(formatRunPace(30 * 60, distanceToMeters(5, 'km'), 'km'), '6:00 /km');
});

test('weekly run summaries stay separate by local calendar week', () => {
  const now = new Date(2026, 10, 3, 12).getTime(); // Tuesday
  const current = run();
  const previous = run({ runId: 'prior', startTime: new Date(2026, 10, 1, 10).getTime() }); // Sunday
  const summary = currentWeekRunSummary([current, previous], now, 'mi');
  assert.equal(summary.count, 1);
  assert.equal(Number(distanceFromMeters(summary.distanceMeters, 'mi').toFixed(1)), 3.1);
  const weeks = runDistanceByWeek([current, previous], 'mi', 2, now);
  assert.deepEqual(weeks.map((week) => week.count), [1, 1]);
});

test('run records save, sort, back up, restore, and delete independently of lifting sessions', async () => {
  const source = new StorageService('runs-source', 'test_runs_source');
  const p = profile({ id: 'p1' });
  await source.saveProfile(p);
  await source.saveRun(run());
  await source.saveRun(run({ runId: 'run-p1-2', startTime: new Date(2026, 10, 4, 7).getTime(), runType: 'tempo' }));
  assert.deepEqual((await source.getRunHistory(p.id)).map((item) => item.runType), ['tempo', 'easy']);
  assert.equal((await source.getSessionHistory(p.id)).length, 0);

  const backup = JSON.parse(await source.exportBackup());
  assert.equal(backup.version, SCHEMA_VERSION);
  assert.equal(backup.runs.length, 2);

  const target = new StorageService('runs-target', 'test_runs_target');
  assert.equal((await target.importBackup(JSON.stringify(backup), 'replace-all')).success, true);
  assert.equal((await target.getRunHistory(p.id)).length, 2);
  await target.deleteRun('run-p1-1');
  assert.deepEqual((await target.getRunHistory(p.id)).map((item) => item.runId), ['run-p1-2']);
});

test('malformed direct run writes and malformed backup runs are rejected', async () => {
  const source = new StorageService('runs-invalid', 'test_runs_invalid');
  const p = profile({ id: 'p1' });
  await source.saveProfile(p);
  await assert.rejects(() => source.saveRun(run({ durationSeconds: 0 })), /malformed run/);

  const backup = JSON.parse(await source.exportBackup());
  backup.runs = [run({ effort: 11 })];
  const result = await source.importBackup(JSON.stringify(backup), 'replace-all');
  assert.equal(result.success, false);
  assert.match(result.message, /run record is malformed/);
});
