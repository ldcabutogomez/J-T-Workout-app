import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { UserProfile } from '../types';
import type { CloudConfig } from '../sync/cloud';
import { defaultSchedule } from '../engine/schedule';
import {
  disablePush, enablePush, loadPushSettings, pushSupport, readVapidKey, savePushSettingsLocal, syncPushSettings,
  type PushPrefs, type PushSettings,
} from '../sync/push';

interface Props {
  profile: UserProfile;
  config: CloudConfig | null;
  /** The pairing code. Notifications are between two paired phones, so without one there is nothing to send. */
  code: string | null;
  deviceId: string;
}

const PREF_LABELS: { key: keyof PushPrefs; label: string; hint: string }[] = [
  { key: 'partner', label: 'Partner trained', hint: 'When your partner finishes a workout.' },
  { key: 'shoutouts', label: 'PRs and badges', hint: 'When your partner hits a PR or unlocks a badge.' },
  { key: 'taunts', label: 'Taunts', hint: 'When your partner sends you one.' },
  { key: 'reminder', label: 'Workout reminder', hint: 'At your chosen time on training days, if you have not trained yet.' },
  { key: 'streak', label: 'Goal at risk', hint: 'An evening heads-up when your weekly goal is slipping.' },
  { key: 'nudge', label: 'Friendly nudge', hint: 'A warm note after a couple of days off.' },
];

/** The Notifications section of Settings. Hidden entirely unless sync and the push key are configured. */
export function NotificationsPanel({ profile, config, code, deviceId }: Props) {
  const [settings, setSettings] = useState<PushSettings>(() => loadPushSettings());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const support = pushSupport();
  const trainDays = (profile.schedule ?? defaultSchedule(profile)).days;
  const daysKey = trainDays.join(',');
  const first = useRef(true);

  const ctx = config && code ? { config, code, deviceId, trainDays } : null;

  // Keep the server's copy (training days, time zone) current while notifications are on.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!ctx || !settings.enabled) return;
    void syncPushSettings(ctx, settings).catch(() => undefined);
  }, [daysKey]);

  if (!config || !readVapidKey()) return null;

  const update = (next: PushSettings) => {
    setSettings(next);
    savePushSettingsLocal(next);
    if (ctx && next.enabled) void syncPushSettings(ctx, next).catch((error) => setMessage({ text: (error as Error).message, error: true }));
  };

  const toggleMaster = async () => {
    if (!ctx) return;
    setBusy(true);
    setMessage(null);
    try {
      if (settings.enabled) {
        await disablePush(ctx);
        update({ ...settings, enabled: false });
        setMessage({ text: 'Notifications are off on this phone.' });
      } else {
        const next = { ...settings, enabled: true };
        await enablePush(ctx, next);
        setSettings(next);
        savePushSettingsLocal(next);
        setMessage({ text: 'Notifications are on.' });
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="notifications" className="card p-5 space-y-3 scroll-mt-20">
      <h2 className="flex items-center gap-2 text-lg font-black"><Bell className="h-5 w-5" aria-hidden /> Notifications</h2>
      {!code ? (
        <p className="text-xs text-muted">Link with your partner on the Together tab first. Notifications go between your two phones.</p>
      ) : support === 'needs-install' ? (
        <p className="text-xs text-muted">On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there to turn notifications on. Needs iOS 16.4 or later.</p>
      ) : support === 'unsupported' ? (
        <p className="text-xs text-muted">This browser can't receive notifications.</p>
      ) : support === 'denied' ? (
        <p className="text-xs text-muted">Notifications are blocked for this app. Allow them in your phone's settings, then come back.</p>
      ) : (
        <>
          <button type="button" disabled={busy} onClick={() => void toggleMaster()} className={settings.enabled ? 'btn-secondary w-full' : 'btn-primary w-full'}>
            {busy ? 'Working…' : settings.enabled ? 'Turn off notifications' : 'Turn on notifications'}
          </button>
          {settings.enabled && (
            <>
              <label className="block text-xs uppercase font-bold text-muted">
                Reminder time
                <input type="time" value={settings.reminderTime} onChange={(event) => event.target.value && update({ ...settings, reminderTime: event.target.value })} className="block w-full mt-1 min-h-11 bg-paper border border-line rounded-xl px-3 text-sm normal-case text-ink" />
              </label>
              <div className="space-y-2">
                {PREF_LABELS.map((item) => (
                  <label key={item.key} className="flex min-h-11 items-center justify-between gap-3">
                    <span><strong className="block text-sm text-ink">{item.label}</strong><span className="block text-xs text-muted">{item.hint}</span></span>
                    <input type="checkbox" checked={settings.prefs[item.key]} onChange={(event) => update({ ...settings, prefs: { ...settings.prefs, [item.key]: event.target.checked } })} className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted">Reminders use your training days and this phone's time zone, and never arrive before 7 am or after 10 pm. At most one scheduled notification a day.</p>
            </>
          )}
        </>
      )}
      {message && <p role="status" className={`text-xs ${message.error ? 'text-bad' : 'text-ok'}`}>{message.text}</p>}
    </section>
  );
}
