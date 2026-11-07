import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Heart, MessageCircle, RefreshCw, Send, Trash2 } from 'lucide-react';
import type { UserProfile } from '../types';
import type { CommunityState } from '../sync/useCommunity';
import { COMMENT_MAX, type FeedItem, type NotificationItem } from '../sync/community';
import { Avatar } from './Avatar';
import { AnatomyMap } from './AnatomyMap';
import type { CloudConfig } from '../sync/cloud';
import { DirectMessages } from './DirectMessages';

function ago(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(ms).toLocaleDateString();
}

function Thread({ community, item, me }: { community: CommunityState; item: FeedItem; me?: UserProfile }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = community.comments[item.id];
  const submit = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    setProblem(null);
    const failure = await community.comment(item.id, text);
    setPosting(false);
    if (failure) setProblem(failure); else setText('');
  };
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      {list === undefined && <p className="text-xs text-muted">Loading comments…</p>}
      {list?.length === 0 && (
        <p className="rounded-2xl bg-sunk/60 px-3 py-3 text-center text-xs text-muted">No comments yet. Say something nice.</p>
      )}
      {list?.map((c) => {
        const mineComment = c.userId === community.userId;
        return (
          <div key={c.id} className="flex items-start gap-2.5">
            <Avatar profile={mineComment && me ? me : { id: c.userId, name: c.name, avatar: c.avatar ? { photo: c.avatar.thumb, color: c.avatar.color } : undefined }} size={28} decorative />
            <div className="min-w-0 flex-1">
              <div className={`rounded-2xl rounded-tl-md px-3 py-2 ${mineComment ? 'bg-accent/10' : 'bg-sunk'}`}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-black text-ink truncate">{c.name}</span>
                  <span className="shrink-0 text-[10px] text-muted">{ago(c.createdAt)}</span>
                </p>
                <p className="mt-0.5 text-sm text-ink break-words whitespace-pre-wrap">{c.body}</p>
              </div>
              {mineComment && (
                <button onClick={() => community.removeComment(item.id, c.id)} aria-label="Delete your comment" className="mt-1 ml-2 inline-flex items-center gap-1 text-[11px] text-muted"><Trash2 className="w-3 h-3" />Delete</button>
              )}
            </div>
          </div>
        );
      })}
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Avatar profile={me ?? { id: community.userId ?? 'me', name: 'You' }} size={28} decorative />
        <input value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" className="bg-sunk/70 border border-line rounded-full px-4 py-2 text-sm text-ink flex-1 min-w-0" />
        <button type="submit" disabled={!text.trim() || posting} aria-label={posting ? 'Posting comment' : 'Post comment'} className="shrink-0 h-9 w-9 rounded-full bg-accent text-on-accent grid place-items-center disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
      {problem && <p role="alert" className="text-xs text-bad">Comment not saved: {problem}</p>}
    </div>
  );
}

