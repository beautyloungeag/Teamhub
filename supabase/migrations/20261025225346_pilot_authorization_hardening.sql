-- Close the pilot audit's authorization paths at the database boundary.
-- No existing employee, permission, message or file is rewritten by this migration.

create or replace function teamhub_private.guard_employee_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor public.employees;
  personal text[] := array['lang','photo_path','about','notify_prefs','updated_at'];
  device_fields text[] := array['last_seen_at','app_installed_at','push_enabled','updated_at'];
begin
  -- Service keys and direct maintenance/auth-service operations are trusted.
  -- auth.uid() is still checked inside SECURITY DEFINER profile RPCs: their
  -- current_user alone must never bypass authorization-field protection.
  if auth.role() = 'service_role' then return new; end if;
  if auth.uid() is null then
    if coalesce(auth.role(), '') = '' and current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then return new; end if;
    raise exception 'employee_write_forbidden' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- These fields are owned by the auth/Phorest administration path, not by
    -- arbitrary Data API PATCH requests, including office browser requests.
    if new.id is distinct from old.id or new.auth_user_id is distinct from old.auth_user_id
      or new.email is distinct from old.email or new.created_at is distinct from old.created_at
      or new.phorest_staff_id is distinct from old.phorest_staff_id then
      raise exception 'employee_identity_immutable' using errcode = '42501';
    end if;
    -- Verified device-maintenance RPCs/triggers also update other profiles when
    -- their subscriptions are revoked. Only these non-authorizing fields pass.
    if current_user in ('postgres','supabase_admin','service_role')
      and (to_jsonb(new) - device_fields) = (to_jsonb(old) - device_fields) then return new; end if;
    if current_user not in ('postgres','supabase_admin','service_role') and
      (new.last_seen_at is distinct from old.last_seen_at
       or new.app_installed_at is distinct from old.app_installed_at
       or new.push_enabled is distinct from old.push_enabled) then
      raise exception 'employee_device_fields_server_owned' using errcode = '42501';
    end if;
  end if;

  select * into actor from public.current_employee();
  if actor.id is null then raise exception 'employee_write_forbidden' using errcode = '42501'; end if;

  if tg_op = 'INSERT' then
    if actor.app_role <> 'buero' or new.auth_user_id is not null or new.phorest_staff_id is not null then
      raise exception 'employee_create_forbidden' using errcode = '42501';
    end if;
    new.created_at := clock_timestamp(); new.updated_at := new.created_at;
  elsif actor.app_role = 'buero' then
    if new.id = actor.id and (new.app_role is distinct from old.app_role
      or new.branch_id is distinct from old.branch_id or new.extra_branch_ids is distinct from old.extra_branch_ids
      or new.active is distinct from old.active) then
      raise exception 'employee_self_authorization_change' using errcode = '42501';
    end if;
  elsif new.id = actor.id then
    if (to_jsonb(new) - personal) is distinct from (to_jsonb(old) - personal) then
      raise exception 'employee_self_authorization_change' using errcode = '42501';
    end if;
    if new.photo_path is not null and new.photo_path is distinct from old.photo_path
      and split_part(new.photo_path, '/', 1) <> actor.id::text then
      raise exception 'profile_photo_owner_mismatch' using errcode = '42501';
    end if;
  elsif actor.app_role = 'filialleitung' then
    if old.app_role = 'buero' or old.branch_id = 'buero'
      or not (old.branch_id = any(array_prepend(actor.branch_id, actor.extra_branch_ids)))
      or (to_jsonb(new) - array['job_title','skills','active','updated_at'])
        is distinct from (to_jsonb(old) - array['job_title','skills','active','updated_at']) then
      raise exception 'employee_lead_write_forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'employee_write_forbidden' using errcode = '42501';
  end if;

  if (tg_op = 'INSERT' or new.extra_branch_ids is distinct from old.extra_branch_ids)
    and exists (select 1 from unnest(new.extra_branch_ids) b where b is null or not exists (select 1 from public.branches x where x.id = b)) then
    raise exception 'unknown_branch';
  end if;
  if (tg_op = 'INSERT' or new.skills is distinct from old.skills)
    and exists (select 1 from unnest(new.skills) s where s is null or not exists (select 1 from public.skills x where x.name = s)) then
    raise exception 'unknown_skill';
  end if;
  return new;
