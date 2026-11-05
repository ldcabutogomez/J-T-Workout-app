// Database webhook target: someone liked or commented on a post, so push a notification to the post's owner.
// Called by two triggers (see supabase/PUSH_SETUP.md). Deployed with --no-verify-jwt: the shared webhook secret is the credential.
import { cleanText, corsHeaders, db, isPushEndpoint, json, sendRaw } from '../_shared/push.ts';

/** At most one push of each kind per phone per this many ms, so a burst of likes is one buzz. */
const RATE_MS = { like: 2 * 60_000, comment: 15_000 };

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!sameSecret(request.headers.get('x-webhook-secret') ?? '', Deno.env.get('WEBHOOK_SECRET') ?? '')) return json({ error: 'forbidden' }, 403);

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try { payload = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (payload.type !== 'INSERT' || !payload.record) return json({ ok: true, skipped: 'not an insert' });
  const kind = payload.table === 'activity_likes' ? 'like' : payload.table === 'activity_comments' ? 'comment' : null;
  if (!kind) return json({ ok: true, skipped: 'unknown table' });

  const activityId = payload.record.activity_id;
  const actorId = payload.record.user_id;
  if (typeof activityId !== 'string' || typeof actorId !== 'string') return json({ error: 'bad record' }, 400);

  const client = db();
  const { data: activity } = await client.from('activities').select('user_id, summary').eq('id', activityId).maybeSingle();
  if (!activity || activity.user_id === actorId) return json({ ok: true, skipped: 'own or missing' });

  const { data: actor } = await client.from('community_members').select('display_name').eq('user_id', actorId).maybeSingle();
  const name = cleanText(actor?.display_name) || 'Someone';
  const title = cleanText((activity.summary as { title?: string } | null)?.title, 60);
  const what = title ? ` your ${title} post` : ' your post';

  const { data: subs } = await client.from('community_push').select('*').eq('user_id', activity.user_id);
  let sent = 0;
  for (const sub of subs ?? []) {
    const prefs = (sub.prefs ?? {}) as Record<string, boolean>;
    if (kind === 'like' && prefs.likes === false) continue;
    if (kind === 'comment' && prefs.comments === false) continue;
    if (!isPushEndpoint(sub.endpoint)) { await client.from('community_push').delete().eq('user_id', sub.user_id).eq('device_id', sub.device_id); continue; }
    const last = Number((sub.last_sent ?? {})[kind]) || 0;
    if (Date.now() - last < RATE_MS[kind]) continue;

    const message = kind === 'like'
      ? { title: `${name} liked${what}`, body: 'Open Activity to see it.' }
      : { title: `${name} commented on${what}`, body: cleanText(payload.record.body, 120) || 'Open Activity to read it.' };
    const result = await sendRaw(sub, { ...message, tag: `activity-${activityId}-${kind}`, url: `./?open=activity&post=${encodeURIComponent(activityId)}` });
    if (result.gone) await client.from('community_push').delete().eq('user_id', sub.user_id).eq('device_id', sub.device_id);
    if (result.ok) {
      sent += 1;
      await client.from('community_push').update({ last_sent: { ...(sub.last_sent ?? {}), [kind]: Date.now() } }).eq('user_id', sub.user_id).eq('device_id', sub.device_id);
    }
  }
  return json({ ok: true, sent });
});
