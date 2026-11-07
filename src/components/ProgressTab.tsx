import { findTopSet } from '../engine/extras';
import React, { useState } from 'react';
import type { RunSession, UserProfile, WorkoutSession } from '../types';
import { normalizeWeight } from '../engine/jnt2Engine';
import { BADGES, computeStreak, countResults, deriveHighlights, loggedDurationMs } from '../engine/achievements';
import { validCompleted } from '../engine/encouragement';
import { ProgressRing } from './ProgressRing';
import { BadgeIcon } from './BadgeIcon';
import { StreakLabel } from './StreakLabel';
import { fmtCount } from '../engine/sessionValidity';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { RepLoadChart, type RepLoadPoint } from './charts/Charts';
import { levelFor } from '../engine/xp';
import { cycleNumber, cycleOf } from '../engine/cycles';
import { ChevronDown, ChevronUp, Trash2, Trophy } from 'lucide-react';
import { RunProgress } from './RunProgress';

interface ProgressTabProps {
  profile: UserProfile | null;
  history: WorkoutSession[];
  runs: RunSession[];
  onEditSession: (session: WorkoutSession) => void;
  onDeleteSession: (sessionId: string, isDemo?: boolean) => void;
  onDeleteRun: (runId: string) => void;
}

export function ProgressTab({ profile, history, runs, onEditSession, onDeleteSession, onDeleteRun }: ProgressTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [showAllHistory, setShowAllHistory] = useState(false);
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
      const set = findTopSet(exercise, (item) => item.completed && item.actualReps !== null && item.load !== null);
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
  const maxSessionVolume = Math.max(1, ...history.map((session) => normalizeWeight(derived.get(session.sessionId)?.totalVolume ?? 0, session.settingsSnapshot.unit, profile.unit)));
  const level = levelFor(history, profile);
  const cycles = [...new Set(history.map(cycleOf))].sort((a, b) => cycleNumber(a) - cycleNumber(b));
  const earnedCount = BADGES.filter((badge) => unlocked.has(badge.id)).length;
  const selectedBadge = BADGES.find((badge) => badge.id === selectedBadgeId) ?? null;
  const filteredHistory = history.filter((session) => cycleFilter === 'all' || cycleOf(session) === cycleFilter);
  const visibleHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 12);

  return (
    <div className="space-y-4">
      <AnalyticsDashboard profile={profile} history={history} />
      <RunProgress runs={runs} onDelete={onDeleteRun} />

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

      <section className="card p-5 space-y-3">
        <div className="flex items-baseline justify-between"><h2 className="text-xl font-black">Badges</h2><span className="chip">{earnedCount}/{BADGES.length} earned</span></div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {BADGES.map((badge) => {
            const earned = unlocked.has(badge.id);
            const selected = badge.id === selectedBadgeId;
            return <button type="button" key={badge.id} title={badge.description} aria-pressed={selected} onClick={() => setSelectedBadgeId(selected ? null : badge.id)} className={`min-h-20 rounded-2xl border p-2 text-center transition ${earned ? 'border-accent/40 bg-accent/10' : 'border-line bg-paper opacity-55'} ${selected ? 'ring-2 ring-accent-ink ring-offset-1 ring-offset-surface' : ''}`}><span className="flex justify-center"><BadgeIcon name={badge.icon} earned={earned} /></span><strong className="mt-1 block text-[11px] leading-tight text-ink">{badge.name}</strong></button>;
          })}
        </div>
        {selectedBadge ? <div className="rounded-xl border border-line bg-sunk p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{selectedBadge.name}</strong><span className={`text-xs font-bold ${unlocked.has(selectedBadge.id) ? 'text-ok' : 'text-muted'}`}>{unlocked.has(selectedBadge.id) ? `Earned ${new Date(unlocked.get(selectedBadge.id) ?? 0).toLocaleDateString()}` : 'Locked'}</span></div><p className="mt-1 text-xs text-muted">{selectedBadge.description}</p></div> : <p className="text-center text-xs text-muted">Tap a badge to see how it is earned.</p>}
      </section>

      <section className="card p-5 space-y-3">
        <div className="flex gap-2 items-center"><Trophy className="w-5 h-5 text-gold-ink" /><div><p className="eyebrow">Rep strength</p><h2 className="text-xl font-black">Strength profile</h2></div></div>
        {exerciseOptions.length ? <select value={activeExercise} onChange={(event) => setSelectedExercise(event.target.value)} className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold">{exerciseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <p className="text-xs text-muted">No comparable top sets recorded yet.</p>}
        <RepLoadChart
          title={`${exerciseOptions.find((item) => item.id === activeExercise)?.name ?? 'Exercise'} rep-strength profile`}
          unit={profile.unit}
          points={[...records.entries()].map(([reps, record]) => ({ reps, load: Number(record.load.toFixed(2)), at: record.date, week: record.week } satisfies RepLoadPoint))}
        />
      </section>

      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="text-lg font-black">Session history</h2>
        {cycles.length > 1 && (
          <select value={cycleFilter} onChange={(event) => { setCycleFilter(event.target.value); setShowAllHistory(false); }} aria-label="Show cycle" className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold">
            <option value="all">All cycles</option>
            {cycles.map((id) => <option key={id} value={id}>Cycle {cycleNumber(id)}</option>)}
          </select>
        )}
        {filteredHistory.length === 0 && <div className="p-5 text-center text-xs text-muted bg-paper rounded-2xl">No session records yet.</div>}
        <div className="space-y-2">
        {visibleHistory.map((session, index) => {
          const open = expanded === session.sessionId;
          const prCount = countResults(derived.get(session.sessionId)?.results ?? [], 'all_time_pr');
          const setCount = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
          const volume = derived.get(session.sessionId)?.totalVolume ?? 0;
          const normalizedVolume = normalizeWeight(volume, session.settingsSnapshot.unit, profile.unit);
          return <div key={session.sessionId} className="relative pl-6">
            <span aria-hidden className={`absolute left-0 top-5 h-3.5 w-3.5 rounded-full border-2 border-surface ${prCount > 0 ? 'bg-gold ring-2 ring-gold/25' : session.status === 'completed' ? 'bg-ok' : session.status === 'partial' ? 'bg-accent' : 'bg-muted'}`} />
            {index < visibleHistory.length - 1 && <span aria-hidden className="absolute bottom-[-0.75rem] left-[6px] top-8 w-px bg-line" />}
          <article className="bg-paper/70 border border-line rounded-2xl p-3">
            <button onClick={() => setExpanded(open ? null : session.sessionId)} className="w-full flex justify-between items-center gap-3 text-left min-h-11"><div className="min-w-0 flex-1"><strong className="text-sm">{session.workoutKind === 'custom' ? (session.customName ?? 'Custom workout') : <>{cycles.length > 1 ? `Cycle ${cycleNumber(cycleOf(session))} · ` : ''}Week {session.week} · Day {session.day}</>}</strong><div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs uppercase"><span className={session.status === 'completed' ? 'text-ok' : session.status === 'partial' ? 'text-accent-ink' : 'text-muted'}>{session.status}</span>{session.workoutKind === 'custom' && <span className="text-muted">custom</span>}{session.isDemo && <span className="text-muted">demo</span>}<span className="text-muted">{setCount} sets</span>{prCount > 0 && <span className="font-bold text-gold-ink">{prCount} PR{prCount > 1 ? 's' : ''}</span>}{session.note && <span className="text-muted">note</span>}</div><p className="mt-1 text-xs text-muted">{new Date(session.completedTime ?? session.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{volume > 0 ? ` · ${volume.toLocaleString()} ${session.settingsSnapshot.unit}` : ''}{loggedDurationMs(session) > 0 ? ` · ${Math.max(1, Math.round(loggedDurationMs(session) / 60_000))} min` : ''}</p>{volume > 0 && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sunk" aria-label={`${volume.toLocaleString()} ${session.settingsSnapshot.unit} volume`}><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (normalizedVolume / maxSessionVolume) * 100)}%` }} /></span>}</div>{open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}</button>
            {open && <div className="border-t border-line mt-2 pt-3 space-y-2">
              {session.note && <p className="whitespace-pre-wrap rounded-xl bg-sunk p-2 text-xs text-ink-2"><strong>Workout note:</strong> {session.note}</p>}
              {session.encouragementMessage && <p className="text-xs text-accent-ink bg-accent/10 rounded-xl p-2">{session.encouragementMessage}</p>}
              {session.exercises.filter((exercise) => exercise.sets.some((set) => set.completed)).map((exercise) => <div key={exercise.slotId} className="bg-surface rounded-xl p-2"><strong className="text-xs">{exercise.isExtra ? 'Extra' : exercise.tier} · {exercise.exerciseName}</strong>{exercise.userNote && <p className="mt-1 whitespace-pre-wrap text-xs italic text-ink-2">{exercise.userNote}</p>}{exercise.swappedFrom && <span className="ml-1 text-xs text-muted">(swapped from {exercise.swappedFrom.exerciseName})</span>}<div className="flex flex-wrap gap-1 mt-1">{exercise.sets.filter((set) => set.completed).map((set) => <span key={set.setId} className="text-xs font-mono bg-paper border border-line rounded px-1.5 py-0.5">{set.actualReps}r @ {set.load}{set.unit}</span>)}</div></div>)}
              <div className="flex justify-end gap-2 pt-2">{!session.isDemo && <button onClick={() => onEditSession(session)} className="px-3 py-2 rounded-xl bg-sunk text-xs font-bold">Edit without advancing</button>}<button onClick={() => onDeleteSession(session.sessionId, session.isDemo)} className="px-3 py-2 rounded-xl text-bad text-xs font-bold"><Trash2 className="inline w-3 h-3 mr-1" />Delete</button></div>
            </div>}
          </article></div>;
        })}
        </div>
        {filteredHistory.length > 12 && <button type="button" onClick={() => setShowAllHistory((value) => !value)} className="btn-secondary w-full">{showAllHistory ? 'Show recent 12' : `Show ${filteredHistory.length - 12} older sessions`}</button>}
      </section>
    </div>
  );
}
