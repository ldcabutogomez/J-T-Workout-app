import React, { useState } from 'react';
import type { UserProfile, WorkoutSession } from '../types';
import { normalizeWeight } from '../engine/jnt2Engine';
import { BADGES, computeStreak, countResults, deriveHighlights, loggedDurationMs } from '../engine/achievements';
import { validCompleted } from '../engine/encouragement';
import { ProgressRing } from './ProgressRing';
import { BadgeIcon } from './BadgeIcon';
import { StreakLabel } from './StreakLabel';
import { fmtCount } from '../engine/sessionValidity';
import { TrendsCard } from './TrendsCard';
import { levelFor } from '../engine/xp';
import { cycleNumber, cycleOf } from '../engine/cycles';
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
  const [cycleFilter, setCycleFilter] = useState<string>('all');
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
  const level = levelFor(history, profile);
  const cycles = [...new Set(history.map(cycleOf))].sort((a, b) => cycleNumber(a) - cycleNumber(b));
  const earnedCount = BADGES.filter((badge) => unlocked.has(badge.id)).length;

  return (
    <div className="space-y-4">
      <section className="animate-slide-up flex items-center gap-4 card p-5">
        <ProgressRing value={streak.weeklyCount} max={streak.weeklyGoal} size={84}>
          <span className="font-mono text-base font-black text-ink">{fmtCount(streak.weeklyCount)}/{streak.weeklyGoal}</span>
        </ProgressRing>
        <div>
          <p className="font-black text-ink">{streak.goalMet ? 'Weekly goal hit!' : 'This week'}</p>
          <p className="text-xs text-muted mt-0.5">{streak.streakWeeks > 0 ? <StreakLabel weeks={streak.streakWeeks} /> : 'Hit your weekly goal to start a streak'}</p>
          {lifetimeVolume > 0 && <p className="text-xs text-muted mt-1 font-mono">{lifetimeVolume.toLocaleString()} {profile.unit} lifted since tracking began</p>}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-black">Level {level.level} · {level.title}</h2>
          <span className="font-mono text-xs text-muted">{level.xp.toLocaleString()} XP</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={level.span} aria-valuenow={level.into} aria-label="XP to next level">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${level.pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{level.into} / {level.span} XP to level {level.level + 1}. Earn XP from sets, finished workouts, PRs, goal weeks and badges.</p>
      </section>

      <TrendsCard profile={profile} history={history} />

      <section className="card p-5">
        <h1 className="text-xl font-black">Recorded progress</h1>
        <p className="text-xs text-muted mt-1">{fmtCount(streak.weeklyCount)} of {streak.weeklyGoal} sessions this week (Mon–Sun). Demo, skipped, duplicate, and partial records are excluded.</p>
        <div className="grid grid-cols-2 gap-2 mt-4"><div className="bg-paper rounded-2xl p-3 border border-line"><span className="text-xs uppercase text-muted">Full sessions</span><strong className="block text-2xl text-ok">{valid.length}</strong></div><div className="bg-paper rounded-2xl p-3 border border-line"><span className="text-xs uppercase text-muted">All records</span><strong className="block text-2xl text-ink">{history.length}</strong></div></div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-black">Badges <span className="text-xs font-mono text-muted">{earnedCount}/{BADGES.length}</span></h2>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map((badge) => {
            const earned = unlocked.has(badge.id);
            return <div key={badge.id} title={badge.description} className={`rounded-2xl border p-2 text-center ${earned ? 'border-accent/40 bg-accent/10' : 'border-line bg-paper opacity-50'}`}><div className="flex justify-center"><BadgeIcon name={badge.icon} earned={earned} /></div><strong className="block text-xs mt-1 text-ink leading-tight">{badge.name}</strong><span className="block text-xs text-muted leading-tight mt-0.5">{earned ? `Earned ${new Date(unlocked.get(badge.id) ?? 0).toLocaleDateString()}` : badge.description}</span></div>;
          })}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <div className="flex gap-2 items-center"><Trophy className="w-5 h-5 text-accent-ink" /><h2 className="font-black">Comparable top-set records</h2></div>
        <p className="text-xs text-muted">Matched by stable exercise identity and actual achieved reps. Loads are converted to {profile.unit} for comparison; saved set units remain unchanged.</p>
        {exerciseOptions.length ? <select value={activeExercise} onChange={(event) => setSelectedExercise(event.target.value)} className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold">{exerciseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <p className="text-xs text-muted">No comparable top sets recorded yet.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[10, 8, 7, 6, 5, 4, 3, 2, 1].map((reps) => {
            const record = records.get(reps);
            return <div key={reps} className="bg-paper border border-line rounded-2xl p-3 text-center"><span className="text-xs text-muted font-mono">ACTUAL {reps} REPS</span><strong className="block mt-1 font-mono">{record ? `${Number(record.load.toFixed(2))} ${profile.unit}` : '—'}</strong><span className="text-xs text-muted">{record ? `W${record.week} · ${new Date(record.date).toLocaleDateString()}` : 'No result'}</span></div>;
          })}
        </div>
      </section>

      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="text-lg font-black">Session history</h2>
        {cycles.length > 1 && (
          <select value={cycleFilter} onChange={(event) => setCycleFilter(event.target.value)} aria-label="Show cycle" className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold">
            <option value="all">All cycles</option>
            {cycles.map((id) => <option key={id} value={id}>Cycle {cycleNumber(id)}</option>)}
          </select>
        )}
        {history.length === 0 && <div className="p-5 text-center text-xs text-muted bg-paper rounded-2xl">No session records yet.</div>}
        {history.filter((session) => cycleFilter === 'all' || cycleOf(session) === cycleFilter).map((session) => {
          const open = expanded === session.sessionId;
          const prCount = countResults(derived.get(session.sessionId)?.results ?? [], 'all_time_pr');
          const setCount = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
          return <article key={session.sessionId} className="bg-paper/70 border border-line rounded-2xl p-3">
            <button onClick={() => setExpanded(open ? null : session.sessionId)} className="w-full flex justify-between items-center text-left min-h-11"><div><strong className="text-sm">{cycles.length > 1 ? `Cycle ${cycleNumber(cycleOf(session))} · ` : ''}Week {session.week} · Day {session.day}</strong><div className="flex gap-2 mt-1 text-xs uppercase"><span className={session.status === 'completed' ? 'text-ok' : session.status === 'partial' ? 'text-accent-ink' : 'text-muted'}>{session.status}</span>{session.isDemo && <span className="text-muted">demo</span>}<span className="text-muted">{setCount} sets</span>{prCount > 0 && <span className="text-accent-ink">{prCount} PR{prCount > 1 ? 's' : ''}</span>}{session.note && <span className="text-muted">note</span>}</div><p className="mt-1 text-xs text-muted">{new Date(session.completedTime ?? session.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{(derived.get(session.sessionId)?.totalVolume ?? 0) > 0 ? ` · ${(derived.get(session.sessionId)?.totalVolume ?? 0).toLocaleString()} ${session.settingsSnapshot.unit}` : ''}{loggedDurationMs(session) > 0 ? ` · ${Math.max(1, Math.round(loggedDurationMs(session) / 60_000))} min` : ''}</p></div>{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
            {open && <div className="border-t border-line mt-2 pt-3 space-y-2">
              {session.note && <p className="whitespace-pre-wrap rounded-xl bg-sunk p-2 text-xs text-ink-2"><strong>Workout note:</strong> {session.note}</p>}
              {session.encouragementMessage && <p className="text-xs text-accent-ink bg-accent/10 rounded-xl p-2">{session.encouragementMessage}</p>}
              {session.exercises.filter((exercise) => exercise.sets.some((set) => set.completed)).map((exercise) => <div key={exercise.slotId} className="bg-surface rounded-xl p-2"><strong className="text-xs">{exercise.tier} · {exercise.exerciseName}</strong>{exercise.userNote && <p className="mt-1 whitespace-pre-wrap text-xs italic text-ink-2">{exercise.userNote}</p>}{exercise.swappedFrom && <span className="ml-1 text-xs text-muted">(swapped from {exercise.swappedFrom.exerciseName})</span>}<div className="flex flex-wrap gap-1 mt-1">{exercise.sets.filter((set) => set.completed).map((set) => <span key={set.setId} className="text-xs font-mono bg-paper border border-line rounded px-1.5 py-0.5">{set.actualReps}r @ {set.load}{set.unit}</span>)}</div></div>)}
              <div className="flex justify-end gap-2 pt-2">{!session.isDemo && <button onClick={() => onEditSession(session)} className="px-3 py-2 rounded-xl bg-sunk text-xs font-bold">Edit without advancing</button>}<button onClick={() => onDeleteSession(session.sessionId, session.isDemo)} className="px-3 py-2 rounded-xl text-bad text-xs font-bold"><Trash2 className="inline w-3 h-3 mr-1" />Delete</button></div>
            </div>}
          </article>;
        })}
      </section>
    </div>
  );
}
