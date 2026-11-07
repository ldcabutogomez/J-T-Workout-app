import { ExternalLink } from 'lucide-react';
import { guideFor } from '../program/exerciseGuides';

export function ExerciseHowTo({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const guide = guideFor(exerciseId, exerciseName);
  return (
    <details className="rounded-xl border border-line bg-paper/70 px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-black uppercase tracking-wider text-accent-ink">How to perform {exerciseName}</summary>
      <div className="space-y-3 pb-3 text-sm text-ink-2">
        {guide.demo && <figure className="rounded-xl bg-surface p-2 text-center"><img loading="lazy" decoding="async" src={guide.demo.url} alt={guide.demo.alt} className="mx-auto max-h-52 rounded-lg object-contain" /><figcaption className="mt-1 text-[10px] text-muted"><a href={guide.demo.creditUrl} target="_blank" rel="noreferrer" className="underline">{guide.demo.credit}</a></figcaption></figure>}
        <GuideList title="Setup" items={guide.setup} /><GuideList title="Movement" items={guide.execution} /><GuideList title="Cues" items={guide.cues} /><GuideList title="Common mistakes" items={guide.mistakes} />
        <a href={guide.videoUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full"><ExternalLink className="h-4 w-4" />Watch suggested video</a>
        <p className="text-xs text-muted">General technique guidance only. Use a qualified coach or clinician for individualized advice.</p>
      </div>
    </details>
  );
}

function GuideList({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="text-xs font-black uppercase tracking-wider text-muted">{title}</h3><ul className="mt-1 list-disc space-y-1 pl-5">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
