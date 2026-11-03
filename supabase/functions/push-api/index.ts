// Client-facing push API: save/delete this device's subscription, and tell the partner's device something happened.
// Deployed with --no-verify-jwt: the secret pairing code is the credential, exactly like the sync functions.
import { CODE_PATTERN, cleanText, corsHeaders, db, hashCode, isPushEndpoint, json, sendPush, type SubscriptionRow } from '../_shared/push.ts';

type Kind = 'trained' | 'pr' | 'badge' | 'taunt';
const KINDS: Kind[] = ['trained', 'pr', 'badge', 'taunt'];
const PREF_KEYS = ['partner', 'shoutouts', 'taunts', 'reminder', 'streak', 'nudge'];
/** At most one push of each kind to a device per this many ms. */
const RATE_MS: Record<Kind, number> = { trained: 5 * 60_000, pr: 5 * 60_000, badge: 5 * 60_000, taunt: 10 * 60_000 };

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
function isTimeZone(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return true; } catch { return false; }
}

function cleanPrefs(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const key of PREF_KEYS) out[key] = source[key] !== false;
  return out;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const code = body.code;
  const device = body.device;
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return json({ error: 'bad code' }, 400);
  if (typeof device !== 'string' || device.length < 8 || device.length > 64) return json({ error: 'bad device' }, 400);
  const codeHash = await hashCode(code);
  const client = db();

  if (body.action === 'delete') {
    await client.from('push_subscriptions').delete().eq('code_hash', codeHash).eq('device_id', device);
    return json({ ok: true });
  }

  if (body.action === 'save') {
    const sub = body.subscription as Record<string, unknown> | undefined;
    const keys = (sub?.keys ?? {}) as Record<string, unknown>;
    if (!sub || !isPushEndpoint(sub.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return json({ error: 'bad subscription' }, 400);
    const settings = (body.settings ?? {}) as Record<string, unknown>;
    // A pairing has two phones, so it never has more than two subscriptions.
    const { data: existing } = await client.from('push_subscriptions').select('device_id').eq('code_hash', codeHash);
    if (!(existing ?? []).some((row) => row.device_id === device) && (existing ?? []).length >= 2) return json({ error: 'pairing full' }, 409);
    const days = Array.isArray(settings.trainDays) ? settings.trainDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : [0, 1, 3, 4];
    const { error } = await client.from('push_subscriptions').upsert({
      code_hash: codeHash,
      device_id: device,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh.slice(0, 200),
      auth: keys.auth.slice(0, 100),
      tz: isTimeZone(settings.tz) ? settings.tz : 'UTC',
      reminder_time: isTime(settings.reminderTime) ? settings.reminderTime : '17:30',
      train_days: [...new Set(days)],
      prefs: cleanPrefs(settings.prefs),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code_hash,device_id' });
    if (error) { console.error(error); return json({ error: 'save failed' }, 500); }
    return json({ ok: true });
  }

  if (body.action === 'notify') {
    const kind = body.kind as Kind;
    if (!KINDS.includes(kind)) return json({ error: 'bad kind' }, 400);
    // Sender name comes from the sender's own synced snapshot; the detail (a lift or badge name) is short, plain text.
    const { data: rows } = await client.from('partner_snapshots').select('device_id, snapshot').eq('code_hash', codeHash);
    if (!rows?.length) return json({ error: 'unknown pairing' }, 404);
    const mine = rows.find((row) => row.device_id === device);
    const name = cleanText((mine?.snapshot as { name?: string } | undefined)?.name) || 'Your partner';
    const detail = cleanText(body.detail);

    const { data: subs } = await client.from('push_subscriptions').select('*').eq('code_hash', codeHash).neq('device_id', device);
    let sent = 0;
    for (const sub of (subs ?? []) as SubscriptionRow[]) {
      const prefs = sub.prefs ?? {};
      let effective: Kind = kind;
      // Someone who only wants "partner trained" still hears about the workout, just without the PR/badge detail.
      if ((kind === 'pr' || kind === 'badge') && prefs.shoutouts === false) effective = 'trained';
      if (effective === 'trained' && prefs.partner === false) continue;
      if (effective === 'taunt' && prefs.taunts === false) continue;
      const last = Number((sub.last_sent ?? {})[effective]) || 0;
      if (Date.now() - last < RATE_MS[effective]) continue;

      const payloads: Record<Kind, { title: string; body: string }> = {
        trained: { title: `${name} just trained 💪`, body: 'Your turn? Open the app and keep pace.' },
        pr: { title: `${name} hit a PR 🔥`, body: detail ? `New best on ${detail}. Can you match it?` : 'New personal best. Can you match it?' },
        badge: { title: `${name} unlocked a badge 🏅`, body: detail ? `"${detail}". Go earn yours.` : 'Go earn yours.' },
        taunt: { title: `${name} sent you a taunt 😏`, body: 'Open the app to read it.' },
      };
      const ok = await sendPush(client, sub, { ...payloads[effective], tag: `partner-${effective}` });
      if (ok) {
        sent += 1;
        await client.from('push_subscriptions').update({ last_sent: { ...(sub.last_sent ?? {}), [effective]: Date.now() } })
          .eq('code_hash', codeHash).eq('device_id', sub.device_id);
      }
    }
    return json({ ok: true, sent });
  }

  return json({ error: 'bad action' }, 400);
});
