-- Gym Log — initial schema.
-- Matches the data model in Core app md files/SWE_S.tracker_App.md.
-- One user, Google sign-in via Supabase Auth, RLS scoped to auth.uid()
-- so the data stays the signed-in user's even though there's only one.

create extension if not exists "pgcrypto";

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) default auth.uid(),
  name text not null,
  muscle_group text,
  is_compound boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Ordered rotation, e.g. Chest -> Back -> Arms -> Legs. "Today" is the next
-- position after the last session's, not a calendar date. See "Today logic"
-- in the spec.
create table split (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) default auth.uid(),
  position int not null,
  day_label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) default auth.uid(),
  date date not null,
  day_label text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) default auth.uid(),
  session_id uuid not null references sessions (id) on delete cascade,
  exercise_id uuid not null references exercises (id),
  set_no int not null,
  weight numeric not null,
  reps int not null,
  rpe numeric,
  felt_note text,
  created_at timestamptz not null default now()
);

create index sets_session_id_idx on sets (session_id);
create index sets_exercise_id_idx on sets (exercise_id);
create index sessions_date_idx on sessions (date desc);

-- Last performance per exercise — the "PLANNED · LAST TIME" row on Today.
-- security_invoker so the view enforces the querying user's RLS policies
-- (Postgres views run as their owner by default, which would otherwise
-- bypass the row-level security set up below).
create view last_performance
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
from sets s
join sessions sess on sess.id = s.session_id
order by s.exercise_id, sess.date desc, s.set_no desc;

-- Est-1RM per set, for trend sparklines and the Exercise detail history table.
create view set_trend
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
from sets s
join sessions sess on sess.id = s.session_id
order by s.exercise_id, sess.date;

alter table exercises enable row level security;
alter table split enable row level security;
alter table sessions enable row level security;
alter table sets enable row level security;

create policy "own exercises" on exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own split" on split
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sets" on sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
