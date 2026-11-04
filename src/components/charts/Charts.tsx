import { useId, useState } from 'react';
import type { TrendPoint } from '../../engine/trends';

const W = 360;
const H = 220;
const PAD = { left: 42, right: 14, top: 16, bottom: 28 };
const PLOT_H = H - PAD.top - PAD.bottom;

const dateLabel = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** A "nice" y range that always includes the data and does not flatten values far above zero. */
function yRange(values: number[], fromZero: boolean): [number, number] {
  const max = Math.max(...values);
  const min = fromZero ? 0 : Math.min(...values);
  const span = max - min || max || 1;
  const pad = fromZero ? span * 0.08 : span * 0.18;
  return [Math.max(0, fromZero ? 0 : min - pad), max + pad];
}

interface ChartProps {
  points: TrendPoint[];
  /** What the numbers are, used in the value readout for each point. */
  unit: string;
  /** Names the chart for screen readers and the fallback table. */
  title: string;
  /** Gives the primary dashboard chart a stronger visual treatment. */
  featured?: boolean;
}

interface FrameProps extends ChartProps {
  children: React.ReactNode;
  lo: number;
  hi: number;
  selected: number | null;
  setSelected: (index: number | null) => void;
}

function Frame({ title, unit, points, children, lo, hi, selected, setSelected, featured = false }: FrameProps) {
  const ticks = [lo, (lo + hi) / 2, hi];
  const active = selected !== null ? points[selected] : null;
  return (
    <figure className="space-y-2">
      <div className={`relative overflow-hidden rounded-2xl border ${featured ? 'border-accent/25 bg-gradient-to-b from-accent/10 to-surface' : 'border-line bg-surface'}`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.length} points, from ${compact(points[0].value)} to ${compact(points[points.length - 1].value)} ${unit}`} className="block h-auto w-full touch-pan-y" onPointerLeave={() => setSelected(null)}>
          {ticks.map((tick) => {
            const y = PAD.top + PLOT_H - ((tick - lo) / (hi - lo)) * PLOT_H;
            return (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" strokeDasharray={tick === lo ? undefined : '3 4'} />
                <text x={PAD.left - 7} y={y + 3} textAnchor="end" fontSize="9" fontWeight="600" fill="var(--color-muted)">{compact(tick)}</text>
              </g>
            );
          })}
          <text x={PAD.left} y={H - 7} fontSize="9" fontWeight="600" fill="var(--color-muted)">{dateLabel(points[0].at)}</text>
          <text x={W - PAD.right} y={H - 7} fontSize="9" fontWeight="600" textAnchor="end" fill="var(--color-muted)">{dateLabel(points[points.length - 1].at)}</text>
          {children}
        </svg>
        {active && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-line bg-surface/95 px-2 py-1 text-right shadow-sm">
            <strong className="block font-mono text-sm text-ink">{active.value.toLocaleString()} {unit}</strong>
            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">{dateLabel(active.at)}{active.best ? ' · New best' : ''}</span>
          </div>
        )}
      </div>
      <figcaption className="min-h-5 text-xs text-ink-2" aria-live="polite">
        {active ? `${dateLabel(active.at)}: ${active.value.toLocaleString()} ${unit}${active.best ? ' (best so far)' : ''}` : 'Tap, hover, or focus a point for its exact value.'}
      </figcaption>
      <details>
        <summary className="min-h-9 cursor-pointer text-xs font-bold text-muted">Show exact values</summary>
        <table className="mt-1 w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1 font-bold">Date</th><th className="py-1 font-bold">{unit}</th></tr></thead>
          <tbody>{points.map((point, index) => <tr key={`${point.at}-${point.value}-${index}`} className="border-t border-line"><td className="py-1">{dateLabel(point.at)}</td><td className="py-1 font-mono">{point.value.toLocaleString()}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** An area-backed performance line. Personal bests are filled; every point remains keyboard accessible. */
export function LineChart(props: ChartProps) {
  const { points } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const [lo, hi] = yRange(points.map((point) => point.value), false);
  const plotWidth = W - PAD.left - PAD.right;
  const x = (index: number) => PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => PAD.top + PLOT_H - ((value - lo) / (hi - lo)) * PLOT_H;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)} Z`;
  return (
    <Frame {...props} lo={lo} hi={hi} selected={selected} setSelected={setSelected}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={props.featured ? 3.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={`${point.at}-${point.value}-${index}`}>
          {point.best && <circle cx={x(index)} cy={y(point.value)} r="8" fill="var(--color-accent)" opacity="0.12" />}
          <circle cx={x(index)} cy={y(point.value)} r={point.best ? 5 : 4} fill={point.best ? 'var(--color-accent)' : 'var(--color-surface)'} stroke="var(--color-accent)" strokeWidth="2" />
          <circle cx={x(index)} cy={y(point.value)} r="14" fill="transparent" tabIndex={0} role="img" aria-label={`${dateLabel(point.at)}: ${point.value} ${props.unit}${point.best ? ', new best' : ''}`} onPointerEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} onClick={() => setSelected(index)} className="outline-none" />
        </g>
      ))}
    </Frame>
  );
}

