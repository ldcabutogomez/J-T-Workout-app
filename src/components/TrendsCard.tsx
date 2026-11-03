import { useMemo, useState } from 'react';
import { BarChart3, Clock3, Dumbbell, Trophy } from 'lucide-react';
import type { UserProfile, WorkoutSession } from '../types';
import {
  analyticsSessions,
  analyticsVolumeByWeek,
  e1rmSeries,
  prsByWeek,
  seriesInRange,
  trendableExercises,
  workoutDurationSeries,
  type AnalyticsRange,
} from '../engine/trends';
import { BarChart, LineChart } from './charts/Charts';

type Metric = 'strength' | 'volume' | 'prs' | 'duration';

/** Strength, volume, PR and duration views over the dashboard's shared time range. */
export function TrendsCard({ profile, history, range, now }: { profile: UserProfile; history: WorkoutSession[]; range: AnalyticsRange; now?: number }) {
  const [metric, setMetric] = useState<Metric>('strength');
  const [exerciseId, setExerciseId] = useState('');
  const options = useMemo(() => trendableExercises(history, profile.unit), [history, profile.unit]);
  const activeId = options.some((item) => item.id === exerciseId) ? exerciseId : options[0]?.id ?? '';
  const strength = useMemo(() => (activeId ? seriesInRange(e1rmSeries(history, activeId, profile.unit), history, range, now) : []), [history, activeId, profile.unit, range, now]);
  const volume = useMemo(() => analyticsVolumeByWeek(history, profile.unit, range, now), [history, profile.unit, range, now]);
  const prs = useMemo(() => prsByWeek(history, range, now), [history, range, now]);
  const duration = useMemo(() => workoutDurationSeries(history, range, now), [history, range, now]);
  const sessions = useMemo(() => analyticsSessions(history, range, now), [history, range, now]);
  const points = metric === 'strength' ? strength : metric === 'volume' ? volume : metric === 'prs' ? prs : duration;
  const name = options.find((item) => item.id === activeId)?.name ?? '';
  const available = metric === 'strength' || metric === 'duration' ? points.length >= 2 : points.some((point) => point.value > 0);
  const tabs: Array<{ key: Metric; label: string; icon: typeof Dumbbell }> = [
    { key: 'strength', label: 'Strength', icon: Dumbbell },
    { key: 'volume', label: 'Volume', icon: BarChart3 },
    { key: 'prs', label: 'PRs', icon: Trophy },
    { key: 'duration', label: 'Duration', icon: Clock3 },
  ];

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line bg-sunk/70 px-5 py-4">
        <p className="eyebrow">Performance</p>
        <h2 className="text-xl font-black">Training trends</h2>
      </div>
      <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Trend to show">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="radio" aria-checked={metric === key} onClick={() => setMetric(key)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold ${metric === key ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line bg-surface text-ink'}`}>
            <Icon className="h-4 w-4" aria-hidden />{label}
          </button>
        ))}
      </div>
      {metric === 'strength' && options.length > 0 && (
        <select value={activeId} onChange={(event) => setExerciseId(event.target.value)} aria-label="Exercise" className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold">
          {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      )}
      {!available ? (
        <p className="rounded-2xl bg-sunk p-4 text-xs text-muted">
          {sessions.length === 0
            ? 'Complete a workout in this time range and the chart will appear here.'
            : metric === 'strength' ? 'Strength needs two comparable workouts for the selected exercise in this time range.'
              : metric === 'duration' ? 'Duration needs two workouts with at least two timestamped sets.'
                : metric === 'prs' ? 'No all-time PRs were recorded in this time range.'
                  : 'No lifting volume was recorded in this time range.'}
        </p>
      ) : metric === 'strength' ? (
        <>
          <p className="text-xs text-muted">Estimated one-rep max from your best set each workout (sets of 1 to 12 reps). Filled dots are new bests.</p>
          <LineChart points={points} unit={`${profile.unit} e1RM`} title={`${name} estimated one-rep max`} />
        </>
      ) : metric === 'volume' ? (
        <>
          <p className="text-xs text-muted">Completed-workout volume by calendar week (reps × load).</p>
          <BarChart points={points} unit={profile.unit} title="Weekly volume" />
        </>
      ) : metric === 'prs' ? (
        <>
          <p className="text-xs text-muted">All-time comparable top-set records earned each week. First-time benchmarks are not counted as PRs.</p>
          <BarChart points={points} unit="PRs" title="Weekly all-time PRs" />
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Active time from the first to last timestamped set. {duration.length} of {sessions.length} workouts in this view have enough timing data.</p>
          <LineChart points={points} unit="min" title="Active workout duration" />
        </>
      )}
      </div>
    </section>
  );
}
