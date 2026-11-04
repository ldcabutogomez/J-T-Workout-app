import { useMemo, useState } from 'react';
import { BarChart3, Clock3, Trophy } from 'lucide-react';
import type { UserProfile, WorkoutSession } from '../types';
import {
  analyticsSessions,
  analyticsVolumeByWeek,
  prsByWeek,
  workoutDurationSeries,
  type AnalyticsRange,
} from '../engine/trends';
import { BarChart, EmptyChart, LineChart } from './charts/Charts';

type Metric = 'volume' | 'prs' | 'duration';

/** Secondary performance views over the dashboard's shared time range. */
export function TrendsCard({ profile, history, range, now }: { profile: UserProfile; history: WorkoutSession[]; range: AnalyticsRange; now?: number }) {
  const [metric, setMetric] = useState<Metric>('volume');
  const volume = useMemo(() => analyticsVolumeByWeek(history, profile.unit, range, now), [history, profile.unit, range, now]);
  const prs = useMemo(() => prsByWeek(history, range, now), [history, range, now]);
  const duration = useMemo(() => workoutDurationSeries(history, range, now), [history, range, now]);
  const sessions = useMemo(() => analyticsSessions(history, range, now), [history, range, now]);
  const points = metric === 'volume' ? volume : metric === 'prs' ? prs : duration;
  const available = metric === 'duration' ? points.length >= 2 : points.some((point) => point.value > 0);
  const tabs: Array<{ key: Metric; label: string; icon: typeof BarChart3 }> = [
    { key: 'volume', label: 'Volume', icon: BarChart3 },
    { key: 'prs', label: 'PRs', icon: Trophy },
    { key: 'duration', label: 'Duration', icon: Clock3 },
  ];
  const description = metric === 'volume'
    ? 'Completed-workout volume by calendar week.'
    : metric === 'prs'
      ? 'New all-time comparable top-set records by week.'
      : `Active workout time. ${duration.length} of ${sessions.length} workouts have enough timing data.`;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line bg-sunk/70 px-5 py-4">
        <p className="eyebrow">Workload</p>
        <h2 className="text-xl font-black">Training trends</h2>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-sunk p-1" role="radiogroup" aria-label="Trend to show">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="radio" aria-checked={metric === key} onClick={() => setMetric(key)} className={`flex min-h-10 items-center justify-center gap-1 rounded-lg text-xs font-black transition ${metric === key ? 'bg-surface text-accent-ink shadow-sm' : 'text-muted'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />{label}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-muted">{description}</p>
        {!available ? (
          <EmptyChart kind={metric === 'duration' ? 'line' : 'bars'} label={sessions.length === 0
            ? 'Complete a workout in this range to start drawing this view.'
            : metric === 'duration' ? 'Two timestamped workouts are needed to show a duration trend.'
              : metric === 'prs' ? 'Future all-time PRs will appear here as milestones.'
                : 'Logged volume will appear here week by week.'} />
        ) : metric === 'volume' ? (
          <BarChart points={points} unit={profile.unit} title="Weekly volume" />
        ) : metric === 'prs' ? (
          <BarChart points={points} unit="PRs" title="Weekly all-time PRs" />
        ) : (
          <LineChart points={points} unit="min" title="Active workout duration" />
        )}
      </div>
    </section>
  );
}
