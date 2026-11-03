import React, { useEffect, useState } from 'react';
import type { LoggedExercise, LoggedSet, SourceReference, UserProfile, WorkoutSession } from '../types';
import { getDayPrescription } from '../engine/jnt2Engine';
import { missingTrainingMaxes } from '../engine/sessionEngine';
import { AlertTriangle, Check, ChevronDown, HelpCircle, Minus, Plus, RotateCcw } from 'lucide-react';
import { priorContext } from '../engine/encouragement';
import { useDialog } from '../lib/useDialog';
import { warmupSets } from '../engine/warmup';
import type { StreakInfo } from '../engine/achievements';
import { getSwapOptions, SWAP_GROUP_LABELS, type SwappableSlot } from '../program/swapOptions';
import { ProgressRing } from './ProgressRing';
import { StreakLabel } from './StreakLabel';
import { fmtCount } from '../engine/sessionValidity';
import { Avatar } from './Avatar';
import { CoachCard } from './CoachCard';
import { fromDateKey, type NextWorkout } from '../engine/schedule';
import type { CoachMessage } from '../engine/coach';

interface TodayTabProps {
  profile: UserProfile | null;
  activeSession: WorkoutSession | null;
  onStartWorkout: () => void;
  onLogSet: (slotId: string, setId: string, reps: number, load: number, rir: number, amrapDeclined?: boolean) => void;
  onUndoSet: (slotId: string, setId: string) => void;
  onBackoffDecision: (slotId: string, load: number) => void;
  onCompleteWorkout: () => void;
  onDiscardActiveWorkout: () => void;
  onSkipSession: () => void;
  onSwapExercise: (slotId: string, originalExerciseId: string, alternativeId: string) => void;
  onToggleWarmup: (slotId: string, stepId: string) => void;
  coach?: CoachMessage | null;
  onDismissCoach?: (id: string) => void;
  /** The workout to do next, from the calendar. Falls back to the saved program position. */
  next?: NextWorkout | null;
  /** Unfinished workouts whose day has passed. */
  missed?: number;
  onMoveNext?: () => void;
  weekStrip?: React.ReactNode;
  streak?: StreakInfo;
  history: WorkoutSession[];
}

function formatSources(refs: SourceReference[]): string {
  return refs.map((ref) => `${ref.sheet}!${ref.ranges.join(',')}`).join(' · ');
}

