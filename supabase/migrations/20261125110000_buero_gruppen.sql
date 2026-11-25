-- Chat-Gruppen vom Büro (Wunsch Büro 24.11.): das Büro legt Gruppen an und bestimmt die Mitglieder.
-- Einzelchats und eigene Gruppen der Mitarbeiterinnen bleiben am Schalter chat_private (weiterhin aus).

alter table public.chat_rooms add column if not exists office boolean not null default false;

create or replace function public.chat_can(p_room uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
 select public.is_staff() and coalesce((select public.is_staff() and exists (select 1 from public.chat_rooms r where r.id = p_room and (
    r.kind = 'team'
    or (r.kind = 'studio' and (public.my_role() = 'buero' or r.branch_id = any(public.my_branches())))
    or ((r.kind = 'gruppe' and r.office
         or coalesce((select value from public.app_settings where key = 'chat_private'), 'false'::jsonb) = 'true'::jsonb)
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = public.my_employee_id()))))), false)
$$;

create or replace function teamhub_private.chat_allows(p_room uuid, p_employee uuid)
returns boolean language sql stable set search_path to '' as $$
 select exists(select 1 from public.employees e join public.chat_rooms r on r.id=p_room
 where e.id=p_employee and e.active and (
  r.kind='team' or (r.kind='studio' and (e.app_role='buero' or r.branch_id=any(array_prepend(e.branch_id,e.extra_branch_ids))))
  or (r.kind in ('direkt','gruppe')
   and (r.kind='gruppe' and r.office or coalesce((select value from public.app_settings where key='chat_private'),'false'::jsonb)='true'::jsonb)
   and exists(select 1 from public.chat_members m where m.room_id=r.id and m.employee_id=e.id))))
$$;

create or replace function public.start_chat(p_people uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid := public.my_employee_id(); others uuid[]; rid uuid;
  priv boolean := coalesce((select value from public.app_settings where key = 'chat_private'), 'false'::jsonb) = 'true'::jsonb;
  office boolean := public.my_role() = 'buero';
begin
  if me is null then raise exception 'not_an_employee'; end if;
  if not priv and not office then raise exception 'private_chats_off'; end if;
  select array_agg(distinct x) into others from unnest(p_people) x
    where x <> me and exists (select 1 from public.employees e where e.id = x and e.active);
  if coalesce(cardinality(others), 0) = 0 then raise exception 'no_people'; end if;
  if priv and cardinality(others) = 1 and coalesce(btrim(p_title), '') = '' then
    select r.id into rid from public.chat_rooms r where r.kind = 'direkt'
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = me)
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = others[1])
      and (select count(*) from public.chat_members m where m.room_id = r.id) = 2 limit 1;
    if rid is not null then return rid; end if;
    insert into public.chat_rooms (kind, created_by) values ('direkt', me) returning id into rid;
  else
    -- Ohne Privatchats gibt es nur benannte Gruppen des Büros
    if not priv and coalesce(btrim(p_title), '') = '' then raise exception 'group_title_needed'; end if;
    insert into public.chat_rooms (kind, title, created_by, office) values ('gruppe', nullif(left(btrim(p_title), 80), ''), me, office) returning id into rid;
  end if;
  insert into public.chat_members (room_id, employee_id) select rid, x from unnest(array_append(others, me)) x on conflict do nothing;
  return rid;
end $$;

-- Name und Mitglieder einer Büro-Gruppe ändern: die genannte Liste gilt, die ändernde Person bleibt Mitglied
create or replace function public.update_office_group(p_room uuid, p_title text, p_people uuid[])
returns void language plpgsql security definer set search_path to 'public' as $$
declare me uuid := public.my_employee_id(); keep uuid[];
begin
  if me is null or public.my_role() <> 'buero' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.chat_rooms r where r.id = p_room and r.kind = 'gruppe' and r.office) then raise exception 'not_found'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'group_title_needed'; end if;
  select array_agg(distinct x) into keep from unnest(array_append(p_people, me)) x
    where exists (select 1 from public.employees e where e.id = x and e.active);
  if coalesce(cardinality(keep), 0) < 2 then raise exception 'no_people'; end if;
  update public.chat_rooms set title = left(btrim(p_title), 80) where id = p_room;
  delete from public.chat_members where room_id = p_room and employee_id <> all(keep);
  insert into public.chat_members (room_id, employee_id) select p_room, x from unnest(keep) x on conflict do nothing;
end $$;

-- Büro-Gruppe samt Nachrichten löschen (Fotos gehen über die bestehende Löschwarteschlange)
create or replace function public.delete_office_group(p_room uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if public.my_employee_id() is null or public.my_role() <> 'buero' then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.chat_rooms where id = p_room and kind = 'gruppe' and office;
  if not found then raise exception 'not_found'; end if;
end $$;

revoke all on function public.update_office_group(uuid, text, uuid[]) from public, anon;
revoke all on function public.delete_office_group(uuid) from public, anon;
grant execute on function public.update_office_group(uuid, text, uuid[]) to authenticated;
grant execute on function public.delete_office_group(uuid) to authenticated;
