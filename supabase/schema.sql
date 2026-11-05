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
create policy activities_read on public.activities for select to authenticated using (true);
create policy activities_write on public.activities for insert to authenticated with check (user_id = auth.uid() and created_at <= now() + interval '5 minutes');
create policy activities_delete on public.activities for delete to authenticated using (user_id = auth.uid());

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
returns table (id uuid, user_id uuid, display_name text, kind text, summary jsonb, created_at timestamptz, like_count bigint, liked_by_me boolean, comment_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.user_id, m.display_name, a.kind, a.summary, a.created_at,
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
create or replace function public.activity_comment_list(p_activity uuid)
returns table (id uuid, user_id uuid, display_name text, body text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.user_id, coalesce(m.display_name, 'Lifter'), c.body, c.created_at
  from activity_comments c left join community_members m on m.user_id = c.user_id
  where c.activity_id = p_activity
  order by c.created_at
  limit 200
$$;
revoke all on function public.activity_comment_list(uuid) from public, anon;
grant execute on function public.activity_comment_list(uuid) to authenticated;
