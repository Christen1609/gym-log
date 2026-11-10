-- Spotify OAuth connection per signed-in user.
-- Tokens are read/written only by the owning Supabase user through RLS.

create table if not exists gymlog.spotify_connections (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  token_type text,
  spotify_user_id text,
  display_name text,
  updated_at timestamptz not null default now()
);

alter table gymlog.spotify_connections enable row level security;

drop policy if exists "own spotify connection" on gymlog.spotify_connections;
create policy "own spotify connection" on gymlog.spotify_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
