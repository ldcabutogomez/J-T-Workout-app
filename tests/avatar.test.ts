import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AVATAR_COLORS, AVATAR_PHOTO_MAX_CHARS, AVATAR_PHOTO_PREFIX, avatarInitial, defaultAvatarColor, isValidAvatar, squareCrop,
} from '../src/lib/avatar';
import { StorageService } from '../src/storage/db';
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

const photo = (length = 200) => AVATAR_PHOTO_PREFIX + 'A'.repeat(length);

test('squareCrop centers the largest square for landscape, portrait, and square images', () => {
  assert.deepEqual(squareCrop(400, 200), { sx: 100, sy: 0, size: 200 });
  assert.deepEqual(squareCrop(200, 400), { sx: 0, sy: 100, size: 200 });
  assert.deepEqual(squareCrop(300, 300), { sx: 0, sy: 0, size: 300 });
  assert.deepEqual(squareCrop(301, 200), { sx: 50, sy: 0, size: 200 });
});

test('default avatar colors are stable, valid, and differ across the two default profiles', () => {
  for (const id of ['partner-1', 'partner-2', 'x', '']) {
    assert.ok(AVATAR_COLORS.includes(defaultAvatarColor(id)));
    assert.equal(defaultAvatarColor(id), defaultAvatarColor(id));
  }
  assert.notEqual(defaultAvatarColor('partner-1'), defaultAvatarColor('partner-2'));
});

test('avatar initial uses the first letter and survives empty or emoji names', () => {
  assert.equal(avatarInitial('lauren'), 'L');
  assert.equal(avatarInitial('  Luis'), 'L');
  assert.equal(avatarInitial(''), '?');
  assert.equal(avatarInitial('Émile'), 'É');
});

test('avatar validation accepts small JPEG data URLs and known colors only', () => {
  assert.equal(isValidAvatar({}), true);
  assert.equal(isValidAvatar({ color: 'teal' }), true);
  assert.equal(isValidAvatar({ photo: photo(), color: 'ink' }), true);
  assert.equal(isValidAvatar({ color: 'magenta' }), false);
  assert.equal(isValidAvatar({ photo: 'data:image/png;base64,AAAA' }), false);
  assert.equal(isValidAvatar({ photo: 'https://example.com/me.jpg' }), false);
  assert.equal(isValidAvatar({ photo: photo(AVATAR_PHOTO_MAX_CHARS) }), false, 'oversize photo');
  assert.equal(isValidAvatar('photo'), false);
  assert.equal(isValidAvatar(null), false);
  assert.equal(isValidAvatar([]), false);
});

test('profiles with avatars save, restore, and round-trip through backup; invalid avatars are rejected', async () => {
  const source = new StorageService('avatar-src', 'test_avatar_src');
  const p = profile({ avatar: { photo: photo(), color: 'clay' } });
  await source.saveProfile(p);
  assert.deepEqual((await source.getProfiles())[0].avatar, p.avatar);

  const backup = await source.exportBackup();
  const target = new StorageService('avatar-dst', 'test_avatar_dst');
  assert.equal((await target.importBackup(backup, 'replace-all')).success, true);
  assert.deepEqual((await target.getProfiles())[0].avatar, p.avatar);

  await assert.rejects(source.saveProfile(profile({ avatar: { photo: 'data:image/png;base64,AAAA' } })), /malformed profile/);
  await assert.rejects(source.saveProfile(profile({ avatar: { color: 'magenta' as never } })), /malformed profile/);

  const bad = JSON.parse(backup);
  bad.profiles[0].avatar = { photo: photo(AVATAR_PHOTO_MAX_CHARS) };
  assert.equal((await target.importBackup(JSON.stringify(bad), 'replace-all')).success, false);
});

test('profiles without an avatar still validate (older backups import unchanged)', async () => {
  const storage = new StorageService('avatar-legacy', 'test_avatar_legacy');
  await storage.saveProfile(profile());
  assert.equal((await storage.getProfiles())[0].avatar, undefined);
});
