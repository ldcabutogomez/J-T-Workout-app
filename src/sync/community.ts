import { parseSnapshot, type PartnerSnapshot } from '../engine/leaderboard';
import { parseActivitySummary, type ActivitySummary } from '../engine/activity';
import type { Gender } from '../types';
import type { CloudConfig } from './cloud';
import type { AuthSession } from './auth';

export interface FeedItem {
  id: string;
  userId: string;
  name: string;
  gender?: Gender;
  summary: ActivitySummary;
  createdAt: number;
  likes: number;
  likedByMe: boolean;
  commentCount: number;
}

export interface CommentItem {
  id: string;
  userId: string;
  name: string;
  body: string;
  createdAt: number;
}

export const COMMENT_MAX = 280;

async function call(config: CloudConfig, session: AuthSession, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${session.accessToken}`, ...((init.headers as Record<string, string>) ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 404 || detail.includes('PGRST205') || detail.includes('PGRST202')) throw new Error('The community tables are missing. Run the Community block of supabase/schema.sql.');
    if (response.status === 401) throw new Error('Signed out. Sign in again.');
    throw new Error(`Community request failed (${response.status}).`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** Publishes this lifter's stats-only snapshot to the global leaderboard. */
export async function upsertMember(config: CloudConfig, session: AuthSession, name: string, gender: Gender | undefined, snapshot: PartnerSnapshot, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(config, session, 'community_members?on_conflict=user_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.userId, display_name: name.trim().slice(0, 40) || 'Lifter', gender: gender ?? null, snapshot, updated_at: new Date().toISOString() }),
  }, fetchImpl);
}

/** Everyone else's snapshots. The server id replaces the device id so each member is one stable row. */
export async function pullMembers(config: CloudConfig, session: AuthSession, fetchImpl: typeof fetch = fetch): Promise<PartnerSnapshot[]> {
  const rows = await call(config, session, 'community_members?select=user_id,display_name,snapshot', { method: 'GET' }, fetchImpl);
  if (!Array.isArray(rows)) return [];
  const out: PartnerSnapshot[] = [];
  for (const row of rows as Array<{ user_id?: unknown; display_name?: unknown; snapshot?: unknown }>) {
    if (typeof row.user_id !== 'string' || row.user_id === session.userId) continue;
    const parsed = parseSnapshot(row.snapshot);
    if (parsed) out.push({ ...parsed, deviceId: `u:${row.user_id}`, profileId: `u:${row.user_id}`, name: typeof row.display_name === 'string' ? row.display_name : parsed.name });
  }
  return out;
}

export async function publishActivity(config: CloudConfig, session: AuthSession, kind: 'workout' | 'run', sourceId: string, summary: ActivitySummary, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(config, session, 'activities?on_conflict=user_id,source_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.userId, kind, source_id: sourceId, summary }),
  }, fetchImpl);
}

export async function removeActivity(config: CloudConfig, session: AuthSession, sourceId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(config, session, `activities?user_id=eq.${session.userId}&source_id=eq.${encodeURIComponent(sourceId)}`, { method: 'DELETE' }, fetchImpl);
}

export async function fetchFeed(config: CloudConfig, session: AuthSession, fetchImpl: typeof fetch = fetch): Promise<FeedItem[]> {
  const rows = await call(config, session, 'rpc/community_feed', { method: 'POST', body: JSON.stringify({ p_limit: 50 }) }, fetchImpl);
  if (!Array.isArray(rows)) return [];
  const items: FeedItem[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const summary = parseActivitySummary(row.summary);
    const created = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
    if (!summary || typeof row.id !== 'string' || typeof row.user_id !== 'string' || !Number.isFinite(created)) continue;
    items.push({
      id: row.id, userId: row.user_id, summary, createdAt: created,
      name: typeof row.display_name === 'string' ? row.display_name : 'Lifter',
      ...(row.gender === 'male' || row.gender === 'female' ? { gender: row.gender } : {}),
      likes: Number(row.like_count) || 0, likedByMe: row.liked_by_me === true, commentCount: Number(row.comment_count) || 0,
    });
  }
  return items;
}

export async function setLike(config: CloudConfig, session: AuthSession, activityId: string, liked: boolean, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (liked) {
    await call(config, session, 'activity_likes?on_conflict=activity_id,user_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ activity_id: activityId, user_id: session.userId }),
    }, fetchImpl);
  } else {
    await call(config, session, `activity_likes?activity_id=eq.${encodeURIComponent(activityId)}&user_id=eq.${session.userId}`, { method: 'DELETE' }, fetchImpl);
  }
}

export interface PublishItem { kind: 'workout' | 'run'; sourceId: string; summary: ActivitySummary; createdAt?: number }

/** Posts or refreshes many activities while preserving each existing row, its likes, and its comments. */
export async function publishActivities(config: CloudConfig, session: AuthSession, items: PublishItem[], fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!items.length) return;
  const now = Date.now();
  await call(config, session, 'activities?on_conflict=user_id,source_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(items.map((item) => ({
      user_id: session.userId, kind: item.kind, source_id: item.sourceId, summary: item.summary,
      ...(item.createdAt ? { created_at: new Date(Math.min(item.createdAt, now)).toISOString() } : {}),
    }))),
  }, fetchImpl);
}

export async function fetchComments(config: CloudConfig, session: AuthSession, activityId: string, fetchImpl: typeof fetch = fetch): Promise<CommentItem[]> {
  const rows = await call(config, session, 'rpc/activity_comment_list', { method: 'POST', body: JSON.stringify({ p_activity: activityId }) }, fetchImpl);
  if (!Array.isArray(rows)) return [];
  const out: CommentItem[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const created = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
    if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.body !== 'string' || !Number.isFinite(created)) continue;
    out.push({ id: row.id, userId: row.user_id, name: typeof row.display_name === 'string' ? row.display_name : 'Lifter', body: row.body.slice(0, COMMENT_MAX), createdAt: created });
  }
  return out;
}

export async function addComment(config: CloudConfig, session: AuthSession, activityId: string, body: string, fetchImpl: typeof fetch = fetch): Promise<CommentItem> {
  const text = body.trim().slice(0, COMMENT_MAX);
  if (!text) throw new Error('Write a comment first.');
  const rows = await call(config, session, 'activity_comments', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ activity_id: activityId, user_id: session.userId, body: text }),
  }, fetchImpl);
  const row = (Array.isArray(rows) ? rows[0] : null) as { id?: unknown; created_at?: unknown } | null;
  if (!row || typeof row.id !== 'string') throw new Error('The comment was not saved.');
  return { id: row.id, userId: session.userId, name: '', body: text, createdAt: typeof row.created_at === 'string' ? Date.parse(row.created_at) || Date.now() : Date.now() };
}

export async function deleteComment(config: CloudConfig, session: AuthSession, commentId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(config, session, `activity_comments?id=eq.${encodeURIComponent(commentId)}&user_id=eq.${session.userId}`, { method: 'DELETE' }, fetchImpl);
}

export async function removeActivityById(config: CloudConfig, session: AuthSession, activityId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(config, session, `activities?id=eq.${encodeURIComponent(activityId)}&user_id=eq.${session.userId}`, { method: 'DELETE' }, fetchImpl);
}