end $$;
revoke all on function teamhub_private.guard_employee_write() from public, anon, authenticated;
create trigger employee_write_guard before insert or update on public.employees
for each row execute function teamhub_private.guard_employee_write();

-- Retain the existing API signature so old clients do not silently create a new
-- overload. Qualification changes must use the authorized administrative path.
create or replace function public.update_my_profile(p_lang text default null, p_skills text[] default null, p_photo_path text default null)
returns public.employees language plpgsql security definer set search_path = '' as $$
declare me public.employees; result public.employees;
begin
  select * into me from public.current_employee();
  if me.id is null then raise exception 'not_an_employee' using errcode = '42501'; end if;
  if p_skills is not null then raise exception 'skills_managed_by_lead_or_office' using errcode = '42501'; end if;
  if p_lang is not null and p_lang not in ('DE','EN','FR') then raise exception 'invalid_language'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> me.id::text then
    raise exception 'profile_photo_owner_mismatch' using errcode = '42501';
  end if;
  update public.employees set lang = coalesce(p_lang, lang), photo_path = coalesce(p_photo_path, photo_path), updated_at = clock_timestamp()
  where id = me.id returning * into result;
  return result;
end $$;
revoke all on function public.update_my_profile(text,text[],text) from public, anon;
grant execute on function public.update_my_profile(text,text[],text) to authenticated, service_role;

-- A completion cannot turn another person's private upload into a readable
-- reference in a different studio. Historical actor nulling by FK is retained.
create or replace function teamhub_private.guard_task_proof_reference()
returns trigger language plpgsql set search_path = '' as $$
declare actor public.employees;
begin
  if auth.role() = 'service_role' or (auth.uid() is null and current_user in ('postgres','supabase_admin','service_role')) then return new; end if;
  select * into actor from public.current_employee();
  if actor.id is null then raise exception 'task_proof_forbidden' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.done_by is distinct from actor.id or
      (new.photo_path is not null and split_part(new.photo_path, '/', 1) <> actor.id::text) then
      raise exception 'task_proof_owner_mismatch' using errcode = '42501';
    end if;
    new.done_by_name := trim(actor.first_name || ' ' || left(actor.last_name, 1) || '.');
  elsif new.id is distinct from old.id or new.item_id is distinct from old.item_id
    or new.branch_id is distinct from old.branch_id or new.day is distinct from old.day
    or new.photo_path is distinct from old.photo_path or new.done_at is distinct from old.done_at
    or new.done_by_name is distinct from old.done_by_name
    or (new.done_by is distinct from old.done_by and not (
      pg_trigger_depth() > 1 and new.done_by is null and old.done_by is not null and not exists(select 1 from public.employees where id = old.done_by))) then
    raise exception 'task_proof_reference_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function teamhub_private.guard_task_proof_reference() from public, anon, authenticated;
create trigger task_proof_reference_guard before insert or update on public.task_completions
for each row execute function teamhub_private.guard_task_proof_reference();

alter policy files_read on storage.objects using (
  (bucket_id = 'profile-photos' and public.is_staff())
  or (bucket_id = 'media' and (
    ((storage.foldername(name))[1] <> 'wiki' and public.is_staff())
    or ((storage.foldername(name))[1] = 'wiki' and public.can_read_level((storage.foldername(name))[2]))))
  or (bucket_id = 'task-proofs' and public.is_staff() and (
    (storage.foldername(name))[1] = public.my_employee_id()::text
    or public.is_buero()
    or exists (select 1 from public.task_completions c where c.photo_path = objects.name and public.leads_branch(c.branch_id))))
  or (bucket_id = 'ticket-photos' and (
    (storage.foldername(name))[1] = public.my_employee_id()::text
    or exists (select 1 from public.tickets t where t.photo_path = objects.name)))
);

