import React, { useRef, useState } from 'react';
import type { EncouragementTone, UserProfile, WeightUnit, WorkoutSession } from '../types';
import { convertProfileUnit } from '../engine/jnt2Engine';
import { Download, Upload, Users } from 'lucide-react';
import { canVibrate, feedback, haptic } from '../lib/feedback';
import { AVATAR_COLORS, defaultAvatarColor, fileToAvatar } from '../lib/avatar';
import { COLOR_THEMES, THEMES, themeForProfile } from '../lib/theme';
import { wakeLockSupported } from '../lib/wakeLock';
import { FLAIRS, PERK_UNLOCKS, TAUNT_LEVEL, THEME_UNLOCK_LEVEL, flairUnlocked, themeUnlocked } from '../lib/perks';
import { WEEKDAY_LABELS, defaultSchedule, normalizeDays, withTrainingDays } from '../engine/schedule';
import { Avatar, AVATAR_TILE } from './Avatar';

interface SettingsTabProps {
  profiles: UserProfile[];
  activeProfileId: string;
  activeSession: WorkoutSession | null;
  /** Asks who uses this phone again. Confirmation happens in the caller. */
  onSwitchUser: () => void;
  /** Starts the setup wizard for another lifter who shares this phone. */
  onAddProfile?: () => void;
  /** Opens the new-cycle flow. Undefined while a workout is in progress. */
  onStartNewCycle?: () => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onExportBackup: () => void;
  onImportBackup: (json: string, replace: boolean) => Promise<{ success: boolean; message: string }>;
  /** The active lifter's level, which unlocks themes, flair and taunts. */
  level?: number;
  /** Extra sections (notifications), rendered before the backups. */
  extra?: React.ReactNode;
  /** Where this phone's data stands: protected from eviction, last export, and an undo for the last replace-all import. */
  backupInfo?: {
    persisted: boolean | null;
    lastBackupAt: number | null;
    canRestore: boolean;
    onRestore: () => Promise<{ success: boolean; message: string }>;
  };
}

