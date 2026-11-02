import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAvatar, AVATAR_PHOTO_PREFIX, AVATAR_THUMB_MAX_CHARS, isJpegDataUrl } from '../src/lib/avatar';
import { LIVE_FRESH_MS, SNAPSHOT_SOFT_LIMIT, composeBoard, isLiveFresh, parseSnapshot, snapshotFromHistory, statsFromSnapshot } from '../src/engine/leaderboard';
import { createWorkoutSession, logSet } from '../src/engine/sessionEngine';
import { getDayPrescription } from '../src/program/prescriptions';
import { planFromToday, weekCodes } from '../src/engine/schedule';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

// Wednesday 2024-05-15 12:00 local time.
const NOW = new Date(2024, 4, 15, 12).getTime();
const TODAY = '2024-05-15';
const THUMB = AVATAR_PHOTO_PREFIX + 'A'.repeat(3000);

const lifter = (overrides = {}) => profile({
  id: 'partner-1', name: 'Lauren', avatar: { thumb: THUMB, color: 'violet' }, schedule: planFromToday(1, [], TODAY), ...overrides,
});

function activeWorkout(done: number): WorkoutSession {
  const p = lifter();
  let session = createWorkoutSession(p, getDayPrescription(1, 1, p), NOW - 600_000, false);
  const sets = session.exercises.flatMap((exercise) => exercise.sets.map((set) => ({ slot: exercise.slotId, id: set.setId })));
  for (const { slot, id } of sets.slice(0, done)) session = logSet(session, slot, id, 5, 100, 2, NOW - 1000);
  return session;
}

test('a snapshot carries your photo thumbnail, theme, today, this week, and the live workout when sharing is on', () => {
  const snapshot = snapshotFromHistory(lifter(), [], NOW, 'device-1', { activeSession: activeWorkout(12) });
  assert.deepEqual(snapshot.avatar, { thumb: THUMB, color: 'violet' });
  assert.equal(snapshot.theme, 'lavender');
  assert.deepEqual(snapshot.today, { week: 1, day: 1, lift: 'Back Squat' });
  assert.equal(snapshot.workout?.done, 12);
  assert.equal(snapshot.workout?.total, 32);
  assert.equal(snapshot.workout?.lift, 'Back Squat');
  assert.equal(snapshot.weekCodes?.length, 7);
  // Planned from Wednesday: Day 1 is today, Days 3 and 4 follow, and the missed-by-calendar Day 2 moves to Saturday.
  assert.deepEqual(snapshot.weekCodes, ['', '', '1t', '3u', '4u', '2u', '']);
  assert.equal(snapshot.v, 1, 'the version does not change, so phones on an older build keep reading it');
  assert.ok(JSON.stringify(snapshot).length < 8192);
});

test('nothing beyond stats is sent when sharing is off, or when no live context is given', () => {
  const off = snapshotFromHistory(lifter({ shareLive: false }), [], NOW, 'device-1', { activeSession: activeWorkout(3) });
  for (const key of ['avatar', 'theme', 'workout', 'today', 'weekCodes']) assert.equal(key in off, false, `${key} is not sent`);
  const plain = snapshotFromHistory(lifter(), [], NOW, 'device-1');
  for (const key of ['avatar', 'theme', 'workout', 'today', 'weekCodes']) assert.equal(key in plain, false);
  const editing = { ...activeWorkout(3), isEditingCompleted: true };
  assert.equal(snapshotFromHistory(lifter(), [], NOW, 'd', { activeSession: editing }).workout, undefined, 'editing history is not "lifting now"');
});

test('the thumbnail is the first thing dropped when a snapshot nears the server cap', () => {
  const huge = lifter({ avatar: { thumb: AVATAR_PHOTO_PREFIX + 'A'.repeat(7_400), color: 'cobalt' } });
  const snapshot = snapshotFromHistory(huge, [], NOW, 'device-1', { activeSession: activeWorkout(5) });
  assert.deepEqual(snapshot.avatar, { color: 'cobalt' });
  assert.ok(JSON.stringify(snapshot).length < SNAPSHOT_SOFT_LIMIT);
  // A worst-case legitimate thumbnail still fits with everything else, under the 8192-byte limit.
  const max = lifter({ avatar: { thumb: AVATAR_PHOTO_PREFIX + 'A'.repeat(AVATAR_THUMB_MAX_CHARS - AVATAR_PHOTO_PREFIX.length), color: 'violet' } });
  const history = Array.from({ length: 30 }, (_, i) => ({ ...completeSession(profile(), 1, 1, NOW - i * 7 * 86_400_000), sessionId: `s${i}` }));
  const big = snapshotFromHistory(max, history, NOW, 'device-1', { activeSession: activeWorkout(20) });
  assert.ok(JSON.stringify(big).length <= 8192, `worst case is ${JSON.stringify(big).length} bytes`);
  assert.ok(big.avatar?.thumb, 'a legitimate thumbnail survives');
});

