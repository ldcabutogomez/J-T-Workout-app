import React, { useRef, useState } from 'react';
import type { EncouragementTone, UserProfile, WeightUnit, WorkoutSession } from '../types';
import { convertProfileUnit } from '../engine/jnt2Engine';
import { Download, Upload, Users } from 'lucide-react';
import { canVibrate, feedback, haptic } from '../lib/feedback';

interface SettingsTabProps {
  profiles: UserProfile[];
  activeProfileId: string;
  activeSession: WorkoutSession | null;
  onSelectProfile: (id: string) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onExportBackup: () => void;
  onImportBackup: (json: string, replace: boolean) => Promise<{ success: boolean; message: string }>;
}

export function SettingsTab({ profiles, activeProfileId, activeSession, onSelectProfile, onUpdateProfile, onExportBackup, onImportBackup }: SettingsTabProps) {
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
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-black">Training partners</h1></div>
        <p className="text-xs text-slate-400">Profiles keep independent TMs, units, active drafts, history, and program positions.</p>
        <div className="grid grid-cols-2 gap-2">{profiles.map((item) => <button key={item.id} onClick={() => onSelectProfile(item.id)} className={`p-3 rounded-2xl border text-left ${item.id === profile.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950'}`}><strong className="block">{item.name}</strong><span className="text-xs text-slate-400">W{item.currentWeek}:D{item.currentDay} · {item.unit}{item.cycleCompleted ? ' · complete' : ''}</span></button>)}</div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <h2 className="text-lg font-black">Profile preferences</h2>
        <label className="block text-[10px] uppercase font-bold text-slate-400">Lifter name<input value={profile.name} onChange={(event) => onUpdateProfile({ ...profile, name: event.target.value })} className="block w-full mt-1 min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm normal-case text-white" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[10px] uppercase font-bold text-slate-400">Weight unit<select disabled={Boolean(activeSession)} value={profile.unit} onChange={(event) => setUnit(event.target.value as WeightUnit)} className="block w-full mt-1 min-h-11 bg-slate-950 disabled:opacity-50 border border-slate-800 rounded-xl px-3 text-sm normal-case text-white"><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label>
          <label className="text-[10px] uppercase font-bold text-slate-400">Equipment increment<input type="number" min="0.1" step="0.5" value={profile.equipmentIncrement} onChange={(event) => onUpdateProfile({ ...profile, equipmentIncrement: Number(event.target.value) })} className="block w-full mt-1 min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm normal-case text-white" /></label>
          <label className="text-[10px] uppercase font-bold text-slate-400">Barbell ({profile.unit})<input type="number" min="0" value={profile.barbellWeight} onChange={(event) => onUpdateProfile({ ...profile, barbellWeight: Number(event.target.value) })} className="block w-full mt-1 min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm normal-case text-white" /></label>
          <label className="text-[10px] uppercase font-bold text-slate-400">Weekly session goal<select value={profile.weeklyGoalSessions ?? 4} onChange={(event) => onUpdateProfile({ ...profile, weeklyGoalSessions: Number(event.target.value) })} className="block w-full mt-1 min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm normal-case text-white"><option value={3}>3 sessions</option><option value={4}>4 sessions</option><option value={5}>5 sessions</option></select></label>
        </div>
        <label className="block text-[10px] uppercase font-bold text-slate-400">Encouragement tone<select value={profile.tone} onChange={(event) => onUpdateProfile({ ...profile, tone: event.target.value as EncouragementTone })} className="block w-full mt-1 min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm normal-case text-white"><option value="minimal">Minimal</option><option value="warm">Warm</option><option value="playful">Playful</option><option value="off">Off</option></select></label>
        <p className="text-[11px] text-slate-500">Changing units converts future profile TMs. Historical sets retain their recorded unit and are normalized only for comparisons.</p>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
        <h2 className="text-lg font-black">Feedback &amp; rewards</h2>
        <Toggle label="Vibration" hint={canVibrate() ? 'Buzz on set logged, PRs, and rest end. On iPhone (iOS 17.4+) this is a light tick, and only when you tap something.' : 'Not supported on this device or browser.'} checked={profile.hapticsEnabled ?? true} onChange={(hapticsEnabled) => { onUpdateProfile({ ...profile, hapticsEnabled }); if (hapticsEnabled) window.setTimeout(() => haptic('pr'), 50); }} />
        <Toggle label="Sounds" hint="Short chimes for PRs, finishing, and rest end." checked={profile.soundEnabled ?? true} onChange={(soundEnabled) => { onUpdateProfile({ ...profile, soundEnabled }); if (soundEnabled) window.setTimeout(() => feedback('badge'), 50); }} />
        <Toggle label="Auto-start rest timer" hint="Start a tier-based countdown after each logged set." checked={profile.autoStartRest ?? false} onChange={(autoStartRest) => onUpdateProfile({ ...profile, autoStartRest })} />
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Preview</p>
          <div className="grid grid-cols-4 gap-2">
            {([['setLogged', 'Set'], ['pr', 'PR'], ['finish', 'Finish'], ['timerEnd', 'Rest end']] as const).map(([kind, label]) => (
              <button key={kind} onClick={() => feedback(kind)} className="min-h-11 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold active:scale-[0.98] transition">{label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
        <h2 className="text-lg font-black">Local backups</h2>
        <p className="text-xs text-slate-400">Version 2 imports validate every profile, session, exercise, and set before one transaction writes anything. Duplicate IDs are rejected unless you explicitly approve replace-all.</p>
        {status && <div role={status.error ? 'alert' : 'status'} className={`p-3 rounded-2xl text-xs ${status.error ? 'bg-rose-950 border border-rose-800 text-rose-200' : 'bg-emerald-950 border border-emerald-800 text-emerald-200'}`}>{status.text}</div>}
        <div className="grid grid-cols-2 gap-2"><button onClick={onExportBackup} className="min-h-12 bg-slate-800 border border-slate-700 rounded-2xl text-xs font-bold"><Download className="inline w-4 h-4 mr-1 text-amber-400" />Export</button><button onClick={() => inputRef.current?.click()} className="min-h-12 bg-amber-500 text-slate-950 rounded-2xl text-xs font-black"><Upload className="inline w-4 h-4 mr-1" />Import</button></div>
        <input ref={inputRef} type="file" accept="application/json,.json" onChange={importFile} className="hidden" />
      </section>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-3 text-left min-h-12">
      <span className="min-w-0">
        <strong className="block text-sm text-white">{label}</strong>
        <span className="block text-[11px] text-slate-400">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
