-- Cardio sessions. A record only: never feeds est 1RM, the rotation or the
-- progress read-out. It counts as "trained" for the missing-workout reminder.

create table if not exists gymlog.cardio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  date date not null,
  kind text not null default 'Cardio',
  minutes int check (minutes between 1 and 600),
  distance_km numeric check (distance_km > 0 and distance_km <= 300),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists cardio_user_date_idx on gymlog.cardio (user_id, date desc);

alter table gymlog.cardio enable row level security;
drop policy if exists "own cardio" on gymlog.cardio;
create policy "own cardio" on gymlog.cardio
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on gymlog.cardio to anon, authenticated, service_role;

-- Let the API see the new table straight away.
notify pgrst, 'reload schema';
