import { Fragment, useId, type ReactNode } from 'react';
import type { Gender } from '../types';
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup, type MuscleIntensityMap } from '../engine/muscles';

type View = 'front' | 'back';

function muscleShapes(group: MuscleGroup, view: View): ReactNode {
  if (view === 'front') {
    switch (group) {
      case 'chest': return <><ellipse cx="420" cy="370" rx="105" ry="78" /><ellipse cx="604" cy="370" rx="105" ry="78" /></>;
      case 'front_delts': return <><ellipse cx="314" cy="348" rx="68" ry="82" /><ellipse cx="710" cy="348" rx="68" ry="82" /></>;
      case 'side_delts': return <><ellipse cx="270" cy="365" rx="48" ry="85" /><ellipse cx="754" cy="365" rx="48" ry="85" /></>;
      case 'traps': return <path d="M395 274 L512 205 L629 274 L680 325 L590 306 L512 346 L434 306 L344 325 Z" />;
      case 'lats': return <><path d="M340 420 L425 445 L420 650 L335 705 L305 540 Z" /><path d="M684 420 L599 445 L604 650 L689 705 L719 540 Z" /></>;
      case 'biceps': return <><ellipse cx="270" cy="510" rx="48" ry="105" /><ellipse cx="754" cy="510" rx="48" ry="105" /></>;
      case 'triceps': return <><ellipse cx="225" cy="510" rx="35" ry="105" /><ellipse cx="799" cy="510" rx="35" ry="105" /></>;
      case 'forearms': return <><path d="M205 585 L285 600 L235 795 L145 755 Z" /><path d="M819 585 L739 600 L789 795 L879 755 Z" /></>;
      case 'abs': return <path d="M415 420 Q512 390 609 420 L590 705 Q512 770 434 705 Z" />;
      case 'obliques': return <><path d="M340 445 L430 470 L425 700 L350 740 L310 585 Z" /><path d="M684 445 L594 470 L599 700 L674 740 L714 585 Z" /></>;
      case 'hip_abductors': return <><ellipse cx="374" cy="745" rx="68" ry="90" /><ellipse cx="650" cy="745" rx="68" ry="90" /></>;
      case 'hip_adductors': return <><path d="M455 720 L510 735 L492 1040 L430 930 Z" /><path d="M569 720 L514 735 L532 1040 L594 930 Z" /></>;
      case 'quads': return <><ellipse cx="409" cy="880" rx="88" ry="205" /><ellipse cx="615" cy="880" rx="88" ry="205" /></>;
      case 'calves': return <><ellipse cx="429" cy="1210" rx="58" ry="185" /><ellipse cx="595" cy="1210" rx="58" ry="185" /></>;
      default: return null;
    }
  }
  switch (group) {
    case 'side_delts': return <><ellipse cx="292" cy="350" rx="62" ry="84" /><ellipse cx="732" cy="350" rx="62" ry="84" /></>;
    case 'rear_delts': return <><ellipse cx="333" cy="365" rx="73" ry="72" /><ellipse cx="691" cy="365" rx="73" ry="72" /></>;
    case 'traps': return <path d="M410 245 L512 175 L614 245 L665 365 L560 540 L512 650 L464 540 L359 365 Z" />;
    case 'lats': return <><path d="M330 405 L465 440 L470 690 L355 650 L300 500 Z" /><path d="M694 405 L559 440 L554 690 L669 650 L724 500 Z" /></>;
    case 'upper_back': return <><ellipse cx="420" cy="420" rx="100" ry="105" /><ellipse cx="604" cy="420" rx="100" ry="105" /></>;
    case 'triceps': return <><ellipse cx="259" cy="500" rx="48" ry="112" /><ellipse cx="765" cy="500" rx="48" ry="112" /></>;
    case 'forearms': return <><path d="M210 580 L282 600 L235 790 L150 750 Z" /><path d="M814 580 L742 600 L789 790 L874 750 Z" /></>;
    case 'obliques': return <><path d="M345 520 L420 540 L430 690 L350 720 L315 610 Z" /><path d="M679 520 L604 540 L594 690 L674 720 L709 610 Z" /></>;
    case 'spinal_erectors': return <><path d="M460 420 L505 405 L500 730 L455 705 Z" /><path d="M564 420 L519 405 L524 730 L569 705 Z" /></>;
    case 'glutes': return <><ellipse cx="423" cy="760" rx="105" ry="130" /><ellipse cx="601" cy="760" rx="105" ry="130" /></>;
    case 'hip_abductors': return <><ellipse cx="343" cy="755" rx="50" ry="105" /><ellipse cx="681" cy="755" rx="50" ry="105" /></>;
    case 'hip_adductors': return <><path d="M455 835 L508 835 L490 1080 L430 985 Z" /><path d="M569 835 L516 835 L534 1080 L594 985 Z" /></>;
    case 'hamstrings': return <><ellipse cx="420" cy="945" rx="82" ry="190" /><ellipse cx="604" cy="945" rx="82" ry="190" /></>;
    case 'calves': return <><ellipse cx="426" cy="1220" rx="62" ry="188" /><ellipse cx="598" cy="1220" rx="62" ry="188" /></>;
    default: return null;
  }
}

