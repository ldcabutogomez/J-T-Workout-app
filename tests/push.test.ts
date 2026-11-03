import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PUSH_SETTINGS, loadPushSettings, notifyPartner, urlBase64ToUint8Array } from '../src/sync/push';

const config = { url: 'https://x.supabase.co', anonKey: 'sb_publishable_abc' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('VAPID keys decode from URL-safe base64', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255], 'URL-safe characters and missing padding');
});

test('notifyPartner posts to the push function with the pairing code, and never throws', async () => {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response('{"ok":true}', { status: 200 });
  }) as unknown as typeof fetch;
  notifyPartner(config, 'ABCDEFGHJK', 'device-123456', 'pr', 'Deadlift', ok);
  await flush();
  assert.equal(calls[0].url, 'https://x.supabase.co/functions/v1/push-api');
  assert.deepEqual(calls[0].body, { action: 'notify', code: 'ABCDEFGHJK', device: 'device-123456', kind: 'pr', detail: 'Deadlift' });
  assert.equal(calls[0].headers.apikey, config.anonKey);
  assert.equal(calls[0].headers.Authorization, undefined, 'publishable keys are not JWTs');

  const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  assert.doesNotThrow(() => notifyPartner(config, 'ABCDEFGHJK', 'device-123456', 'trained', undefined, failing));
  await flush();

  const before = calls.length;
  notifyPartner(null, 'ABCDEFGHJK', 'device-123456', 'trained', undefined, ok);
  notifyPartner(config, null, 'device-123456', 'trained', undefined, ok);
  await flush();
  assert.equal(calls.length, before, 'no sync config or no pairing means nothing is sent');
});

test('notification settings default to everything on but disabled until the phone opts in', () => {
  const settings = loadPushSettings();
  assert.equal(settings.enabled, false);
  assert.deepEqual(settings, DEFAULT_PUSH_SETTINGS);
  assert.ok(Object.values(settings.prefs).every(Boolean));
});
