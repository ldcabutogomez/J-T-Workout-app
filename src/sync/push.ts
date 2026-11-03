import type { CloudConfig } from './cloud';

/** Per-phone notification choices. Device-local on purpose: a subscription belongs to one phone, not to a profile. */
export interface PushPrefs {
  /** Your partner finished a workout. */
  partner: boolean;
  /** Your partner hit a PR or unlocked a badge. */
  shoutouts: boolean;
  taunts: boolean;
  /** A reminder at your chosen time on training days. */
  reminder: boolean;
  /** Evening warning when the weekly goal is slipping. */
  streak: boolean;
  /** A warm nudge after a couple of days off. */
  nudge: boolean;
}

export interface PushSettings {
  enabled: boolean;
  reminderTime: string;
  prefs: PushPrefs;
}

export const DEFAULT_PUSH_SETTINGS: PushSettings = {
  enabled: false,
  reminderTime: '17:30',
  prefs: { partner: true, shoutouts: true, taunts: true, reminder: true, streak: true, nudge: true },
};

const SETTINGS_KEY = 'jnt2_push_settings';

export function loadPushSettings(): PushSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<PushSettings> | null;
    if (!raw) return DEFAULT_PUSH_SETTINGS;
    return {
      enabled: raw.enabled === true,
      reminderTime: typeof raw.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.reminderTime) ? raw.reminderTime : DEFAULT_PUSH_SETTINGS.reminderTime,
      prefs: { ...DEFAULT_PUSH_SETTINGS.prefs, ...(raw.prefs ?? {}) },
    };
  } catch {
    return DEFAULT_PUSH_SETTINGS;
  }
}

export function savePushSettingsLocal(settings: PushSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* the server copy is what counts */ }
}

export const readVapidKey = (): string | null => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_VAPID_PUBLIC_KEY || null;
};

export type PushSupport = 'ready' | 'needs-install' | 'unsupported' | 'denied';

/** Whether this phone can receive push right now, and if not, why. iPhone only allows it from the Home Screen. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (!('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function call(config: CloudConfig, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${config.url}/functions/v1/push-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      ...(config.anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${config.anonKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 404) throw new Error('The push functions are not deployed yet. Follow supabase/PUSH_SETUP.md.');
    if (detail.includes('pairing full')) throw new Error('That pairing already has two phones with notifications.');
    throw new Error(`Notifications failed (${response.status}).`);
  }
  return response.json().catch(() => null);
}

export interface PushContext {
  config: CloudConfig;
  code: string;
  deviceId: string;
  /** Weekday offsets from Monday (0-6) of the lifter's training days. */
  trainDays: number[];
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Asks permission (must be called from a tap), subscribes this phone and saves the subscription server-side. */
export async function enablePush(ctx: PushContext, settings: PushSettings, fetchImpl: typeof fetch = fetch): Promise<void> {
  const key = readVapidKey();
  if (!key) throw new Error('Push is not configured in this build.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your phone settings.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
  await saveSubscription(ctx, settings, subscription, fetchImpl);
}

async function saveSubscription(ctx: PushContext, settings: PushSettings, subscription: PushSubscription, fetchImpl: typeof fetch) {
  await call(ctx.config, {
    action: 'save',
    code: ctx.code,
    device: ctx.deviceId,
    subscription: subscription.toJSON(),
    settings: { tz: timeZone(), reminderTime: settings.reminderTime, trainDays: ctx.trainDays, prefs: settings.prefs },
  }, fetchImpl);
}

/** Re-sends the choices (reminder time, toggles, training days, time zone) for a phone that is already subscribed. */
export async function syncPushSettings(ctx: PushContext, settings: PushSettings, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (pushSupport() === 'unsupported' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await saveSubscription(ctx, settings, subscription, fetchImpl);
}

export async function disablePush(ctx: Pick<PushContext, 'config' | 'code' | 'deviceId'>, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  } catch { /* the server copy is removed below either way */ }
  await call(ctx.config, { action: 'delete', code: ctx.code, device: ctx.deviceId }, fetchImpl);
}

export type PartnerEvent = 'trained' | 'pr' | 'badge' | 'taunt';

/** Tells your partner's phone something happened. Fire and forget: it must never get in the way of the workout. */
export function notifyPartner(
  config: CloudConfig | null,
  code: string | null,
  deviceId: string,
  kind: PartnerEvent,
  detail?: string,
  fetchImpl: typeof fetch = fetch,
): void {
  if (!config || !code) return;
  void call(config, { action: 'notify', code, device: deviceId, kind, detail: detail?.slice(0, 40) }, fetchImpl).catch(() => undefined);
}
