// Shared helpers for the push Edge Functions. Runs on Deno inside Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

export const CODE_PATTERN = /^[A-Z2-9]{10,32}$/;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export const db = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** Same hash as the SQL functions: SHA-256 of the code, hex. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Push endpoints must belong to a real push service, so a stored endpoint can never point at an internal address. */
export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 600) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === 'https:' && (
      host === 'fcm.googleapis.com'
      || host.endsWith('.push.apple.com')
      || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com')
      || host.endsWith('.notify.windows.com')
    );
  } catch {
    return false;
  }
}

export const cleanText = (value: unknown, max = 40): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';

export interface PushPayload {
  title: string;
  body: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag: string;
}

export interface SubscriptionRow {
  code_hash: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  reminder_time: string;
  train_days: number[];
  prefs: Record<string, boolean>;
  last_sent: Record<string, unknown>;
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  configured = true;
}

/** Sends one push. A subscription the push service says is gone (404/410) is deleted. Returns true if delivered. */
export async function sendPush(client: ReturnType<typeof db>, sub: SubscriptionRow, payload: PushPayload): Promise<boolean> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600, urgency: 'normal' },
    );
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await client.from('push_subscriptions').delete().eq('code_hash', sub.code_hash).eq('device_id', sub.device_id);
    } else {
      console.error('push failed', status, (error as Error).message);
    }
    return false;
  }
}
