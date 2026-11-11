-- In-app account deletion (App Store Guideline 5.1.1(v)).
--
-- Called by the signed-in user over PostgREST: rpc("delete_my_account").
-- security definer so it can remove the auth.users row, which the
-- authenticated role can't touch. Every delete is pinned to auth.uid(), so a
-- caller can only ever remove themselves. search_path is empty and every name
-- is schema-qualified, so a caller can't shadow a table with their own.

create or replace function gymlog.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- sets first: sets.exercise_id references exercises with no cascade.
  delete from gymlog.sets where user_id = uid;
  delete from gymlog.cardio where user_id = uid;
  delete from gymlog.sessions where user_id = uid;
  delete from gymlog.exercises where user_id = uid;
  delete from gymlog.split where user_id = uid;
  delete from gymlog.coach_messages where user_id = uid;
  delete from gymlog.coach_notes where user_id = uid;
  delete from gymlog.notion_connections where user_id = uid;
  delete from gymlog.profiles where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function gymlog.delete_my_account() from public, anon;
grant execute on function gymlog.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