test('what a partner sends is validated piece by piece: a bad piece is dropped, the stats still show', () => {
  const good = snapshotFromHistory(lifter(), [], NOW, 'device-2', { activeSession: activeWorkout(2) });
  const parsed = parseSnapshot(JSON.parse(JSON.stringify(good)))!;
  assert.deepEqual(parsed.avatar, good.avatar);
  assert.equal(parsed.workout?.done, 2);
  assert.deepEqual(parsed.weekCodes, good.weekCodes);

  const mutate = (patch: Record<string, unknown>) => parseSnapshot({ ...JSON.parse(JSON.stringify(good)), ...patch })!;
  const hostile = [
    'data:image/png;base64,AAAA',
    `${AVATAR_PHOTO_PREFIX}AAAA"><script>alert(1)</script>`,
    `${AVATAR_PHOTO_PREFIX}AAAA" onerror="x`,
    'javascript:alert(1)',
    AVATAR_PHOTO_PREFIX + 'A'.repeat(AVATAR_THUMB_MAX_CHARS + 1),
    'https://example.com/me.jpg',
  ];
  for (const thumb of hostile) {
    const result = mutate({ avatar: { thumb, color: 'violet' } });
    assert.equal(result.avatar?.thumb, undefined, `rejects ${thumb.slice(0, 40)}`);
    assert.equal(result.avatar?.color, 'violet', 'the color still arrives');
    assert.equal(result.name, 'Lauren', 'the stats are untouched');
  }
  assert.equal(mutate({ avatar: { color: 'magenta' } }).avatar, undefined);
  assert.equal(mutate({ theme: 'neon' }).theme, undefined);
  assert.equal(mutate({ weekCodes: ['1c', '', '', '', '', ''] }).weekCodes, undefined, 'wrong length');
  assert.equal(mutate({ weekCodes: ['9x', '', '', '', '', '', ''] }).weekCodes, undefined, 'unknown code');
  assert.equal(mutate({ today: { week: 99, day: 1, lift: 'Squat' } }).today, undefined);
  assert.equal(mutate({ today: { week: 1, day: 1, lift: '<img src=x>' } }).today, undefined);
  assert.equal(mutate({ workout: { ...good.workout, done: 50, total: 10 } }).workout, undefined, 'done cannot exceed total');
  assert.equal(mutate({ workout: { ...good.workout, lift: 'x'.repeat(200) } }).workout, undefined);
  assert.equal(mutate({ workout: 'lifting' }).workout, undefined);
});

test('a snapshot from an older phone, with none of the new fields, still parses', () => {
  const { avatar: _a, theme: _t, workout: _w, today: _d, weekCodes: _c, ...old } = snapshotFromHistory(lifter(), [], NOW, 'old-phone', { activeSession: activeWorkout(1) });
  const parsed = parseSnapshot(old)!;
  assert.ok(parsed);
  for (const key of ['avatar', 'theme', 'workout', 'today', 'weekCodes']) assert.equal(key in parsed, false);
  const stats = statsFromSnapshot(parsed, NOW);
  assert.equal(stats.avatar, undefined);
  assert.equal(stats.name, 'Lauren');
});

test('a partner\'s picture and status reach the board', () => {
  const partner = snapshotFromHistory(lifter({ id: 'partner-2', name: 'Luis', avatar: { thumb: THUMB, color: 'cobalt' } }), [], NOW, 'phone-2', { activeSession: activeWorkout(9) });
  const mine = lifter({ id: 'mine', name: 'Me', avatar: undefined });
  const board = composeBoard({ profiles: [mine], historyByProfile: { mine: [] }, pairedProfileId: 'mine', remote: [partner], now: NOW });
  const theirs = board.ranked.find((s) => s.profileId === 'remote:phone-2')!;
  assert.deepEqual(theirs.avatar, { thumb: THUMB, color: 'cobalt' });
  assert.equal(theirs.workout?.done, 9);
  assert.equal(theirs.theme, 'blue', 'partner-2 is on the blue theme');
  const own = board.ranked.find((s) => s.profileId === 'mine')!;
  assert.equal(own.workout, undefined, 'your own row is built from local history, with no live extras');
});

test('"lifting now" goes stale after three hours', () => {
  const workout = { week: 1, day: 1, lift: 'Back Squat', done: 3, total: 32, updatedAt: NOW };
  assert.equal(isLiveFresh(workout, NOW + 60_000), true);
  assert.equal(isLiveFresh(workout, NOW + LIVE_FRESH_MS), true);
  assert.equal(isLiveFresh(workout, NOW + LIVE_FRESH_MS + 1), false);
  assert.equal(isLiveFresh(workout, NOW - 60_000), false, 'a time in the future is not trusted');
  assert.equal(isLiveFresh(undefined, NOW), false);
});

test('week codes: day number plus status per workout, empty on rest days', () => {
  const schedule = { anchor: '2024-05-13', days: [0, 1, 3, 4], moves: {} };
  const done = { ...completeSession(profile(), 1, 1, new Date(2024, 4, 13, 12).getTime()), sessionId: 'd1' };
  const codes = weekCodes(schedule, [done], TODAY);
  assert.deepEqual(codes, ['1c', '2m', '', '3u', '4u', '', '']);
  assert.deepEqual(weekCodes(schedule, [], '2024-05-14'), ['1m', '2t', '', '3u', '4u', '', '']);
});

test('thumbnail and avatar validation', () => {
  assert.equal(isJpegDataUrl(THUMB, AVATAR_THUMB_MAX_CHARS), true);
  assert.equal(isJpegDataUrl(`${THUMB}!`, AVATAR_THUMB_MAX_CHARS), false);
  assert.equal(isJpegDataUrl(5, AVATAR_THUMB_MAX_CHARS), false);
  assert.equal(isValidAvatar({ photo: AVATAR_PHOTO_PREFIX + 'AAAA', thumb: THUMB, color: 'ink' }), true);
  assert.equal(isValidAvatar({ thumb: 'data:image/png;base64,AAAA' }), false);
  assert.equal(isValidAvatar({ thumb: AVATAR_PHOTO_PREFIX + 'A'.repeat(AVATAR_THUMB_MAX_CHARS) }), false);
});