export function SettingsTab({ profiles, activeProfileId, activeSession, onSwitchUser, onAddProfile, onStartNewCycle, onUpdateProfile, onExportBackup, onImportBackup, level = 1, extra, backupInfo }: SettingsTabProps) {
  const profile = profiles.find((item) => item.id === activeProfileId) ?? profiles[0];
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  if (!profile) return null;

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const json = await file.text();
      // Say what is about to be imported before touching anything.
      try {
        const peek = JSON.parse(json) as { timestamp?: number; profiles?: unknown[]; sessions?: unknown[] };
        if (Array.isArray(peek.profiles) && Array.isArray(peek.sessions)) {
          const when = typeof peek.timestamp === 'number' ? ` made ${new Date(peek.timestamp).toLocaleDateString()}` : '';
          if (!window.confirm(`Import this backup${when}?\n\n${peek.profiles.length} profile${peek.profiles.length === 1 ? '' : 's'}, ${peek.sessions.length} completed workout${peek.sessions.length === 1 ? '' : 's'}.`)) return;
        }
      } catch { /* not readable as JSON: the import below reports the real problem */ }
      let result = await onImportBackup(json, false);
      if (!result.success && result.message.includes('duplicate IDs')) {
        const replace = window.confirm(`${result.message}\n\nReplace all local profiles, completed sessions, and active drafts with this validated backup? Export your current data first if needed.`);
        if (replace) result = await onImportBackup(json, true);
      }
      setStatus({ text: result.message, error: !result.success });
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    }
  };

  const setUnit = (unit: WeightUnit) => {
    if (activeSession) {
      setStatus({ text: 'Finish or discard the active session before changing units. Its saved prescription must keep one consistent unit.', error: true });
      return;
    }
    onUpdateProfile(convertProfileUnit(profile, unit));
  };

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-accent-ink" /><h1 className="text-xl font-black">This phone</h1></div>
        <div className="flex items-center gap-3">
          <Avatar profile={profile} size={44} decorative />
          <div className="min-w-0">
            <p className="font-black text-ink">{profile.name}'s phone</p>
            <p className="text-xs text-muted">Week {profile.currentWeek} · Day {profile.currentDay} · {profile.unit}{profile.cycleCompleted ? ' · complete' : ''}</p>
          </div>
        </div>
        <p className="text-xs text-muted">Your workouts, theme and partner link stay with you. Lending the phone to someone else? Switch who uses it.</p>
        <button type="button" onClick={onSwitchUser} className="btn-secondary min-h-11 text-sm">Switch who uses this phone</button>
        {onStartNewCycle && <button type="button" onClick={() => { if (window.confirm(profile.cycleCompleted ? 'Start the next cycle?' : 'Start a new cycle now? The current one is closed where it stands. Nothing is deleted.')) onStartNewCycle(); }} className="btn-secondary min-h-11 text-sm">Start a new cycle</button>}
        {onAddProfile && <button type="button" onClick={onAddProfile} className="btn-secondary min-h-11 text-sm">Add another lifter</button>}
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-lg font-black">Profile preferences</h2>
        <AvatarEditor profile={profile} onUpdateProfile={onUpdateProfile} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={profile.shareLive !== false} onChange={(event) => onUpdateProfile({ ...profile, shareLive: event.target.checked })} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
          <span>
            <strong className="block text-ink">Share my photo and live status with my partner</strong>
            <span className="text-xs text-muted">Your partner sees your picture, whether you are lifting right now, today's workout and this week's calendar. Set-by-set logs never leave this phone.</span>
          </span>
        </label>
        <ThemePicker profile={profile} onUpdateProfile={onUpdateProfile} level={level} />
        <FlairPicker profile={profile} onUpdateProfile={onUpdateProfile} level={level} />
        <TrainingDays profile={profile} onUpdateProfile={onUpdateProfile} />
        <label className="block text-xs uppercase font-bold text-muted">Lifter name<input value={profile.name} onChange={(event) => onUpdateProfile({ ...profile, name: event.target.value })} className="block w-full mt-1 min-h-11 bg-paper border border-line rounded-xl px-3 text-sm normal-case text-ink" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs uppercase font-bold text-muted">Weight unit<select disabled={Boolean(activeSession)} value={profile.unit} onChange={(event) => setUnit(event.target.value as WeightUnit)} className="block w-full mt-1 min-h-11 bg-paper disabled:opacity-50 border border-line rounded-xl px-3 text-sm normal-case text-ink"><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label>
          <label className="text-xs uppercase font-bold text-muted">Equipment increment<input type="number" min="0.1" step="0.5" value={profile.equipmentIncrement} onChange={(event) => onUpdateProfile({ ...profile, equipmentIncrement: Number(event.target.value) })} className="block w-full mt-1 min-h-11 bg-paper border border-line rounded-xl px-3 text-sm normal-case text-ink" /></label>
          <label className="text-xs uppercase font-bold text-muted">Barbell ({profile.unit})<input type="number" min="0" value={profile.barbellWeight} onChange={(event) => onUpdateProfile({ ...profile, barbellWeight: Number(event.target.value) })} className="block w-full mt-1 min-h-11 bg-paper border border-line rounded-xl px-3 text-sm normal-case text-ink" /></label>
          <label className="text-xs uppercase font-bold text-muted">Weekly session goal<select value={profile.weeklyGoalSessions ?? 4} onChange={(event) => onUpdateProfile({ ...profile, weeklyGoalSessions: Number(event.target.value) })} className="block w-full mt-1 min-h-11 bg-paper border border-line rounded-xl px-3 text-sm normal-case text-ink"><option value={3}>3 sessions</option><option value={4}>4 sessions</option><option value={5}>5 sessions</option></select></label>
        </div>
        <label className="block text-xs uppercase font-bold text-muted">Encouragement tone<select value={profile.tone} onChange={(event) => onUpdateProfile({ ...profile, tone: event.target.value as EncouragementTone })} className="block w-full mt-1 min-h-11 bg-paper border border-line rounded-xl px-3 text-sm normal-case text-ink"><option value="minimal">Minimal</option><option value="warm">Warm</option><option value="playful">Playful</option><option value="off">Off</option></select></label>
        <p className="text-xs text-muted">Changing units converts future profile TMs. Historical sets retain their recorded unit and are normalized only for comparisons.</p>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-black">Feedback &amp; rewards</h2>
        <Toggle label="Vibration" hint={canVibrate() ? 'Buzz on set logged, PRs, and rest end. On iPhone (iOS 17.4+) this is a light tick, and only when you tap something.' : 'Not supported on this device or browser.'} checked={profile.hapticsEnabled ?? true} onChange={(hapticsEnabled) => { onUpdateProfile({ ...profile, hapticsEnabled }); if (hapticsEnabled) window.setTimeout(() => haptic('pr'), 50); }} />
        <Toggle label="Sounds" hint="Short chimes for PRs, finishing, and rest end." checked={profile.soundEnabled ?? true} onChange={(soundEnabled) => { onUpdateProfile({ ...profile, soundEnabled }); if (soundEnabled) window.setTimeout(() => feedback('badge'), 50); }} />
        {wakeLockSupported() && <Toggle label="Keep screen on during workouts" hint="Stops the phone from locking between sets. Turns itself off when you finish." checked={profile.keepScreenOn ?? true} onChange={(keepScreenOn) => onUpdateProfile({ ...profile, keepScreenOn })} />}
        <Toggle label="Large gym mode" hint="Bigger numbers and buttons when logging a set, easier to read and tap mid-lift." checked={profile.largeGymMode ?? false} onChange={(largeGymMode) => onUpdateProfile({ ...profile, largeGymMode })} />
        <Toggle label="Auto-start rest timer" hint="Start a tier-based countdown after each logged set." checked={profile.autoStartRest ?? false} onChange={(autoStartRest) => onUpdateProfile({ ...profile, autoStartRest })} />
        <div>
          <p className="text-xs uppercase font-bold text-muted mb-1">Preview</p>
          <div className="grid grid-cols-4 gap-2">
            {([['setLogged', 'Set'], ['pr', 'PR'], ['finish', 'Finish'], ['timerEnd', 'Rest end']] as const).map(([kind, label]) => (
              <button key={kind} onClick={() => feedback(kind)} className="min-h-11 bg-sunk border border-line rounded-xl text-xs font-bold active:scale-[0.98] transition">{label}</button>
            ))}
          </div>
        </div>
      </section>

      {extra}

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-black">Local backups</h2>
        {backupInfo && (
          <div className="rounded-xl bg-sunk p-3 text-xs text-ink-2 space-y-1">
            <p>Last backup: <strong>{backupInfo.lastBackupAt ? new Date(backupInfo.lastBackupAt).toLocaleDateString() : 'never'}</strong>. Your workouts live only on this phone, so save a copy now and then.</p>
            <p>{backupInfo.persisted === true ? 'This phone has agreed to keep the app data safe from automatic cleanup.' : backupInfo.persisted === false ? 'This phone may clear app data if it runs low on space, so backups matter.' : 'Storage protection status is not available here.'}</p>
          </div>
        )}
        {backupInfo?.canRestore && (
          <button type="button" onClick={async () => {
            if (!window.confirm('Restore the data you had before your last "replace all" import? This replaces the current data on this phone.')) return;
            const result = await backupInfo.onRestore();
            setStatus({ text: result.message, error: !result.success });
          }} className="btn-secondary w-full">Undo last replace-all import</button>
        )}
        <p className="text-xs text-muted">Backups validate every profile, session, exercise, and set before one transaction writes anything. Duplicate IDs are rejected unless you explicitly approve replace-all.</p>
        {status && <div role={status.error ? 'alert' : 'status'} className={`p-3 rounded-2xl text-xs ${status.error ? 'bg-bad/10 border border-bad/40 text-bad' : 'bg-ok/10 border border-ok/40 text-ok'}`}>{status.text}</div>}
        <div className="grid grid-cols-2 gap-2"><button onClick={onExportBackup} className="min-h-12 bg-sunk border border-line rounded-2xl text-xs font-bold"><Download className="inline w-4 h-4 mr-1 text-accent-ink" />Export</button><button onClick={() => inputRef.current?.click()} className="min-h-12 bg-accent text-on-accent rounded-2xl text-xs font-black"><Upload className="inline w-4 h-4 mr-1" />Import</button></div>
        <input ref={inputRef} type="file" accept="application/json,.json" onChange={importFile} className="hidden" />
      </section>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-3 text-left min-h-12">
      <span className="min-w-0">
        <strong className="block text-sm text-ink">{label}</strong>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-ok' : 'bg-sunk'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