export function TodayTab({
  profile,
  activeSession,
  onStartWorkout,
  onLogSet,
  onUndoSet,
  onBackoffDecision,
  onCompleteWorkout,
  onDiscardActiveWorkout,
  onSkipSession,
  onSwapExercise,
  onToggleWarmup,
  coach,
  onDismissCoach,
  next,
  missed = 0,
  onMoveNext,
  weekStrip,
  streak,
  history,
}: TodayTabProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [reopened, setReopened] = useState<Record<string, boolean>>({});
  // The load currently typed into each T1 exercise's first (RM) set, so the warm-up ramp follows it.
  const [topDraft, setTopDraft] = useState<Record<string, number | ''>>({});
  if (!profile) return <div className="p-6 text-center text-muted">Loading local profiles…</div>;

  if (!activeSession) {
    const slot = next ?? { week: profile.currentWeek, day: profile.currentDay, date: '', reason: 'upcoming' as const };
    const prescription = getDayPrescription(slot.week, slot.day, profile);
    const missing = missingTrainingMaxes(prescription, profile);
    const done = !next && Boolean(profile.cycleCompleted);
    const whenText = !slot.date ? '' : slot.reason === 'today' ? 'Today' : slot.reason === 'missed' ? `Missed · was ${fromDateKey(slot.date).toLocaleDateString(undefined, { weekday: 'long' })}` : fromDateKey(slot.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    return (
      <div className="space-y-4">
        {streak && <WeekCard profile={profile} streak={streak} />}
        {weekStrip}
        {coach && onDismissCoach && <CoachCard message={coach} onDismiss={onDismissCoach} />}
        <section className="card p-5  animate-slide-up">
          <div className="flex justify-between items-start gap-3">
            <div>
              <span className="block text-xs uppercase font-extrabold tracking-widest text-accent-ink">Next scheduled session</span>
              {whenText && <span className={`mt-0.5 block text-sm font-bold ${slot.reason === 'missed' ? 'text-bad' : 'text-ink-2'}`}>{whenText}</span>}
              <h1 className="text-2xl sm:text-3xl font-black text-ink mt-1">{prescription.title}</h1>
              <p className="text-xs text-muted font-mono mt-1">Week {slot.week} of 12 · Day {slot.day} of 4</p>
            </div>
            <button onClick={() => setShowHelp(true)} className="shrink-0 self-start min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-sunk text-ink-2" aria-label="Set notation help"><HelpCircle className="w-5 h-5" /></button>
          </div>

          {done ? (
            <div className="mt-4 p-3 rounded-2xl border border-ok/40 bg-ok/10 text-sm text-ok">This profile is at the end of Week 12. The app will not silently restart or duplicate cycle completion.</div>
          ) : missing.length > 0 ? (
            <div role="alert" className="mt-4 p-3 rounded-2xl border border-bad/40 bg-bad/10 text-sm text-bad">
              <strong className="block">Personal setup required</strong>
              <span className="text-xs">Enter {missing.join(', ')} on the Program tab. Workbook example weights are never used as profile data.</span>
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button disabled={done || missing.length > 0} onClick={() => onStartWorkout()} className="flex-1 min-h-14 bg-accent disabled:bg-sunk disabled:text-muted text-on-accent font-black rounded-2xl uppercase tracking-wider active:scale-[0.98] transition">Start workout</button>
            <button disabled={done} onClick={() => onSkipSession()} className="min-h-14 px-4 bg-sunk disabled:opacity-50 border border-line rounded-2xl text-xs font-bold">Skip</button>
          </div>
          {!done && onMoveNext && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={onMoveNext} className="min-h-11 rounded-xl px-1 text-sm font-bold text-accent-ink underline underline-offset-2">Not today? Move this workout</button>
              {missed > 0 && <span className="text-xs font-semibold text-bad">{missed} missed workout{missed === 1 ? '' : 's'}</span>}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs uppercase tracking-wider font-bold text-muted">Workbook prescription</h2>
          {prescription.exercises.map((slot) => (
            <article key={slot.slotId} className={`bg-surface/80 border rounded-2xl p-4 ${slot.ambiguity ? 'border-accent/40' : 'border-line'}`}>
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-sunk text-accent-ink">{slot.tier}</span>
                    <strong className="text-sm text-ink">{slot.exerciseName}</strong>
                    {slot.status !== 'work' && <span className="text-xs uppercase text-muted">{slot.status}</span>}
                  </div>
                  <ExerciseSwap slot={slot} siblings={prescription.exercises.filter((other) => other.slotId !== slot.slotId && (other.status === 'work' || other.status === 'test')).map((other) => other.exerciseId)} onSwap={onSwapExercise} />
                  <p className="text-xs text-muted mt-1">
                    {slot.status === 'work' || slot.status === 'test'
                      ? slot.setType === 'mrs'
                        ? `${slot.repTarget}RM + ${slot.mrsAdditionalSets} additional MRS (${slot.setCount} logged sets)`
                        : `${slot.setCount} set${slot.setCount === 1 ? '' : 's'}${slot.repTarget ? ` · ${slot.repTarget} reps` : ''}${slot.percentage ? ` · ${slot.percentage * 100}%` : ''}`
                      : slot.notes}
                  </p>
                  {slot.ambiguity && <p className="text-xs text-accent-ink mt-2"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />{slot.ambiguity}</p>}
                </div>
              </div>
              <SourceDetails refs={slot.sourceRefs} />
            </article>
          ))}
        </section>

        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </div>
    );
  }

  let currentSetId: string | undefined;
  for (const exercise of activeSession.exercises) {
    const next = exercise.sets.find((set) => !set.completed && !(exercise.manualLoadDecisionPending && set.type === 'backoff'));
    if (next) { currentSetId = next.setId; break; }
  }

  return (
    <div className="space-y-6">
      <section className="bg-surface border border-accent/40 rounded-3xl p-5">
        <div className="flex justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold text-accent-ink">{activeSession.isEditingCompleted ? 'Editing completed history' : 'Workout in progress'}</span>
            <h1 className="text-2xl font-black">Week {activeSession.week} · Day {activeSession.day}</h1>
            <p className="text-xs text-muted mt-1">Autosaves after every set. Prescription and setup are snapshotted with this session.</p>
          </div>
          <button onClick={() => setShowHelp(true)} className="shrink-0 self-start min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-sunk" aria-label="Set notation help"><HelpCircle className="w-5 h-5" /></button>
        </div>
        <SessionProgress session={activeSession} />
      </section>

      {activeSession.exercises.map((exercise, exerciseIndex) => {
        const isActive = exercise.sets.some((set) => set.setId === currentSetId);
        const tierColor = exercise.tier === 'T1' ? 'var(--color-accent)' : exercise.tier.startsWith('T2') ? 'var(--color-ink-2, var(--color-ink))' : 'var(--color-muted, var(--color-line))';
        const finished = exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
        if (finished && !reopened[exercise.slotId]) {
          return (
            <section key={exercise.slotId} className="bg-surface/60 border border-ok/40 rounded-2xl animate-pop">
              <button onClick={() => setReopened((value) => ({ ...value, [exercise.slotId]: true }))} aria-expanded={false} className="w-full min-h-12 px-4 flex items-center justify-between gap-3 text-left">
                <span className="flex items-center gap-2 min-w-0 text-sm">
                  <Check className="w-4 h-4 text-ok shrink-0" />
                  <strong className="truncate text-ink">{exercise.tier} · {exercise.exerciseName}</strong>
                  <span className="text-xs text-muted shrink-0">{exercise.sets.length}/{exercise.sets.length} sets</span>
                </span>
                <ChevronDown className="w-4 h-4 text-muted shrink-0" />
              </button>
            </section>
          );
        }
        return (
        <section key={exercise.slotId} style={{ '--tier-color': tierColor } as React.CSSProperties} className={`exercise-card ${isActive ? 'exercise-card-active' : ''} ${exercise.manualLoadDecisionPending ? 'exercise-card-alert' : ''}`}>
          <div className="exercise-head">
            <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Exercise {exerciseIndex + 1} of {activeSession.exercises.length}</p>
            {finished && <button onClick={() => setReopened((value) => ({ ...value, [exercise.slotId]: false }))} className="mb-2 min-h-11 px-3 rounded-xl bg-sunk text-xs font-bold text-ink-2">Hide completed exercise</button>}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black px-2 py-0.5 rounded bg-sunk text-accent-ink">{exercise.tier}</span>
              <h2 className="font-black text-ink">{exercise.exerciseName}</h2>
              {exercise.status !== 'work' && <span className="text-xs uppercase text-muted">{exercise.status}</span>}
            </div>
            <ExerciseSwap slot={exercise} siblings={activeSession.exercises.filter((other) => other.slotId !== exercise.slotId && (other.status === 'work' || other.status === 'test')).map((other) => other.exerciseId)} locked={activeSession.isEditingCompleted || exercise.sets.some((set) => set.completed)} lockedReason={activeSession.isEditingCompleted ? 'Swaps are disabled while editing history.' : 'Undo logged sets to swap this exercise.'} onSwap={onSwapExercise} />
            {exercise.notes && <p className="text-xs text-muted mt-1">{exercise.notes}</p>}
          </div>

          {exercise.manualLoadDecisionPending && (
            <BackoffDecision unit={activeSession.settingsSnapshot.unit} increment={activeSession.settingsSnapshot.equipmentIncrement} warning={exercise.rmMismatchWarning} onSave={(load) => onBackoffDecision(exercise.slotId, load)} />
          )}

          {exercise.tier === 'T1' && exercise.sets.length > 0 && !activeSession.isEditingCompleted && (
            <WarmupList
              exercise={exercise}
              draftLoad={topDraft[exercise.slotId]}
              barbell={activeSession.settingsSnapshot.barbellWeight}
              increment={activeSession.settingsSnapshot.equipmentIncrement}
              onToggle={(stepId) => onToggleWarmup(exercise.slotId, stepId)}
            />
          )}

          {exercise.sets.length === 0 ? (
            <div className="rounded-2xl bg-paper/60 border border-line p-3 text-xs text-muted">No logged sets for this {exercise.status} slot.</div>
          ) : exercise.sets.map((set, index) => (
            <SetRow key={set.setId} set={set} setNumber={index + 1} unit={set.unit} increment={activeSession.settingsSnapshot.equipmentIncrement} onLoadChange={index === 0 && exercise.tier === 'T1' ? (value) => setTopDraft((drafts) => (drafts[exercise.slotId] === value ? drafts : { ...drafts, [exercise.slotId]: value })) : undefined} isCurrent={set.setId === currentSetId} context={set.completed || (set.type !== 'rm_target' && set.type !== 'test') ? undefined : contextLine(exercise.exerciseId, set.prescribedReps, history, set.unit, activeSession.sessionId)} disabled={Boolean(exercise.manualLoadDecisionPending && set.type === 'backoff')} onLog={(reps, load, rir, declined) => onLogSet(exercise.slotId, set.setId, reps, load, rir, declined)} onUndo={() => onUndoSet(exercise.slotId, set.setId)} />
          ))}
          <SourceDetails refs={exercise.sourceRefs} />
        </section>
        );
      })}

      <section className="grid grid-cols-3 gap-2">
        <button onClick={onDiscardActiveWorkout} className="min-h-12 bg-surface border border-line rounded-2xl text-xs font-bold text-bad">Discard draft</button>
        <button onClick={() => setShowHelp(true)} className="min-h-12 bg-surface border border-line rounded-2xl text-xs font-bold">Notation</button>
        <button onClick={onCompleteWorkout} className="min-h-12 bg-ok text-on-accent rounded-2xl text-xs font-black uppercase">{activeSession.isEditingCompleted ? 'Save edits' : 'Finish'}</button>
      </section>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function ExerciseSwap({ slot, siblings = [], locked = false, lockedReason, onSwap }: {
  slot: SwappableSlot;
  /** Exercises already in the day's other slots, hidden from the choices so none repeats. */
  siblings?: string[];
  locked?: boolean;
  lockedReason?: string;
  onSwap: (slotId: string, originalExerciseId: string, alternativeId: string) => void;
}) {
  const options = getSwapOptions(slot, siblings);
  if (!options) return null;
  return (
    <div className="mt-2">
      <label className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-muted">
        <span className="shrink-0">Swap · {SWAP_GROUP_LABELS[options.group]}</span>
        <select
          aria-label={`Swap ${options.original.exerciseName}`}
          value={options.selectedId}
          disabled={locked}
          onChange={(event) => onSwap(slot.slotId, options.original.exerciseId, event.target.value)}
          className="min-w-0 flex-1 min-h-9 bg-paper disabled:opacity-50 border border-line rounded-xl px-2 text-xs normal-case font-bold text-accent-ink"
        >
          <option value="">Program: {options.original.exerciseName}</option>
          {options.alternatives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {locked && lockedReason && <p className="mt-1 text-xs text-muted">{lockedReason}</p>}
      {slot.swappedFrom && !locked && <p className="mt-1 text-xs text-muted">Swapped from {slot.swappedFrom.exerciseName}. Remembered for this slot while it is the same program exercise.</p>}
    </div>
  );
}

function WeekCard({ profile, streak }: { profile: UserProfile; streak: StreakInfo }) {
  const name = profile.name;
  const remaining = fmtCount(Math.max(0, streak.weeklyGoal - streak.weeklyCount));
  const headline = streak.goalMet
    ? 'Weekly goal crushed!'
    : streak.weeklyCount === 0
      ? `Ready when you are, ${name}`
      : `${remaining} more to hit your weekly goal`;
  return (
    <section className="animate-slide-up flex items-center gap-4 card p-4">
      <ProgressRing value={streak.weeklyCount} max={streak.weeklyGoal}>
        <span className="font-mono text-sm font-black text-ink">{fmtCount(streak.weeklyCount)}/{streak.weeklyGoal}</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="font-black text-ink text-sm">{headline}</p>
        <p className="text-xs text-muted mt-0.5">
          {streak.streakWeeks > 0
            ? <StreakLabel weeks={streak.streakWeeks} />
            : 'Hit your weekly goal to start a streak'}
        </p>
      </div>
      <Avatar profile={profile} size={44} />
    </section>
  );
}

function SessionProgress({ session }: { session: WorkoutSession }) {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const done = sets.filter((set) => set.completed).length;
  if (!sets.length) return null;
  const pct = Math.round((done / sets.length) * 100);
  return (
    <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={sets.length} aria-valuenow={done} aria-label="Sets completed">
      <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted mb-1">
        <span>{done === sets.length ? 'All sets done — nice work!' : `${done} of ${sets.length} sets`}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-sunk overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${done === sets.length ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SetRow({ set, setNumber, unit, increment, disabled, isCurrent, context, onLoadChange, onLog, onUndo }: {
  set: LoggedSet;
  setNumber: number;
  unit: 'lb' | 'kg';
  increment: number;
  disabled: boolean;
  isCurrent: boolean;
  context?: string;
  onLoadChange?: (value: number | '') => void;
  onLog: (reps: number, load: number, rir: number, declined?: boolean) => void;
  onUndo: () => void;
}) {
  const [load, setLoad] = useState<number | ''>(set.load ?? '');
  const [reps, setReps] = useState<number | ''>(set.actualReps ?? (set.type === 'mrs' ? '' : set.prescribedReps));
  const [rir, setRir] = useState(set.rir ?? 2);
  useEffect(() => { onLoadChange?.(load); }, [load]);
  useEffect(() => {
    setLoad(set.load ?? '');
    setReps(set.actualReps ?? (set.type === 'mrs' ? '' : set.prescribedReps));
    setRir(set.rir ?? 2);
  }, [set.load, set.actualReps, set.rir, set.completed, set.type, set.prescribedReps]);

  if (set.completed) {
    return (
      <div className="animate-pop bg-ok/10 border border-ok/40 rounded-2xl p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs"><Check className="w-4 h-4 text-ok" /><strong>Set {setNumber}</strong><span className="font-mono text-ink-2">{set.actualReps} reps @ {set.load} {set.unit}</span>{set.amrapDeclined && <span className="text-muted">AMRAP declined</span>}</div>
        <button onClick={onUndo} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted" aria-label={`Undo set ${setNumber}`}><RotateCcw className="w-4 h-4" /></button>
      </div>
    );
  }

  const canLog = !disabled && load !== '' && reps !== '' && Number(reps) >= 0 && Number(load) >= 0;
  return (
    <div className={`rounded-2xl p-3 border ${isCurrent ? 'bg-paper border-accent/70 ring-1 ring-accent/30' : 'bg-paper/40 border-line/70'} ${disabled ? 'opacity-50' : ''}`}>
      {isCurrent && <p className="mb-1 text-xs font-black uppercase tracking-wider text-accent-ink">Up next</p>}
      {context && <p className="mb-2 text-xs text-muted">{context}</p>}
      <div className="flex justify-between gap-2 items-center mb-2">
        <div className="text-xs"><strong>Set {setNumber}</strong> <span className="text-muted">{set.type === 'mrs' ? 'MRS · reps may decline' : `target ${set.prescribedReps}${set.isAmrap ? '+' : ''}`}</span></div>
        {set.isAmrap && <span className="text-xs px-2 py-0.5 rounded bg-bad/10 text-bad">optional rep-out</span>}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Stepper label={`Load (${unit})`} value={load} step={increment} onChange={setLoad} />
        <Stepper label="Achieved reps" value={reps} step={1} onChange={setReps} />
        <label className="text-xs uppercase font-bold text-muted">RIR<select value={rir} onChange={(event) => setRir(Number(event.target.value))} className="block mt-1 min-h-10 bg-surface border border-line rounded-xl px-2 text-xs text-accent-ink"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3+</option></select></label>
      </div>
      {set.suggested && load !== '' && Number(load) === set.load && (
        <p className="mt-2 text-xs font-semibold text-accent-ink">{set.suggested === 'tm' ? 'Suggested from your training max. Adjust to what you can do today.' : 'Suggested from last time. Adjust to what you can do today.'}</p>
      )}
      <div className="flex gap-2 mt-3">
        <button disabled={!canLog} onClick={() => onLog(Number(reps), Number(load), rir)} className={`flex-1 bg-ok disabled:bg-sunk disabled:text-muted text-on-accent rounded-xl font-black uppercase active:scale-[0.98] transition ${isCurrent ? 'min-h-12 text-sm' : 'min-h-11 text-xs'}`}>Log set</button>
        {set.isAmrap && <button disabled={disabled || load === ''} onClick={() => onLog(set.prescribedReps, Number(load), rir, true)} className="px-3 min-h-11 bg-sunk rounded-xl text-xs font-bold">Log prescribed reps, no AMRAP</button>}
      </div>
    </div>
  );
}

function Stepper({ label, value, step, onChange }: { label: string; value: number | ''; step: number; onChange: (value: number | '') => void }) {
  return (
    <label className="text-xs uppercase font-bold text-muted min-w-0">{label}
 <div className="flex mt-1 min-h-11 bg-surface border border-line rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent">
        <button type="button" data-haptic="step" onClick={() => onChange(Math.max(0, Number(value || 0) - step))} className="px-3 min-w-9 bg-sunk" aria-label={`Decrease ${label}`}><Minus className="w-3 h-3" /></button>
        <input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} className="w-full min-w-0 bg-transparent text-center text-sm font-mono text-ink outline-none" />
        <button type="button" data-haptic="step" onClick={() => onChange(Number(value || 0) + step)} className="px-3 min-w-9 bg-sunk" aria-label={`Increase ${label}`}><Plus className="w-3 h-3" /></button>
      </div>
    </label>
  );
}

function BackoffDecision({ unit, increment, warning, onSave }: { unit: string; increment: number; warning?: string; onSave: (load: number) => void }) {
  const [load, setLoad] = useState<number | ''>('');
  return (
    <div role="alert" className="bg-bad/10 border border-bad/40 rounded-2xl p-3">
      <p className="text-xs text-bad"><AlertTriangle className="inline w-4 h-4 mr-1" />{warning}</p>
      <div className="flex gap-2 mt-2"><input type="number" step={increment} value={load} onChange={(event) => setLoad(event.target.value === '' ? '' : Number(event.target.value))} placeholder={`Back-off load (${unit})`} className="flex-1 min-w-0 bg-paper border border-bad/40 rounded-xl px-3 py-2 text-sm" /><button disabled={load === '' || load <= 0} onClick={() => onSave(Number(load))} className="px-3 bg-bad disabled:opacity-40 text-on-accent rounded-xl text-xs font-bold">Use load</button></div>
    </div>
  );
}

function WarmupList({ exercise, draftLoad, barbell, increment, onToggle }: {
  exercise: LoggedExercise;
  draftLoad: number | '' | undefined;
  barbell: number;
  increment: number;
  onToggle: (stepId: string) => void;
}) {
  const top = exercise.sets[0];
  const topLoad = draftLoad === undefined ? top.load : draftLoad === '' ? null : draftLoad;
  const steps = warmupSets({ topLoad, topReps: top.prescribedReps, barbell, increment });
  if (!steps.length) return null;
  const done = exercise.warmupsDone ?? [];
  const doneCount = steps.filter((step) => done.includes(step.id)).length;
  const allDone = doneCount === steps.length;
  return (
    <details open={!allDone && !top.completed} className="rounded-xl border border-line bg-sunk/50 px-3">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-bold text-ink-2">
        <span>Warm-up</span>
        <span className="text-xs font-semibold text-muted">{doneCount} of {steps.length} done</span>
      </summary>
      <ul className="pb-2">
        {steps.map((step) => {
          const checked = done.includes(step.id);
          return (
            <li key={step.id}>
              <button type="button" role="checkbox" aria-checked={checked} onClick={() => onToggle(step.id)} className="flex min-h-11 w-full items-center gap-3 text-left">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-ok bg-ok text-on-accent' : 'border-line bg-surface'}`}>{checked && <Check className="h-4 w-4" />}</span>
                <span className={`text-sm font-bold ${checked ? 'text-muted line-through' : 'text-ink'}`}>{step.label}</span>
                <span className="ml-auto font-mono text-sm text-ink-2">{step.reps} × {step.load} {top.unit}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function SourceDetails({ refs }: { refs: SourceReference[] }) {
  return (
    <details className="text-xs">
      <summary className="min-h-9 flex items-center cursor-pointer text-muted">Prescription details</summary>
      <p className="text-xs text-muted font-mono break-all pb-1">{formatSources(refs)}</p>
    </details>
  );
}

function contextLine(exerciseId: string, reps: number, history: WorkoutSession[], unit: 'lb' | 'kg', sessionId: string): string {
  const { last, best } = priorContext(exerciseId, reps, history, unit, sessionId);
  if (last === null || best === null) return `First time at ${reps} reps. This set becomes your benchmark.`;
  const n = (value: number) => Number(value.toFixed(2));
  return `At ${reps} reps · Last time ${n(last)} ${unit} · Best ${n(best)} ${unit}`;
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialog({ onClose });
  return <div className="fixed inset-0 z-50 bg-paper/85 p-4 flex items-center justify-center"><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Set notation" className="w-full max-w-sm max-h-[85vh] overflow-y-auto card p-5 space-y-3"><h2 className="text-xl font-black text-accent-ink">Set notation</h2><p className="text-xs text-ink-2"><strong>3+</strong> is three total work sets; the last set may be extended as an optional AMRAP.</p><p className="text-xs text-ink-2"><strong>3MRS</strong> is one target-RM set followed by three additional max-rep sets: four logged sets total. MRS reps may decline.</p><p className="text-xs text-ink-2">Prescribed reps and achieved reps are stored separately. Block 2 main-lift back-offs use the achieved target-RM load only when the intended rep target is hit; otherwise you must choose a load.</p><button onClick={onClose} className="w-full min-h-11 rounded-xl bg-sunk font-bold text-sm">Close</button></div></div>;
}
