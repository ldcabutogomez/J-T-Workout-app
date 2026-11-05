import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProfile, WorkoutSession } from '../types';
import { snapshotFromHistory, type PartnerSnapshot } from '../engine/leaderboard';
import type { ActivitySummary } from '../engine/activity';
import type { CloudConfig } from './cloud';
import { pushSupport, readVapidKey, urlBase64ToUint8Array, type PushSupport } from './push';
import { consumeAuthRedirect, freshSession, loadSession, saveSession, sendMagicLink, verifyEmailCode, type AuthSession } from './auth';
import { addComment, countUnread, deleteComment, deleteCommunityPush, fetchComments, fetchFeed, fetchNotifications, saveCommunityPush, type NotificationItem, publishActivities, publishActivity, pullMembers, removeActivity, removeActivityById, setLike, upsertMember, type CommentItem, type FeedItem, type PublishItem } from './community';

export interface CommunityState {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  userId?: string;
  /** Your display name as shown on posts and comments. */
  members: PartnerSnapshot[];
  feed: FeedItem[];
  busy: boolean;
  error: string | null;
  /** Set after a magic link was requested, until the person returns through it. */
  linkSentTo: string | null;
  /** Likes and comments on your posts, newest first. */
  notifications: NotificationItem[];
  /** How many arrived since you last opened the list. */
  unread: number;
  /** Marks everything as seen. */
  markNotificationsSeen: () => void;
  /** Phone push for likes and comments: whether this build and phone can do it, and whether it is on. */
  push: { support: PushSupport | 'not-configured'; enabled: boolean; busy: boolean };
  enablePush: () => Promise<string | null>;
  disablePush: () => Promise<void>;
  /** True while an email or code request is in flight. */
  authBusy: boolean;
  signIn: (email: string) => Promise<void>;
  /** Finishes sign-in with the code from the email, inside this app. */
  verifyCode: (code: string) => Promise<void>;
  /** Goes back to the email form. */
  cancelSignIn: () => void;
  /** Goes straight to the code box for an email that was already sent a code. */
  haveCode: (email: string) => void;
  signOut: () => void;
  refresh: () => void;
  toggleLike: (id: string) => void;
  publish: (kind: 'workout' | 'run', sourceId: string, summary: ActivitySummary) => void;
  unpublish: (sourceId: string) => void;
  /** Deletes one of your own posts from the feed. */
  deletePost: (activityId: string) => void;
  /** Posts many past activities at once. Resolves with how many were sent. */
  shareHistory: (items: PublishItem[]) => Promise<number>;
  comments: Record<string, CommentItem[]>;
  loadComments: (activityId: string) => void;
  /** Posts a comment. Resolves with an error message, or null when it was saved. */
  comment: (activityId: string, body: string) => Promise<string | null>;
  removeComment: (activityId: string, commentId: string) => void;
}

