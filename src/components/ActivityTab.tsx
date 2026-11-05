import { useState } from 'react';
import { Heart, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { CommunityState } from '../sync/useCommunity';
import { COMMENT_MAX, type FeedItem } from '../sync/community';
import { Avatar } from './Avatar';
import { AnatomyMap } from './AnatomyMap';

function ago(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(ms).toLocaleDateString();
}

function Thread({ community, item }: { community: CommunityState; item: FeedItem }) {
  const [text, setText] = useState('');
  const list = community.comments[item.id];
  const submit = () => { if (text.trim()) { community.comment(item.id, text); setText(''); } };
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-2">
      {list === undefined && <p className="text-xs text-muted">Loading comments…</p>}
      {list?.length === 0 && <p className="text-xs text-muted">No comments yet.</p>}
      {list?.map((c) => (
        <div key={c.id} className="flex items-start justify-between gap-2">
          <p className="text-xs text-ink min-w-0 break-words"><span className="font-black">{c.name}</span> {c.body} <span className="text-muted">{ago(c.createdAt)}</span></p>
          {c.userId === community.userId && (
            <button onClick={() => community.removeComment(item.id, c.id)} aria-label="Delete your comment" className="shrink-0 text-muted"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" className="bg-paper border border-line rounded-xl px-3 py-2 text-sm text-ink flex-1 min-w-0" />
        <button type="submit" disabled={!text.trim()} className="px-3 py-2 rounded-xl text-xs font-black bg-accent text-on-accent disabled:opacity-50">Post</button>
      </form>
    </div>
  );
}

function Card({ item, community }: { item: FeedItem; community: CommunityState }) {
  const [open, setOpen] = useState(false);
  const s = item.summary;
  const mine = item.userId === community.userId;
  return (
    <article className="card p-4">
      <div className="flex items-center gap-2.5">
        <Avatar profile={{ id: item.userId, name: item.name }} size={36} decorative />
        <div className="min-w-0 flex-1">
          <p className="font-black text-ink text-sm truncate">{item.name}</p>
          <p className="text-xs text-muted">{ago(item.createdAt)}</p>
        </div>
        {mine && (
          <button onClick={() => { if (window.confirm('Delete this post from Activity? Your workout stays on this phone.')) community.deletePost(item.id); }} aria-label="Delete your post" className="p-2 text-muted"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>
      {s.kind === 'run' ? (
        <>
          <p className="eyebrow mt-3">Run</p>
          <p className="font-black text-ink text-xl mt-0.5">{s.distance}</p>
          <p className="text-xs text-muted">{s.duration} · {s.pace}{s.effort !== undefined ? ` · effort ${s.effort}/10` : ''}</p>
        </>
      ) : (
        <>
          <p className="eyebrow mt-3">{s.partial ? 'Partial workout' : 'Workout'} · Week {s.week}, Day {s.day}</p>
          <p className="font-black text-ink text-xl mt-0.5">{s.title}</p>
          <div className="mt-1 flex gap-4 text-xs text-muted">
            <span><b className="text-ink">{s.sets}</b> sets</span>
            <span><b className="text-ink">{s.volumeLb.toLocaleString()}</b> lb</span>
            {s.minutes !== null && <span><b className="text-ink">{s.minutes}</b> min</span>}
          </div>
          {s.prs.length > 0 && <p className="text-xs font-black text-accent-ink mt-1.5">PR: {s.prs.join(', ')}</p>}
          {s.muscles && item.gender && <AnatomyMap gender={item.gender} muscles={s.muscles} />}
        </>
      )}
      {s.wrap && <p className="text-sm text-ink mt-3 break-words">{s.wrap}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => community.toggleLike(item.id)}
          aria-pressed={item.likedByMe}
          aria-label={item.likedByMe ? 'Remove like' : 'Like this activity'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${item.likedByMe ? 'bg-accent text-on-accent' : 'bg-sunk text-ink'}`}
        >
          <Heart className="w-4 h-4" fill={item.likedByMe ? 'currentColor' : 'none'} />
          {item.likes > 0 ? item.likes : 'Like'}
        </button>
        <button
          onClick={() => { if (!open && community.comments[item.id] === undefined) community.loadComments(item.id); setOpen(!open); }}
          aria-expanded={open}
          aria-label={open ? 'Hide comments' : 'Show comments'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-sunk text-ink"
        >
          <MessageCircle className="w-4 h-4" />
          {item.commentCount > 0 ? item.commentCount : 'Comment'}
        </button>
      </div>
      {open && <Thread community={community} item={item} />}
    </article>
  );
}

interface ActivityTabProps {
  community: CommunityState;
  memberName: string;
  /** Posts this lifter's past finished workouts and runs. Resolves with how many were sent. */
  onShareHistory: () => Promise<number>;
}

export function ActivityTab({ community, memberName, onShareHistory }: ActivityTabProps) {
  const [email, setEmail] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [sharing, setSharing] = useState(false);
  const input = 'bg-paper border border-line rounded-xl px-3 py-2 text-sm text-ink';
  const button = 'px-3 py-2 rounded-xl text-xs font-black';

  if (!community.configured) {
    return (
      <section className="card p-4">
        <p className="font-black text-ink text-sm">Activity is not set up</p>
        <p className="text-xs text-muted mt-1">This build has no backend configured. See the README to turn on accounts and the activity feed.</p>
      </section>
    );
  }

  if (!community.signedIn) {
    return (
      <section className="card p-4 space-y-3">
        <div>
          <p className="font-black text-ink text-sm">Join the community</p>
          <p className="text-xs text-muted mt-1">Sign in with your email to see everyone's workouts and runs, like them and comment. You share stats, worked muscle groups, a short wrap-up and your comments, as {memberName || 'your profile name'}. Exercise lists, set-by-set logs and notes stay on this phone.</p>
        </div>
        {community.linkSentTo ? (
          <p className="text-xs text-ink">Check {community.linkSentTo} for a sign-in link. It comes from Supabase, our sign-in provider, so also check spam. Open it on this phone, in this same app.</p>
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

  const items = filter === 'mine' ? community.feed.filter((item) => item.userId === community.userId) : community.feed;
  const share = async () => {
    if (!window.confirm('Post or refresh your last 20 finished workouts and 20 runs in Activity? Existing posts keep their likes and comments while workout muscle maps are updated. Notes, exercise lists and set logs are not shared.')) return;
    setSharing(true);
    try { await onShareHistory(); } finally { setSharing(false); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Filter activity">
          {(['all', 'mine'] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`${button} ${filter === value ? 'bg-accent text-on-accent' : 'bg-sunk text-ink'}`}>{value === 'all' ? 'Everyone' : 'Mine'}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={community.refresh} disabled={community.busy} className={`${button} bg-sunk text-ink inline-flex items-center gap-1`} aria-label="Refresh activity">
            <RefreshCw className={`w-3.5 h-3.5 ${community.busy ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      {community.error && <p className="text-xs text-bad">{community.error}</p>}
      {items.length === 0 && !community.busy && (
        <div className="card p-4 space-y-2">
          <p className="text-xs text-muted">{filter === 'mine' ? 'You have not posted yet.' : 'No activity yet.'} Finish a workout or log a run and it shows up here.</p>
          <button onClick={() => void share()} disabled={sharing} className={`${button} bg-accent text-on-accent`}>{sharing ? 'Refreshing…' : 'Share my history'}</button>
        </div>
      )}
      {items.map((item) => <Card key={item.id} item={item} community={community} />)}
      <div className="flex items-center justify-between pt-1">
        {items.length > 0 ? <button onClick={() => void share()} disabled={sharing} className="text-xs text-muted underline">{sharing ? 'Refreshing…' : 'Refresh shared history'}</button> : <span />}
        <button onClick={() => { if (window.confirm('Sign out of the community? Your data stays on this phone.')) community.signOut(); }} className="text-xs text-muted underline">Sign out{community.email ? ` (${community.email})` : ''}</button>
      </div>
    </section>
  );
}
