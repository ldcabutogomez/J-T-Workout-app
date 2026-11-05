import type { Gender, UserProfile } from '../types';

/** One-time migration gate for profiles created before workout muscle maps existed. */
export function GenderPrompt({ profile, onChoose }: { profile: UserProfile; onChoose: (gender: Gender) => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-labelledby="gender-title">
      <section className="card w-full max-w-sm p-5 shadow-2xl">
        <p className="eyebrow">One quick update</p>
        <h1 id="gender-title" className="mt-1 text-2xl font-black">Choose your gender</h1>
        <p className="mt-2 text-sm text-ink-2">This selects the matching male or female anatomy figure for muscle maps attached to {profile.name}&apos;s shared workouts.</p>
        <div className="mt-5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Gender">
          {([['female', 'Female'], ['male', 'Male']] as const).map(([gender, label]) => (
            <button key={gender} type="button" role="radio" aria-checked={false} onClick={() => onChoose(gender)} className="btn-secondary min-h-14 text-base">{label}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
