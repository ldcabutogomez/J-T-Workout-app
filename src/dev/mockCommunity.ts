import { useState } from 'react';
import type { CommunityState } from '../sync/useCommunity';
import type { CommentItem, FeedItem, NotificationItem } from '../sync/community';
import { MUSCLE_GROUPS, type MuscleIntensityMap } from '../engine/muscles';

/**
 * Dev-only preview of a signed-in Activity tab with sample posts, for checking the layout without a backend.
 * Open the app on the dev server with `?activityPreview` on the URL. Nothing here is sent anywhere.
 */
export const ACTIVITY_PREVIEW = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('activityPreview');

const now = Date.now();
const MIN = 60_000;
const ME = 'preview-me';

/** Every muscle at once, spread from faint to strong, so shape alignment can be checked by eye. */
const ALL_MUSCLES: MuscleIntensityMap = Object.fromEntries(MUSCLE_GROUPS.map((group, i) => [group, Math.round(8 + (i * 92) / (MUSCLE_GROUPS.length - 1))]));
const qa = (id: string, gender: 'male' | 'female'): FeedItem => ({
  id, userId: 'preview-qa', name: `QA ${gender}`, gender, createdAt: now - 48 * 60 * MIN, likes: 0, likedByMe: false, commentCount: 0,
  summary: { kind: 'workout', title: 'Every muscle', week: 1, day: 1, sets: 1, volumeLb: 1, minutes: null, prs: [], partial: false, muscles: ALL_MUSCLES },
});

const SAMPLE_FEED: FeedItem[] = [
  {
    id: 'a1', userId: ME, name: 'Luis', gender: 'male', createdAt: now - 25 * MIN, likes: 3, likedByMe: true, commentCount: 2,
    summary: { kind: 'workout', title: 'Back Squat', week: 3, day: 1, sets: 24, volumeLb: 18450, minutes: 68, prs: ['Back Squat', 'Leg Press'], partial: false,
      muscles: { quads: 100, glutes: 96, hamstrings: 58, spinal_erectors: 52, hip_adductors: 30, abs: 28, calves: 12 },
      wrap: 'Finished Back Squat: 24 sets, 18,450 lb in 68 min. New PRs: Back Squat, Leg Press.' },
  },
  {
    id: 'a2', userId: 'preview-lauren', name: 'Lauren', gender: 'female', createdAt: now - 3 * 60 * MIN, likes: 1, likedByMe: false, commentCount: 0,
    summary: { kind: 'run', title: 'Run', distance: '3.1 mi', duration: '29:40', pace: '9:34 /mi', effort: 6, wrap: '3.1 mi easy run in 29:40 at 9:34 /mi.' },
  },
  {
    id: 'a3', userId: 'preview-lauren', name: 'Lauren', gender: 'female', createdAt: now - 26 * 60 * MIN, likes: 0, likedByMe: false, commentCount: 1,
    summary: { kind: 'workout', title: 'Bench Press', week: 3, day: 2, sets: 18, volumeLb: 9200, minutes: 52, prs: [], partial: true,
      muscles: { chest: 100, triceps: 72, front_delts: 55, biceps: 20, lats: 14 },
      wrap: 'Partial Bench Press: 18 sets, 9,200 lb in 52 min.' },
  },
  qa('qa-male', 'male'),
  qa('qa-female', 'female'),
];

const SAMPLE_COMMENTS: CommentItem[] = [
  { id: 'c1', userId: 'preview-lauren', name: 'Lauren', body: 'Beast. That squat looked heavy.', createdAt: now - 20 * MIN },
  { id: 'c2', userId: ME, name: 'Luis', body: 'Felt good today.', createdAt: now - 12 * MIN },
];

const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  { id: 'n1', kind: 'comment', activityId: 'a1', actorId: 'preview-lauren', actorName: 'Lauren', body: 'Beast. That squat looked heavy.', title: 'Back Squat', createdAt: now - 20 * MIN },
  { id: 'n2', kind: 'like', activityId: 'a1', actorId: 'preview-lauren', actorName: 'Lauren', title: 'Back Squat', createdAt: now - 22 * MIN },
  { id: 'n3', kind: 'like', activityId: 'a1', actorId: 'preview-sam', actorName: 'Sam', title: 'Back Squat', createdAt: now - 5 * 60 * MIN },
];

/** Same shape as the real community state, backed by sample data that you can like, comment on and delete. */
export function useMockCommunity(): CommunityState {
  const [feed, setFeed] = useState<FeedItem[]>(SAMPLE_FEED);
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
  const [seen, setSeen] = useState(0);
  return {
    configured: true, signedIn: true, email: 'preview@example.com', userId: ME,
    members: [], feed, busy: false, error: null, linkSentTo: null, authBusy: false,
    notifications: SAMPLE_NOTIFICATIONS, unread: SAMPLE_NOTIFICATIONS.filter((item) => item.createdAt > seen).length,
    markNotificationsSeen: () => setSeen(Date.now()),
    push: { support: 'ready', enabled: false, busy: false }, enablePush: async () => null, disablePush: async () => {},
    signIn: async () => {}, verifyCode: async () => {}, cancelSignIn: () => {}, haveCode: () => {}, signOut: () => {}, refresh: () => {},
    toggleLike: (id) => setFeed((items) => items.map((item) => item.id === id ? { ...item, likedByMe: !item.likedByMe, likes: item.likes + (item.likedByMe ? -1 : 1) } : item)),
    publish: () => {}, unpublish: () => {},
    deletePost: (id) => setFeed((items) => items.filter((item) => item.id !== id)),
    shareHistory: async () => 0,
    comments,
    loadComments: (id) => setComments((all) => ({ ...all, [id]: SAMPLE_COMMENTS.slice(0, feed.find((item) => item.id === id)?.commentCount ?? 0) })),
    comment: async (id, body) => { setComments((all) => ({ ...all, [id]: [...(all[id] ?? []), { id: `c${Date.now()}`, userId: ME, name: 'Luis', body, createdAt: Date.now() }] })); return null; },
    removeComment: (id, commentId) => setComments((all) => ({ ...all, [id]: (all[id] ?? []).filter((c) => c.id !== commentId) })),
  };
}
