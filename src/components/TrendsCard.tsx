import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { UserProfile, WorkoutSession } from '../types';
import { e1rmSeries, trendableExercises, volumeByWeek } from '../engine/trends';
import { BarChart, LineChart } from './charts/Charts';

type Metric = 'strength' | 'volume';

/** Strength (estimated 1RM per workout) and weekly volume over time, for the history passed in. */
export function TrendsCard({ profile, history }: { profile: UserProfile; history: WorkoutSession[] }) {
  const [metric, setMetric] = useState<Metric>('strength');
  const [exerciseId, setExerciseId] = useState('');
  const options = useMemo(() => trendableExercises(history, profile.unit), [history, profile.unit]);
  const activeId = options.some((item) => item.id === exerciseId) ? exerciseId : options[0]?.id ?? '';
  const strength = useMemo(() => (activeId ? e1rmSeries(history, activeId, profile.unit) : []), [history, activeId, profile.unit]);
  const volume = useMemo(() => volumeByWeek(history, profile.unit), [history, profile.unit]);
  const points = metric === 'strength' ? strength : volume;
  const name = options.find((item) => item.id === activeId)?.name ?? '';

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-accent-ink" aria-hidden /><h2 className="font-black">Trends</h2></div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Trend to show">
        {([['strength', 'Strength'], ['volume', 'Weekly volume']] as const).map(([key, label]) => (
          <button key={key} type="button" role="radio" aria-checked={metric === key} onClick={() => setMetric(key)} className={`min-h-11 rounded-xl border text-sm font-bold ${metric === key ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line bg-surface text-ink'}`}>{label}</button>
        ))}
      </div>
      {metric === 'strength' && options.length > 0 && (
        <select value={activeId} onChange={(event) => setExerciseId(event.target.value)} aria-label="Exercise" className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold">
          {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      )}
      {points.length < 2 ? (
        <p className="rounded-2xl bg-sunk p-4 text-xs text-muted">
          {history.some((s) => s.status === 'completed') ? 'A trend needs at least two data points. Finish another workout and it will appear here.' : 'Finish a workout and your trends will start here.'}
        </p>
      ) : metric === 'strength' ? (
        <>
          <p className="text-xs text-muted">Estimated one-rep max from your best set each workout (sets of 1 to 12 reps). Filled dots are new bests.</p>
          <LineChart points={points} unit={`${profile.unit} e1RM`} title={`${name} estimated one-rep max`} />
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Total weight lifted each week (reps × load), most recent 12 weeks.</p>
          <BarChart points={points} unit={profile.unit} title="Weekly volume" />
        </>
      )}
    </section>
  );
}