function Card({ item, community, me, focusSignal }: { item: FeedItem; community: CommunityState; me?: UserProfile; focusSignal?: number }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // Asked to show this post (a notification was tapped): open its comments, bring it into view and flash it briefly.
  useEffect(() => {
    if (!focusSignal) return;
    setOpen(true);
    community.loadComments(item.id);
    setFlash(true);
    const scroll = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    const stop = window.setTimeout(() => setFlash(false), 2200);
    return () => { window.clearTimeout(scroll); window.clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);
  const s = item.summary;
  const mine = item.userId === community.userId;
  return (
    <article ref={ref} id={`post-${item.id}`} className={`card p-4 transition-shadow duration-500 ${flash ? 'ring-2 ring-accent shadow-lg' : ''}`}>
      <div className="flex items-center gap-2.5">
        <Avatar profile={mine && me ? me : { id: item.userId, name: item.name, avatar: item.avatar ? { photo: item.avatar.thumb, color: item.avatar.color } : undefined }} size={36} decorative />
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
          <p className="eyebrow mt-3">{s.partial ? 'Partial workout' : 'Workout'}{s.custom ? ' · Custom' : ` · Week ${s.week}, Day ${s.day}`}</p>
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
      {open && <Thread community={community} item={item} me={me} />}
    </article>
  );
}

function Notifications({ community, onOpenPost }: { community: CommunityState; onOpenPost: (activityId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const items = community.notifications;
  const push = community.push;
  const toggle = async () => {
    setNote(null);
    if (push.enabled) { await community.disablePush(); return; }
    setNote(await community.enablePush());
  };
  const pushHint = push.support === 'needs-install' ? 'Add the app to your Home Screen to get phone notifications.'
    : push.support === 'denied' ? 'Notifications are blocked. Allow them in your phone settings.'
    : push.support === 'unsupported' ? 'This phone cannot receive notifications here.' : null;
  if (items.length === 0 && push.support === 'not-configured') return null;
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => { const next = !open; setOpen(next); if (next) community.markNotificationsSeen(); }} aria-expanded={open} className="flex items-center gap-2 text-left min-w-0">
          <span className="relative grid h-8 w-8 place-items-center rounded-full bg-sunk text-ink">
            <Bell className="w-4 h-4" />
            {community.unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-on-accent text-[10px] font-black grid place-items-center">{community.unread}</span>}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-ink">{community.unread > 0 ? `${community.unread} new` : 'Notifications'}</span>
            <span className="block text-xs text-muted">{items.length === 0 ? 'Likes and comments on your posts show up here.' : 'Likes and comments on your posts'}</span>
          </span>
        </button>
        {push.support === 'ready' && (
          <button onClick={() => void toggle()} disabled={push.busy} aria-pressed={push.enabled} className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black disabled:opacity-60 ${push.enabled ? 'bg-accent text-on-accent' : 'bg-sunk text-ink'}`}>
            {push.enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}{push.busy ? 'Working…' : push.enabled ? 'Push on' : 'Push off'}
          </button>
        )}
      </div>
      {pushHint && <p className="text-xs text-muted">{pushHint}</p>}
      {note && <p role="alert" className="text-xs text-bad">{note}</p>}
      {open && items.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {items.slice(0, 8).map((item) => <NotificationRow key={item.id} item={item} onOpen={() => onOpenPost(item.activityId)} />)}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const what = item.title ? `your ${item.title} post` : 'your post';
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-2.5 rounded-xl bg-sunk/60 px-3 py-2 text-left active:bg-sunk">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.kind === 'like' ? 'bg-accent text-on-accent' : 'bg-surface text-ink border border-line'}`}>
          {item.kind === 'like' ? <Heart className="w-3 h-3" fill="currentColor" /> : <MessageCircle className="w-3 h-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink break-words"><span className="font-black">{item.actorName}</span> {item.kind === 'like' ? 'liked' : 'commented on'} {what}</span>
          {item.body && <span className="mt-0.5 block text-xs text-muted break-words">&ldquo;{item.body}&rdquo;</span>}
        </span>
        <span className="shrink-0 text-[10px] text-muted">{ago(item.createdAt)}</span>
      </button>
    </li>
  );
}

interface ActivityTabProps {
  community: CommunityState;
  config: CloudConfig | null;
  memberName: string;
  /** Your own profile, so your posts show your picture and colours. */
  me?: UserProfile;
  /** A post to scroll to and open, from a notification or a link. */
  focus?: { id: string; n: number } | null;
  /** Posts this lifter's past finished workouts and runs. Resolves with how many were sent. */
  onShareHistory: () => Promise<number>;
}

export function ActivityTab({ community, config, memberName, me, focus, onShareHistory }: ActivityTabProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [section, setSection] = useState<'feed' | 'messages'>('feed');
  const [sharing, setSharing] = useState(false);
  const [local, setLocal] = useState<{ id: string; n: number } | null>(null);
  const target = local && (!focus || local.n >= focus.n) ? local : focus ?? null;
  // Everyone's posts, so the one being opened is never filtered out.
  useEffect(() => { if (target) setFilter('all'); }, [target?.n]);
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
          <div className="space-y-2">
            <p className="text-xs text-ink">We sent a sign-in code to {community.linkSentTo}. The email comes from J&amp;T 2.0 through Supabase, our sign-in provider, so check spam if it is not there. Type the code below. Do not tap any link in the email, because that opens your browser instead of this app.</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void community.verifyCode(code); }}>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Code from email" className={`${input} flex-1 min-w-0`} aria-label="Sign-in code" />
              {typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function' && (
                <button type="button" onClick={() => { void navigator.clipboard.readText().then((text) => setCode(text.replace(/\D/g, '').slice(0, 10))).catch(() => { /* clipboard blocked: type or paste into the box instead */ }); }} className={`${button} bg-sunk text-ink`}>Paste</button>
              )}
              <button type="submit" disabled={community.authBusy} className={`${button} bg-accent text-on-accent disabled:opacity-60`}>{community.authBusy ? 'Checking…' : 'Verify'}</button>
            </form>
            <button type="button" onClick={() => { setCode(''); community.cancelSignIn(); }} className="text-xs text-muted underline">Use a different email</button>
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (email.includes('@')) void community.signIn(email); }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={`${input} flex-1 min-w-0`} aria-label="Email" />
            <button type="submit" disabled={community.authBusy} className={`${button} bg-accent text-on-accent disabled:opacity-60`}>{community.authBusy ? 'Sending…' : 'Email me a code'}</button>
          </form>
        )}
        {!community.linkSentTo && (
          <button type="button" onClick={() => { if (email.includes('@')) community.haveCode(email); }} disabled={!email.includes('@')} className="text-xs text-muted underline disabled:opacity-50">I already have a code (enter your email above first)</button>
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

  if (section === 'messages' && config) return <section className="space-y-3"><div className="grid grid-cols-2 gap-1 rounded-xl bg-sunk p-1" role="tablist" aria-label="Community sections"><button role="tab" aria-selected={false} onClick={() => setSection('feed')} className="min-h-11 rounded-lg text-sm font-bold text-muted">Feed</button><button role="tab" aria-selected className="min-h-11 rounded-lg bg-surface text-sm font-black text-ink">Messages</button></div><DirectMessages config={config} community={community} /></section>;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-sunk p-1" role="tablist" aria-label="Community sections"><button role="tab" aria-selected className="min-h-11 rounded-lg bg-surface text-sm font-black text-ink">Feed</button><button role="tab" aria-selected={false} onClick={() => setSection('messages')} className="min-h-11 rounded-lg text-sm font-bold text-muted">Messages</button></div>
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
      <Notifications community={community} onOpenPost={(id) => setLocal({ id, n: Date.now() })} />
      {community.error && <p className="text-xs text-bad">{community.error}</p>}
      {target && !community.busy && community.feed.length > 0 && !community.feed.some((entry) => entry.id === target.id) && (
        <p className="text-xs text-muted">That post is not in the latest posts. Refresh, or it may have been deleted.</p>
      )}
      {items.length === 0 && !community.busy && (
        <div className="card p-4 space-y-2">
          <p className="text-xs text-muted">{filter === 'mine' ? 'You have not posted yet.' : 'No activity yet.'} Finish a workout or log a run and it shows up here.</p>
          <button onClick={() => void share()} disabled={sharing} className={`${button} bg-accent text-on-accent`}>{sharing ? 'Refreshing…' : 'Share my history'}</button>
        </div>
      )}
      {items.map((item) => <Card key={item.id} item={item} community={community} me={me} focusSignal={target?.id === item.id ? target.n : undefined} />)}
      <div className="flex items-center justify-between pt-1">
        {items.length > 0 ? <button onClick={() => void share()} disabled={sharing} className="text-xs text-muted underline">{sharing ? 'Refreshing…' : 'Refresh shared history'}</button> : <span />}
        <button onClick={() => { if (window.confirm('Sign out of the community? Your data stays on this phone.')) community.signOut(); }} className="text-xs text-muted underline">Sign out{community.email ? ` (${community.email})` : ''}</button>
      </div>
    </section>
  );
}
