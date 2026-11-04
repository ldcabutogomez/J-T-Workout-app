import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePairCode, normalizePairCode, pullSnapshots, pushSnapshot, formatPairCode } from '../src/sync/cloud';
import { snapshotFromHistory, statsFromSnapshot, parseSnapshot } from '../src/engine/leaderboard';
import { completeSession, profile } from './helpers';

const DAY = 86_400_000;
const NOW = new Date(2024, 4, 15, 12).getTime(); // Wednesday
const config = { url: 'https://x.supabase.co', anonKey: 'anon' };

test('pair codes are valid, formatted and normalised', () => {
  const code = generatePairCode();
  assert.match(code, /^[A-Z2-9]{10}$/);
  assert.equal(normalizePairCode(formatPairCode(code).toLowerCase()), code);
  assert.equal(normalizePairCode('short'), null);
  assert.equal(normalizePairCode('AAAAA-0OIL1'), null, 'ambiguous characters are rejected');
});

test('snapshot survives JSON and recomputes against the receiver clock', () => {
  const base = completeSession();
  const mk = (id: string, time: number) => ({ ...structuredClone(base), sessionId: id, startTime: time - 1000, completedTime: time });
  const p = profile({ id: 'p1', name: 'Lauren', weeklyGoalSessions: 2 });
  // Two sessions last week met the goal of 2.
  const snap = snapshotFromHistory(p, [mk('a', NOW - 7 * DAY), mk('b', NOW - 7 * DAY - 5000)], NOW, 'dev-lauren-1');
  const wire = parseSnapshot(JSON.parse(JSON.stringify(snap)));
  assert.ok(wire);
  const sameWeek = statsFromSnapshot(wire!, NOW);
  assert.equal(sameWeek.streakWeeks, 1, 'an unmet current week does not break last week\'s streak');
  assert.equal(sameWeek.weeklyCompliancePct, 0, 'nothing done yet this week');
  assert.ok(sameWeek.score >= 0 && sameWeek.score <= 100);
  // Three weeks later with no new push: last week's sessions fall out of "this week" and the old streak is gone.
  const later = statsFromSnapshot(wire!, NOW + 21 * DAY);
  assert.equal(later.weeklyCount, 0);
  assert.equal(later.streakWeeks, 0);
  assert.ok((later.daysSinceLast ?? 0) >= 21, 'inactivity keeps showing even though the phone never pushed again');
});

test('parseSnapshot rejects malformed data', () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot({ v: 2 }), null);
  const good = snapshotFromHistory(profile(), [], NOW, 'dev-12345678');
  assert.equal(parseSnapshot({ ...good, volumeLb: -5 }), null);
  assert.equal(parseSnapshot({ ...good, weekly: { 'not-a-date': 2 } }), null);
});

test('push and pull use the RPC endpoints with the anon key', async () => {
  const snap = snapshotFromHistory(profile(), [], NOW, 'dev-12345678');
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return url.endsWith('pull_snapshots')
      ? new Response(JSON.stringify([snap, { junk: true }]), { status: 200 })
      : new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  await pushSnapshot(config, 'ABCDEFGHJK', snap, fake);
  const pulled = await pullSnapshots(config, 'ABCDEFGHJK', fake);
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/push_snapshot');
  assert.equal((calls[0].init.headers as Record<string, string>).apikey, 'anon');
  assert.equal(pulled.length, 1, 'malformed rows are dropped');
});

test('a full pairing surfaces a clear error', async () => {
  const fake = (async () => new Response('{"message":"pairing full"}', { status: 400 })) as unknown as typeof fetch;
  const snap = snapshotFromHistory(profile(), [], NOW, 'dev-12345678');
  await assert.rejects(pushSnapshot(config, 'ABCDEFGHJK', snap, fake), /two phones/);
});
