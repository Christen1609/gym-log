-- Gym Log — baseline schema, exported from the live project on 2026-11-09.
--
-- The app's data lives in the "gymlog" schema of a shared Supabase project
-- (ref duxqfwcxdmezwgxddaed), not in public. The original single-purpose
-- project was deleted in Sep 2026; this file replaces its public-schema init
-- and is the source of truth for rebuilding the database from scratch.
--
-- Idempotent: safe to run against the live project (it changes nothing there)
-- or a fresh one.
--
-- Not covered by SQL — set in the dashboard on a fresh project:
--   * Settings → API → Exposed schemas: add "gymlog"
--   * Authentication → Providers: enable Google and Email
--
-- user_id columns have no foreign key to auth.users: rows were copied in from
-- the deleted project, where user ids differed. RLS (auth.uid() = user_id) is
-- what scopes every row.

create extension if not exists "pgcrypto";

create schema if not exists gymlog;

grant usage on schema gymlog to anon, authenticated, service_role;
alter default privileges in schema gymlog
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema gymlog
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema gymlog
  grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Training log. Matches the data model in Core app md files/SWE_S.tracker_App.md.
-- ---------------------------------------------------------------------------

create table if not exists gymlog.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  muscle_group text,
  is_compound boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Ordered rotation, e.g. Chest -> Back -> Arms -> Legs. "Today" is the next
-- position after the last session's, not a calendar date. See "Today logic"
-- in the spec.
create table if not exists gymlog.split (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  position int not null,
  day_label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

create table if not exists gymlog.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  date date not null,
  day_label text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists gymlog.sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  session_id uuid not null references gymlog.sessions (id) on delete cascade,
  exercise_id uuid not null references gymlog.exercises (id),
  set_no int not null,
  weight numeric not null,
  reps int not null,
  rpe numeric,
  felt_note text,
  created_at timestamptz not null default now()
);

create index if not exists sets_session_id_idx on gymlog.sets (session_id);
create index if not exists sets_exercise_id_idx on gymlog.sets (exercise_id);
create index if not exists sessions_date_idx on gymlog.sessions (date desc);

-- ---------------------------------------------------------------------------
-- Coach: the lifter's profile, saved chat, and the coach's running notes.
-- ---------------------------------------------------------------------------

create table if not exists gymlog.profiles (
  user_id uuid primary key default auth.uid(),
  goal text,
  experience text,
  days_per_week int check (days_per_week >= 1 and days_per_week <= 7),
  injuries text,
  preferences text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gymlog.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  who text not null check (who in ('user', 'coach')),
  kind text not null default 'chat' check (kind in ('chat', 'checkin')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx
  on gymlog.coach_messages (user_id, created_at desc);

create table if not exists gymlog.coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  note text not null,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Integrations. Tokens are readable only by their owner through RLS.
-- ---------------------------------------------------------------------------

create table if not exists gymlog.notion_connections (
  user_id uuid primary key default auth.uid(),
  access_token text not null,
  workspace_name text,
  workspace_icon text,
  bot_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Views. security_invoker so they enforce the querying user's RLS policies
-- (Postgres views run as their owner by default, which would bypass RLS).
-- ---------------------------------------------------------------------------

-- Last performance per exercise — the "PLANNED · LAST TIME" row on Today.
create or replace view gymlog.last_performance
  with (security_invoker = true) as
select distinct on (s.exercise_id)
  s.exercise_id,
  s.user_id,
  s.weight,
  s.reps,
  s.rpe,
  s.set_no,
  sess.date,
  s.weight * (1 + s.reps / 30.0) as est_1rm
from gymlog.sets s
join gymlog.sessions sess on sess.id = s.session_id
order by s.exercise_id, sess.date desc, s.set_no desc;

-- Est-1RM per set, for trend sparklines and the Exercise detail history table.
create or replace view gymlog.set_trend
  with (security_invoker = true) as
select
  s.id,
  s.user_id,
  s.exercise_id,
  s.session_id,
  sess.date,
  s.weight,
  s.reps,
  s.rpe,
  s.weight * (1 + s.reps / 30.0) as est_1rm
from gymlog.sets s
join gymlog.sessions sess on sess.id = s.session_id
order by s.exercise_id, sess.date;

-- ---------------------------------------------------------------------------
-- Row-level security: every row belongs to auth.uid().
-- ---------------------------------------------------------------------------

alter table gymlog.exercises enable row level security;
alter table gymlog.split enable row level security;
alter table gymlog.sessions enable row level security;
alter table gymlog.sets enable row level security;
alter table gymlog.profiles enable row level security;
alter table gymlog.coach_messages enable row level security;
alter table gymlog.coach_notes enable row level security;
alter table gymlog.notion_connections enable row level security;

drop policy if exists "own exercises" on gymlog.exercises;
create policy "own exercises" on gymlog.exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own split" on gymlog.split;
create policy "own split" on gymlog.split
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own sessions" on gymlog.sessions;
create policy "own sessions" on gymlog.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own sets" on gymlog.sets;
create policy "own sets" on gymlog.sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own profile" on gymlog.profiles;
create policy "own profile" on gymlog.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own messages" on gymlog.coach_messages;
create policy "own messages" on gymlog.coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own notes" on gymlog.coach_notes;
create policy "own notes" on gymlog.coach_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own notion connection" on gymlog.notion_connections;
create policy "own notion connection" on gymlog.notion_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on all tables in schema gymlog to anon, authenticated, service_role;
