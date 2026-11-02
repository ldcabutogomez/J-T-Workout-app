import type { UserProfile } from '../types';
import { THEMES, themeForProfile } from '../lib/theme';
import { Avatar } from './Avatar';

/** Shown once per phone. The choice locks the phone to that person, so "Lauren is Lauren". */
export function WhoUsesPhone({ profiles, onPick }: { profiles: UserProfile[]; onPick: (profileId: string) => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-10" aria-labelledby="who-heading">
      <div className="text-center">
        <p className="font-display text-lg font-black text-accent-ink">J&amp;T 2.0</p>
        <h1 id="who-heading" className="mt-2 text-3xl font-black">Who uses this phone?</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Pick once. This phone then stays yours, with your own workouts, theme and partner link. You can change it later in Settings.</p>
      </div>
      <div className="grid gap-3">
        {profiles.map((profile) => {
          const accent = THEMES[themeForProfile(profile)].accent;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onPick(profile.id)}
              className="card flex min-h-20 items-center gap-4 border-2 p-4 text-left active:scale-[0.99]"
              style={{ borderColor: accent }}
            >
              <Avatar profile={profile} size={56} decorative />
              <span className="min-w-0">
                <span className="block font-display text-2xl font-black text-ink">{profile.name}</span>
                <span className="block text-xs text-muted">Week {profile.currentWeek} · Day {profile.currentDay}</span>
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
