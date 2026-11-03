import { useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { loadPushSettings, pushSupport, readVapidKey } from '../sync/push';

const SNOOZE_KEY = 'jnt2_push_prompt_until';
const SNOOZE_MS = 7 * 24 * 3_600_000;
const SHOW_AFTER_MS = 4_000;

const snoozed = (): boolean => {
  try { return Number(localStorage.getItem(SNOOZE_KEY)) > Date.now(); } catch { return false; }
};
const snooze = () => {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* it just asks again next time */ }
};

interface Props {
  /** A new version has been downloaded and is waiting. */
  updateReady: boolean;
  onUpdate: () => void;
  /** Never interrupt a workout in progress. */
  activeWorkout: boolean;
  /** Notifications are possible here: sync is set up, the key is built in, and this phone is paired. */
  paired: boolean;
  /** Take the person to the Notifications section of Settings. */
  onOpenNotifications: () => void;
}

/** One small card above the tab bar: an app update first, otherwise an offer to turn on notifications. */
export function AppPrompts({ updateReady, onUpdate, activeWorkout, paired, onOpenNotifications }: Props) {
  const [ready, setReady] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [pushHidden, setPushHidden] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready || activeWorkout) return null;

  if (updateReady && !dismissedUpdate) {
    return (
      <Card icon={<RefreshCw className="h-5 w-5" aria-hidden />} title="A new version is ready" body="Update now to get the latest features and fixes. It only takes a second.">
        <button type="button" onClick={onUpdate} className="btn-primary flex-1">Update now</button>
        <button type="button" onClick={() => setDismissedUpdate(true)} className="btn-secondary">Later</button>
      </Card>
    );
  }

  const canOffer = paired && Boolean(readVapidKey()) && pushSupport() === 'ready'
    && typeof Notification !== 'undefined' && Notification.permission === 'default' && !loadPushSettings().enabled;
  if (canOffer && !pushHidden && !snoozed()) {
    return (
      <Card icon={<Bell className="h-5 w-5" aria-hidden />} title="Turn on notifications?" body="Get a buzz when your partner trains, plus friendly reminders to keep your streak alive.">
        <button type="button" onClick={() => { setPushHidden(true); onOpenNotifications(); }} className="btn-primary flex-1">Yes, set it up</button>
        <button type="button" onClick={() => { snooze(); setPushHidden(true); }} className="btn-secondary">Not now</button>
      </Card>
    );
  }
  return null;
}

function Card({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-xl animate-slide-up rounded-3xl border-2 border-accent/50 bg-surface p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">{icon}</span>
        <div className="min-w-0">
          <p className="font-black text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-2">{body}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">{children}</div>
    </div>
  );
}
