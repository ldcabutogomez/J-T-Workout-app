import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBadges, computeStreak, deriveHighlights } from '../src/engine/achievements';
import { composeBoard, computeCompliance, parseSnapshot, snapshotFromHistory, weekKey } from '../src/engine/leaderboard';
import { completedSetCount, countsTowardStats, fmtCount, plannedSetCount, sessionCredit, weekStart, weeklyCounts } from '../src/engine/sessionValidity';
import { describeSyncFailure, pushSnapshot, testConnection } from '../src/sync/cloud';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

// Wednesday 2024-05-15 12:00 local time.
const NOW = new Date(2024, 4, 15, 12).getTime();
const day = (month: number, date: number, hour = 12) => new Date(2024, month - 1, date, hour).getTime();
const base = completeSession(profile(), 1, 1, 1_000);

function finished(id: string, time: number): WorkoutSession {
  const next = structuredClone(base);
  next.sessionId = id;
  next.startTime = time - 3_600_000;
  next.completedTime = time;
  return next;
}

/** A partial workout with the first `done` of the planned sets logged. */
function partial(id: string, time: number, done: number): WorkoutSession {
  const next = finished(id, time);
  next.status = 'partial';
  next.isPartial = true;
  next.exercises.flatMap((exercise) => exercise.sets).forEach((set, index) => {
    if (index >= done) { set.completed = false; set.actualReps = null; }
  });
  return next;
}

test('credit: finished is 1, partial is the share of sets logged, everything else is 0', () => {
  assert.equal(plannedSetCount(base), 32);
  assert.equal(sessionCredit(finished('f', 1)), 1);
  assert.equal(sessionCredit(partial('p', 1, 18)), 18 / 32);
  assert.equal(sessionCredit(partial('p0', 1, 0)), 0, 'a partial with nothing logged counts as nothing');
  assert.equal(sessionCredit({ ...finished('s', 1), status: 'skipped', isSkipped: true }), 0);
  assert.equal(sessionCredit({ ...finished('d', 1), isDemo: true }), 0);
  assert.equal(sessionCredit({ ...finished('a', 1), status: 'active' }), 0);
  assert.equal(completedSetCount(partial('p', 1, 18)), 18);
  assert.equal(countsTowardStats(partial('p', 1, 1)), true);
  assert.equal(countsTowardStats(partial('p0', 1, 0)), false);
});

test('approved example: weekly total, count display, and compliance', () => {
  const week = [finished('mon', day(5, 6)), partial('wed', day(5, 8), 18), finished('fri', day(5, 10)), partial('sat', day(5, 11), 8)];
  const total = weeklyCounts(week).get(weekStart(day(5, 6)))!;
  assert.ok(Math.abs(total - 2.8125) < 1e-9, `1 + 0.5625 + 1 + 0.25 = ${total}`);
  assert.equal(fmtCount(total), '2.8');
  assert.equal(computeCompliance(week, 4, NOW), 18, 'only the last 4 full weeks count, each capped at the goal');
  assert.equal(fmtCount(3), '3');
  // A week of partials can still meet the goal once the credits add up.
  const grind = [partial('a', day(5, 13), 24), partial('b', day(5, 14), 24), partial('c', day(5, 14, 18), 24), partial('d', day(5, 15, 8), 24), finished('e', day(5, 15, 9))];
  assert.equal(computeStreak(grind, 4, NOW).goalMet, true, '4 x 0.75 + 1 reaches 4');
});

test('snapshots include partial workouts in volume and PRs, and report them separately', () => {
  const p = profile();
  const history = [finished('full', day(5, 13)), partial('half', day(5, 14), 16)];
  const snap = snapshotFromHistory(p, history, NOW, 'device');
  const fullVolume = deriveHighlights([history[0]]).get('full')!.totalVolume;
  const halfVolume = deriveHighlights([history[1]]).get('half')!.totalVolume;
  assert.ok(halfVolume > 0 && halfVolume < fullVolume);
  assert.equal(snap.volumeLb, Math.round(fullVolume + halfVolume));
  assert.equal(snap.sessionsCompleted, 1);
  assert.equal(snap.partialSessions, 1);
  assert.equal(snap.weekly[weekKey(weekStart(NOW))], 1.5, 'one full workout plus half of another');
  assert.equal(snap.lastSessionAt, day(5, 14));
  // Nothing logged: not counted at all.
  assert.equal(snapshotFromHistory(p, [partial('none', day(5, 14), 0)], NOW, 'device').partialSessions, 0);
});