create or replace function teamhub_private.guard_comment_identity()
returns trigger language plpgsql set search_path = '' as $$
declare actor public.employees;
begin
  if auth.role() = 'service_role' or (auth.uid() is null and current_user in ('postgres','supabase_admin','service_role')) then return new; end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.ticket_id is distinct from old.ticket_id
      or new.author_name is distinct from old.author_name or new.created_at is distinct from old.created_at
      or (new.author_id is distinct from old.author_id and not (
        pg_trigger_depth() > 1 and new.author_id is null and old.author_id is not null and not exists(select 1 from public.employees where id = old.author_id))) then
      raise exception 'comment_identity_immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  select * into actor from public.current_employee();
  if actor.id is null or new.author_id is distinct from actor.id then
    raise exception 'comment_author_mismatch' using errcode = '42501';
  end if;
  new.author_name := trim(actor.first_name || ' ' || actor.last_name);
  new.created_at := clock_timestamp();
  return new;
end $$;
revoke all on function teamhub_private.guard_comment_identity() from public, anon, authenticated;
create trigger comment_identity_guard before insert or update on public.ticket_comments
for each row execute function teamhub_private.guard_comment_identity();

-- Read state is bounded to an actual message rendered by the client. A message
-- that arrives after the loaded snapshot must not be implicitly acknowledged.
alter table public.chat_members alter column last_read_at set default '1970-01-01 00:00:00+00'::timestamptz;
create or replace function teamhub_private.chat_clock() returns trigger
language plpgsql set search_path = '' as $$
declare latest timestamptz; bounded timestamptz;
begin
  if auth.uid() is not null then
    if tg_table_name = 'chat_messages' then new.created_at := clock_timestamp();
    else
      if tg_op = 'UPDATE' and (new.room_id is distinct from old.room_id or new.employee_id is distinct from old.employee_id) then
        raise exception 'chat_membership_immutable' using errcode = '42501';
      end if;
      select max(m.created_at) into latest from public.chat_messages m where m.room_id = new.room_id;
      bounded := least(coalesce(new.last_read_at, '1970-01-01'::timestamptz), coalesce(latest, '1970-01-01'::timestamptz), clock_timestamp());
      new.last_read_at := case when tg_op = 'UPDATE' then greatest(old.last_read_at, bounded) else bounded end;
    end if;
  end if;
  return new;
end $$;
revoke all on function teamhub_private.chat_clock() from public, anon, authenticated;

-- Sending alone does not mean the sender rendered any concurrent incoming
-- messages. The visible-message RPC owns read state; this trigger only updates
-- the room summary. Private membership is established by chat creation RPCs.
create or replace function public.chat_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_rooms set last_message_at = greatest(last_message_at, new.created_at) where id = new.room_id;
  return new;
end $$;
revoke all on function public.chat_touch() from public, anon, authenticated;

create or replace function public.mark_chat_read(p_room uuid, p_message uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_employee_id(); seen_at timestamptz; result timestamptz;
begin
  if me is null or not public.chat_can(p_room) then raise exception 'forbidden' using errcode = '42501'; end if;
  select created_at into seen_at from public.chat_messages where id = p_message and room_id = p_room;
  if seen_at is null then raise exception 'message_not_found'; end if;
  seen_at := least(seen_at, clock_timestamp());
  insert into public.chat_members(room_id, employee_id, last_read_at) values (p_room, me, seen_at)
  on conflict (room_id, employee_id) do update set last_read_at = greatest(public.chat_members.last_read_at, excluded.last_read_at)
  returning last_read_at into result;
  return result;
end $$;
revoke all on function public.mark_chat_read(uuid,uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid,uuid) to authenticated;

-- Realtime changes only invalidate client state; the next SELECT remains RLS
-- protected. Keep DEFAULT replica identities so DELETE never sends old bodies.
do $$ declare t text; begin
  foreach t in array array['employees','tickets','ticket_comments','ticket_votes'] loop
    execute format('alter table public.%I replica identity default', t);
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
