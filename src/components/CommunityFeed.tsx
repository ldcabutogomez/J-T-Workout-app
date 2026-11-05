import { useState } from 'react';
import { Heart, RefreshCw } from 'lucide-react';
import type { CommunityState } from '../sync/useCommunity';
import type { FeedItem } from '../sync/community';

function ago(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function Card({ item, onLike }: { item: FeedItem; onLike: () => void }) {
  const s = item.summary;
  return (
    <article className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-black text-ink text-sm truncate">{item.name}</p>
        <p className="text-xs text-muted shrink-0">{ago(item.createdAt)}</p>
      </div>
      {s.kind === 'run' ? (
        <>
          <p className="text-xs text-muted mt-1">Run</p>
          <p className="font-black text-ink text-lg mt-0.5">{s.distance}</p>
          <p className="text-xs text-muted">{s.duration} · {s.pace}{s.effort !== undefined ? ` · effort ${s.effort}/10` : ''}</p>
        </>
      ) : (
        <>
          <p className="text-xs text-muted mt-1">{s.partial ? 'Partial workout' : 'Workout'} · Week {s.week}, Day {s.day}</p>
          <p className="font-black text-ink text-lg mt-0.5">{s.title}</p>
          <p className="text-xs text-muted">{s.sets} sets · {s.volumeLb.toLocaleString()} lb{s.minutes !== null ? ` · ${s.minutes} min` : ''}</p>
          {s.prs.length > 0 && <p className="text-xs font-black text-accent-ink mt-1">PR: {s.prs.join(', ')}</p>}
        </>
      )}
      <button
        onClick={onLike}
        aria-pressed={item.likedByMe}
        aria-label={item.likedByMe ? 'Remove like' : 'Like this activity'}
        className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${item.likedByMe ? 'bg-accent text-on-accent' : 'bg-sunk text-ink'}`}
      >
        <Heart className="w-4 h-4" fill={item.likedByMe ? 'currentColor' : 'none'} />
        {item.likes > 0 ? item.likes : 'Like'}
      </button>
    </article>
  );
}

export function CommunityFeed({ community, memberName }: { community: CommunityState; memberName: string }) {
  const [email, setEmail] = useState('');
  const input = 'bg-paper border border-line rounded-xl px-3 py-2 text-sm text-ink';
  const button = 'px-3 py-2 rounded-xl text-xs font-black';

  if (!community.configured) return null;

  if (!community.signedIn) {
    return (
      <section className="card p-4 space-y-3">
        <div>
          <p className="font-black text-ink text-sm">Join the community</p>
          <p className="text-xs text-muted mt-1">Sign in with your email to join everyone on one leaderboard and see each other's workouts and runs. You share stats only (sessions, volume, PRs, run distance and pace), as {memberName || 'your profile name'}. Set-by-set logs and notes stay on this phone.</p>
        </div>
        {community.linkSentTo ? (
          <p className="text-xs text-ink">Check {community.linkSentTo} for a sign-in link, then open it on this phone.</p>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (email.includes('@')) void community.signIn(email); }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`${input} flex-1 min-w-0`} aria-label="Email" />
            <button type="submit" className={`${button} bg-accent text-on-accent`}>Email me a link</button>
          </form>
        )}
        {community.error && <p className="text-xs text-bad">{community.error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black text-ink text-sm uppercase tracking-wide">Activity</h2>
        <div className="flex items-center gap-2">
          <button onClick={community.refresh} disabled={community.busy} className={`${button} bg-sunk text-ink inline-flex items-center gap-1`} aria-label="Refresh activity">
            <RefreshCw className={`w-3.5 h-3.5 ${community.busy ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => { if (window.confirm('Sign out of the community? Your data stays on this phone.')) community.signOut(); }} className="text-xs text-muted underline">Sign out</button>
        </div>
      </div>
      {community.error && <p className="text-xs text-bad">{community.error}</p>}
      {community.feed.length === 0 && !community.busy && (
        <p className="card p-4 text-xs text-muted">No activity yet. Finish a workout or log a run and it shows up here for everyone.</p>
      )}
      {community.feed.map((item) => <Card key={item.id} item={item} onLike={() => community.toggleLike(item.id)} />)}
    </section>
  );
}
