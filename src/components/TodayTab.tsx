import React, { useState } from 'react';
import {
  UserProfile,
  WorkoutSession,
  LoggedExercise,
  LoggedSet,
  WeightUnit,
} from '../types';
import { getDayPrescription, roundLoad } from '../engine/jnt2Engine';
import { PlateCalculatorModal } from './PlateCalculatorModal';
import {
  Play,
  Check,
  RotateCcw,
  Plus,
  Minus,
  HelpCircle,
  Disc3,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface TodayTabProps {
  profile: UserProfile | null;
  activeSession: WorkoutSession | null;
  history: WorkoutSession[];
  onStartWorkout: () => void;
  onLogSet: (slotIdx: number, setIdx: number, actualReps: number, load: number, rir: number) => void;
  onUndoSet: (slotIdx: number, setIdx: number) => void;
  onCompleteWorkout: () => void;
  onDiscardActiveWorkout: () => void;
  onAdvanceDayManually: () => void;
}

export const TodayTab: React.FC<TodayTabProps> = ({
  profile,
  activeSession,
  history,
  onStartWorkout,
  onLogSet,
  onUndoSet,
  onCompleteWorkout,
  onDiscardActiveWorkout,
  onAdvanceDayManually,
}) => {
  const [plateCalcTarget, setPlateCalcTarget] = useState<number | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);

  if (!profile) return null;

  // --------------------------------------------------------------------------
  // GLOSSARY MODAL
  // --------------------------------------------------------------------------
  const glossaryModal = showGlossary && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <h3 className="text-lg font-black font-display text-amber-400">GZCL & J&T 2.0 Terms</h3>
          <button onClick={() => setShowGlossary(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
        </div>
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <div>
            <strong className="text-white block font-bold text-sm">TM (Training Max)</strong>
            Defined in the compendium as an <em>estimated daily 2RM</em>. Never substitute 1RM or arbitrarily use 90% of 1RM.
          </div>
          <div>
            <strong className="text-white block font-bold text-sm">RM Target (Rep Max)</strong>
            The goal reps for your heaviest work set of the day. Stop the set leaving 1–2 reps in reserve.
          </div>
          <div>
            <strong className="text-white block font-bold text-sm">MRS (Max Rep Sets)</strong>
            Sets done to 1–2 reps in reserve using the same weight as your target RM set.
          </div>
          <div>
            <strong className="text-white block font-bold text-sm">3MRS (3 Max Rep Sets)</strong>
            1 initial target RM set followed by <em>3 additional sets</em> at the same load (total 4 logged sets).
          </div>
          <div>
            <strong className="text-white block font-bold text-sm">3+ / 4+ (AMRAP on final set)</strong>
            Means 3 (or 4) total work sets, with an optional rep-out on the final set. It does not mean an extra set.
          </div>
          <div>
            <strong className="text-white block font-bold text-sm">RIR (Reps In Reserve)</strong>
            How many more clean reps you could have performed before technical failure.
          </div>
        </div>
        <button
          onClick={() => setShowGlossary(false)}
          className="w-full bg-slate-800 hover:bg-slate-700 py-2.5 rounded-xl font-bold text-xs uppercase"
        >
          Got it
        </button>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // IDLE / PREVIEW MODE (No workout in progress)
  // --------------------------------------------------------------------------
  if (!activeSession) {
    const dayPrescription = getDayPrescription(profile.currentWeek, profile.currentDay, profile);
    const dayNames = ['Squat Day', 'Bench Day', 'Deadlift Day', 'Overhead Press Day'];

    return (
      <div className="space-y-4">
        {glossaryModal}
        {plateCalcTarget !== null && (
          <PlateCalculatorModal
            isOpen={true}
            onClose={() => setPlateCalcTarget(null)}
            targetWeight={plateCalcTarget}
            barbellWeight={profile.barbellWeight || 45}
            unit={profile.unit}
          />
        )}

        {/* Hero Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] uppercase font-extrabold tracking-widest text-amber-400">
                Next Scheduled Session
              </span>
              <h2 className="text-3xl font-black text-white font-display mt-0.5">
                {dayNames[profile.currentDay - 1]}
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Week {profile.currentWeek} of 12 · Day {profile.currentDay} of 4
              </p>
            </div>
            <button
              onClick={() => setShowGlossary(true)}
              className="text-slate-400 hover:text-amber-400 p-1.5 rounded-xl hover:bg-slate-800/80 transition"
              title="GZCL Terminology Guide"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Block banner */}
          <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-start gap-2.5 text-xs text-slate-300">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              {profile.currentWeek <= 6 ? (
                <span>
                  <strong>Block 1 (Hypertrophy Base):</strong> T1 drop sets use fixed percentages of your starting TM ({profile.currentWeek === 6 ? 'Week 6 1RM test' : '3-4 drop sets'}).
                </span>
              ) : (
                <span>
                  <strong>Block 2 (Strength & Peaking):</strong> T1 back-offs will auto-calculate at 85%–90% of the actual RM weight you hit today.
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={onStartWorkout}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-4 px-6 rounded-2xl shadow-lg shadow-amber-500/20 text-base uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Start Workout</span>
            </button>
            <button
              onClick={onAdvanceDayManually}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-4 rounded-2xl text-xs font-bold transition border border-slate-700"
              title="Skip or advance day without logging"
            >
              Skip Day
            </button>
          </div>
        </div>

        {/* Programmed Movement Preview */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Prescribed Movements ({dayPrescription.exercises.length})
            </h3>
            <span className="text-[11px] font-mono text-slate-500">{dayPrescription.sourceRef}</span>
          </div>

          {dayPrescription.exercises.map((p, idx) => (
            <div
              key={idx}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex justify-between items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded font-mono ${
                      p.tier === 'T1'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : p.tier.startsWith('T2')
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-sky-950 text-sky-300 border border-sky-800'
                    }`}
                  >
                    {p.tier}
                  </span>
                  <span className="font-bold text-white text-sm">{p.defaultExercise}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {p.isRestWeek
                    ? 'Programmed Deload / Rest'
                    : p.tier === 'T1'
                    ? `Top ${p.targetRM}RM + ${p.prescribedSets.length - 1} back-off sets`
                    : p.tier === 'T2a'
                    ? `${p.prescribedSets.length} sets × ${p.prescribedSets[0]?.prescribedReps || 0} reps`
                    : `${p.targetRM}RM + 3 Max Rep Sets (4 sets total)`}
                </p>
              </div>

              {p.tier === 'T1' && profile.trainingMaxes[p.parentLiftKey || ''] && (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Starting TM</span>
                  <span className="font-mono font-bold text-amber-400 text-xs">
                    {profile.trainingMaxes[p.parentLiftKey || '']} {profile.unit}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // ACTIVE WORKOUT MODE (In progress)
  // --------------------------------------------------------------------------
  const allSetsDone = activeSession.exercises.every((ex) =>
    ex.sets.every((s) => s.completed)
  );

  return (
    <div className="space-y-4">
      {glossaryModal}
      {plateCalcTarget !== null && (
        <PlateCalculatorModal
          isOpen={true}
          onClose={() => setPlateCalcTarget(null)}
          targetWeight={plateCalcTarget}
          barbellWeight={profile.barbellWeight || 45}
          unit={profile.unit}
        />
      )}

      {/* Sticky Top Status Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex justify-between items-center">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block">
            Workout In Progress · Autosaved
          </span>
          <h2 className="text-xl font-black text-white font-display">
            Week {activeSession.week} · Day {activeSession.day}
          </h2>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDiscardActiveWorkout}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition"
            title="Discard session"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onCompleteWorkout}
            className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition ${
              allSetsDone
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'
            }`}
          >
            {allSetsDone ? 'Finish ✓' : 'Finish Early'}
          </button>
        </div>
      </div>

      {/* Exercise Cards */}
      <div className="space-y-4">
        {activeSession.exercises.map((exercise, slotIdx) => (
          <ActiveExerciseBlock
            key={exercise.slotKey}
            slotIdx={slotIdx}
            exercise={exercise}
            unit={profile.unit}
            increment={profile.equipmentIncrement}
            onLogSet={onLogSet}
            onUndoSet={onUndoSet}
            onOpenPlateCalc={(w) => setPlateCalcTarget(w)}
            history={history}
          />
        ))}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// EXERCISE BLOCK COMPONENT
// ----------------------------------------------------------------------------
interface ActiveExerciseBlockProps {
  slotIdx: number;
  exercise: LoggedExercise;
  unit: WeightUnit;
  increment: number;
  onLogSet: (slotIdx: number, setIdx: number, actualReps: number, load: number, rir: number) => void;
  onUndoSet: (slotIdx: number, setIdx: number) => void;
  onOpenPlateCalc: (weight: number) => void;
  history: WorkoutSession[];
}

const ActiveExerciseBlock: React.FC<ActiveExerciseBlockProps> = ({
  slotIdx,
  exercise,
  unit,
  increment,
  onLogSet,
  onUndoSet,
  onOpenPlateCalc,
  history,
}) => {
  // If it's a programmed rest slot
  if (exercise.sets.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 text-center">
        <span className="text-[10px] font-mono uppercase font-bold text-slate-500">
          {exercise.tier} — Programmed Rest / Recovery
        </span>
        <h4 className="text-base font-bold text-slate-300 mt-1">{exercise.exerciseName}</h4>
        <p className="text-xs text-slate-500 mt-1">{exercise.notes}</p>
      </div>
    );
  }

  // Find previous relevant performance for same exercise and target RM
  const previousRecord = React.useMemo(() => {
    if (!exercise.targetRM) return null;
    for (const sess of history) {
      const match = sess.exercises.find(
        (e) => e.exerciseName === exercise.exerciseName && e.targetRM === exercise.targetRM
      );
      if (match && match.achievedRMWeight) {
        return {
          weight: match.achievedRMWeight,
          date: sess.completedTime ? new Date(sess.completedTime).toLocaleDateString() : 'Previous',
        };
      }
    }
    return null;
  }, [exercise.exerciseName, exercise.targetRM, history]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
      {/* Exercise Title and Header */}
      <div className="flex justify-between items-start border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded font-mono ${
                exercise.tier === 'T1'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : exercise.tier.startsWith('T2')
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-sky-950 text-sky-300 border border-sky-800'
              }`}
            >
              {exercise.tier}
            </span>
            <h3 className="font-extrabold text-white text-lg font-display tracking-tight">
              {exercise.exerciseName}
            </h3>
          </div>

          {exercise.targetRM && (
            <p className="text-xs text-slate-400 mt-1">
              Top Goal: Find <strong className="text-amber-400">{exercise.targetRM}RM</strong> (1-2 reps in reserve)
            </p>
          )}

          {previousRecord && (
            <p className="text-[11px] text-emerald-400/90 font-mono mt-0.5">
              Previous {exercise.targetRM}RM: {previousRecord.weight} {unit} ({previousRecord.date})
            </p>
          )}
        </div>

        {exercise.sets[0]?.load > 0 && (
          <button
            onClick={() => onOpenPlateCalc(exercise.sets[0].load)}
            className="flex items-center gap-1 text-slate-400 hover:text-amber-400 text-xs font-mono bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl transition"
            title="Open Plate Calculator"
          >
            <Disc3 className="w-3.5 h-3.5" />
            <span>Plates</span>
          </button>
        )}
      </div>

      {/* Rep-mismatch warning for Block 2 T1 */}
      {exercise.rmMismatchWarning && (
        <div className="p-3 bg-amber-950/40 border border-amber-900/60 rounded-2xl flex items-start gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{exercise.rmMismatchWarning}</span>
        </div>
      )}

      {/* Sets List */}
      <div className="space-y-2.5">
        {exercise.sets.map((set, setIdx) => (
          <SetLoggingRow
            key={set.setId}
            setNumber={setIdx + 1}
            set={set}
            unit={unit}
            increment={increment}
            onSave={(reps, load, rir) => onLogSet(slotIdx, setIdx, reps, load, rir)}
            onUndo={() => onUndoSet(slotIdx, setIdx)}
            onOpenPlateCalc={onOpenPlateCalc}
          />
        ))}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// SET LOGGING ROW (High-contrast, large touch buttons, one-handed use)
// ----------------------------------------------------------------------------
interface SetLoggingRowProps {
  setNumber: number;
  set: LoggedSet;
  unit: WeightUnit;
  increment: number;
  onSave: (reps: number, load: number, rir: number) => void;
  onUndo: () => void;
  onOpenPlateCalc: (weight: number) => void;
}

const SetLoggingRow: React.FC<SetLoggingRowProps> = ({
  setNumber,
  set,
  unit,
  increment,
  onSave,
  onUndo,
  onOpenPlateCalc,
}) => {
  const [load, setLoad] = useState<number>(set.load || 0);
  const [reps, setReps] = useState<number>(set.actualReps || set.prescribedReps);
  const [rir, setRir] = useState<number>(set.rir ?? 2);

  React.useEffect(() => {
    setLoad(set.load || 0);
  }, [set.load]);

  const tagLabel =
    set.type === 'rm_target'
      ? 'TOP RM'
      : set.type === 'backoff'
      ? set.isAmrap
        ? 'AMRAP 3+'
        : 'BACK-OFF'
      : set.type === 'mrs'
      ? 'MRS'
      : 'WORK';

  if (set.completed) {
    return (
      <div className="flex justify-between items-center bg-slate-950 border border-emerald-900/60 rounded-2xl px-4 py-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> #{setNumber}
          </span>
          <span className="text-[10px] font-black uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
            {tagLabel}
          </span>
          <span className="font-bold text-white text-sm">
            {set.actualReps} reps @ {set.load} {unit}
          </span>
          {set.rir !== undefined && (
            <span className="text-[10px] text-slate-400 font-mono">({set.rir} RIR)</span>
          )}
        </div>

        <button
          onClick={onUndo}
          className="text-slate-400 hover:text-slate-200 text-xs font-semibold underline px-2 py-1"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Set Label */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold text-slate-400">#{setNumber}</span>
        <span
          className={`text-[9px] font-black px-2 py-0.5 rounded font-mono ${
            set.type === 'rm_target'
              ? 'bg-amber-500 text-slate-950'
              : set.isAmrap
              ? 'bg-rose-950 text-rose-300 border border-rose-800'
              : 'bg-slate-800 text-slate-300'
          }`}
        >
          {tagLabel}
        </span>
        <span className="text-xs text-slate-400 font-mono">
          Target: {set.prescribedReps} {set.isAmrap ? 'reps+' : 'reps'}
        </span>
      </div>

      {/* Steppers & Inputs */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Load Stepper */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase text-slate-500">Weight ({unit})</span>
            {load > 0 && (
              <button
                onClick={() => onOpenPlateCalc(load)}
                className="text-[9px] text-amber-400 hover:underline"
              >
                plates
              </button>
            )}
          </div>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mt-0.5">
            <button
              onClick={() => setLoad((prev) => Math.max(0, prev - increment))}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:bg-slate-600 transition"
              aria-label="Decrease load"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              step={increment}
              value={load === 0 ? '' : load}
              onChange={(e) => setLoad(Number(e.target.value))}
              placeholder="0"
              className="w-16 bg-transparent text-center font-mono font-bold text-sm text-white outline-none"
            />
            <button
              onClick={() => setLoad((prev) => prev + increment)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:bg-slate-600 transition"
              aria-label="Increase load"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Reps Stepper */}
        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase text-slate-500">Reps</span>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mt-0.5">
            <button
              onClick={() => setReps((prev) => Math.max(1, prev - 1))}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:bg-slate-600 transition"
              aria-label="Decrease reps"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className="w-12 bg-transparent text-center font-mono font-bold text-sm text-white outline-none"
            />
            <button
              onClick={() => setReps((prev) => prev + 1)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:bg-slate-600 transition"
              aria-label="Increase reps"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* RIR (Reps in reserve) */}
        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase text-slate-500">RIR</span>
          <select
            value={rir}
            onChange={(e) => setRir(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-xl py-1.5 px-2 text-xs font-mono font-bold text-amber-400 outline-none mt-0.5"
          >
            <option value={0}>0 (Failure)</option>
            <option value={1}>1 (1 left)</option>
            <option value={2}>2 (2 left)</option>
            <option value={3}>3+ (Easy)</option>
          </select>
        </div>

        {/* Big Log Button */}
        <button
          onClick={() => onSave(reps, load, rir)}
          className="mt-3 sm:mt-0 flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition active:scale-95 shadow-md"
        >
          Log Set
        </button>
      </div>
    </div>
  );
};