/** Accounts, the global leaderboard and the activity feed. Inert without a backend or a signed-in person. */
export function useCommunity(config: CloudConfig | null, profile: UserProfile | null, history: WorkoutSession[], getHistory: () => Promise<WorkoutSession[]>, deviceId: string): CommunityState {
  // The magic-link redirect must be read before the stored session, or the first render after the link shows signed out.
  const [session, setSession] = useState<AuthSession | null>(() => { consumeAuthRedirectOnce(); return loadSession(); });
  const [members, setMembers] = useState<PartnerSnapshot[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeAuthRedirectOnce());
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const seenKey = session ? `jnt2_notif_seen_${session.userId}` : null;
  const [seenAt, setSeenAt] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
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
      await upsertMember(config, active, profile.name, profile.gender, snapshotFromHistory(profile, mine, Date.now(), deviceId));
      const [others, items, alerts] = await Promise.all([pullMembers(config, active), fetchFeed(config, active), fetchNotifications(config, active).catch(() => null)]);
      setMembers(others);
      setFeed(items);
      // The notification list needs the newest SQL block; without it the rest of Activity still works.
      if (alerts) setNotifications(alerts);
      setError(null);
    } catch (e) {
      setError(navigator.onLine === false ? 'Offline. Community will update when you are back online.' : (e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [config, profile, usable, getHistory, deviceId]);

  useEffect(() => {
    if (!seenKey) { setSeenAt(0); setNotifications([]); return; }
    try { setSeenAt(Number(localStorage.getItem(seenKey)) || 0); } catch { setSeenAt(0); }
  }, [seenKey]);

  useEffect(() => {
    if (!session || !('serviceWorker' in navigator) || !('PushManager' in window)) { setPushEnabled(false); return; }
    let live = true;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => { if (live) setPushEnabled(Boolean(subscription) && Notification.permission === 'granted'); }).catch(() => undefined);
    return () => { live = false; };
  }, [session?.userId]);

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
    userId: session?.userId,
    members, feed, busy, error, linkSentTo, authBusy,
    notifications,
    unread: countUnread(notifications, seenAt),
    markNotificationsSeen: () => {
      const latest = notifications[0]?.createdAt ?? Date.now();
      setSeenAt(latest);
      if (seenKey) { try { localStorage.setItem(seenKey, String(latest)); } catch { /* the badge simply returns next visit */ } }
    },
    push: { support: readVapidKey() ? pushSupport() : 'not-configured', enabled: pushEnabled, busy: pushBusy },
    enablePush: async () => {
      const key = readVapidKey();
      if (!config || !key) return 'Push is not configured in this build.';
      setPushBusy(true);
      try {
        const active = await usable();
        if (!active) return 'You are signed out.';
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return 'Notifications were not allowed. You can allow them in your phone settings.';
        const registration = await navigator.serviceWorker.ready;
        const subscription = (await registration.pushManager.getSubscription())
          ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
        await saveCommunityPush(config, active, deviceId, subscription.toJSON());
        setPushEnabled(true);
        return null;
      } catch (e) { return (e as Error).message; } finally { setPushBusy(false); }
    },
    disablePush: async () => {
      if (!config) return;
      setPushBusy(true);
      try {
        const active = await usable();
        if (active) await deleteCommunityPush(config, active, deviceId);
        setPushEnabled(false);
      } catch (e) { setError((e as Error).message); } finally { setPushBusy(false); }
    },
    signIn: async (email) => {
      if (!config) return;
      setError(null);
      setAuthBusy(true);
      try {
        await sendMagicLink(config, email.trim(), `${location.origin}${location.pathname}`);
        setLinkSentTo(email.trim());
      } catch (e) { setError((e as Error).message); } finally { setAuthBusy(false); }
    },
    verifyCode: async (code) => {
      if (!config || !linkSentTo) return;
      setError(null);
      setAuthBusy(true);
      try {
        const next = await verifyEmailCode(config, linkSentTo, code);
        saveSession(next); sessionRef.current = next; setSession(next); setLinkSentTo(null);
      } catch (e) { setError((e as Error).message); } finally { setAuthBusy(false); }
    },
    haveCode: (email) => { setError(null); setLinkSentTo(email.trim()); },
    cancelSignIn: () => { setLinkSentTo(null); setError(null); },
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
    shareHistory: async (items) => {
      if (!config) return 0;
      try {
        const active = await usable();
        if (!active) return 0;
        await publishActivities(config, active, items);
        await syncRef.current();
        return items.length;
      } catch (e) { setError((e as Error).message); return 0; }
    },
    comments,
    loadComments: (activityId) => {
      if (!config) return;
      void (async () => {
        try {
          const active = await usable();
          if (active) { const list = await fetchComments(config, active, activityId); setComments((all) => ({ ...all, [activityId]: list })); }
        } catch (e) { setError((e as Error).message); }
      })();
    },
    comment: async (activityId, body) => {
      if (!config) return 'Not connected.';
      if (!body.trim()) return 'Write a comment first.';
      try {
        const active = await usable();
        if (!active) return 'You are signed out. Sign in again to comment.';
        await addComment(config, active, activityId, body);
        // Show what the server actually holds, so a comment that did not stick cannot look posted.
        const list = await fetchComments(config, active, activityId);
        setComments((all) => ({ ...all, [activityId]: list }));
        setFeed((items) => items.map((entry) => (entry.id === activityId ? { ...entry, commentCount: list.length } : entry)));
        return null;
      } catch (e) { return (e as Error).message; }
    },
    removeComment: (activityId, commentId) => {
      if (!config) return;
      setComments((all) => ({ ...all, [activityId]: (all[activityId] ?? []).filter((item) => item.id !== commentId) }));
      setFeed((items) => items.map((entry) => (entry.id === activityId ? { ...entry, commentCount: Math.max(0, entry.commentCount - 1) } : entry)));
      void (async () => {
        try {
          const active = await usable();
          if (active) await deleteComment(config, active, commentId);
        } catch (e) { setError((e as Error).message); void syncRef.current(); }
      })();
    },
    deletePost: (activityId) => {
      if (!config) return;
      setFeed((items) => items.filter((entry) => entry.id !== activityId));
      void (async () => {
        try {
          const active = await usable();
          if (active) await removeActivityById(config, active, activityId);
        } catch (e) { setError((e as Error).message); void syncRef.current(); }
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
