import { Footprints, Gauge, Route, Timer, Trash2 } from 'lucide-react';
import type { RunSession } from '../types';
import {
  currentWeekRunSummary,
  distanceFromMeters,
  formatRunDistance,
  formatRunDuration,
  formatRunPace,
  preferredRunUnit,
  RUN_TYPE_LABELS,
  runDistanceByWeek,
} from '../engine/runs';

export function RunProgress({ runs, onDelete }: { runs: RunSession[]; onDelete: (runId: string) => void }) {
  const unit = preferredRunUnit(runs);
  const summary = currentWeekRunSummary(runs, Date.now(), unit);
  const weeks = runDistanceByWeek(runs, unit);
  const maximum = Math.max(1, ...weeks.map((week) => week.distance));
  const lifetimeMeters = runs.reduce((sum, run) => sum + run.distanceMeters, 0);
  const lifetimeSeconds = runs.reduce((sum, run) => sum + run.durationSeconds, 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-gold/30 bg-gold/10 px-5 py-4">
        <div><p className="eyebrow">Supplemental training</p><h2 className="text-xl font-black">Running</h2></div>
        <Footprints className="h-6 w-6 text-gold-ink" aria-hidden />
      </div>
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-paper p-3"><Footprints className="mx-auto h-4 w-4 text-gold-ink" aria-hidden /><strong className="mt-1 block font-mono text-2xl">{summary.count}</strong><span className="text-xs text-muted">Runs this week</span></div>
          <div className="rounded-2xl bg-paper p-3"><Route className="mx-auto h-4 w-4 text-gold-ink" aria-hidden /><strong className="mt-1 block font-mono text-2xl">{summary.distanceMeters > 0 ? Number(distanceFromMeters(summary.distanceMeters, unit).toFixed(2)) : '—'}</strong><span className="text-xs text-muted">{unit} this week</span></div>
          <div className="rounded-2xl bg-paper p-3"><Gauge className="mx-auto h-4 w-4 text-gold-ink" aria-hidden /><strong className="mt-1 block font-mono text-2xl">{summary.count ? summary.averagePace.split(' ')[0] : '—'}</strong><span className="text-xs text-muted">Pace /{unit}</span></div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-muted">Distance by week</p><span className="chip">Last 8 weeks</span></div>
          <div className="flex h-28 items-end gap-2" role="img" aria-label={`Running distance by week in ${unit}`}>
            {weeks.map((week, index) => {
              const label = new Date(week.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <div key={week.startTime} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Week of ${label}: ${week.distance.toFixed(2)} ${unit}, ${week.count} runs`}>
                  <span className="font-mono text-[10px] font-bold text-muted">{week.distance > 0 ? Number(week.distance.toFixed(1)) : ''}</span>
                  <span className={`w-full max-w-8 rounded-t-md ${index === weeks.length - 1 ? 'bg-gold ring-2 ring-gold/25' : 'bg-gold/55'}`} style={{ height: `${Math.max(week.distance > 0 ? 7 : 2, (week.distance / maximum) * 72)}px` }} />
                  <span className="text-[9px] text-muted">{label.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-paper p-5 text-center"><Footprints className="mx-auto h-7 w-7 text-muted" aria-hidden /><p className="mt-2 text-sm font-bold">No runs logged yet</p><p className="mt-1 text-xs text-muted">Use Log a run on Today. Running stays separate from lifting progression.</p></div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between gap-3"><h3 className="text-sm font-black">Recent runs</h3><p className="text-xs text-muted">{formatRunDistance(lifetimeMeters, unit)} · {formatRunDuration(lifetimeSeconds)} total</p></div>
            <ol className="mt-2 space-y-2">
              {runs.slice(0, 8).map((run) => (
                <li key={run.runId} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-gold bg-gold" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2"><strong className="text-sm">{RUN_TYPE_LABELS[run.runType]}</strong><span className="text-xs text-muted">{new Date(run.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                    <p className="mt-0.5 text-xs text-muted">{formatRunDistance(run.distanceMeters, run.distanceUnit)} · <Timer className="inline h-3 w-3" aria-hidden /> {formatRunDuration(run.durationSeconds)} · {formatRunPace(run.durationSeconds, run.distanceMeters, run.distanceUnit)}</p>
                    {(run.effort || run.notes) && <p className="mt-1 truncate text-xs text-ink-2">{run.effort ? `Effort ${run.effort}/10` : ''}{run.effort && run.notes ? ' · ' : ''}{run.notes}</p>}
                  </div>
                  <button type="button" onClick={() => onDelete(run.runId)} aria-label={`Delete ${RUN_TYPE_LABELS[run.runType]} run from ${new Date(run.startTime).toLocaleDateString()}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-bad"><Trash2 className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
