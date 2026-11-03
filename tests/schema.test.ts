import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKUP_APP, SCHEMA_VERSION, migrateBackup, sanitizeProfile } from '../src/storage/schema';
import { StorageService } from '../src/storage/db';
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

test('good optional fields are kept and the schema version is stamped', () => {
  const p = profile({
    cycleCompleted: false, hapticsEnabled: true, soundEnabled: false, autoStartRest: true, shareLive: false,
    weeklyGoalSessions: 4, flair: 'bishop', taunt: { id: 3, at: 1_000 }, block2ConfirmedAt: 5_000,
    exerciseCustomizations: { 'd1-t3a': 'My Row' },
    unlockedBadges: [{ id: 'first_workout', unlockedAt: 1 }],
  });
  const clean = sanitizeProfile(p);
  assert.deepEqual({ ...clean, schemaVersion: undefined }, { ...p, schemaVersion: undefined });
  assert.equal(clean.schemaVersion, SCHEMA_VERSION);
});

test('unusable optional fields are dropped instead of failing the profile', () => {
  const dirty = {
    ...profile(), cycleCompleted: 'yes', hapticsEnabled: 1, weeklyGoalSessions: 99, flair: '', block2ConfirmedAt: -5,
    exerciseCustomizations: { a: 1 }, taunt: { id: 'x', at: 1 }, unlockedBadges: 'all',
  };
  const clean = sanitizeProfile(dirty) as Record<string, unknown>;
  for (const key of ['cycleCompleted', 'hapticsEnabled', 'weeklyGoalSessions', 'flair', 'block2ConfirmedAt', 'exerciseCustomizations', 'taunt', 'unlockedBadges']) {
    assert.equal(key in clean, false, `${key} should be dropped`);
  }
  assert.equal(clean.name, 'Test Lifter', 'core fields are untouched');
});

test('badges are filtered and de-duplicated entry by entry', () => {
  const clean = sanitizeProfile({
    ...profile(),
    unlockedBadges: [{ id: 'a', unlockedAt: 1 }, { id: 'a', unlockedAt: 2 }, { id: '', unlockedAt: 3 }, { id: 'b' }, 'junk', { id: 'c', unlockedAt: 4, extra: 1 }],
  });
  assert.deepEqual(clean.unlockedBadges, [{ id: 'a', unlockedAt: 1 }, { id: 'c', unlockedAt: 4 }]);
  assert.equal(sanitizeProfile(null), null);
  assert.equal(sanitizeProfile('x'), 'x');
});

test('sanitizing twice changes nothing more (idempotent)', () => {
  const once = sanitizeProfile({ ...profile(), weeklyGoalSessions: 0, flair: 'bishop' });
  assert.deepEqual(sanitizeProfile(once), once);
});

test('backups: version 2 migrates to 3, newer and foreign files are refused with a reason', () => {
  const v2 = { version: 2, app: BACKUP_APP, timestamp: 1, profiles: [{ ...profile(), flair: '' }], sessions: [], activeSessions: [] };
  const migrated = migrateBackup(v2);
  assert.equal(migrated.ok, true);
  if (migrated.ok) {
    assert.equal(migrated.value.version, 3);
    const profiles = migrated.value.profiles as Array<Record<string, unknown>>;
    assert.equal('flair' in profiles[0], false);
    assert.equal(profiles[0].schemaVersion, SCHEMA_VERSION);
  }
  const current = migrateBackup({ ...v2, version: 3 });
  assert.equal(current.ok, true);
  const newer = migrateBackup({ ...v2, version: 99 });
  assert.equal(newer.ok, false);
  if (!newer.ok) assert.match(newer.message, /newer version/);
  assert.equal(migrateBackup({ ...v2, app: 'something else' }).ok, false);
  assert.equal(migrateBackup({ ...v2, version: 1 }).ok, false);
  assert.equal(migrateBackup(null).ok, false);
});

test('export writes the current version and a v2 backup still imports, with bad optional fields dropped', async () => {
  const source = new StorageService('schema-src', 'test_schema_src');
  const p = profile({ flair: 'bishop' });
  await source.saveProfile(p);
  const exported = JSON.parse(await source.exportBackup());
  assert.equal(exported.version, SCHEMA_VERSION);
  assert.equal(exported.profiles[0].schemaVersion, SCHEMA_VERSION);

  const old = { ...exported, version: 2, profiles: [{ ...exported.profiles[0], weeklyGoalSessions: 'lots', flair: 'bishop' }] };
  delete old.profiles[0].schemaVersion;
  const target = new StorageService('schema-dst', 'test_schema_dst');
  const result = await target.importBackup(JSON.stringify(old), 'replace-all');
  assert.equal(result.success, true, result.message);
  const [restored] = await target.getProfiles();
  assert.equal(restored.flair, 'bishop');
  assert.equal(restored.weeklyGoalSessions, undefined, 'the bad field was dropped, the profile survived');
  assert.equal(restored.schemaVersion, SCHEMA_VERSION);

  const tooNew = await target.importBackup(JSON.stringify({ ...exported, version: 7 }), 'replace-all');
  assert.equal(tooNew.success, false);
  assert.match(tooNew.message, /newer version/);
});

test('a session still round-trips through a v3 backup', async () => {
  const source = new StorageService('schema-sess', 'test_schema_sess');
  const p = profile();
  await source.saveProfile(p);
  await source.completeAndAdvance(completeSession(p), p);
  const target = new StorageService('schema-sess2', 'test_schema_sess2');
  assert.equal((await target.importBackup(await source.exportBackup(), 'replace-all')).success, true);
  assert.equal((await target.getSessionHistory(p.id, true)).length, 1);
});
