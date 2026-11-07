import type { ProfileAvatar } from '../types';
import { AVATAR_COLORS, AVATAR_THUMB_MAX_CHARS, isJpegDataUrl } from '../lib/avatar';
import type { AuthSession } from './auth';
import type { CloudConfig } from './cloud';

export interface DirectConversation { id: string; otherId: string; otherName: string; avatar?: Pick<ProfileAvatar, 'thumb' | 'color'>; lastBody: string; lastAt: number; unread: number }
export interface DirectMessage { id: string; conversationId: string; senderId: string; body: string; createdAt: number }
export const DIRECT_MESSAGE_MAX = 1000;

async function rpc(config: CloudConfig, session: AuthSession, name: string, body: object, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 404 || detail.includes('PGRST202')) throw new Error('Messaging is not installed on the server yet. Run the Direct messages block in supabase/schema.sql.');
    let message = '';
    try { message = String((JSON.parse(detail) as { message?: unknown }).message ?? ''); } catch { /* Supabase may return plain text. */ }
    throw new Error(message || `Messaging failed (${response.status}).`);
  }
  const text = await response.text(); return text ? JSON.parse(text) : null;
}

const avatar = (value: unknown): DirectConversation['avatar'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>; const out: NonNullable<DirectConversation['avatar']> = {};
  if (isJpegDataUrl(raw.thumb, AVATAR_THUMB_MAX_CHARS)) out.thumb = raw.thumb;
  if (typeof raw.color === 'string' && (AVATAR_COLORS as readonly string[]).includes(raw.color)) out.color = raw.color as ProfileAvatar['color'];
  return out.thumb || out.color ? out : undefined;
};

export async function listConversations(config: CloudConfig, session: AuthSession): Promise<DirectConversation[]> {
  const rows = await rpc(config, session, 'dm_conversation_list', {});
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: Record<string, unknown>) => {
    const at = typeof row.last_at === 'string' ? Date.parse(row.last_at) : NaN;
    if (typeof row.id !== 'string' || typeof row.other_id !== 'string' || !Number.isFinite(at)) return [];
    return [{ id: row.id, otherId: row.other_id, otherName: typeof row.other_name === 'string' ? row.other_name : 'Lifter', avatar: avatar(row.avatar), lastBody: typeof row.last_body === 'string' ? row.last_body : '', lastAt: at, unread: Number(row.unread_count) || 0 }];
  });
}

export async function startConversation(config: CloudConfig, session: AuthSession, otherId: string): Promise<string> {
  const value = await rpc(config, session, 'start_dm', { p_other: otherId });
  if (typeof value !== 'string') throw new Error('The conversation could not be opened.');
  return value;
}

export async function listMessages(config: CloudConfig, session: AuthSession, conversationId: string): Promise<DirectMessage[]> {
  const rows = await rpc(config, session, 'dm_message_list', { p_conversation: conversationId, p_limit: 100 });
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: Record<string, unknown>) => {
    const at = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
    if (typeof row.id !== 'string' || typeof row.sender_id !== 'string' || typeof row.body !== 'string' || !Number.isFinite(at)) return [];
    return [{ id: row.id, conversationId, senderId: row.sender_id, body: row.body.slice(0, DIRECT_MESSAGE_MAX), createdAt: at }];
  });
}

export async function sendDirectMessage(config: CloudConfig, session: AuthSession, conversationId: string, body: string): Promise<void> {
  const text = body.trim().slice(0, DIRECT_MESSAGE_MAX); if (!text) throw new Error('Write a message first.');
  await rpc(config, session, 'send_dm', { p_conversation: conversationId, p_body: text });
}

export async function markConversationRead(config: CloudConfig, session: AuthSession, conversationId: string): Promise<void> { await rpc(config, session, 'mark_dm_read', { p_conversation: conversationId }); }
export async function blockCommunityUser(config: CloudConfig, session: AuthSession, userId: string): Promise<void> { await rpc(config, session, 'block_community_user', { p_user: userId }); }
export async function reportDirectMessage(config: CloudConfig, session: AuthSession, messageId: string, reason: string): Promise<void> { await rpc(config, session, 'report_dm', { p_message: messageId, p_reason: reason.slice(0, 280) }); }