const COLOR_NAMES: Record<string, string> = { accent: 'Accent', violet: 'Violet', cobalt: 'Cobalt', ok: 'Forest', gold: 'Ochre', ink: 'Ink', clay: 'Clay', teal: 'Teal' };

function AvatarEditor({ profile, onUpdateProfile }: { profile: UserProfile; onUpdateProfile: (profile: UserProfile) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const color = profile.avatar?.color ?? defaultAvatarColor(profile);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { photo, thumb } = await fileToAvatar(file);
      onUpdateProfile({ ...profile, avatar: { ...profile.avatar, photo, thumb } });
      setMessage({ text: 'Photo saved on this device.' });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = () => {
    const { photo: _photo, thumb: _thumb, ...rest } = profile.avatar ?? {};
    onUpdateProfile({ ...profile, avatar: rest });
    setMessage({ text: 'Photo removed.' });
  };

  return (
    <div>
      <p className="eyebrow">Profile picture</p>
      <div className="mt-2 flex items-center gap-4">
        <Avatar profile={profile} size={72} />
        <div className="flex flex-col items-start gap-1">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="btn-secondary min-h-11">{profile.avatar?.photo ? 'Change photo' : 'Add photo'}</button>
          {profile.avatar?.photo && <button type="button" onClick={removePhoto} className="min-h-11 px-1 text-sm font-bold text-bad">Remove photo</button>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={pick} className="hidden" aria-label="Choose a profile photo" />
      </div>
      <div className="mt-3" role="radiogroup" aria-label="Profile color">
        <p className="text-xs text-muted">Color for the initial{profile.avatar?.photo ? ' (shown if you remove the photo)' : ''}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {/* The theme accent is already offered as violet or cobalt, so only show it for the vermilion theme (or if it was chosen before). */}
          {AVATAR_COLORS.filter((item) => item !== 'accent' || themeForProfile(profile) === 'vermilion' || color === 'accent').map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={color === item}
              aria-label={COLOR_NAMES[item]}
              onClick={() => onUpdateProfile({ ...profile, avatar: { ...profile.avatar, color: item } })}
              className={`h-11 w-11 rounded-full ${AVATAR_TILE[item]} ${color === item ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`}
            />
          ))}
        </div>
      </div>
      <p role="status" className={`mt-2 text-xs ${message?.error ? 'text-bad' : 'text-muted'}`}>{message?.text ?? ''}</p>
    </div>
  );
}

