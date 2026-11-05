import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthHash, sessionFromTokens } from '../src/sync/auth';
import { parseActivitySummary, runActivity } from '../src/engine/activity';
import { fetchFeed, setLike } from '../src/sync/community';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims: object) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
const config = { url: 'https://x.supabase.co', anonKey: 'k' };
const session = { accessToken: 't', refreshToken: 'r', expiresAt: 9e15, userId: 'u1' };

test('parses a magic-link redirect hash into a session', () => {
  const hash = `#access_token=${jwt({ sub: 'u1', email: 'a@b.co' })}&refresh_token=r&expires_in=3600&token_type=bearer`;
  const { session: s, error } = parseAuthHash(hash, 1000);
  assert.equal(error, null);
  assert.equal(s?.userId, 'u1');
  assert.equal(s?.email, 'a@b.co');
  assert.equal(s?.expiresAt, 1000 + 3_600_000);
});

test('surfaces a redirect error and rejects tokens without a subject', () => {
  assert.equal(parseAuthHash('#error=access_denied&error_description=Link+expired', 0).error, 'Link expired');
  assert.equal(sessionFromTokens(jwt({}), 'r', 3600, 0), null);
  assert.equal(sessionFromTokens('garbage', 'r', 3600, 0), null);
});

test('a run summary carries stats only and round-trips the validator', () => {
  const { sourceId, summary } = runActivity({
    runId: 'run1', profileId: 'p', startTime: 0, durationSeconds: 1800, distanceMeters: 5000, distanceUnit: 'km',
    runType: 'easy', notes: 'secret note', source: 'manual', createdTime: 0, updatedTime: 0,
  });
  assert.equal(sourceId, 'r:run1');
  assert.ok(!JSON.stringify(summary).includes('secret'));
  assert.deepEqual(parseActivitySummary(JSON.parse(JSON.stringify(summary))), summary);
});

test('malformed summaries are dropped', () => {
  assert.equal(parseActivitySummary(null), null);
  assert.equal(parseActivitySummary({ kind: 'workout', title: 'x' }), null);
  assert.equal(parseActivitySummary({ kind: 'cardio', title: 'x' }), null);
});

test('feed rows are validated and mapped', async () => {
  const rows = [
    { id: 'a', user_id: 'u2', display_name: 'Sam', kind: 'run', summary: { kind: 'run', title: 'Run', distance: '5 km', duration: '30:00', pace: '6:00 /km' }, created_at: '2026-01-01T00:00:00Z', like_count: 2, liked_by_me: true },
    { id: 'b', user_id: 'u3', display_name: 'Bad', kind: 'run', summary: { nope: 1 }, created_at: '2026-01-01T00:00:00Z', like_count: 0, liked_by_me: false },
  ];
  const fetchImpl = (async () => new Response(JSON.stringify(rows))) as typeof fetch;
  const feed = await fetchFeed(config, session, fetchImpl);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].likes, 2);
  assert.equal(feed[0].likedByMe, true);
});

test('liking inserts and unliking deletes only the caller\'s row', async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url, method: init.method }); return new Response(''); }) as unknown as typeof fetch;
  await setLike(config, session, 'act1', true, fetchImpl);
  await setLike(config, session, 'act1', false, fetchImpl);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].method, 'DELETE');
  assert.match(calls[1].url, /user_id=eq\.u1/);
});
