import { useState } from 'react';
import type { TrendPoint } from '../../engine/trends';

const W = 320;
const H = 170;
const PAD = { left: 40, right: 12, top: 12, bottom: 24 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const dateLabel = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** A "nice" y range that always includes the data and, for lines, doesn't start at zero when the data sits well above it. */
function yRange(values: number[], fromZero: boolean): [number, number] {
  const max = Math.max(...values);
  const min = fromZero ? 0 : Math.min(...values);
  const span = max - min || max || 1;
  const pad = fromZero ? span * 0.08 : span * 0.15;
  return [Math.max(0, fromZero ? 0 : min - pad), max + pad];
}

interface ChartProps {
  points: TrendPoint[];
  /** What the numbers are, used in the label read out for each point ("lb e1RM"). */
  unit: string;
  /** Names the chart for screen readers and the table. */
  title: string;
}

function Frame({ title, unit, points, children, lo, hi, selected, setSelected }: ChartProps & { children: React.ReactNode; lo: number; hi: number; selected: number | null; setSelected: (i: number | null) => void }) {
  const ticks = [lo, (lo + hi) / 2, hi];
  const active = selected !== null ? points[selected] : null;
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.length} points, from ${compact(points[0].value)} to ${compact(points[points.length - 1].value)} ${unit}`} className="w-full h-auto" onPointerLeave={() => setSelected(null)}>
        {ticks.map((tick) => {
          const y = PAD.top + PLOT_H - ((tick - lo) / (hi - lo)) * PLOT_H;
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-muted)">{compact(tick)}</text>
            </g>
          );
        })}
        <text x={PAD.left} y={H - 6} fontSize="9" fill="var(--color-muted)">{dateLabel(points[0].at)}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="9" textAnchor="end" fill="var(--color-muted)">{dateLabel(points[points.length - 1].at)}</text>
        {children}
      </svg>
      <figcaption className="min-h-5 text-xs text-ink-2" aria-live="polite">
        {active ? `${dateLabel(active.at)}: ${active.value.toLocaleString()} ${unit}${active.best ? ' (best so far)' : ''}` : 'Tap or hover a point for its value.'}
      </figcaption>
      <details>
        <summary className="min-h-9 cursor-pointer text-xs font-bold text-muted">Show as table</summary>
        <table className="mt-1 w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1 font-bold">Date</th><th className="py-1 font-bold">{unit}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.at} className="border-t border-line"><td className="py-1">{dateLabel(p.at)}</td><td className="py-1 font-mono">{p.value.toLocaleString()}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** A single-series line over time. Thin line, markers with a surface ring, personal bests filled; a table view alongside. */
export function LineChart(props: ChartProps) {
  const { points } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const [lo, hi] = yRange(points.map((p) => p.value), false);
  const x = (i: number) => PAD.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W);
  const y = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <Frame {...props} lo={lo} hi={hi} selected={selected} setSelected={setSelected}>
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.at}>
          <circle cx={x(i)} cy={y(p.value)} r="4.5" fill={p.best ? 'var(--color-accent)' : 'var(--color-surface)'} stroke={p.best ? 'var(--color-surface)' : 'var(--color-accent)'} strokeWidth="2" />
          <circle cx={x(i)} cy={y(p.value)} r="14" fill="transparent" tabIndex={0} role="img" aria-label={`${dateLabel(p.at)}: ${p.value} ${props.unit}`} onPointerEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)} className="outline-none" />
        </g>
      ))}
    </Frame>
  );
}

/** Bars from a zero baseline, rounded at the data end only, with a gap between neighbours. */
export function BarChart(props: ChartProps) {
  const { points } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const [, hi] = yRange(points.map((p) => p.value), true);
  const slot = PLOT_W / points.length;
  const barW = Math.max(4, Math.min(28, slot - 6));
  const baseline = PAD.top + PLOT_H;
  const r = 3;
  return (
    <Frame {...props} lo={0} hi={hi} selected={selected} setSelected={setSelected}>
      {points.map((p, i) => {
        const h = Math.max(0, (p.value / hi) * PLOT_H);
        const x0 = PAD.left + i * slot + (slot - barW) / 2;
        const top = baseline - h;
        const rr = Math.min(r, h, barW / 2);
        const d = h <= 0 ? '' : `M${x0},${baseline} V${top + rr} Q${x0},${top} ${x0 + rr},${top} H${x0 + barW - rr} Q${x0 + barW},${top} ${x0 + barW},${top + rr} V${baseline} Z`;
        return (
          <g key={p.at}>
            {d && <path d={d} fill="var(--color-accent)" opacity={selected === null || selected === i ? 1 : 0.55} />}
            <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={PLOT_H} fill="transparent" tabIndex={0} role="img" aria-label={`Week of ${dateLabel(p.at)}: ${p.value} ${props.unit}`} onPointerEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)} className="outline-none" />
          </g>
        );
      })}
    </Frame>
  );
}
