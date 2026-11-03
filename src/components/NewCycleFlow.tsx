import { useMemo, useState } from 'react';
import type { TrainingMaxKey, UserProfile, WorkoutSession } from '../types';
import { REQUIRED_TRAINING_MAXES } from '../engine/jnt2Engine';
import { WEEKDAY_LABELS, addDays, mondayOf, normalizeDays, todayKey } from '../engine/schedule';
import { buildNextCycleProfile, cycleNumber, nextCycleId, profileCycleId, summarizeCycle } from '../engine/cycles';
import { tmProblem } from '../lib/validateTm';

const STEPS = ['Review', 'Training maxes', 'Dates', 'Confirm'] as const;
const DAY_NAMES = ['Day 1 · Squat', 'Day 2 · Bench', 'Day 3 · Front Squat / Deadlift', 'Day 4 · Military Press'];

interface Props {
  profile: UserProfile;
  history: WorkoutSession[];
  /** Saves the new-cycle profile. Throws a readable message if it can't. */
  onStart: (next: UserProfile) => Promise<void>;
  onCancel: () => void;
}

/** Start the next run through the program: look back, set new training maxes, pick dates, confirm. */
export function NewCycleFlow({ profile, history, onStart, onCancel }: Props) {
  const current = profileCycleId(profile);
  const upcoming = cycleNumber(nextCycleId(current));
  const summary = useMemo(() => summarizeCycle(history, current), [history, current]);
  const [step, setStep] = useState(0);
  const [tms, setTms] = useState<Partial<Record<TrainingMaxKey, number | ''>>>({ ...profile.trainingMaxes });
  const defaultStart = useMemo(() => { const today = todayKey(); const monday = mondayOf(today); return monday >= today ? monday : addDays(monday, 7); }, []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [days, setDays] = useState<number[]>(normalizeDays(profile.schedule?.days));
  const [keepSwaps, setKeepSwaps] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tmErrors = REQUIRED_TRAINING_MAXES.filter(({ key }) => tmProblem(tms[key], profile.unit)?.level === 'error');
  const tmMissing = REQUIRED_TRAINING_MAXES.filter(({ key }) => !(Number(tms[key]) > 0));
  const canAdvance = [true, tmErrors.length === 0 && tmMissing.length === 0, new Set(days).size === 4 && /^\d{4}-\d{2}-\d{2}$/.test(startDate), true][step];

  const chooseDay = (index: number, weekday: number) => {
    const next = [...days];
    const clash = next.indexOf(weekday);
    if (clash >= 0 && clash !== index) next[clash] = next[index];
    next[index] = weekday;
    setDays(next);
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    const trainingMaxes = Object.fromEntries(Object.entries(tms).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) as Partial<Record<TrainingMaxKey, number>>;
    try { await onStart(buildNextCycleProfile(profile, history, { trainingMaxes, trainingDays: days, startDate, keepSwaps })); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-4">
        <header className="pt-4">
          <p className="eyebrow">Cycle {upcoming} · Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          <div className="mt-2 flex gap-1" aria-hidden>{STEPS.map((name, i) => <span key={name} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-sunk'}`} />)}</div>
          <h1 className="mt-4 text-3xl font-black">{['Start another cycle', 'Your new training maxes', 'When do you start?', 'Ready to go'][step]}</h1>
        </header>

        <section className="card p-5 space-y-4">
          {step === 0 && (
            <>
              <p className="text-sm text-ink-2">Cycle {cycleNumber(current)} is {profile.cycleCompleted ? 'finished' : 'still in progress; starting a new one closes it where it stands'}. Here is how it went:</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Finished', summary.finished], ['Partial', summary.partial], ['Skipped', summary.skipped]].map(([label, value]) => (
                  <div key={label as string} className="rounded-2xl bg-sunk p-3"><strong className="block text-2xl">{value}</strong><span className="text-xs uppercase text-muted">{label}</span></div>
                ))}
              </div>
              {Object.keys(profile.trainingMaxes).length > 0 && (
                <div className="rounded-2xl bg-sunk p-3 text-xs text-ink-2">
                  <p className="font-bold uppercase tracking-wider text-muted">Cycle {cycleNumber(current)} training maxes ({profile.unit})</p>
                  <ul className="mt-1 space-y-0.5">
                    {REQUIRED_TRAINING_MAXES.filter(({ key }) => profile.trainingMaxes[key]).map(({ key, label }) => (
                      <li key={key} className="flex justify-between"><span>{label}</span><span className="font-mono">{profile.trainingMaxes[key]}{profile.block2ConfirmedTMs?.[key] ? ` → ${profile.block2ConfirmedTMs[key]}` : ''}</span></li>
                    ))}
                  </ul>
                  {profile.block2ConfirmedTMs && <p className="mt-1 text-muted">Arrows show your Block 2 maxes.</p>}
                </div>
              )}
              <p className="text-xs text-muted">Nothing is deleted. Cycle {cycleNumber(current)} stays in Progress, and your personal bests, badges and level carry over.</p>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-ink-2">These start from your last cycle's maxes. Retested or stronger? Update them. Block 2 maxes are cleared; you confirm them again in the middle of the cycle.</p>
              {REQUIRED_TRAINING_MAXES.map(({ key, label }) => {
                const problem = tmProblem(tms[key], profile.unit);
                return (
                  <label key={key} className="block text-xs uppercase font-bold text-muted">{label} ({profile.unit})
                    <input type="number" inputMode="decimal" min="0" step={profile.equipmentIncrement} value={tms[key] ?? ''} onChange={(e) => setTms({ ...tms, [key]: e.target.value === '' ? '' : Number(e.target.value) })} className="field mt-1 normal-case" />
                    {profile.trainingMaxes[key] ? <span className="mt-1 block text-xs normal-case font-normal text-muted">Last cycle: {profile.block2ConfirmedTMs?.[key] ?? profile.trainingMaxes[key]} {profile.unit}</span> : null}
                    {problem && <span role="alert" className={`mt-1 block text-xs normal-case font-semibold ${problem.level === 'error' ? 'text-bad' : 'text-accent-ink'}`}>{problem.message}</span>}
                  </label>
                );
              })}
            </>
          )}

          {step === 2 && (
            <>
              <label className="block text-xs uppercase font-bold text-muted">Week 1 starts the week of
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field mt-1 normal-case" />
              </label>
              <div className="space-y-2">
                {DAY_NAMES.map((name, index) => (
                  <label key={name} className="flex items-center justify-between gap-3 text-sm font-bold">
                    <span>{name}</span>
                    <select value={days[index]} onChange={(e) => chooseDay(index, Number(e.target.value))} className="field w-32 shrink-0 text-sm" aria-label={`${name} weekday`}>
                      {WEEKDAY_LABELS.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span><strong className="block text-sm">Keep my exercise swaps</strong><span className="block text-xs text-muted">Swapped lifts and renamed accessories carry over. Turn off to go back to the program's own exercises.</span></span>
                <input type="checkbox" checked={keepSwaps} onChange={(e) => setKeepSwaps(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
              </label>
              <p className="rounded-2xl bg-sunk p-4 text-sm text-ink-2">Starting <strong>cycle {upcoming}</strong> on the week of <strong>{startDate}</strong>, training {days.map((d) => WEEKDAY_LABELS[d]).join(', ')}.</p>
            </>
          )}
          {error && <p role="alert" className="text-xs text-bad">{error}</p>}
        </section>

        <div className="flex gap-2">
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary">Back</button> : <button type="button" onClick={onCancel} className="btn-secondary">Not now</button>}
          {step < STEPS.length - 1
            ? <button type="button" disabled={!canAdvance} onClick={() => setStep(step + 1)} className="btn-primary flex-1">Next</button>
            : <button type="button" disabled={busy} onClick={() => void start()} className="btn-primary flex-1">{busy ? 'Starting…' : `Start cycle ${upcoming}`}</button>}
        </div>
      </div>
    </div>
  );
}