/** Bars from a zero baseline, with a full-height hit target for touch and keyboard users. */
export function BarChart(props: ChartProps) {
  const { points } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const [, hi] = yRange(points.map((point) => point.value), true);
  const plotWidth = W - PAD.left - PAD.right;
  const slot = plotWidth / points.length;
  const barWidth = Math.max(5, Math.min(30, slot - 5));
  const baseline = PAD.top + PLOT_H;
  const radius = 4;
  return (
    <Frame {...props} lo={0} hi={hi} selected={selected} setSelected={setSelected}>
      {points.map((point, index) => {
        const height = Math.max(0, (point.value / hi) * PLOT_H);
        const x = PAD.left + index * slot + (slot - barWidth) / 2;
        const top = baseline - height;
        const rounded = Math.min(radius, height, barWidth / 2);
        const path = height <= 0 ? '' : `M${x},${baseline} V${top + rounded} Q${x},${top} ${x + rounded},${top} H${x + barWidth - rounded} Q${x + barWidth},${top} ${x + barWidth},${top + rounded} V${baseline} Z`;
        return (
          <g key={`${point.at}-${point.value}-${index}`}>
            {path && <path d={path} fill="var(--color-accent)" opacity={selected === null || selected === index ? 1 : 0.4} />}
            <rect x={PAD.left + index * slot} y={PAD.top} width={slot} height={PLOT_H} fill="transparent" tabIndex={0} role="img" aria-label={`Week of ${dateLabel(point.at)}: ${point.value} ${props.unit}`} onPointerEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} onClick={() => setSelected(index)} className="outline-none" />
          </g>
        );
      })}
    </Frame>
  );
}

