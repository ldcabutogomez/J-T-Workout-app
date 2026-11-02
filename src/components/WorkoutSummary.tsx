import { useEffect, useRef, useState } from 'react';
import type { EncouragementTone, SessionHighlights, SessionResult, WeightUnit } from '../types';
import { countResults, summaryHeadline, type BadgeDefinition, type StreakInfo } from '../engine/achievements';
import { feedback, type FeedbackKind } from '../lib/feedback';
import type { Celebration } from '../lib/rewards';
import { useDialog } from '../lib/useDialog';
import { Confetti } from './Confetti';
import { ProgressRing } from './ProgressRing';

export interface WorkoutSummaryData {
  title: string;
  message: string;
  highlights: SessionHighlights;
  streak: StreakInfo;
  newBadges: BadgeDefinition[];
  unit: WeightUnit;
  tone: EncouragementTone;
  celebrate: boolean;
  /** The single major feedback sequence for this completion. */
  celebration: Celebration;
  nextTitle?: string;
}

const CELEBRATION_FEEDBACK: Record<Celebration, FeedbackKind | null> = {
  cycle: 'finish',
  pr: 'pr',
  weekly_goal: 'badge',
  badge: 'badge',
  finish: 'finish',
  none: null,
};

function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || target <= 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const num = (value: number) => Number(value.toFixed(2));

function resultCard(result: SessionResult) {
  const isPr = result.kind === 'all_time_pr';
  const delta = isPr ? result.deltaVsBest : result.deltaVsPrevious;
  const label = isPr ? '⭐ PR' : '↑ Improved';
  const basis = isPr ? 'vs best' : 'vs last time';
  return (
    <div key={`${result.exerciseId}-${result.reps}`} className={`flex items-center justify-between rounded-2xl border p-3 ${isPr ? 'border-amber-400/40 bg-amber-400/10' : 'border-sky-400/30 bg-sky-400/10'}`}>
      <div>
        <strong className="block text-sm text-white">{result.exerciseName}</strong>
        <span className="text-xs text-slate-300">{result.reps} reps @ {num(result.load)} {result.unit}</span>
      </div>
      <span className={`text-right text-xs font-black ${isPr ? 'text-amber-300' : 'text-sky-300'}`}>
        {label}
        {delta !== null && delta > 0 && <span className="block font-mono font-bold">+{num(delta)} {result.unit} {basis}</span>}
      </span>
    </div>
  );
}

export function WorkoutSummary({ data, onDone }: { data: WorkoutSummaryData; onDone: () => void }) {
  const { highlights, streak, newBadges, unit, tone, celebrate, celebration } = data;
  const dialogRef = useDialog({ onClose: onDone });
  const volume = useCountUp(highlights.totalVolume);
  const sets = useCountUp(highlights.setsCompleted, 600);
  const results = celebrate ? highlights.results : [];
  const improvements = results.filter((r) => r.kind === 'all_time_pr' || r.kind === 'previous_improvement');
  const quiet = results.filter((r) => r.kind === 'matched_best' || r.kind === 'benchmark');
  const hasAllTimePr = countResults(results, 'all_time_pr') > 0;
  const headline = summaryHeadline(results, celebrate);
  const bigMoment = hasAllTimePr || celebration === 'cycle';

  // One feedback sequence per completion; the ref also blocks re-render and StrictMode replays.
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    const kind = CELEBRATION_FEEDBACK[celebration];
    if (kind) feedback(kind);
  }, [celebration]);

  const confettiCount = tone === 'off' || !celebrate ? 0 : bigMoment ? (tone === 'minimal' ? 40 : 90) : tone === 'minimal' ? 0 : 24;
  const emoji = !celebrate ? '✅' : hasAllTimePr ? '🏆' : improvements.length ? '📈' : '💪';

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 animate-fade-in" role="dialog" aria-modal="true" aria-label="Workout summary">
      {confettiCount > 0 && <Confetti count={confettiCount} />}
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 p-4 pb-8">
        <header className="animate-slide-up pt-8 text-center">
          <div className="text-5xl" aria-hidden>{emoji}</div>
          <h1 className="mt-3 text-3xl font-black text-white">{headline}</h1>
          <p className="mt-1 text-xs font-mono uppercase tracking-wider text-amber-400">{data.title}</p>
          {data.message && tone !== 'off' && <p className="mx-auto mt-3 max-w-sm text-sm text-slate-300">{data.message}</p>}
        </header>

        <section className="animate-slide-up grid grid-cols-3 gap-2" style={{ animationDelay: '0.1s' }}>
          <Stat label={`Volume (${unit})`} value={volume.toLocaleString()} />
          <Stat label="Sets" value={String(sets)} />
          <Stat label="Active time" value={formatDuration(highlights.durationMs)} />
        </section>

        {improvements.length > 0 && (
          <section className="animate-slide-up space-y-2" style={{ animationDelay: '0.2s' }}>
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-amber-400">{hasAllTimePr ? 'Personal records' : 'Progress'}</h2>
            {improvements.map(resultCard)}
          </section>
        )}

        {quiet.length > 0 && (
          <section className="animate-slide-up space-y-1 px-1" style={{ animationDelay: '0.25s' }}>
            {quiet.map((r) => (
              <p key={`${r.exerciseId}-${r.reps}`} className="text-xs text-slate-400">
                <span className="font-bold text-slate-300">{r.kind === 'benchmark' ? 'Benchmark saved' : 'Matched your best'}</span> · {r.exerciseName} {r.reps} reps @ {num(r.load)} {r.unit}
              </p>
            ))}
          </section>
        )}

        <section className="animate-slide-up flex items-center gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4" style={{ animationDelay: '0.3s' }}>
          <ProgressRing value={streak.weeklyCount} max={streak.weeklyGoal} size={84}>
            <span className="font-mono text-base font-black text-white">{streak.weeklyCount}/{streak.weeklyGoal}</span>
          </ProgressRing>
          <div>
            <p className="text-sm font-black text-white">{streak.goalMet ? 'Weekly goal hit!' : 'This week'}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {streak.goalMet
                ? 'You showed up all week. Enjoy the recovery.'
                : `${streak.weeklyGoal - streak.weeklyCount} more session${streak.weeklyGoal - streak.weeklyCount === 1 ? '' : 's'} to reach your goal`}
            </p>
            {streak.streakWeeks > 0 && <p className="mt-1 text-xs font-bold text-amber-300">🔥 {streak.streakWeeks}-week streak</p>}
          </div>
        </section>

        {newBadges.length > 0 && (
          <section className="animate-slide-up space-y-2" style={{ animationDelay: '0.4s' }}>
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-emerald-400">Badge{newBadges.length > 1 ? 's' : ''} unlocked</h2>
            {newBadges.map((badge) => (
              <div key={badge.id} className="flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-3">
                <span className="text-3xl" aria-hidden>{badge.icon}</span>
                <div>
                  <strong className="block text-sm text-white">{badge.name}</strong>
                  <span className="text-xs text-slate-300">{badge.description}</span>
                </div>
              </div>
            ))}
          </section>
        )}

        {data.nextTitle && <p className="text-center text-xs text-slate-500">Up next: <span className="text-slate-300">{data.nextTitle}</span></p>}

        <button onClick={onDone} className="mt-auto min-h-14 w-full rounded-2xl bg-amber-500 font-black uppercase tracking-wider text-slate-950 transition active:scale-[0.98]">Done</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
      <strong className="block font-mono text-xl text-white">{value}</strong>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}
