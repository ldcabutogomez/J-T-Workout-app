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
