import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Ban, Flag, Send } from 'lucide-react';
import type { CommunityState } from '../sync/useCommunity';
import type { CloudConfig } from '../sync/cloud';
import { freshSession, loadSession, saveSession } from '../sync/auth';
import { blockCommunityUser, DIRECT_MESSAGE_MAX, listConversations, listMessages, markConversationRead, reportDirectMessage, sendDirectMessage, startConversation, type DirectConversation, type DirectMessage } from '../sync/messages';
import { Avatar } from './Avatar';

export function DirectMessages({ config, community }: { config: CloudConfig; community: CommunityState }) {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = async () => {
    const stored = loadSession();
    const fresh = stored ? await freshSession(config, stored) : null;
    if (fresh && fresh !== stored) saveSession(fresh);
    return fresh;
  };
  const refresh = useCallback(async () => { const auth = await session(); if (!auth) return; try { setConversations(await listConversations(config, auth)); if (activeId) { setMessages(await listMessages(config, auth, activeId)); await markConversationRead(config, auth, activeId); } setError(null); } catch (e) { setError((e as Error).message); } }, [config, activeId]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 8000); return () => window.clearInterval(timer); }, [refresh]);
  const active = conversations.find((conversation) => conversation.id === activeId);
  const people = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const item of community.feed) if (item.userId !== community.userId) seen.set(item.userId, { id: item.userId, name: item.name });
    for (const member of community.members) if (member.deviceId.startsWith('u:')) seen.set(member.deviceId.slice(2), { id: member.deviceId.slice(2), name: member.name });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [community.feed, community.members, community.userId]);

  if (activeId) return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line bg-sunk p-3"><button onClick={() => setActiveId(null)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h2 className="truncate font-black">{active?.otherName ?? 'Conversation'}</h2><p className="text-xs text-muted">Private conversation</p></div>{active && <><button onClick={() => { const reason = window.prompt('Why are you reporting this conversation?'); const last = messages[messages.length - 1]; if (reason && last) void session().then((auth) => auth && reportDirectMessage(config, auth, last.id, reason)).then(() => setError('Report submitted.')); }} className="flex h-11 w-11 items-center justify-center text-muted" aria-label="Report conversation"><Flag className="h-4 w-4" /></button><button onClick={() => { if (window.confirm(`Block ${active.otherName}? They will no longer be able to message you.`)) void session().then((auth) => auth && blockCommunityUser(config, auth, active.otherId)).then(() => { setActiveId(null); void refresh(); }); }} className="flex h-11 w-11 items-center justify-center text-bad" aria-label={`Block ${active.otherName}`}><Ban className="h-4 w-4" /></button></>}</header>
      <div className="flex max-h-[55vh] min-h-64 flex-col gap-2 overflow-y-auto p-3">{messages.map((message) => { const mine = message.senderId === community.userId; return <div key={message.id} className={`max-w-[82%] rounded-2xl px-3 py-2 ${mine ? 'ml-auto rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md bg-sunk text-ink'}`}><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p><p className={`mt-1 text-[10px] ${mine ? 'text-on-accent/75' : 'text-muted'}`}>{new Date(message.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>; })}{messages.length === 0 && <p className="m-auto text-sm text-muted">No messages yet. Say hello.</p>}</div>
      <form className="flex gap-2 border-t border-line p-3" onSubmit={async (event) => { event.preventDefault(); if (!text.trim() || busy) return; setBusy(true); const auth = await session(); try { if (!auth) throw new Error('Sign in again to send messages.'); await sendDirectMessage(config, auth, activeId, text); setText(''); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><textarea rows={1} maxLength={DIRECT_MESSAGE_MAX} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message" className="field min-h-11 flex-1 resize-none py-2" aria-label="Message" /><button disabled={!text.trim() || busy} className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button></form>
      {error && <p role="alert" className="px-3 pb-3 text-xs text-bad">{error}</p>}
    </section>
  );

  return <section className="space-y-3"><div className="card p-4"><h2 className="text-xl font-black">Messages</h2><p className="text-xs text-muted">Private, one-to-one conversations with signed-in community lifters.</p>{people.length > 0 && <label className="mt-3 block text-xs font-bold uppercase text-muted">New message<select defaultValue="" onChange={async (event) => { const other = event.target.value; event.target.value = ''; if (!other) return; const auth = await session(); try { if (!auth) throw new Error('Sign in again.'); const id = await startConversation(config, auth, other); await refresh(); setActiveId(id); } catch (e) { setError((e as Error).message); } }} className="field mt-1 normal-case"><option value="">Choose a community member…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}</div>{conversations.map((conversation) => <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className="card flex w-full items-center gap-3 p-3 text-left"><Avatar profile={{ id: conversation.otherId, name: conversation.otherName, avatar: conversation.avatar ? { photo: conversation.avatar.thumb, color: conversation.avatar.color } : undefined }} size={42} decorative /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{conversation.otherName}</strong><span className="block truncate text-xs text-muted">{conversation.lastBody || 'New conversation'}</span></span><span className="text-right text-[10px] text-muted">{new Date(conversation.lastAt).toLocaleDateString()}{conversation.unread > 0 && <b className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-on-accent">{conversation.unread}</b>}</span></button>)}{!conversations.length && <div className="card p-5 text-center text-sm text-muted">No conversations yet. Choose a community member above.</div>}{error && <p role="alert" className="text-xs text-bad">{error}</p>}</section>;
}
