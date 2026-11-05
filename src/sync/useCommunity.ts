import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProfile, WorkoutSession } from '../types';
import { snapshotFromHistory, type PartnerSnapshot } from '../engine/leaderboard';
import type { ActivitySummary } from '../engine/activity';
import type { CloudConfig } from './cloud';
import { consumeAuthRedirect, freshSession, loadSession, saveSession, sendMagicLink, type AuthSession } from './auth';
import { fetchFeed, publishActivity, pullMembers, removeActivity, setLike, upsertMember, type FeedItem } from './community';

export interface CommunityState {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  members: PartnerSnapshot[];
  feed: FeedItem[];
  busy: boolean;
  error: string | null;
  /** Set after a magic link was requested, until the person returns through it. */
  linkSentTo: string | null;
  signIn: (email: string) => Promise<void>;
  signOut: () => void;
  refresh: () => void;
  toggleLike: (id: string) => void;
  publish: (kind: 'workout' | 'run', sourceId: string, summary: ActivitySummary) => void;
  unpublish: (sourceId: string) => void;
}

/** Accounts, the global leaderboard and the activity feed. Inert without a backend or a signed-in person. */
export function useCommunity(config: CloudConfig | null, profile: UserProfile | null, history: WorkoutSession[], getHistory: () => Promise<WorkoutSession[]>, deviceId: string): CommunityState {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [members, setMembers] = useState<PartnerSnapshot[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeAuthRedirectOnce());
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const running = useRef(false);

  /** The current session, refreshed if needed. Signs out when the server refuses the refresh. */
  const usable = useCallback(async (): Promise<AuthSession | null> => {
    const current = sessionRef.current;
    if (!config || !current) return null;
    const next = await freshSession(config, current);
    if (!next) { saveSession(null); setSession(null); return null; }
    if (next !== current) { saveSession(next); setSession(next); sessionRef.current = next; }
    return next;
  }, [config]);

  const sync = useCallback(async () => {
    if (!config || !profile || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const active = await usable();
      if (!active) return;
      const mine = await getHistory();
      await upsertMember(config, active, profile.name, snapshotFromHistory(profile, mine, Date.now(), deviceId));
      const [others, items] = await Promise.all([pullMembers(config, active), fetchFeed(config, active)]);
      setMembers(others);
      setFeed(items);
      setError(null);
    } catch (e) {
      setError(navigator.onLine === false ? 'Offline. Community will update when you are back online.' : (e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [config, profile, usable, getHistory, deviceId]);

  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void syncRef.current(), 1500);
    return () => window.clearTimeout(timer);
  }, [session?.userId, history, profile]);

  useEffect(() => {
    if (!session) return;
    const refresh = () => { if (document.visibilityState === 'visible') void syncRef.current(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [session?.userId]);

  return {
    configured: Boolean(config),
    signedIn: Boolean(session),
    email: session?.email,
    members, feed, busy, error, linkSentTo,
    signIn: async (email) => {
      if (!config) return;
      setError(null);
      try {
        await sendMagicLink(config, email.trim(), `${location.origin}${location.pathname}`);
        setLinkSentTo(email.trim());
      } catch (e) { setError((e as Error).message); }
    },
    signOut: () => { saveSession(null); setSession(null); setMembers([]); setFeed([]); setLinkSentTo(null); },
    refresh: () => void sync(),
    toggleLike: (id) => {
      const item = feed.find((entry) => entry.id === id);
      if (!config || !item) return;
      const liked = !item.likedByMe;
      // Optimistic: the count moves now and is corrected by the next refresh if the server refuses.
      setFeed((items) => items.map((entry) => (entry.id === id ? { ...entry, likedByMe: liked, likes: Math.max(0, entry.likes + (liked ? 1 : -1)) } : entry)));
      void (async () => {
        try {
          const active = await usable();
          if (active) await setLike(config, active, id, liked);
        } catch (e) { setError((e as Error).message); void syncRef.current(); }
      })();
    },
    publish: (kind, sourceId, summary) => {
      if (!config) return;
      void (async () => {
        try {
          const active = await usable();
          if (active) { await publishActivity(config, active, kind, sourceId, summary); void syncRef.current(); }
        } catch (e) { setError((e as Error).message); }
      })();
    },
    unpublish: (sourceId) => {
      if (!config) return;
      void (async () => {
        try {
          const active = await usable();
          if (active) { await removeActivity(config, active, sourceId); void syncRef.current(); }
        } catch (e) { setError((e as Error).message); }
      })();
    },
  };
}

// The magic-link redirect must be consumed exactly once per page load, even under React strict mode.
let consumed: { session: AuthSession | null; error: string | null } | null = null;
function consumeAuthRedirectOnce(): string | null {
  if (!consumed) consumed = consumeAuthRedirect();
  return consumed.error;
}