/** Light work reads yellow, moderate work orange, the hardest-worked muscle red. */
const HEAT_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [1, [255, 225, 77]],
  [50, [255, 154, 31]],
  [100, [224, 48, 30]],
];
function heatRgb(intensity: number): [number, number, number] {
  const value = Math.min(100, Math.max(1, intensity));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [endAt, end] = HEAT_STOPS[i];
    const [startAt, start] = HEAT_STOPS[i - 1];
    if (value <= endAt) {
      const t = (value - startAt) / (endAt - startAt);
      return [0, 1, 2].map((c) => Math.round(start[c] + (end[c] - start[c]) * t)) as [number, number, number];
    }
  }
  return [...HEAT_STOPS[HEAT_STOPS.length - 1][1]] as [number, number, number];
}

function MuscleView({ gender, view, muscles, id }: { gender: Gender; view: View; muscles: MuscleIntensityMap; id: string }) {
  // Relative to the app's base, so it also works when the site is served from a subfolder such as GitHub Pages.
  const source = `${import.meta.env.BASE_URL}anatomy/${gender}-${view}.png`;
  const worked = MUSCLE_GROUPS.filter((group) => muscles[group]);
  return (
    <div className="min-w-0 flex-1 text-center">
      <svg viewBox="0 0 1024 1536" className="mx-auto h-48 max-h-[42vw] w-auto max-w-full" aria-hidden="true">
        <defs>
          <filter id={`${id}-${view}-neutral`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
          </filter>
          {worked.map((group) => (
            <clipPath id={`${id}-${view}-${group}`} key={group}>{muscleShapes(group, view)}</clipPath>
          ))}
          {/* The figure is flat orange with dark outlines, so its red channel is "how much fill". Scaling it by a colour recolours the fill and keeps the outlines. */}
          {worked.map((group) => {
            const [r, g, b] = heatRgb(muscles[group] ?? 0);
            return (
              <filter id={`${id}-${view}-${group}-heat`} key={group} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values={`${r / 255} 0 0 0 0  ${g / 255} 0 0 0 0  ${b / 255} 0 0 0 0  0 0 0 1 0`} />
              </filter>
            );
          })}
        </defs>
        <image href={source} width="1024" height="1536" preserveAspectRatio="xMidYMid meet" filter={`url(#${id}-${view}-neutral)`} opacity="0.34" />
        {/* One layer per muscle, coloured by its intensity from yellow (light) through orange to red (hardest). */}
        {worked.map((group) => (
          <image key={group} href={source} width="1024" height="1536" preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id}-${view}-${group})`} filter={`url(#${id}-${view}-${group}-heat)`} opacity="0.95" />
        ))}
      </svg>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{view}</span>
    </div>
  );
}

export function AnatomyMap({ gender, muscles }: { gender: Gender; muscles: MuscleIntensityMap }) {
  const id = `anatomy-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const worked = MUSCLE_GROUPS
    .filter((group) => muscles[group])
    .sort((a, b) => Number(muscles[b]) - Number(muscles[a]));
  const band = (value: number) => (value >= 67 ? 'high' : value >= 34 ? 'medium' : 'low');
  if (!worked.length) return null;
  const description = worked.map((group) => `${MUSCLE_LABELS[group]} ${band(muscles[group] ?? 0)}`).join(', ');
  return (
    <figure className="mt-3 rounded-2xl border border-line bg-sunk/60 px-3 py-2" role="img" aria-label={`Muscles worked: ${description}`}>
      <div className="flex items-center justify-between gap-3">
        <figcaption className="eyebrow">Muscles worked</figcaption>
        <div className="flex items-center gap-1 text-[10px] font-bold text-muted" aria-hidden="true">
          <span>Low</span><span className="h-2 w-16 rounded-full bg-gradient-to-r from-[#ffe14d] via-[#ff9a1f] to-[#e0301e]" /><span>High</span>
        </div>
      </div>
      <div className="mx-auto mt-1 flex max-w-[18rem] items-end justify-center gap-2">
        <MuscleView gender={gender} view="front" muscles={muscles} id={id} />
        <MuscleView gender={gender} view="back" muscles={muscles} id={id} />
      </div>
    </figure>
  );
}