function ThemePicker({ profile, onUpdateProfile, level }: { profile: UserProfile; onUpdateProfile: (profile: UserProfile) => void; level: number }) {
  const current = themeForProfile(profile);
  return (
    <div>
      <p className="eyebrow">Color theme</p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Color theme">
        {COLOR_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={current === theme}
            disabled={!themeUnlocked(theme, level)}
            onClick={() => onUpdateProfile({ ...profile, colorTheme: theme })}
            className={`disabled:opacity-50 flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-bold ${current === theme ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line bg-surface text-ink'}`}
          >
            <span
              aria-hidden
              className="h-7 w-7 rounded-full border border-line"
              style={{ background: `linear-gradient(135deg, ${THEMES[theme].paper} 50%, ${THEMES[theme].accent} 50%)` }}
            />
            {THEMES[theme].label}
            {!themeUnlocked(theme, level) && <span className="text-xs font-normal text-muted">Level {THEME_UNLOCK_LEVEL[theme]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function FlairPicker({ profile, onUpdateProfile, level }: { profile: UserProfile; onUpdateProfile: (profile: UserProfile) => void; level: number }) {
  const next = PERK_UNLOCKS.find((perk) => perk.level > level);
  const badgeIds = (profile.unlockedBadges ?? []).map((badge) => badge.id);
  return (
    <div>
      <p className="eyebrow">Flair <span className="normal-case font-normal">(Level {level})</span></p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Avatar flair">
        {[{ id: '', label: 'None', level: 1, badge: undefined as string | undefined }, ...FLAIRS.filter((item) => !item.debuff)].map((flair) => {
          const locked = flair.id !== '' && !flairUnlocked(flair as (typeof FLAIRS)[number], level, badgeIds);
          const selected = (profile.flair ?? '') === flair.id;
          return (
            <button
              key={flair.id || 'none'}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => onUpdateProfile({ ...profile, flair: flair.id || undefined })}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-bold disabled:opacity-50 ${selected ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line bg-surface text-ink'}`}
            >
              {flair.label}
              {locked && <span className="text-xs font-normal text-muted">{flair.badge ? 'Earn the badge' : `Level ${flair.level}`}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{next ? `Next unlock: ${next.text} at level ${next.level}. ` : ''}Taunts for your partner unlock at level {TAUNT_LEVEL}, with sharper ones as you climb. Level up by training.</p>
    </div>
  );
}

const DAY_NAMES = ['Day 1 · Squat', 'Day 2 · Bench', 'Day 3 · Back Squat / Deadlift', 'Day 4 · Military Press'];

function TrainingDays({ profile, onUpdateProfile }: { profile: UserProfile; onUpdateProfile: (profile: UserProfile) => void }) {
  const schedule = profile.schedule ?? defaultSchedule(profile);
  const days = normalizeDays(schedule.days);
  const choose = (index: number, weekday: number) => {
    const next = [...days];
    const clash = next.indexOf(weekday);
    if (clash >= 0 && clash !== index) next[clash] = next[index]; // keep the four days distinct by swapping
    next[index] = weekday;
    onUpdateProfile({ ...profile, schedule: withTrainingDays(schedule, next) });
  };
  return (
    <div>
      <p className="eyebrow">Training days</p>
      <p className="mt-1 text-xs text-muted">Which weekday each workout lands on by default. You can still drag any workout to another day on the Program tab.</p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        {DAY_NAMES.map((name, index) => (
          <label key={name} className="flex items-center justify-between gap-3 text-sm font-bold text-ink">
            <span>{name}</span>
            <select value={days[index]} onChange={(event) => choose(index, Number(event.target.value))} className="field w-32 shrink-0 text-sm" aria-label={`${name} weekday`}>
              {WEEKDAY_LABELS.map((label, weekday) => <option key={label} value={weekday}>{label}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
