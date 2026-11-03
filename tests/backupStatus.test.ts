import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKUP_AFTER_DAYS, BACKUP_AFTER_SESSIONS, FIRST_BACKUP_AFTER_SESSIONS, backupDue } from '../src/lib/backupStatus';
import type { WorkoutSession } from '../src/types';
import { completeSession } from './helpers';

const DAY = 86_400_000;
const NOW = new Date(2024, 4, 15, 12).getTime();
const base = completeSession();
const done = (n: number, at: (i: number) => number): WorkoutSession[] =>
  Array.from({ length: n }, (_, i) => ({ ...structuredClone(base), sessionId: `s${i}`, startTime: at(i) - 1000, completedTime: at(i) }));

test('someone who never backed up is asked once there is a little history', () => {
  assert.equal(backupDue(done(FIRST_BACKUP_AFTER_SESSIONS - 1, (i) => NOW - i * DAY), null, NOW, 0), false);
  assert.equal(backupDue(done(FIRST_BACKUP_AFTER_SESSIONS, (i) => NOW - i * DAY), null, NOW, 0), true);
});

test('after a backup, enough new sessions or a long gap with new work triggers a reminder', () => {
  const last = NOW - 3 * DAY;
  assert.equal(backupDue(done(2, (i) => NOW - i * 3_600_000), last, NOW, 0), false, 'recent backup, little new');
  assert.equal(backupDue(done(BACKUP_AFTER_SESSIONS, (i) => NOW - i * 3_600_000), last, NOW, 0), true, 'many new sessions');
  const old = NOW - (BACKUP_AFTER_DAYS + 1) * DAY;
  assert.equal(backupDue(done(1, () => NOW - DAY), old, NOW, 0), true, 'old backup and something new');
  assert.equal(backupDue([], old, NOW, 0), false, 'nothing new to protect');
});

test('sessions already covered by the last backup do not count, and a snooze silences the reminder', () => {
  const covered = done(BACKUP_AFTER_SESSIONS + 2, (i) => NOW - 20 * DAY - i * 3_600_000);
  assert.equal(backupDue(covered, NOW - 10 * DAY, NOW, 0), false);
  assert.equal(backupDue(done(10, (i) => NOW - i * 3_600_000), null, NOW, NOW + DAY), false, 'snoozed');
});
