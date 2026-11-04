import { useMemo, useState } from 'react';
import { Activity, CalendarCheck2, Check, Clock3, Dumbbell, Lightbulb, Minus, Sparkles, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { UserProfile, WorkoutSession } from '../types';
import {
  activityDays,
  analyticsInsights,
  analyticsSummary,
  analyticsVolumeByWeek,
  e1rmSeries,
  prsByWeek,
  seriesInRange,
  trendableExercises,
  workoutDurationSeries,
  type ActivityDay,
  type AnalyticsInsight,
  type AnalyticsRange,
  type TrendPoint,
} from '../engine/trends';
import { EmptyChart, LineChart, Sparkline } from './charts/Charts';
import { TrendsCard } from './TrendsCard';

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string; long: string }> = [
  { value: '4w', label: '4W', long: '4 weeks' },
  { value: '12w', label: '12W', long: '12 weeks' },
  { value: 'all', label: 'All', long: 'All time' },
];

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat();

function Comparison({ current, previous, unit = '' }: { current: number; previous: number | undefined; unit?: string }) {
  if (previous === undefined) return <span className="text-xs text-muted">All recorded history</span>;
  const difference = current - previous;
  const Icon = difference > 0 ? TrendingUp : difference < 0 ? TrendingDown : Minus;
  if (difference === 0) return <span className="inline-flex items-center gap-1 text-xs font-bold text-muted"><Icon className="h-3 w-3" aria-hidden />Even with prior</span>;
  const formatted = unit ? compactNumber.format(Math.abs(difference)) : fullNumber.format(Math.abs(difference));
  return <span className={`inline-flex items-center gap-1 text-xs font-bold ${difference > 0 ? 'text-ok' : 'text-muted'}`}><Icon className="h-3 w-3" aria-hidden />{difference > 0 ? '+' : '−'}{formatted}{unit ? ` ${unit}` : ''} vs prior</span>;
}

function MetricTile({ icon: Icon, label, value, title, detail, points, bars = false, tone = 'accent' }: { icon: typeof Activity; label: string; value: string; title?: string; detail: React.ReactNode; points: TrendPoint[]; bars?: boolean; tone?: 'accent' | 'ok' | 'gold' }) {
  return (
    <article className="min-w-0 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-muted"><Icon className="h-4 w-4" aria-hidden /><span className="text-xs font-bold uppercase tracking-wide">{label}</span></div>
      <strong className="mt-1 block truncate font-mono text-3xl leading-none text-ink" title={title}>{value}</strong>
      <Sparkline points={points} bars={bars} tone={tone} />
      <div className="mt-1 min-h-4 leading-tight">{detail}</div>
    </article>
  );
}

function cellColour(day: ActivityDay): string {
  if (day.future) return 'border-dashed border-line bg-transparent opacity-55';
  if (day.count >= 3) return 'border-accent bg-accent';
  if (day.count === 2) return 'border-accent/60 bg-accent/65';
  if (day.count === 1) return 'border-accent/40 bg-accent/35';
  return 'border-line bg-sunk';
}

function groupWeeks(days: ActivityDay[]): Array<{ at: number; count: number; future: boolean }> {
  const weeks: Array<{ at: number; count: number; future: boolean }> = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    if (!slice.length) continue;
    weeks.push({ at: slice[0].at, count: slice.reduce((sum, day) => sum + day.count, 0), future: slice.every((day) => day.future) });
  }
  return weeks;
}

