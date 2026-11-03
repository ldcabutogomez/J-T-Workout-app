import { useMemo, useState } from 'react';
import { Activity, CalendarCheck2, Clock3, Dumbbell, Lightbulb, Sparkles, Trophy } from 'lucide-react';
import type { UserProfile, WorkoutSession } from '../types';
import {
  activityDays,
  analyticsInsights,
  analyticsSummary,
  type ActivityDay,
  type AnalyticsInsight,
  type AnalyticsRange,
} from '../engine/trends';
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
  if (difference === 0) return <span className="text-xs text-muted">Even with prior period</span>;
  const formatted = unit ? compactNumber.format(Math.abs(difference)) : fullNumber.format(Math.abs(difference));
  return <span className={`text-xs font-bold ${difference > 0 ? 'text-ok' : 'text-muted'}`}>{difference > 0 ? '+' : '−'}{formatted}{unit ? ` ${unit}` : ''} vs prior</span>;
}

function MetricTile({ icon: Icon, label, value, title, detail }: { icon: typeof Activity; label: string; value: string; title?: string; detail: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-paper p-3">
      <div className="flex items-center gap-1.5 text-muted"><Icon className="h-4 w-4" aria-hidden /><span className="text-xs font-bold uppercase tracking-wide">{label}</span></div>
      <strong className="mt-1 block truncate font-mono text-2xl leading-none text-ink" title={title}>{value}</strong>
      <div className="mt-1.5 min-h-4 leading-tight">{detail}</div>
    </div>
  );
}

function cellColour(day: ActivityDay): string {
  if (day.future) return 'border-dashed border-line bg-transparent opacity-55';
  if (day.count >= 3) return 'border-accent bg-accent';
  if (day.count === 2) return 'border-accent/60 bg-accent/65';
  if (day.count === 1) return 'border-accent/40 bg-accent/35';
  return 'border-line bg-sunk';
}

function ActivityHeatmap({ days, range }: { days: ActivityDay[]; range: AnalyticsRange }) {
  const [selected, setSelected] = useState<ActivityDay | null>(null);
  const weeks = Math.max(1, Math.ceil(days.length / 7));
  const cell = range === 'all' && weeks > 12 ? 18 : 22;
  const selectedLabel = selected
    ? `${new Date(selected.at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}: ${selected.future ? 'future date' : `${selected.count} completed workout${selected.count === 1 ? '' : 's'}`}`
    : 'Tap or focus a day to see its activity.';

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line bg-sunk/70 px-5 py-4">
        <div><p className="eyebrow">Consistency</p><h2 className="text-xl font-black">Training activity</h2></div>
        <CalendarCheck2 className="mt-1 h-5 w-5 text-accent-ink" aria-hidden />
      </div>
      <div className="p-5">
        <div className="flex gap-2">
          <div className="grid shrink-0 grid-rows-7 gap-1 text-[9px] font-bold uppercase text-muted" style={{ gridTemplateRows: `repeat(7, ${cell}px)` }} aria-hidden>
            <span className="flex items-center">Mon</span><span /><span className="flex items-center">Wed</span><span /><span className="flex items-center">Fri</span><span /><span className="flex items-center">Sun</span>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto pb-2 no-scrollbar">
            <div
              role="grid"
              aria-label="Completed workouts by day"
              className="grid w-max grid-flow-col grid-rows-7 gap-1"
              style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridTemplateColumns: `repeat(${weeks}, ${cell}px)` }}
            >
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
      <div className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-gold-ink" aria-hidden /><div><p className="eyebrow">What the data says</p><h2 className="text-xl font-black">Training insights</h2></div></div>
      <div className="mt-4 space-y-2">
        {insights.map((insight) => {
          const Icon = insightIcon[insight.kind];
          return (
            <article key={`${insight.kind}-${insight.title}`} className="flex gap-3 rounded-2xl border border-line bg-paper p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-ink"><Icon className="h-4 w-4" aria-hidden /></span>
              <div><h3 className="text-sm font-black">{insight.title}</h3><p className="mt-0.5 text-xs leading-relaxed text-muted">{insight.body}</p></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function AnalyticsDashboard({ profile, history }: { profile: UserProfile; history: WorkoutSession[] }) {
  const [range, setRange] = useState<AnalyticsRange>('12w');
  const now = useMemo(() => Date.now(), [history, profile.id]);
  const summary = useMemo(() => analyticsSummary(history, profile.unit, range, now), [history, profile.unit, range, now]);
  const days = useMemo(() => activityDays(history, range, now), [history, range, now]);
  const insights = useMemo(() => analyticsInsights(history, profile.unit, profile.weeklyGoalSessions ?? 4, range, now), [history, profile.unit, profile.weeklyGoalSessions, range, now]);
  const { current, previous } = summary;

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="bg-ink px-5 py-5 text-paper">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-paper/70">Your training</p><h1 className="mt-1 text-2xl font-black">Progress analytics</h1><p className="mt-1 text-xs text-paper/70">Completed workouts only · loads normalized to {profile.unit}</p></div>
            <Activity className="h-7 w-7 text-accent" aria-hidden />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-paper/10 p-1" role="radiogroup" aria-label="Analytics time range">
            {RANGE_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={range === option.value} aria-label={option.long} onClick={() => setRange(option.value)} className={`min-h-10 rounded-lg text-xs font-black transition ${range === option.value ? 'bg-paper text-ink shadow-sm' : 'text-paper'}`}>{option.label}</button>)}
          </div>
        </div>
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">At a glance</p><h2 className="text-lg font-black">The numbers that matter</h2></div><span className="chip">{RANGE_OPTIONS.find((option) => option.value === range)?.long}</span></div>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile icon={CalendarCheck2} label="Workouts" value={fullNumber.format(current.workouts)} detail={<Comparison current={current.workouts} previous={previous?.workouts} />} />
            <MetricTile icon={Dumbbell} label="Volume" value={compactNumber.format(current.volume)} title={`${fullNumber.format(current.volume)} ${profile.unit}`} detail={<Comparison current={current.volume} previous={previous?.volume} unit={profile.unit} />} />
            <MetricTile icon={Trophy} label="All-time PRs" value={fullNumber.format(current.prs)} detail={<Comparison current={current.prs} previous={previous?.prs} />} />
            <MetricTile icon={Clock3} label="Avg active" value={current.averageDurationMinutes === null ? '—' : `${current.averageDurationMinutes}m`} detail={<span className="text-xs text-muted">{current.durationCoverage} of {current.workouts} timed</span>} />
          </div>
        </div>
      </section>

      <ActivityHeatmap key={range} days={days} range={range} />
      <TrendsCard profile={profile} history={history} range={range} now={now} />
      <Insights insights={insights} />
    </div>
  );
}
