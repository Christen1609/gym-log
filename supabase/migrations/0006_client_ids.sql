-- Client-generated ids for writes queued offline, so a replay that already
-- reached the server (response lost) is recognised and not written twice.

alter table gymlog.sets add column if not exists client_id text;
alter table gymlog.cardio add column if not exists client_id text;

create index if not exists sets_client_id_idx on gymlog.sets (user_id, client_id) where client_id is not null;
create index if not exists cardio_client_id_idx on gymlog.cardio (user_id, client_id) where client_id is not null;

notify pgrst, 'reload schema';