function WeeklyGoalBars({ days, goal }: { days: ActivityDay[]; goal: number }) {
  const weeks = groupWeeks(days).slice(-12);
  const max = Math.max(goal, ...weeks.map((week) => week.count), 1);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-muted">Weekly goal</p><span className="chip">Target {goal}</span></div>
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label={`Completed workouts per week against a goal of ${goal}`}>
        {weeks.map((week, index) => {
          const hit = week.count >= goal;
          const current = index === weeks.length - 1;
          const date = new Date(week.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div key={week.at} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Week of ${date}: ${week.count} of ${goal}`}>
              <div className={`relative h-16 w-full max-w-8 overflow-hidden rounded-md bg-sunk ${current ? 'ring-2 ring-accent-ink ring-offset-1 ring-offset-surface' : ''}`}>
                <span className="absolute inset-x-0 border-t border-dashed border-ink/30" style={{ bottom: `${(goal / max) * 100}%` }} />
                <span className={`absolute inset-x-0 bottom-0 rounded-t-md ${hit ? 'bg-ok' : 'bg-accent'}`} style={{ height: `${Math.max(week.count > 0 ? 8 : 0, (week.count / max) * 100)}%` }} />
                {hit && <Check className="absolute left-1/2 top-1 h-3.5 w-3.5 -translate-x-1/2 text-on-accent" aria-hidden />}
              </div>
              <span className="font-mono text-[10px] font-bold text-muted">{week.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityHeatmap({ days, range, goal }: { days: ActivityDay[]; range: AnalyticsRange; goal: number }) {
  const [selected, setSelected] = useState<ActivityDay | null>(null);
  const weeks = Math.max(1, Math.ceil(days.length / 7));
  const cell = range === 'all' && weeks > 12 ? 18 : 22;
  const selectedLabel = selected
    ? `${new Date(selected.at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}: ${selected.future ? 'future date' : `${selected.count} completed workout${selected.count === 1 ? '' : 's'}`}`
    : 'Tap or focus a day to inspect it.';

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line bg-sunk/70 px-5 py-4">
        <div><p className="eyebrow">Consistency</p><h2 className="text-xl font-black">Training activity</h2></div>
        <CalendarCheck2 className="mt-1 h-5 w-5 text-accent-ink" aria-hidden />
      </div>
      <div className="space-y-5 p-5">
        <WeeklyGoalBars days={days} goal={goal} />
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Daily activity</p>
          <div className="flex gap-2">
            <div className="grid shrink-0 grid-rows-7 gap-1 text-[9px] font-bold uppercase text-muted" style={{ gridTemplateRows: `repeat(7, ${cell}px)` }} aria-hidden>
              <span className="flex items-center">Mon</span><span /><span className="flex items-center">Wed</span><span /><span className="flex items-center">Fri</span><span /><span className="flex items-center">Sun</span>
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto pb-2 no-scrollbar">
              <div role="grid" aria-label="Completed workouts by day" className="grid w-max grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridTemplateColumns: `repeat(${weeks}, ${cell}px)` }}>
                {days.map((day) => {
                  const date = new Date(day.at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                  const label = day.future ? `${date}, future date` : `${date}, ${day.count} completed workout${day.count === 1 ? '' : 's'}`;
                  return <button key={day.at} type="button" role="gridcell" aria-label={label} aria-selected={selected?.at === day.at} onFocus={() => setSelected(day)} onClick={() => setSelected(day)} className={`rounded-[4px] border transition ${cellColour(day)} ${selected?.at === day.at ? 'ring-2 ring-accent-ink ring-offset-1 ring-offset-surface' : ''}`} />;
                })}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-h-5 text-xs text-ink-2" aria-live="polite">{selectedLabel}</p>
            <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted" aria-label="Activity intensity from none to three or more workouts">
              <span>Less</span><i className="h-3 w-3 rounded-[3px] border border-line bg-sunk" /><i className="h-3 w-3 rounded-[3px] border border-accent/40 bg-accent/35" /><i className="h-3 w-3 rounded-[3px] border border-accent/60 bg-accent/65" /><i className="h-3 w-3 rounded-[3px] border border-accent bg-accent" /><span>More</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const insightIcon: Record<AnalyticsInsight['kind'], typeof Activity> = {
  volume: Dumbbell,
  strength: Activity,
  consistency: CalendarCheck2,
  schedule: Clock3,
  start: Sparkles,
};

function Insights({ insights }: { insights: AnalyticsInsight[] }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-gold-ink" aria-hidden /><div><p className="eyebrow">Highlights</p><h2 className="text-xl font-black">Training insights</h2></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {insights.map((insight) => {
          const Icon = insightIcon[insight.kind];
          return (
            <article key={`${insight.kind}-${insight.title}`} className="rounded-2xl border border-line bg-paper p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-ink"><Icon className="h-4 w-4" aria-hidden /></span>
              <h3 className="mt-2 text-sm font-black">{insight.title}</h3><p className="mt-0.5 text-xs leading-relaxed text-muted">{insight.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function AnalyticsDashboard({ profile, history }: { profile: UserProfile; history: WorkoutSession[] }) {
  const [range, setRange] = useState<AnalyticsRange>('12w');
  const [exerciseId, setExerciseId] = useState('');
  const now = useMemo(() => Date.now(), [history, profile.id]);
  const summary = useMemo(() => analyticsSummary(history, profile.unit, range, now), [history, profile.unit, range, now]);
  const days = useMemo(() => activityDays(history, range, now), [history, range, now]);
  const insights = useMemo(() => analyticsInsights(history, profile.unit, profile.weeklyGoalSessions ?? 4, range, now), [history, profile.unit, profile.weeklyGoalSessions, range, now]);
  const options = useMemo(() => trendableExercises(history, profile.unit), [history, profile.unit]);
  const activeId = options.some((item) => item.id === exerciseId) ? exerciseId : options[0]?.id ?? '';
  const activeName = options.find((item) => item.id === activeId)?.name ?? 'Strength';
  const strength = useMemo(() => activeId ? seriesInRange(e1rmSeries(history, activeId, profile.unit), history, range, now) : [], [history, activeId, profile.unit, range, now]);
  const volume = useMemo(() => analyticsVolumeByWeek(history, profile.unit, range, now), [history, profile.unit, range, now]);
  const prs = useMemo(() => prsByWeek(history, range, now), [history, range, now]);
  const duration = useMemo(() => workoutDurationSeries(history, range, now), [history, range, now]);
  const workouts = useMemo<TrendPoint[]>(() => groupWeeks(days).map((week) => ({ at: week.at, value: week.count })), [days]);
  const { current, previous } = summary;
  const latestStrength = strength[strength.length - 1];
  const firstStrength = strength[0];
  const strengthDelta = latestStrength && firstStrength ? Number((latestStrength.value - firstStrength.value).toFixed(1)) : null;
  const strengthPct = strengthDelta !== null && firstStrength?.value ? Math.round((strengthDelta / firstStrength.value) * 1000) / 10 : null;

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden shadow-sm">
        <div className="bg-ink px-5 py-5 text-paper">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-paper/70">Your training</p><h1 className="mt-1 text-2xl font-black">Progress analytics</h1></div>
            <Activity className="h-7 w-7 text-accent" aria-hidden />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-paper/10 p-1" role="radiogroup" aria-label="Analytics time range">
            {RANGE_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={range === option.value} aria-label={option.long} onClick={() => setRange(option.value)} className={`min-h-10 rounded-lg text-xs font-black transition ${range === option.value ? 'bg-paper text-ink shadow-sm' : 'text-paper'}`}>{option.label}</button>)}
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Strength trajectory · Estimated one-rep max</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong className="font-mono text-4xl leading-none text-ink">{latestStrength ? Number(latestStrength.value.toFixed(1)) : '—'}{latestStrength && <span className="ml-1 text-lg text-muted">{profile.unit}</span>}</strong>
                {strengthDelta !== null && strength.length >= 2 && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${strengthDelta > 0 ? 'bg-ok/10 text-ok' : strengthDelta < 0 ? 'bg-sunk text-muted' : 'bg-sunk text-ink-2'}`}>{strengthDelta > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : strengthDelta < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}{strengthDelta > 0 ? '+' : ''}{strengthDelta} {profile.unit}{strengthPct !== null ? ` · ${strengthPct > 0 ? '+' : ''}${strengthPct}%` : ''}</span>}
              </div>
            </div>
            {options.length > 0 && <label className="min-w-0 sm:w-64"><span className="sr-only">Exercise</span><select value={activeId} onChange={(event) => setExerciseId(event.target.value)} aria-label="Exercise" className="w-full min-h-11 bg-paper border border-line rounded-xl px-3 text-sm font-bold text-ink">{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          </div>
          {strength.length > 0 ? <LineChart points={strength} unit={`${profile.unit} e1RM`} title={`${activeName} estimated one-rep max`} featured /> : <EmptyChart label="Complete a workout in this time range and the chart will appear here." />}
        </div>
      </section>

      <section aria-label="Training summary" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricTile icon={CalendarCheck2} label="Workouts" value={fullNumber.format(current.workouts)} detail={<Comparison current={current.workouts} previous={previous?.workouts} />} points={workouts} bars tone="ok" />
        <MetricTile icon={Dumbbell} label="Volume" value={compactNumber.format(current.volume)} title={`${fullNumber.format(current.volume)} ${profile.unit}`} detail={<Comparison current={current.volume} previous={previous?.volume} unit={profile.unit} />} points={volume} bars />
        <MetricTile icon={Trophy} label="All-time PRs" value={fullNumber.format(current.prs)} detail={<Comparison current={current.prs} previous={previous?.prs} />} points={prs} bars tone="gold" />
        <MetricTile icon={Clock3} label="Avg active" value={current.averageDurationMinutes === null ? '—' : `${current.averageDurationMinutes}m`} detail={<span className="text-xs text-muted">{current.durationCoverage} of {current.workouts} timed</span>} points={duration} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ActivityHeatmap key={range} days={days} range={range} goal={profile.weeklyGoalSessions ?? 4} />
        <TrendsCard profile={profile} history={history} range={range} now={now} />
      </div>
      <Insights insights={insights} />
    </div>
  );
}
