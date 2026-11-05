import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthHash, sessionFromTokens } from '../src/sync/auth';
import { buildRunWrapUp, buildWorkoutWrapUp, clampWrap, parseActivitySummary, runActivity, WRAP_MAX } from '../src/engine/activity';
import { addComment, deleteComment, fetchComments, fetchFeed, publishActivities, setLike } from '../src/sync/community';

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
    { id: 'a', user_id: 'u2', display_name: 'Sam', gender: 'female', kind: 'run', summary: { kind: 'run', title: 'Run', distance: '5 km', duration: '30:00', pace: '6:00 /km' }, created_at: '2026-01-01T00:00:00Z', like_count: 2, liked_by_me: true },
    { id: 'b', user_id: 'u3', display_name: 'Bad', kind: 'run', summary: { nope: 1 }, created_at: '2026-01-01T00:00:00Z', like_count: 0, liked_by_me: false },
  ];
  const fetchImpl = (async () => new Response(JSON.stringify(rows))) as typeof fetch;
  const feed = await fetchFeed(config, session, fetchImpl);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].likes, 2);
  assert.equal(feed[0].likedByMe, true);
  assert.equal(feed[0].gender, 'female');
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

test('wrap-ups are short, factual and capped', () => {
  const text = buildWorkoutWrapUp({ kind: 'workout', title: 'Back Squat', week: 1, day: 3, sets: 18, volumeLb: 12400, minutes: 62, prs: ['Back Squat'], partial: false });
  assert.match(text, /Finished Back Squat: 18 sets, 12,400 lb in 62 min\./);
  assert.match(text, /New PR: Back Squat\./);
  assert.match(buildWorkoutWrapUp({ kind: 'workout', title: 'Bench', week: 1, day: 1, sets: 1, volumeLb: 100, minutes: null, prs: [], partial: true }, 3), /Partial Bench: 1 set, 100 lb\. 3 weeks in a row/);
  assert.equal(clampWrap('x'.repeat(500)).length, WRAP_MAX);
  assert.equal(clampWrap('  a \n\n b  '), 'a b');
  assert.match(buildRunWrapUp({ distance: '5 km', duration: '30:00', pace: '6:00 /km', longestRecent: true }), /Longest run in a while/);
});

test('an edited run wrap-up is used, and a blank one is omitted', () => {
  const run = { runId: 'r2', profileId: 'p', startTime: 5, durationSeconds: 600, distanceMeters: 2000, distanceUnit: 'km' as const, runType: 'easy' as const, source: 'manual' as const, createdTime: 0, updatedTime: 0 };
  assert.equal(runActivity(run, [], 'Felt great').summary.wrap, 'Felt great');
  assert.equal(runActivity(run, [], '   ').summary.wrap, undefined);
});

test('summaries parse with and without a wrap-up', () => {
  const base = { kind: 'run', title: 'Run', distance: '5 km', duration: '30:00', pace: '6:00 /km' };
  assert.equal(parseActivitySummary(base)?.wrap, undefined);
  assert.equal(parseActivitySummary({ ...base, wrap: 'Solid.' })?.wrap, 'Solid.');
  assert.equal(parseActivitySummary({ ...base, wrap: 'y'.repeat(900) })?.wrap?.length, WRAP_MAX);
});

test('comments are mapped, malformed rows dropped, and writes are scoped to the caller', async () => {
  const rows = [
    { id: 'c1', user_id: 'u2', display_name: 'Sam', body: 'Nice', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c2', user_id: 'u3', body: 5, created_at: 'x' },
  ];
  const list = await fetchComments(config, session, 'a1', (async () => new Response(JSON.stringify(rows))) as typeof fetch);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Sam');

  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, body: init.body as string });
    return new Response(init.method === 'POST' ? JSON.stringify([{ id: 'new', created_at: '2026-01-01T00:00:00Z' }]) : '');
  }) as unknown as typeof fetch;
  const saved = await addComment(config, session, 'a1', '  hello  ', fetchImpl);
  assert.equal(saved.body, 'hello');
  assert.equal(JSON.parse(calls[0].body ?? '{}').user_id, 'u1');
  await assert.rejects(() => addComment(config, session, 'a1', '   ', fetchImpl));
  await deleteComment(config, session, 'new', fetchImpl);
  assert.match(calls[1].url, /id=eq\.new&user_id=eq\.u1/);
});

test('history share posts original times, never the future, and skips an empty list', async () => {
  const bodies: Array<Array<{ created_at?: string }>> = [];
  const preferences: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    preferences.push(String((init.headers as Record<string, string>)?.Prefer));
    return new Response('');
  }) as unknown as typeof fetch;
  await publishActivities(config, session, [], fetchImpl);
  assert.equal(bodies.length, 0);
  const summary = { kind: 'run' as const, title: 'Run', distance: '1 km', duration: '5:00', pace: '5:00 /km' };
  await publishActivities(config, session, [
    { kind: 'run', sourceId: 'r:a', summary, createdAt: Date.UTC(2020, 0, 1) },
    { kind: 'run', sourceId: 'r:b', summary, createdAt: Date.now() + 86_400_000 },
  ], fetchImpl);
  assert.equal(bodies[0][0].created_at, '2020-01-01T00:00:00.000Z');
  assert.ok(Date.parse(bodies[0][1].created_at ?? '') <= Date.now() + 1000);
  assert.match(preferences[0], /merge-duplicates/, 'history refresh updates an existing activity row instead of replacing it');
});

test('notification rows are validated, ordered newest first and counted against the last-seen time', async () => {
  const { parseNotifications, countUnread } = await import('../src/sync/community');
  const items = parseNotifications([
    { kind: 'like', activity_id: 'a1', actor_id: 'u1', actor_name: 'Lauren', body: null, created_at: '2026-01-01T10:00:00Z', title: 'Back Squat' },
    { kind: 'comment', activity_id: 'a1', actor_id: 'u2', actor_name: '', body: 'Nice lift', created_at: '2026-01-01T11:00:00Z', title: null },
    { kind: 'share', activity_id: 'a1', actor_id: 'u2', created_at: '2026-01-01T12:00:00Z' },
    { kind: 'like', activity_id: 'a1', actor_id: 'u3', created_at: 'not a date' },
  ]);
  assert.deepEqual(items.map((item) => [item.kind, item.actorName, item.body, item.title]), [['comment', 'Someone', 'Nice lift', ''], ['like', 'Lauren', undefined, 'Back Squat']]);
  assert.equal(countUnread(items, Date.parse('2026-01-01T10:30:00Z')), 1);
  assert.equal(countUnread(items, 0), 2);
  assert.deepEqual(parseNotifications('nope'), []);
});