test('snapshots from older phones still parse, and bad partial counts are rejected', () => {
  const snap = snapshotFromHistory(profile(), [finished('full', day(5, 13))], NOW, 'device');
  const { partialSessions: _omit, ...legacy } = snap;
  assert.equal(parseSnapshot(legacy)?.partialSessions, 0);
  assert.equal(parseSnapshot({ ...snap, weekly: { '2024-05-13': 2.5 } })?.weekly['2024-05-13'], 2.5, 'fractional weekly credit parses');
  assert.equal(parseSnapshot({ ...snap, partialSessions: -1 }), null);
  assert.equal(parseSnapshot({ ...snap, partialSessions: 'two' }), null);
});

test('your own row shows after a workout with no partner and no pairing', () => {
  const p = profile({ id: 'solo', name: 'Solo' });
  const historyByProfile = { solo: [partial('half', day(5, 14), 16)] };
  const unpaired = composeBoard({ profiles: [p], historyByProfile, pairedProfileId: null, remote: [], now: NOW });
  assert.equal(unpaired.ranked.length, 1);
  assert.ok(unpaired.ranked[0].volumeLb > 0, 'pounds lifted from a partial workout are on the board');
  assert.equal(unpaired.ranked[0].partialSessions, 1);

  const pairedAlone = composeBoard({ profiles: [p], historyByProfile, pairedProfileId: 'solo', remote: [], now: NOW });
  assert.equal(pairedAlone.ranked.length, 1, 'paired but the partner has not synced yet: you still see yourself');
  assert.equal(pairedAlone.ranked[0].profileId, 'solo');
  assert.equal(pairedAlone.ranked[0].volumeLb, unpaired.ranked[0].volumeLb);

  const partner = snapshotFromHistory(profile({ id: 'other', name: 'Other' }), [finished('x', day(5, 13))], NOW, 'phone-2');
  const both = composeBoard({ profiles: [p], historyByProfile, pairedProfileId: 'solo', remote: [partner], now: NOW });
  assert.deepEqual(both.ranked.map((s) => s.profileId).sort(), ['remote:phone-2', 'solo']);
});

test('badges and the cycle check still require finished workouts', () => {
  const history = [finished('a', day(5, 13)), partial('b', day(5, 14), 30)];
  const earned = evaluateBadges(finished('now', day(5, 15)), history, 4, NOW);
  assert.ok(earned.includes('first_workout'));
  assert.ok(!earned.includes('sessions_5'));
  // Three partials plus one finished must not look like four finished workouts for the milestone badges.
  const many = [partial('p1', day(5, 11), 30), partial('p2', day(5, 12), 30), partial('p3', day(5, 13), 30), partial('p4', day(5, 14), 30)];
  const manyEarned = evaluateBadges(finished('now2', day(5, 15)), many, 4, NOW);
  assert.ok(!manyEarned.includes('sessions_5'), 'partial workouts do not count toward the 5-workout badge');
  assert.ok(!manyEarned.includes('streak_2'));
});

test('sync errors keep the server explanation and explain the common causes', () => {
  assert.match(describeSyncFailure(404, '{"code":"PGRST202","message":"Could not find the function"}'), /schema\.sql/);
  assert.match(describeSyncFailure(401, '{"message":"Invalid API key"}'), /rejected the key/);
  assert.match(describeSyncFailure(500, '{"message":"boom"}'), /Sync failed \(500\): boom/);
  assert.match(describeSyncFailure(400, '{"message":"pairing full"}'), /two phones/);
  assert.equal(describeSyncFailure(502, ''), 'Sync failed (502)');
});

test('the Authorization header matches the key type, and the connection test only reads', async () => {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(url.endsWith('pull_snapshots') ? '[]' : null, { status: url.endsWith('pull_snapshots') ? 200 : 204 });
  }) as unknown as typeof fetch;
  const snap = snapshotFromHistory(profile(), [], NOW, 'device');

  await pushSnapshot({ url: 'https://x.supabase.co', anonKey: 'eyJabc.def.ghi' }, 'ABCDEFGHJK', snap, fake);
  assert.equal(seen[0].headers.Authorization, 'Bearer eyJabc.def.ghi');
  assert.equal(seen[0].headers.apikey, 'eyJabc.def.ghi');

  await pushSnapshot({ url: 'https://x.supabase.co', anonKey: 'sb_publishable_abc' }, 'ABCDEFGHJK', snap, fake);
  assert.equal(seen[1].headers.Authorization, undefined);
  assert.equal(seen[1].headers.apikey, 'sb_publishable_abc');

  await testConnection({ url: 'https://x.supabase.co', anonKey: 'sb_publishable_abc' }, fake);
  assert.ok(seen[2].url.endsWith('/rpc/pull_snapshots'), 'the test only calls the read function');
  assert.match(JSON.parse(seen[2].body).p_code, /^[A-Z2-9]{10}$/);

  const notFound = (async () => new Response('{"code":"PGRST202","message":"Could not find the function"}', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(testConnection({ url: 'https://x.supabase.co', anonKey: 'sb_publishable_abc' }, notFound), /schema\.sql/);
});
