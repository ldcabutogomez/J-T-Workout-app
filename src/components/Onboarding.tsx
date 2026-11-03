import { useMemo, useState } from 'react';
import type { EncouragementTone, TrainingMaxKey, UserProfile, WeightUnit } from '../types';
import { REQUIRED_TRAINING_MAXES, getDayPrescription } from '../engine/jnt2Engine';
import { WEEKDAY_LABELS } from '../engine/schedule';
import { tmProblem } from '../lib/validateTm';
import { DEFAULT_TRAINING_DAYS, buildProfileFromWizard, defaultsForUnit, wizardProblems, type WizardInput } from '../lib/wizard';

const STEPS = ['You', 'Equipment', 'Training maxes', 'Schedule', 'Ready'] as const;
const DAY_NAMES = ['Day 1 · Squat', 'Day 2 · Bench', 'Day 3 · Front Squat / Deadlift', 'Day 4 · Military Press'];

interface Props {
  /** Called with the finished profile; the caller saves it. */
  onDone: (profile: UserProfile) => Promise<void> | void;
  /** Present when adding another lifter to a phone that already has one, so the wizard can be left. */
  onCancel?: () => void;
}

const num = (text: string): number | '' => (text === '' ? '' : Number(text));

/** First-run setup: a few short steps, then a preview of the first workout. Nothing is saved until the end. */
export function Onboarding({ onDone, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<WizardInput>({
    name: '',
    unit: 'lb',
    ...defaultsForUnit('lb'),
    trainingMaxes: {},
    trainingDays: DEFAULT_TRAINING_DAYS,
    weeklyGoalSessions: 4,
    tone: 'warm',
  });
  const set = (patch: Partial<WizardInput>) => setInput((current) => ({ ...current, ...patch }));
  const problems = wizardProblems(input);
  const profile = useMemo(() => (problems.length === 0 ? buildProfileFromWizard(input) : null), [input, problems.length]);
  const preview = useMemo(() => (profile ? getDayPrescription(1, 1, profile) : null), [profile]);
  const missing = REQUIRED_TRAINING_MAXES.filter(({ key }) => !(Number(input.trainingMaxes[key]) > 0));

  const changeUnit = (unit: WeightUnit) => set({ unit, ...defaultsForUnit(unit), trainingMaxes: {} });
  const chooseDay = (index: number, weekday: number) => {
    const days = [...input.trainingDays];
    const clash = days.indexOf(weekday);
    if (clash >= 0 && clash !== index) days[clash] = days[index]; // keep the four days distinct by swapping
    days[index] = weekday;
    set({ trainingDays: days });
  };

  const canAdvance = [
    input.name.trim().length > 0,
    input.barbellWeight >= 0 && input.equipmentIncrement > 0,
    REQUIRED_TRAINING_MAXES.every(({ key }) => tmProblem(input.trainingMaxes[key], input.unit)?.level !== 'error'),
    new Set(input.trainingDays).size === 4,
    problems.length === 0,
  ][step];

  const finish = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try { await onDone(profile); } catch (e) { setError((e as Error).message); setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-4">
        <header className="pt-4">
          <p className="eyebrow">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          <div className="mt-2 flex gap-1" aria-hidden>
            {STEPS.map((name, i) => <span key={name} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-sunk'}`} />)}
          </div>
          <h1 className="mt-4 text-3xl font-black">{['Welcome', 'Your equipment', 'Your training maxes', 'Your week', "You're set"][step]}</h1>
        </header>

        <section className="card p-5 space-y-4">
          {step === 0 && (
            <>
              <p className="text-sm text-ink-2">This app runs the 12-week Jacked &amp; Tan 2.0 program and keeps everything on your phone. Let's set it up in a minute.</p>
              <label className="block text-xs uppercase font-bold text-muted">What should we call you?
                <input autoFocus value={input.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className="field mt-1 normal-case" placeholder="Your name" />
              </label>
              <div>
                <p className="eyebrow">Weight unit</p>
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Weight unit">
                  {(['lb', 'kg'] as const).map((unit) => (
                    <button key={unit} type="button" role="radio" aria-checked={input.unit === unit} onClick={() => changeUnit(unit)} className={`min-h-12 rounded-xl border font-bold ${input.unit === unit ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line bg-surface'}`}>{unit === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-ink-2">Used to work out plates and to round your loads to weights you can actually load.</p>
              <label className="block text-xs uppercase font-bold text-muted">Barbell weight ({input.unit})
                <input type="number" inputMode="decimal" min="0" value={input.barbellWeight} onChange={(e) => set({ barbellWeight: Number(e.target.value) })} className="field mt-1 normal-case" />
              </label>
              <label className="block text-xs uppercase font-bold text-muted">Smallest jump between loads ({input.unit})
                <input type="number" inputMode="decimal" min="0.25" step="0.25" value={input.equipmentIncrement} onChange={(e) => set({ equipmentIncrement: Number(e.target.value) })} className="field mt-1 normal-case" />
              </label>
              <p className="text-xs text-muted">{input.unit === 'lb' ? 'A standard bar is 45 lb, and the smallest plate pair is usually a 5 lb jump.' : 'A standard bar is 20 kg, and the smallest plate pair is usually a 2.5 kg jump.'}</p>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-ink-2">A training max is roughly the most you could lift for a clean single. Every percentage in the program comes from these. Not sure yet? Leave any blank and add it later on the Program tab.</p>
              {REQUIRED_TRAINING_MAXES.map(({ key, label }) => {
                const problem = tmProblem(input.trainingMaxes[key], input.unit);
                return (
                  <label key={key} className="block text-xs uppercase font-bold text-muted">{label} ({input.unit})
                    <input type="number" inputMode="decimal" min="0" step={input.equipmentIncrement} value={input.trainingMaxes[key as TrainingMaxKey] ?? ''} onChange={(e) => set({ trainingMaxes: { ...input.trainingMaxes, [key]: num(e.target.value) } })} aria-invalid={problem?.level === 'error'} className="field mt-1 normal-case" />
                    {problem && <span role="alert" className={`mt-1 block text-xs normal-case font-semibold ${problem.level === 'error' ? 'text-bad' : 'text-accent-ink'}`}>{problem.message}</span>}
                  </label>
                );
              })}
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-ink-2">Which weekday should each workout land on? You can always drag a workout to another day later.</p>
              <div className="space-y-2">
                {DAY_NAMES.map((name, index) => (
                  <label key={name} className="flex items-center justify-between gap-3 text-sm font-bold">
                    <span>{name}</span>
                    <select value={input.trainingDays[index]} onChange={(e) => chooseDay(index, Number(e.target.value))} className="field w-32 shrink-0 text-sm" aria-label={`${name} weekday`}>
                      {WEEKDAY_LABELS.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <label className="block text-xs uppercase font-bold text-muted">Weekly goal
                <select value={input.weeklyGoalSessions} onChange={(e) => set({ weeklyGoalSessions: Number(e.target.value) })} className="field mt-1 normal-case"><option value={3}>3 sessions a week</option><option value={4}>4 sessions a week</option><option value={5}>5 sessions a week</option></select>
              </label>
              <label className="block text-xs uppercase font-bold text-muted">Encouragement
                <select value={input.tone} onChange={(e) => set({ tone: e.target.value as EncouragementTone })} className="field mt-1 normal-case"><option value="warm">Warm</option><option value="playful">Playful</option><option value="minimal">Minimal</option><option value="off">Off</option></select>
              </label>
            </>
          )}

          {step === 4 && preview && (
            <>
              <p className="text-sm text-ink-2">Hi {input.name.trim()}. Your first workout is lined up:</p>
              <div className="rounded-2xl bg-sunk p-4">
                <p className="eyebrow">Week 1 · Day 1</p>
                <h2 className="text-xl font-black">{preview.title}</h2>
                <ul className="mt-2 space-y-1 text-sm text-ink-2">
                  {preview.exercises.filter((slot) => slot.status === 'work' || slot.status === 'test').map((slot) => (
                    <li key={slot.slotId}><span className="mr-2 rounded bg-surface px-1.5 py-0.5 text-xs font-black text-accent-ink">{slot.tier}</span>{slot.exerciseName}</li>
                  ))}
                </ul>
              </div>
              {missing.length > 0 && <p role="status" className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs text-ink-2">You skipped {missing.map((m) => m.label).join(', ')}. Add {missing.length === 1 ? 'it' : 'them'} on the Program tab before your first workout.</p>}
            </>
          )}
          {error && <p role="alert" className="text-xs text-bad">{error}</p>}
        </section>

        <div className="flex gap-2">
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary">Back</button> : onCancel ? <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button> : null}
          {step < STEPS.length - 1
            ? <button type="button" disabled={!canAdvance} onClick={() => setStep(step + 1)} className="btn-primary flex-1">{step === 2 && missing.length === REQUIRED_TRAINING_MAXES.length ? 'Skip for now' : 'Next'}</button>
            : <button type="button" disabled={!canAdvance || saving} onClick={() => void finish()} className="btn-primary flex-1">{saving ? 'Saving…' : 'Start training'}</button>}
        </div>
      </div>
    </div>
  );
}
