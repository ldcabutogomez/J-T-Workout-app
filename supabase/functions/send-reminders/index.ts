// Runs every 15 minutes (pg_cron, see supabase/PUSH_SETUP.md). For each subscribed phone, in that phone's own
// time zone, decides whether to send a workout reminder, a streak-at-risk warning, or a warm nudge.
// At most one scheduled push per phone per day, and never in quiet hours.
import { db, json, sendPush, type SubscriptionRow } from '../_shared/push.ts';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const QUIET_BEFORE = 7;
const QUIET_FROM = 22;
const WINDOW_MIN = 20; // a bit over the 15 minute schedule, so a late tick is not missed (the daily cap prevents repeats)

const NUDGES = [
  'A short session still counts. Your future self will thank you.',
  'You have been building something good. Come add to it today.',
  'No pressure, just a nudge: the bar is ready when you are.',
  'Showing up is the hard part, and you are great at it. See you in the gym?',
  'Your goals have not gone anywhere. Neither have you. Let us go.',
  'One workout today keeps the momentum alive.',
];

interface Local { dateKey: string; mondayKey: string; dow: number; minutes: number; hour: number }

function localParts(now: Date, tz: string): Local {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const dow = Math.max(0, WEEKDAYS.indexOf(parts.weekday));
  const y = Number(parts.year); const m = Number(parts.month); const d = Number(parts.day);
  const monday = new Date(Date.UTC(y, m - 1, d - dow));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    mondayKey: monday.toISOString().slice(0, 10),
    dow,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    hour: Number(parts.hour),
  };
}

const dayNumber = (dateKey: string) => Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
const inWindow = (nowMin: number, targetMin: number) => nowMin >= targetMin && nowMin < targetMin + WINDOW_MIN;

Deno.serve(async (request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || request.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);
  const client = db();
  const now = new Date();
  const { data: subs, error } = await client.from('push_subscriptions').select('*');
  if (error) { console.error(error); return json({ error: 'read failed' }, 500); }

  let sent = 0;
  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    const prefs = sub.prefs ?? {};
    const local = localParts(now, sub.tz);
    if (local.hour < QUIET_BEFORE || local.hour >= QUIET_FROM) continue;
    if ((sub.last_sent ?? {}).day === local.dateKey) continue; // one scheduled push a day

    const { data: row } = await client.from('partner_snapshots').select('snapshot').eq('code_hash', sub.code_hash).eq('device_id', sub.device_id).maybeSingle();
    const snap = (row?.snapshot ?? {}) as { lastSessionAt?: number | null; weekly?: Record<string, number>; weeklyGoal?: number };
    const last = typeof snap.lastSessionAt === 'number' ? localParts(new Date(snap.lastSessionAt), sub.tz).dateKey : null;
    const trainedToday = last === local.dateKey;
    if (trainedToday) continue;
    const daysSince = last === null ? 99 : dayNumber(local.dateKey) - dayNumber(last);
    const goal = Math.max(1, snap.weeklyGoal ?? 4);
    const weekCount = snap.weekly?.[local.mondayKey] ?? 0;
    const daysLeft = 7 - local.dow; // including today
    const need = Math.ceil(goal - weekCount - 1e-9);

    const [h, m] = sub.reminder_time.split(':').map(Number);
    let kind: 'reminder' | 'streak' | 'nudge' | null = null;
    let payload: { title: string; body: string } | null = null;

    if (prefs.reminder !== false && sub.train_days.includes(local.dow) && inWindow(local.minutes, h * 60 + m)) {
      kind = 'reminder';
      payload = { title: "It's workout time 💪", body: 'Today is a training day. Open the app and get your first set in.' };
    } else if (prefs.streak !== false && need > 0 && need >= daysLeft - 1 && inWindow(local.minutes, 18 * 60)) {
      kind = 'streak';
      payload = {
        title: 'Your weekly goal needs you 🔥',
        body: need >= daysLeft ? `You need ${need} more session${need === 1 ? '' : 's'} and only ${daysLeft} day${daysLeft === 1 ? '' : 's'} left. Today counts!` : `${need} more session${need === 1 ? '' : 's'} to go this week. Train today and you are right on track.`,
      };
    } else if (prefs.nudge !== false && daysSince >= 2 && inWindow(local.minutes, 12 * 60)) {
      kind = 'nudge';
      payload = { title: 'Thinking of you 💛', body: NUDGES[dayNumber(local.dateKey) % NUDGES.length] };
    }
    if (!kind || !payload) continue;

    if (await sendPush(client, sub, { ...payload, tag: `scheduled-${kind}` })) {
      sent += 1;
      await client.from('push_subscriptions').update({ last_sent: { ...(sub.last_sent ?? {}), day: local.dateKey, [kind]: Date.now() } })
        .eq('code_hash', sub.code_hash).eq('device_id', sub.device_id);
    }
  }
  return json({ ok: true, checked: subs?.length ?? 0, sent });
});
