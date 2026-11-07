import { RADAR_REGIONS, type RadarRegion } from '../engine/muscleDistribution';

const point = (index: number, radius: number, center = 110) => {
  const angle = -Math.PI / 2 + index * Math.PI / 3;
  return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius] as const;
};
const polygon = (radius: number) => RADAR_REGIONS.map((_, index) => point(index, radius).join(',')).join(' ');

export function MuscleRadarChart({ values, unit }: { values: Record<RadarRegion, number>; unit: string }) {
  const max = Math.max(1, ...Object.values(values));
  const data = RADAR_REGIONS.map((region, index) => point(index, 82 * values[region] / max).join(',')).join(' ');
  return (
    <section className="card p-5">
      <p className="eyebrow">Muscle distribution</p><h2 className="text-xl font-black">Training volume balance</h2>
      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[15rem_1fr]">
        <svg viewBox="0 0 220 220" role="img" aria-label={`Muscle training volume radar: ${RADAR_REGIONS.map((region) => `${region} ${values[region]} ${unit}`).join(', ')}`} className="mx-auto w-full max-w-60 overflow-visible">
          {[27, 54, 82].map((radius) => <polygon key={radius} points={polygon(radius)} fill="none" stroke="var(--color-line)" strokeWidth="1" />)}
          {RADAR_REGIONS.map((_, index) => { const [x, y] = point(index, 82); return <line key={index} x1="110" y1="110" x2={x} y2={y} stroke="var(--color-line)" />; })}
          <polygon points={data} fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" stroke="var(--color-accent)" strokeWidth="3" />
          {RADAR_REGIONS.map((region, index) => { const [x, y] = point(index, 102); return <text key={region} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="var(--color-ink-2)" fontSize="9" fontWeight="700">{region}</text>; })}
        </svg>
        <dl className="grid grid-cols-2 gap-2">{RADAR_REGIONS.map((region) => <div key={region} className="rounded-xl bg-sunk p-2"><dt className="text-xs font-bold text-muted">{region}</dt><dd className="font-mono text-lg font-black text-ink">{values[region].toLocaleString()} <span className="text-xs text-muted">{unit}</span></dd></div>)}</dl>
      </div>
    </section>
  );
}