/** A compact decorative trend for a metric tile; the adjacent number supplies the accessible value. */
export function Sparkline({ points, bars = false, tone = 'accent' }: { points: TrendPoint[]; bars?: boolean; tone?: 'accent' | 'ok' | 'gold' }) {
  const values = points.map((point) => point.value);
  const color = tone === 'ok' ? 'var(--color-ok)' : tone === 'gold' ? 'var(--color-gold-ink)' : 'var(--color-accent)';
  if (!values.length) return <div className="h-9 rounded-lg bg-sunk/70" aria-hidden />;
  const width = 120;
  const height = 34;
  const max = Math.max(...values, 1);
  const min = bars ? 0 : Math.min(...values);
  const span = max - min || 1;
  const x = (index: number) => values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
  const y = (value: number) => 4 + (height - 8) - ((value - min) / span) * (height - 8);
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 block h-9 w-full" aria-hidden>
      {bars ? values.map((value, index) => {
        const slot = width / values.length;
        const barHeight = Math.max(value > 0 ? 2 : 0, (value / max) * (height - 5));
        return <rect key={index} x={index * slot + 2} y={height - barHeight} width={Math.max(2, slot - 4)} height={barHeight} rx="2" fill={color} opacity={0.82} />;
      }) : <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

export interface RepLoadPoint {
  reps: number;
  load: number;
  at: number;
  week: number;
}

/** A visual strength profile: each point is an actually recorded best load for that achieved rep count. */
export function RepLoadChart({ points, unit, title }: { points: RepLoadPoint[]; unit: string; title: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!points.length) return <EmptyChart label="Record a completed top set and your rep-strength profile will grow here." kind="points" />;
  const sorted = [...points].sort((a, b) => a.reps - b.reps);
  const [lo, hi] = yRange(sorted.map((point) => point.load), false);
  const plotWidth = W - PAD.left - PAD.right;
  const x = (reps: number) => PAD.left + ((reps - 1) / 9) * plotWidth;
  const y = (load: number) => PAD.top + PLOT_H - ((load - lo) / (hi - lo)) * PLOT_H;
  const active = selected === null ? null : sorted[selected];
  const path = sorted.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.reps)},${y(point.load)}`).join(' ');
  return (
    <figure className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-gold/10 to-surface">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${sorted.length} recorded rep bests`} className="block h-auto w-full" onPointerLeave={() => setSelected(null)}>
          {[lo, (lo + hi) / 2, hi].map((tick) => {
            const yy = y(tick);
            return <g key={tick}><line x1={PAD.left} x2={W - PAD.right} y1={yy} y2={yy} stroke="var(--color-line)" strokeDasharray="3 4" /><text x={PAD.left - 7} y={yy + 3} textAnchor="end" fontSize="9" fontWeight="600" fill="var(--color-muted)">{compact(tick)}</text></g>;
          })}
          {Array.from({ length: 10 }, (_, index) => index + 1).map((reps) => <text key={reps} x={x(reps)} y={H - 13} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--color-muted)">{reps}</text>)}
          <path d={path} fill="none" stroke="var(--color-gold-ink)" strokeWidth="2.5" strokeDasharray="5 4" strokeLinejoin="round" />
          {sorted.map((point, index) => (
            <g key={point.reps}>
              <line x1={x(point.reps)} x2={x(point.reps)} y1={y(point.load)} y2={PAD.top + PLOT_H} stroke="var(--color-gold)" strokeWidth="2" opacity="0.35" />
              <circle cx={x(point.reps)} cy={y(point.load)} r="6" fill="var(--color-gold)" stroke="var(--color-surface)" strokeWidth="2" />
              <circle cx={x(point.reps)} cy={y(point.load)} r="15" fill="transparent" tabIndex={0} role="img" aria-label={`${point.reps} reps: ${point.load} ${unit}, week ${point.week}`} onPointerEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} onClick={() => setSelected(index)} className="outline-none" />
            </g>
          ))}
          <text x={W / 2} y={H - 2} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--color-ink-2)">ACHIEVED REPS</text>
        </svg>
        {active && <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-line bg-surface/95 px-2 py-1 text-right shadow-sm"><strong className="block font-mono text-sm">{active.load} {unit} × {active.reps}</strong><span className="text-[10px] font-bold uppercase text-muted">Week {active.week} · {dateLabel(active.at)}</span></div>}
      </div>
      <figcaption className="text-xs text-ink-2" aria-live="polite">{active ? `${active.reps} reps at ${active.load} ${unit}, recorded ${dateLabel(active.at)}.` : 'Tap a recorded point for its load and date. Dashed spans connect recorded rep bests only.'}</figcaption>
      <details>
        <summary className="min-h-9 cursor-pointer text-xs font-bold text-muted">Show exact records</summary>
        <table className="mt-1 w-full text-xs"><thead><tr className="text-left text-muted"><th className="py-1">Reps</th><th className="py-1">Load</th><th className="py-1">Date</th></tr></thead><tbody>{[...sorted].reverse().map((point) => <tr key={point.reps} className="border-t border-line"><td className="py-1 font-mono">{point.reps}</td><td className="py-1 font-mono">{point.load} {unit}</td><td className="py-1">{dateLabel(point.at)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/** A graphical empty state that preserves the future shape of the dashboard. */
export function EmptyChart({ label, kind = 'line' }: { label: string; kind?: 'line' | 'bars' | 'points' }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-sunk/45 p-4">
      <svg viewBox="0 0 300 90" className="block w-full" aria-hidden>
        <line x1="8" x2="292" y1="74" y2="74" stroke="var(--color-line)" />
        {kind === 'bars' ? [28, 48, 36, 64, 54, 76].map((height, index) => <rect key={index} x={24 + index * 44} y={74 - height} width="24" height={height} rx="4" fill="var(--color-accent)" opacity={0.14 + index * 0.025} />) : (
          <>
            <path d="M12,68 L64,56 L112,61 L166,38 L218,43 L288,18" fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={kind === 'points' ? '5 7' : undefined} opacity="0.22" />
            {[12, 64, 112, 166, 218, 288].map((x, index) => <circle key={x} cx={x} cy={[68, 56, 61, 38, 43, 18][index]} r="5" fill="var(--color-accent)" opacity="0.24" />)}
          </>
        )}
      </svg>
      <p className="mt-2 text-center text-xs font-medium text-muted">{label}</p>
    </div>
  );
}
