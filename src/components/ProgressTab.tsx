import React, { useState } from 'react';
import type { UserProfile, WorkoutSession } from '../types';
import { normalizeWeight } from '../engine/jnt2Engine';
import { BADGES, computeStreak, countResults, deriveHighlights } from '../engine/achievements';
import { validCompleted } from '../engine/encouragement';
import { ProgressRing } from './ProgressRing';
import { ChevronDown, ChevronUp, Trash2, Trophy } from 'lucide-react';

interface ProgressTabProps {
  profile: UserProfile | null;
  history: WorkoutSession[];
  onEditSession: (session: WorkoutSession) => void;
  onDeleteSession: (sessionId: string, isDemo?: boolean) => void;
}

export function ProgressTab({ profile, history, onEditSession, onDeleteSession }: ProgressTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  if (!profile) return null;

  const valid = history.filter(validCompleted);
  const exerciseOptions = (() => {
    const names = new Map<string, string>();
    valid.forEach((session) => session.exercises.forEach((exercise) => names.set(exercise.exerciseId, exercise.exerciseName)));
    return [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const activeExercise = selectedExercise || exerciseOptions[0]?.id || '';

  const records = (() => {
    const result = new Map<number, { load: number; week: number; date: number; name: string }>();
    valid.forEach((session) => session.exercises.filter((exercise) => exercise.exerciseId === activeExercise).forEach((exercise) => {
      const set = exercise.sets.find((item) => item.completed && (item.type === 'rm_target' || item.type === 'test') && item.actualReps !== null && item.load !== null);
      if (!set || set.actualReps === null || set.load === null) return;
      const load = normalizeWeight(set.load, set.unit, profile.unit);
      const prior = result.get(set.actualReps);
      if (!prior || load > prior.load) result.set(set.actualReps, { load, week: session.week, date: session.completedTime ?? session.startTime, name: exercise.exerciseName });
    }));
    return result;
  })();

  const streak = computeStreak(history, profile.weeklyGoalSessions ?? 4);
  const unlocked = new Map((profile.unlockedBadges ?? []).map((badge) => [badge.id, badge.unlockedAt]));
  const derived = deriveHighlights(history);
  const lifetimeVolume = valid.reduce((sum, session) => sum + (derived.get(session.sessionId)?.totalVolume ?? 0), 0);
  const earnedCount = BADGES.filter((badge) => unlocked.has(badge.id)).length;

  return (
    <div className="space-y-4">
      <section className="animate-slide-up flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5">
        <ProgressRing value={streak.weeklyCount} max={streak.weeklyGoal} size={84}>
          <span className="font-mono text-base font-black text-white">{streak.weeklyCount}/{streak.weeklyGoal}</span>
        </ProgressRing>
        <div>
          <p className="font-black text-white">{streak.goalMet ? 'Weekly goal hit!' : 'This week'}</p>
          <p className="text-xs text-slate-400 mt-0.5">{streak.streakWeeks > 0 ? `🔥 ${streak.streakWeeks}-week streak` : 'Hit your weekly goal to start a streak'}</p>
          {lifetimeVolume > 0 && <p className="text-xs text-slate-500 mt-1 font-mono">{lifetimeVolume.toLocaleString()} {profile.unit} lifted since tracking began</p>}
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
        <h1 className="text-xl font-black">Recorded progress</h1>
        <p className="text-xs text-slate-400 mt-1">{streak.weeklyCount} of {streak.weeklyGoal} sessions this week (Mon–Sun). Demo, skipped, duplicate, and partial records are excluded.</p>
        <div className="grid grid-cols-2 gap-2 mt-4"><div className="bg-slate-950 rounded-2xl p-3 border border-slate-800"><span className="text-[10px] uppercase text-slate-500">Full sessions</span><strong className="block text-2xl text-emerald-400">{valid.length}</strong></div><div className="bg-slate-950 rounded-2xl p-3 border border-slate-800"><span className="text-[10px] uppercase text-slate-500">All records</span><strong className="block text-2xl text-white">{history.length}</strong></div></div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
        <h2 className="font-black">Badges <span className="text-xs font-mono text-slate-500">{earnedCount}/{BADGES.length}</span></h2>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map((badge) => {
            const earned = unlocked.has(badge.id);
            return <div key={badge.id} title={badge.description} className={`rounded-2xl border p-2 text-center ${earned ? 'border-amber-400/40 bg-amber-400/10' : 'border-slate-800 bg-slate-950 opacity-50'}`}><div className={`text-2xl ${earned ? '' : 'grayscale'}`} aria-hidden>{badge.icon}</div><strong className="block text-[10px] mt-1 text-white leading-tight">{badge.name}</strong><span className="block text-[9px] text-slate-500 leading-tight mt-0.5">{earned ? new Date(unlocked.get(badge.id) ?? 0).toLocaleDateString() : badge.description}</span></div>;
          })}
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
        <div className="flex gap-2 items-center"><Trophy className="w-5 h-5 text-amber-400" /><h2 className="font-black">Comparable top-set records</h2></div>
        <p className="text-xs text-slate-400">Matched by stable exercise identity and actual achieved reps. Loads are converted to {profile.unit} for comparison; saved set units remain unchanged.</p>
        {exerciseOptions.length ? <select value={activeExercise} onChange={(event) => setSelectedExercise(event.target.value)} className="w-full min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 text-sm font-bold">{exerciseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <p className="text-xs text-slate-500">No comparable top sets recorded yet.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[10, 8, 7, 6, 5, 4, 3, 2, 1].map((reps) => {
            const record = records.get(reps);
            return <div key={reps} className="bg-slate-950 border border-slate-800 rounded-2xl p-3 text-center"><span className="text-[10px] text-slate-500 font-mono">ACTUAL {reps} REPS</span><strong className="block mt-1 font-mono">{record ? `${Number(record.load.toFixed(2))} ${profile.unit}` : '—'}</strong><span className="text-[9px] text-slate-600">{record ? `W${record.week} · ${new Date(record.date).toLocaleDateString()}` : 'No result'}</span></div>;
          })}
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3">
        <h2 className="text-lg font-black">Session history</h2>
        {history.length === 0 && <div className="p-5 text-center text-xs text-slate-500 bg-slate-950 rounded-2xl">No session records yet.</div>}
        {history.map((session) => {
          const open = expanded === session.sessionId;
          const prCount = countResults(derived.get(session.sessionId)?.results ?? [], 'all_time_pr');
          const setCount = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
          return <article key={session.sessionId} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
            <button onClick={() => setExpanded(open ? null : session.sessionId)} className="w-full flex justify-between items-center text-left min-h-11"><div><strong className="text-sm">Week {session.week} · Day {session.day}</strong><div className="flex gap-2 mt-1 text-[10px] uppercase"><span className={session.status === 'completed' ? 'text-emerald-400' : session.status === 'partial' ? 'text-amber-400' : 'text-slate-500'}>{session.status}</span>{session.isDemo && <span className="text-slate-500">demo</span>}<span className="text-slate-500">{setCount} sets</span>{prCount > 0 && <span className="text-amber-400">⭐ {prCount} PR{prCount > 1 ? 's' : ''}</span>}</div></div>{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
            {open && <div className="border-t border-slate-800 mt-2 pt-3 space-y-2">
              {session.encouragementMessage && <p className="text-xs text-amber-300 bg-amber-950/20 rounded-xl p-2">{session.encouragementMessage}</p>}
              {session.exercises.filter((exercise) => exercise.sets.some((set) => set.completed)).map((exercise) => <div key={exercise.slotId} className="bg-slate-900 rounded-xl p-2"><strong className="text-xs">{exercise.tier} · {exercise.exerciseName}</strong>{exercise.swappedFrom && <span className="ml-1 text-[10px] text-slate-500">(swapped from {exercise.swappedFrom.exerciseName})</span>}<div className="flex flex-wrap gap-1 mt-1">{exercise.sets.filter((set) => set.completed).map((set) => <span key={set.setId} className="text-[10px] font-mono bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">{set.actualReps}r @ {set.load}{set.unit}</span>)}</div></div>)}
              <div className="flex justify-end gap-2 pt-2">{!session.isDemo && <button onClick={() => onEditSession(session)} className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-bold">Edit without advancing</button>}<button onClick={() => onDeleteSession(session.sessionId, session.isDemo)} className="px-3 py-2 rounded-xl text-rose-400 text-xs font-bold"><Trash2 className="inline w-3 h-3 mr-1" />Delete</button></div>
            </div>}
          </article>;
        })}
      </section>
    </div>
  );
}
