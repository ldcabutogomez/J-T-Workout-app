export type FeedbackKind = 'setLogged' | 'pr' | 'finish' | 'badge' | 'timerEnd';

interface FeedbackPrefs {
  haptics: boolean;
  sound: boolean;
}

let prefs: FeedbackPrefs = { haptics: true, sound: true };
let audioCtx: AudioContext | null = null;

export const setFeedbackPrefs = (next: Partial<FeedbackPrefs>) => {
  prefs = { ...prefs, ...next };
};

const VIBRATION: Record<FeedbackKind, number | number[]> = {
  setLogged: 25,
  pr: [60, 40, 60, 40, 140],
  finish: [80, 50, 80, 50, 80, 50, 300],
  badge: [40, 30, 40, 30, 120],
  timerEnd: [200, 100, 200, 100, 400],
};

// Each tone is [frequency Hz, start offset s, duration s].
const TONES: Record<FeedbackKind, [number, number, number][]> = {
  setLogged: [[660, 0, 0.08]],
  pr: [[587, 0, 0.12], [740, 0.12, 0.12], [880, 0.24, 0.3]],
  finish: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5]],
  badge: [[784, 0, 0.1], [988, 0.1, 0.25]],
  timerEnd: [[587, 0, 0.3], [880, 0.2, 0.45]],
};

// iOS Safari has no Vibration API, but 17.4+ ticks when a native switch toggles.
let switchLabel: HTMLLabelElement | null = null;

const isIOS = () =>
  typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const getSwitchLabel = (): HTMLLabelElement | null => {
  if (typeof document === 'undefined') return null;
  if (switchLabel?.isConnected) return switchLabel;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  switchLabel = label;
  return label;
};

const tick = () => getSwitchLabel()?.click();

// Pulse gaps (ms) between ticks to approximate each vibration pattern.
const TICK_GAPS: Record<FeedbackKind, number[]> = {
  setLogged: [0],
  pr: [0, 90, 90],
  finish: [0, 100, 100, 100],
  badge: [0, 80],
  timerEnd: [0, 120, 120],
};

const iosHaptic = (kind: FeedbackKind) => {
  let at = 0;
  TICK_GAPS[kind].forEach((gap, i) => {
    at += gap;
    if (i === 0) tick();
    else window.setTimeout(tick, at);
  });
};

export const haptic = (kind: FeedbackKind) => {
  if (!prefs.haptics || typeof navigator === 'undefined') return;
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(VIBRATION[kind]);
    } catch {
      // Vibration is best-effort.
    }
    return;
  }
  if (isIOS()) iosHaptic(kind);
};

export const chime = (kind: FeedbackKind) => {
  if (!prefs.sound) return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = audioCtx ?? new AudioCtx();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    TONES[kind].forEach(([freq, offset, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.05);
    });
  } catch {
    // Audio is best-effort.
  }
};

export const feedback = (kind: FeedbackKind) => {
  haptic(kind);
  chime(kind);
};

export const canVibrate = () =>
  typeof navigator !== 'undefined' && ('vibrate' in navigator || isIOS());
