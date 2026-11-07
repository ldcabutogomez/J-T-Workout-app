-- Partner sync backend for J&T 2.0. Run once in the Supabase SQL editor.
--
-- Model: two phones share a secret pairing code. Each phone pushes a stats-only snapshot
-- (no set logs) and pulls its partner's. The table is locked down: the public anon key can
-- ONLY call the two functions below, never read or write the table directly. The code is
-- stored as a SHA-256 hash, so a database leak does not reveal usable codes.

create table if not exists public.partner_snapshots (
  code_hash   text        not null,
  device_id   text        not null,
  snapshot    jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (code_hash, device_id)
);

alter table public.partner_snapshots enable row level security;
-- No policies on purpose: direct table access is denied for anon/authenticated.
revoke all on public.partner_snapshots from anon, authenticated;

create or replace function public.push_snapshot(p_code text, p_device text, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  if p_code !~ '^[A-Z2-9]{10,32}$' then raise exception 'bad code'; end if;
  if length(p_device) < 8 or length(p_device) > 64 then raise exception 'bad device'; end if;
  if pg_column_size(p_snapshot) > 8192 then raise exception 'snapshot too large'; end if;
  h := encode(sha256(convert_to(p_code, 'utf8')), 'hex');
  -- A pairing has two phones. Refuse a third device so a leaked code cannot spam the group.
  if not exists (select 1 from partner_snapshots where code_hash = h and device_id = p_device)
     and (select count(*) from partner_snapshots where code_hash = h) >= 2 then
    raise exception 'pairing full';
  end if;
  insert into partner_snapshots (code_hash, device_id, snapshot, updated_at)
  values (h, p_device, p_snapshot, now())
  on conflict (code_hash, device_id)
  do update set snapshot = excluded.snapshot, updated_at = now();
end;
$$;

create or replace function public.pull_snapshots(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  if p_code !~ '^[A-Z2-9]{10,32}$' then raise exception 'bad code'; end if;
  h := encode(sha256(convert_to(p_code, 'utf8')), 'hex');
  return coalesce(
    (select jsonb_agg(snapshot) from partner_snapshots where code_hash = h),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.push_snapshot(text, text, jsonb) from public;
revoke all on function public.pull_snapshots(text) from public;
grant execute on function public.push_snapshot(text, text, jsonb) to anon;
grant execute on function public.pull_snapshots(text) to anon;

-- ---------------------------------------------------------------------------------------------
-- Push notifications. Run this block after the sync functions above, then follow
-- supabase/PUSH_SETUP.md to deploy the two Edge Functions and schedule the reminders.
-- Subscriptions hang off the same pairing code (hashed) and device id as snapshots, so there are
-- no accounts. Only the Edge Functions (service role) can touch this table.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  code_hash     text        not null,
  device_id     text        not null,
  endpoint      text        not null,
  p256dh        text        not null,
  auth          text        not null,
  tz            text        not null default 'UTC',
  reminder_time text        not null default '17:30',
  train_days    int[]       not null default '{0,1,3,4}',
  prefs         jsonb       not null default '{}'::jsonb,
  -- When each kind of push last went to this device ({"trained": ms, "day": "YYYY-MM-DD"}), for rate limits.
  last_sent     jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (code_hash, device_id)
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Community: accounts (Supabase Auth, email magic link), one global leaderboard and an activity feed
-- with likes. Run this block after the sections above. In Authentication > URL Configuration, set the
-- Site URL to the deployed app and add it (and http://localhost:3000) to Redirect URLs.
-- Everything here is stats only: no set logs, no notes. Signed-in users can read everyone's rows and
-- write only their own.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.community_members (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(display_name) between 1 and 40),
  snapshot     jsonb check (snapshot is null or pg_column_size(snapshot) <= 8192),
  updated_at   timestamptz not null default now()
);
alter table public.community_members add column if not exists gender text;
alter table public.community_members drop constraint if exists community_members_gender_check;
alter table public.community_members add constraint community_members_gender_check check (gender is null or gender in ('male', 'female'));
create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  kind       text not null check (kind in ('workout', 'run')),
  source_id  text not null check (length(source_id) <= 80),
  summary    jsonb not null check (pg_column_size(summary) <= 2048),
  created_at timestamptz not null default now(),
  unique (user_id, source_id)
);
create index if not exists activities_created_idx on public.activities (created_at desc);
create table if not exists public.activity_likes (
  activity_id uuid not null references public.activities on delete cascade,
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);

alter table public.community_members enable row level security;
alter table public.activities enable row level security;
alter table public.activity_likes enable row level security;
revoke all on public.community_members, public.activities, public.activity_likes from anon;

drop policy if exists members_read on public.community_members;
drop policy if exists members_write on public.community_members;
drop policy if exists members_update on public.community_members;
drop policy if exists members_delete on public.community_members;
create policy members_read on public.community_members for select to authenticated using (true);
create policy members_write on public.community_members for insert to authenticated with check (user_id = auth.uid());
create policy members_update on public.community_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete on public.community_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists activities_read on public.activities;
drop policy if exists activities_write on public.activities;
drop policy if exists activities_delete on public.activities;
drop policy if exists activities_update on public.activities;
create policy activities_read on public.activities for select to authenticated using (true);
create policy activities_write on public.activities for insert to authenticated with check (user_id = auth.uid() and created_at <= now() + interval '5 minutes');
create policy activities_delete on public.activities for delete to authenticated using (user_id = auth.uid());
create policy activities_update on public.activities for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and created_at <= now() + interval '5 minutes');

drop policy if exists likes_read on public.activity_likes;
drop policy if exists likes_write on public.activity_likes;
drop policy if exists likes_delete on public.activity_likes;
create policy likes_read on public.activity_likes for select to authenticated using (true);
create policy likes_write on public.activity_likes for insert to authenticated with check (user_id = auth.uid());
create policy likes_delete on public.activity_likes for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.community_members, public.activities, public.activity_likes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Activity comments, and the feed function with comment counts. Run this block after the Community
-- block above. Re-runnable. (It drops and recreates community_feed because its result changed.)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.activity_comments (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities on delete cascade,
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  body        text not null check (length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists activity_comments_activity_idx on public.activity_comments (activity_id, created_at);
alter table public.activity_comments enable row level security;
revoke all on public.activity_comments from anon;
drop policy if exists comments_read on public.activity_comments;
drop policy if exists comments_write on public.activity_comments;
drop policy if exists comments_delete on public.activity_comments;
create policy comments_read on public.activity_comments for select to authenticated using (true);
create policy comments_write on public.activity_comments for insert to authenticated with check (user_id = auth.uid());
create policy comments_delete on public.activity_comments for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.activity_comments to authenticated;

-- Past workouts can be shared with their original time, but never dated in the future.
drop policy if exists activities_write on public.activities;
create policy activities_write on public.activities for insert to authenticated with check (user_id = auth.uid() and created_at <= now() + interval '5 minutes');

drop function if exists public.community_feed(int);
create function public.community_feed(p_limit int default 50)
returns table (id uuid, user_id uuid, display_name text, gender text, avatar jsonb, kind text, summary jsonb, created_at timestamptz, like_count bigint, liked_by_me boolean, comment_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.user_id, m.display_name, m.gender, m.snapshot -> 'avatar', a.kind, a.summary, a.created_at,
         (select count(*) from activity_likes l where l.activity_id = a.id),
         exists (select 1 from activity_likes l where l.activity_id = a.id and l.user_id = auth.uid()),
         (select count(*) from activity_comments c where c.activity_id = a.id)
  from activities a join community_members m on m.user_id = a.user_id
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.community_feed(int) from public, anon;
grant execute on function public.community_feed(int) to authenticated;

-- Comments with their authors' names, for one activity.
drop function if exists public.activity_comment_list(uuid);
create function public.activity_comment_list(p_activity uuid)
returns table (id uuid, user_id uuid, display_name text, avatar jsonb, body text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.user_id, coalesce(m.display_name, 'Lifter'), m.snapshot -> 'avatar', c.body, c.created_at
  from activity_comments c left join community_members m on m.user_id = c.user_id
  where c.activity_id = p_activity
  order by c.created_at
  limit 200
$$;
revoke all on function public.activity_comment_list(uuid) from public, anon;
grant execute on function public.activity_comment_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Likes and comments notifications. Run this block after the Community and comments blocks above.
-- It adds (1) the in-app list of likes and comments on your own posts and (2) a table for phone push
-- subscriptions tied to the signed-in account. Real push also needs the notify-activity Edge Function and
-- two triggers: see "Likes and comments notifications" in supabase/PUSH_SETUP.md. Re-runnable.
-- ---------------------------------------------------------------------------------------------
create or replace function public.my_activity_notifications(p_limit int default 40)
returns table (kind text, activity_id uuid, actor_id uuid, actor_name text, body text, created_at timestamptz, title text)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select 'like'::text as kind, l.activity_id, l.user_id as actor_id, coalesce(m.display_name, 'Someone') as actor_name,
           null::text as body, l.created_at, a.summary ->> 'title' as title
    from activity_likes l
    join activities a on a.id = l.activity_id
    left join community_members m on m.user_id = l.user_id
    where a.user_id = auth.uid() and l.user_id <> auth.uid()
    union all
    select 'comment'::text, c.activity_id, c.user_id, coalesce(m.display_name, 'Someone'), c.body, c.created_at, a.summary ->> 'title'
    from activity_comments c
    join activities a on a.id = c.activity_id
    left join community_members m on m.user_id = c.user_id
    where a.user_id = auth.uid() and c.user_id <> auth.uid()
  ) n
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.my_activity_notifications(int) from public, anon;
grant execute on function public.my_activity_notifications(int) to authenticated;

-- One row per phone per account. The Edge Function (service role) re-checks every endpoint before sending.
create table if not exists public.community_push (
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  device_id  text not null check (length(device_id) between 8 and 64),
  endpoint   text not null check (length(endpoint) <= 600),
  p256dh     text not null check (length(p256dh) <= 200),
  auth       text not null check (length(auth) <= 100),
  prefs      jsonb not null default '{"likes": true, "comments": true}'::jsonb,
  last_sent  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.community_push enable row level security;
revoke all on public.community_push from anon;
drop policy if exists cpush_read on public.community_push;
drop policy if exists cpush_write on public.community_push;
drop policy if exists cpush_update on public.community_push;
drop policy if exists cpush_delete on public.community_push;
create policy cpush_read on public.community_push for select to authenticated using (user_id = auth.uid());
create policy cpush_write on public.community_push for insert to authenticated with check (user_id = auth.uid());
create policy cpush_update on public.community_push for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cpush_delete on public.community_push for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.community_push to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Direct messages. Text-only, one-to-one conversations for authenticated community members.
-- Participants can read only their conversations. Writes go through checked RPCs so blocking,
-- membership, length and throttling rules cannot be bypassed by the public client.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users on delete cascade,
  user_high uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_distinct_users check (user_low <> user_high),
  unique (user_low, user_high)
);
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations on delete cascade,
  sender_id uuid not null references auth.users on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_conversation_idx on public.dm_messages (conversation_id, created_at desc);
create table if not exists public.dm_reads (
  conversation_id uuid not null references public.dm_conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table if not exists public.dm_blocks (
  blocker_id uuid not null references auth.users on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table if not exists public.dm_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users on delete cascade default auth.uid(),
  message_id uuid not null references public.dm_messages on delete cascade,
  reason text not null check (length(reason) between 1 and 280),
  created_at timestamptz not null default now(),
  unique (reporter_id, message_id)
);

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_reads enable row level security;
alter table public.dm_blocks enable row level security;
alter table public.dm_reports enable row level security;
revoke all on public.dm_conversations, public.dm_messages, public.dm_reads, public.dm_blocks, public.dm_reports from anon, authenticated;

drop policy if exists dm_conversations_read on public.dm_conversations;
create policy dm_conversations_read on public.dm_conversations for select to authenticated using (auth.uid() in (user_low, user_high));
drop policy if exists dm_messages_read on public.dm_messages;
create policy dm_messages_read on public.dm_messages for select to authenticated using (exists (select 1 from public.dm_conversations c where c.id = conversation_id and auth.uid() in (c.user_low, c.user_high)));
drop policy if exists dm_reads_own on public.dm_reads;
create policy dm_reads_own on public.dm_reads for select to authenticated using (user_id = auth.uid());
drop policy if exists dm_blocks_own on public.dm_blocks;
create policy dm_blocks_own on public.dm_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists dm_reports_own on public.dm_reports;
create policy dm_reports_own on public.dm_reports for select to authenticated using (reporter_id = auth.uid());
grant select on public.dm_conversations, public.dm_messages, public.dm_reads, public.dm_blocks, public.dm_reports to authenticated;

create or replace function public.start_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); low_id uuid; high_id uuid; result uuid;
begin
  if me is null or p_other is null or me = p_other then raise exception 'Choose another community member.'; end if;
  if not exists (select 1 from community_members where user_id = p_other) then raise exception 'That community member is unavailable.'; end if;
  if exists (select 1 from dm_blocks where (blocker_id = me and blocked_id = p_other) or (blocker_id = p_other and blocked_id = me)) then raise exception 'This conversation is blocked.'; end if;
  if me::text < p_other::text then low_id := me; high_id := p_other; else low_id := p_other; high_id := me; end if;
  insert into dm_conversations(user_low, user_high) values (low_id, high_id)
    on conflict (user_low, user_high) do update set updated_at = dm_conversations.updated_at returning id into result;
  insert into dm_reads(conversation_id, user_id) values (result, me) on conflict do nothing;
  return result;
end $$;

create or replace function public.send_dm(p_conversation uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other_id uuid; result uuid; clean text := btrim(p_body);
begin
  select case when user_low = me then user_high when user_high = me then user_low end into other_id from dm_conversations where id = p_conversation;
  if other_id is null then raise exception 'Conversation not found.'; end if;
  if length(clean) < 1 or length(clean) > 1000 then raise exception 'Messages must be 1 to 1000 characters.'; end if;
  if exists (select 1 from dm_blocks where (blocker_id = me and blocked_id = other_id) or (blocker_id = other_id and blocked_id = me)) then raise exception 'This conversation is blocked.'; end if;
  if (select count(*) from dm_messages where sender_id = me and created_at > now() - interval '1 minute') >= 30 then raise exception 'Too many messages. Wait a minute and try again.'; end if;
  insert into dm_messages(conversation_id, sender_id, body) values (p_conversation, me, clean) returning id into result;
  update dm_conversations set updated_at = now() where id = p_conversation;
  insert into dm_reads(conversation_id, user_id, last_read_at) values (p_conversation, me, now()) on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return result;
end $$;

create or replace function public.dm_message_list(p_conversation uuid, p_limit int default 100)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select m.id, m.sender_id, m.body, m.created_at from dm_messages m
  where m.conversation_id = p_conversation order by m.created_at asc limit least(greatest(p_limit, 1), 200)
$$;

create or replace function public.dm_conversation_list()
returns table (id uuid, other_id uuid, other_name text, avatar jsonb, last_body text, last_at timestamptz, unread_count bigint)
language sql stable security invoker set search_path = public as $$
  select c.id, case when c.user_low = auth.uid() then c.user_high else c.user_low end,
    coalesce(cm.display_name, 'Lifter'), cm.snapshot -> 'avatar', coalesce(last_m.body, ''), coalesce(last_m.created_at, c.created_at),
    (select count(*) from dm_messages unread where unread.conversation_id = c.id and unread.sender_id <> auth.uid()
      and unread.created_at > coalesce((select r.last_read_at from dm_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), 'epoch'::timestamptz))
  from dm_conversations c
  join community_members cm on cm.user_id = case when c.user_low = auth.uid() then c.user_high else c.user_low end
  left join lateral (select m.body, m.created_at from dm_messages m where m.conversation_id = c.id order by m.created_at desc limit 1) last_m on true
  where auth.uid() in (c.user_low, c.user_high)
    and not exists (select 1 from dm_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = cm.user_id) or (b.blocker_id = cm.user_id and b.blocked_id = auth.uid()))
  order by coalesce(last_m.created_at, c.created_at) desc
$$;

create or replace function public.mark_dm_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public as $$ begin
  if not exists (select 1 from dm_conversations where id = p_conversation and auth.uid() in (user_low, user_high)) then raise exception 'Conversation not found.'; end if;
  insert into dm_reads(conversation_id, user_id, last_read_at) values (p_conversation, auth.uid(), now()) on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end $$;

create or replace function public.block_community_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$ begin
  if p_user is null or p_user = auth.uid() then raise exception 'Choose another community member.'; end if;
  insert into dm_blocks(blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
end $$;

create or replace function public.report_dm(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$ begin
  if length(btrim(p_reason)) < 1 then raise exception 'Add a reason for the report.'; end if;
  if not exists (select 1 from dm_messages m join dm_conversations c on c.id = m.conversation_id where m.id = p_message and auth.uid() in (c.user_low, c.user_high)) then raise exception 'Message not found.'; end if;
  insert into dm_reports(reporter_id, message_id, reason) values (auth.uid(), p_message, left(btrim(p_reason), 280)) on conflict (reporter_id, message_id) do update set reason = excluded.reason, created_at = now();
end $$;

revoke all on function public.start_dm(uuid), public.send_dm(uuid, text), public.dm_message_list(uuid, int), public.dm_conversation_list(), public.mark_dm_read(uuid), public.block_community_user(uuid), public.report_dm(uuid, text) from public, anon;
grant execute on function public.start_dm(uuid), public.send_dm(uuid, text), public.dm_message_list(uuid, int), public.dm_conversation_list(), public.mark_dm_read(uuid), public.block_community_user(uuid), public.report_dm(uuid, text) to authenticated;
