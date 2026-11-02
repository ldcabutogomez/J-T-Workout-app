import React, { useEffect, useState } from 'react';
import type { LoggedSet, SourceReference, UserProfile, WorkoutSession } from '../types';
import { getDayPrescription } from '../engine/jnt2Engine';
import { missingTrainingMaxes } from '../engine/sessionEngine';
import { AlertTriangle, Check, HelpCircle, Minus, Plus, RotateCcw } from 'lucide-react';

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
}: TodayTabProps) {
  const [showHelp, setShowHelp] = useState(false);
  if (!profile) return <div className="p-6 text-center text-slate-400">Loading local profiles…</div>;

  if (!activeSession) {
    const prescription = getDayPrescription(profile.currentWeek, profile.currentDay, profile);
    const missing = missingTrainingMaxes(prescription, profile);
    return (
      <div className="space-y-4">
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex justify-between items-start gap-3">
            <div>
              <span className="text-[11px] uppercase font-extrabold tracking-widest text-amber-400">Next scheduled session</span>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">{prescription.title}</h1>
              <p className="text-xs text-slate-400 font-mono mt-1">Week {profile.currentWeek} of 12 · Day {profile.currentDay} of 4</p>
            </div>
            <button onClick={() => setShowHelp(true)} className="p-2 rounded-xl bg-slate-800 text-slate-300" aria-label="Set notation help"><HelpCircle className="w-5 h-5" /></button>
          </div>

          {profile.cycleCompleted ? (
            <div className="mt-4 p-3 rounded-2xl border border-emerald-800 bg-emerald-950/40 text-sm text-emerald-300">This profile is at the end of Week 12. The app will not silently restart or duplicate cycle completion.</div>
          ) : missing.length > 0 ? (
            <div role="alert" className="mt-4 p-3 rounded-2xl border border-rose-800 bg-rose-950/40 text-sm text-rose-200">
              <strong className="block">Personal setup required</strong>
              <span className="text-xs">Enter {missing.join(', ')} on the Program tab. Workbook example weights are never used as profile data.</span>
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button disabled={profile.cycleCompleted || missing.length > 0} onClick={onStartWorkout} className="flex-1 min-h-14 bg-amber-500 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-black rounded-2xl uppercase tracking-wider">Start workout</button>
            <button disabled={profile.cycleCompleted} onClick={onSkipSession} className="min-h-14 px-4 bg-slate-800 disabled:opacity-50 border border-slate-700 rounded-2xl text-xs font-bold">Skip</button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs uppercase tracking-wider font-bold text-slate-400">Workbook prescription</h2>
          {prescription.exercises.map((slot) => (
            <article key={slot.slotId} className={`bg-slate-900/80 border rounded-2xl p-4 ${slot.ambiguity ? 'border-amber-700' : 'border-slate-800'}`}>
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800 text-amber-300">{slot.tier}</span>
                    <strong className="text-sm text-white">{slot.exerciseName}</strong>
                    {slot.status !== 'work' && <span className="text-[10px] uppercase text-slate-400">{slot.status}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {slot.status === 'work' || slot.status === 'test'
                      ? slot.setType === 'mrs'
                        ? `${slot.repTarget}RM + ${slot.mrsAdditionalSets} additional MRS (${slot.setCount} logged sets)`
                        : `${slot.setCount} set${slot.setCount === 1 ? '' : 's'}${slot.repTarget ? ` · ${slot.repTarget} reps` : ''}${slot.percentage ? ` · ${slot.percentage * 100}%` : ''}`
                      : slot.notes}
                  </p>
                  {slot.ambiguity && <p className="text-xs text-amber-300 mt-2"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />{slot.ambiguity}</p>}
                </div>
              </div>
              <p className="text-[9px] text-slate-600 font-mono mt-2 break-all">{formatSources(slot.sourceRefs)}</p>
            </article>
          ))}
        </section>

        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-slate-900 border border-amber-800/60 rounded-3xl p-5">
        <div className="flex justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400">{activeSession.isEditingCompleted ? 'Editing completed history' : 'Workout in progress'}</span>
            <h1 className="text-2xl font-black">Week {activeSession.week} · Day {activeSession.day}</h1>
            <p className="text-xs text-slate-400 mt-1">Autosaves after every set. Prescription and setup are snapshotted with this session.</p>
          </div>
          <button onClick={() => setShowHelp(true)} className="p-2 h-10 rounded-xl bg-slate-800" aria-label="Set notation help"><HelpCircle className="w-5 h-5" /></button>
        </div>
      </section>

      {activeSession.exercises.map((exercise) => (
        <section key={exercise.slotId} className={`bg-slate-900 border rounded-3xl p-4 space-y-3 ${exercise.manualLoadDecisionPending ? 'border-rose-700' : 'border-slate-800'}`}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800 text-amber-300">{exercise.tier}</span>
              <h2 className="font-black text-white">{exercise.exerciseName}</h2>
              {exercise.status !== 'work' && <span className="text-[10px] uppercase text-slate-400">{exercise.status}</span>}
            </div>
            {exercise.notes && <p className="text-xs text-slate-400 mt-1">{exercise.notes}</p>}
          </div>

          {exercise.manualLoadDecisionPending && (
            <BackoffDecision unit={activeSession.settingsSnapshot.unit} increment={activeSession.settingsSnapshot.equipmentIncrement} warning={exercise.rmMismatchWarning} onSave={(load) => onBackoffDecision(exercise.slotId, load)} />
          )}

          {exercise.sets.length === 0 ? (
            <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3 text-xs text-slate-400">No logged sets for this {exercise.status} slot.</div>
          ) : exercise.sets.map((set, index) => (
            <SetRow key={set.setId} set={set} setNumber={index + 1} unit={set.unit} increment={activeSession.settingsSnapshot.equipmentIncrement} disabled={Boolean(exercise.manualLoadDecisionPending && set.type === 'backoff')} onLog={(reps, load, rir, declined) => onLogSet(exercise.slotId, set.setId, reps, load, rir, declined)} onUndo={() => onUndoSet(exercise.slotId, set.setId)} />
          ))}
          <p className="text-[9px] text-slate-600 font-mono break-all">{formatSources(exercise.sourceRefs)}</p>
        </section>
      ))}

      <section className="grid grid-cols-3 gap-2">
        <button onClick={onDiscardActiveWorkout} className="min-h-12 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-bold text-rose-300">Discard draft</button>
        <button onClick={() => setShowHelp(true)} className="min-h-12 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-bold">Notation</button>
        <button onClick={onCompleteWorkout} className="min-h-12 bg-emerald-500 text-slate-950 rounded-2xl text-xs font-black uppercase">{activeSession.isEditingCompleted ? 'Save edits' : 'Finish'}</button>
      </section>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function SetRow({ set, setNumber, unit, increment, disabled, onLog, onUndo }: {
  set: LoggedSet;
  setNumber: number;
  unit: 'lb' | 'kg';
  increment: number;
  disabled: boolean;
  onLog: (reps: number, load: number, rir: number, declined?: boolean) => void;
  onUndo: () => void;
}) {
  const [load, setLoad] = useState<number | ''>(set.load ?? '');
  const [reps, setReps] = useState<number | ''>(set.actualReps ?? (set.type === 'mrs' ? '' : set.prescribedReps));
  const [rir, setRir] = useState(set.rir ?? 2);
  useEffect(() => {
    setLoad(set.load ?? '');
    setReps(set.actualReps ?? (set.type === 'mrs' ? '' : set.prescribedReps));
    setRir(set.rir ?? 2);
  }, [set.load, set.actualReps, set.rir, set.completed, set.type, set.prescribedReps]);

  if (set.completed) {
    return (
      <div className="bg-emerald-950/30 border border-emerald-900 rounded-2xl p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs"><Check className="w-4 h-4 text-emerald-400" /><strong>Set {setNumber}</strong><span className="font-mono text-slate-300">{set.actualReps} reps @ {set.load} {set.unit}</span>{set.amrapDeclined && <span className="text-slate-500">AMRAP declined</span>}</div>
        <button onClick={onUndo} className="p-2 rounded-xl text-slate-400" aria-label={`Undo set ${setNumber}`}><RotateCcw className="w-4 h-4" /></button>
      </div>
    );
  }

  const canLog = !disabled && load !== '' && reps !== '' && Number(reps) >= 0 && Number(load) >= 0;
  return (
    <div className={`bg-slate-950/70 border border-slate-800 rounded-2xl p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex justify-between gap-2 items-center mb-2">
        <div className="text-xs"><strong>Set {setNumber}</strong> <span className="text-slate-400">{set.type === 'mrs' ? 'MRS · reps may decline' : `target ${set.prescribedReps}${set.isAmrap ? '+' : ''}`}</span></div>
        {set.isAmrap && <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300">optional rep-out</span>}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Stepper label={`Load (${unit})`} value={load} step={increment} onChange={setLoad} />
        <Stepper label="Achieved reps" value={reps} step={1} onChange={setReps} />
        <label className="text-[9px] uppercase font-bold text-slate-500">RIR<select value={rir} onChange={(event) => setRir(Number(event.target.value))} className="block mt-1 min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2 text-xs text-amber-300"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3+</option></select></label>
      </div>
      <div className="flex gap-2 mt-3">
        <button disabled={!canLog} onClick={() => onLog(Number(reps), Number(load), rir)} className="flex-1 min-h-11 bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded-xl text-xs font-black uppercase">Log set</button>
        {set.isAmrap && <button disabled={disabled || load === ''} onClick={() => onLog(set.prescribedReps, Number(load), rir, true)} className="px-3 min-h-11 bg-slate-800 rounded-xl text-[10px] font-bold">Log prescribed reps, no AMRAP</button>}
      </div>
    </div>
  );
}

function Stepper({ label, value, step, onChange }: { label: string; value: number | ''; step: number; onChange: (value: number | '') => void }) {
  return (
    <label className="text-[9px] uppercase font-bold text-slate-500 min-w-0">{label}
      <div className="flex mt-1 min-h-10 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <button type="button" onClick={() => onChange(Math.max(0, Number(value || 0) - step))} className="px-2 bg-slate-800" aria-label={`Decrease ${label}`}><Minus className="w-3 h-3" /></button>
        <input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} className="w-full min-w-0 bg-transparent text-center text-sm font-mono text-white outline-none" />
        <button type="button" onClick={() => onChange(Number(value || 0) + step)} className="px-2 bg-slate-800" aria-label={`Increase ${label}`}><Plus className="w-3 h-3" /></button>
      </div>
    </label>
  );
}

function BackoffDecision({ unit, increment, warning, onSave }: { unit: string; increment: number; warning?: string; onSave: (load: number) => void }) {
  const [load, setLoad] = useState<number | ''>('');
  return (
    <div role="alert" className="bg-rose-950/40 border border-rose-800 rounded-2xl p-3">
      <p className="text-xs text-rose-200"><AlertTriangle className="inline w-4 h-4 mr-1" />{warning}</p>
      <div className="flex gap-2 mt-2"><input type="number" step={increment} value={load} onChange={(event) => setLoad(event.target.value === '' ? '' : Number(event.target.value))} placeholder={`Back-off load (${unit})`} className="flex-1 min-w-0 bg-slate-950 border border-rose-800 rounded-xl px-3 py-2 text-sm" /><button disabled={load === '' || load <= 0} onClick={() => onSave(Number(load))} className="px-3 bg-rose-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold">Use load</button></div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-50 bg-slate-950/85 p-4 flex items-center justify-center"><div className="w-full max-w-sm max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-3"><h2 className="text-xl font-black text-amber-400">Set notation</h2><p className="text-xs text-slate-300"><strong>3+</strong> is three total work sets; the last set may be extended as an optional AMRAP.</p><p className="text-xs text-slate-300"><strong>3MRS</strong> is one target-RM set followed by three additional max-rep sets: four logged sets total. MRS reps may decline.</p><p className="text-xs text-slate-300">Prescribed reps and achieved reps are stored separately. Block 2 main-lift back-offs use the achieved target-RM load only when the intended rep target is hit; otherwise you must choose a load.</p><button onClick={onClose} className="w-full min-h-11 rounded-xl bg-slate-800 font-bold text-sm">Close</button></div></div>;
}
