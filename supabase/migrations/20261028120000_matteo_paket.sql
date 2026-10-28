-- Wünsche von Renée (27.10., „Div“) und Matteo (28.10., „Re: TeamHub Updates“), von Renée freigegeben.
-- Nur Ergänzungen, keine bestehenden Daten werden verändert.

-- 1) Rollen Lehrling und Praktikantin: dürfen dasselbe wie Mitarbeiterinnen, sind aber eigens filterbar.
--    Darum keine neue app_role (die steuert Rechte), sondern eine Unterart davon.
alter table public.employees add column if not exists staff_kind text check (staff_kind in ('lehrling', 'praktikantin'));

-- 2) Stellvertretung: je Person eine Ersatzperson, dazu Abwesenheiten. Ist jemand heute abwesend, gehen seine
--    Aufgaben an die Ersatzperson (sichtbar, abhakbar, Mitteilungen).
alter table public.employees add column if not exists deputy_id uuid references public.employees(id) on delete set null;
create table if not exists public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  from_day date not null,
  until_day date not null,
  note text not null default '',
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check (until_day >= from_day)
);
alter table public.employee_absences enable row level security;

-- Heute in Zürich
create or replace function public.zurich_today() returns date language sql stable as $$ select (now() at time zone 'Europe/Zurich')::date $$;

-- Wer ist heute abwesend und wird von wem vertreten
create or replace function public.covering_for(p_deputy uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id from employees e
  where e.deputy_id = p_deputy and e.active
    and exists (select 1 from employee_absences a where a.employee_id = e.id and public.zurich_today() between a.from_day and a.until_day)
$$;
create or replace function public.my_covered() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from public.covering_for(public.my_employee_id()) x
$$;

create policy absences_read on public.employee_absences for select to authenticated using (
  public.is_staff() and (employee_id = public.my_employee_id() or public.leads_person(employee_id)
    or exists (select 1 from public.employees e where e.id = employee_absences.employee_id and e.deputy_id = public.my_employee_id())));
create policy absences_write on public.employee_absences for all to authenticated
  using (public.leads_person(employee_id)) with check (public.leads_person(employee_id));

-- Filialleitung darf bei ihren Leuten auch Unterart und Ersatzperson setzen
create or replace function teamhub_private.guard_employee_write()
 returns trigger language plpgsql set search_path to '' as $function$
declare
  actor public.employees;
  personal text[] := array['lang','photo_path','about','notify_prefs','updated_at'];
  device_fields text[] := array['last_seen_at','app_installed_at','push_enabled','updated_at'];
begin
  if auth.role() = 'service_role' then return new; end if;
  if auth.uid() is null then
    if coalesce(auth.role(), '') = '' and current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then return new; end if;
    raise exception 'employee_write_forbidden' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.auth_user_id is distinct from old.auth_user_id
      or new.email is distinct from old.email or new.created_at is distinct from old.created_at
      or new.phorest_staff_id is distinct from old.phorest_staff_id then
      raise exception 'employee_identity_immutable' using errcode = '42501';
    end if;
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
      or (to_jsonb(new) - array['job_title','skills','active','updated_at','staff_kind','deputy_id'])
        is distinct from (to_jsonb(old) - array['job_title','skills','active','updated_at','staff_kind','deputy_id']) then
      raise exception 'employee_lead_write_forbidden' using errcode = '42501';
    end if;
    if new.staff_kind is not null and old.app_role <> 'mitarbeiterin' then
      raise exception 'employee_lead_write_forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'employee_write_forbidden' using errcode = '42501';
  end if;

  if new.staff_kind is not null and new.app_role <> 'mitarbeiterin' then new.staff_kind := null; end if;
  if new.deputy_id = new.id then raise exception 'deputy_self'; end if;
  if (tg_op = 'INSERT' or new.extra_branch_ids is distinct from old.extra_branch_ids)
    and exists (select 1 from unnest(new.extra_branch_ids) b where b is null or not exists (select 1 from public.branches x where x.id = b)) then
    raise exception 'unknown_branch';
  end if;
  if (tg_op = 'INSERT' or new.skills is distinct from old.skills)
    and exists (select 1 from unnest(new.skills) s where s is null or not exists (select 1 from public.skills x where x.name = s)) then
    raise exception 'unknown_skill';
  end if;
  return new;
end $function$;

-- 3) Aufgaben: weitergeben, mehrere Ziele auf einmal (Gruppe), Erinnerung, Stellvertretung
alter table public.todos add column if not exists group_id uuid;
alter table public.todos add column if not exists remind_at timestamptz;
alter table public.todos add column if not exists reminded_at timestamptz;
alter table public.todos add column if not exists handed_from_name text;

drop policy if exists todos_read on public.todos;
create policy todos_read on public.todos for select to authenticated using (
  (assignee_id = my_employee_id()) or (created_by = my_employee_id())
  or ((assignee_id is null) and (branch_id = any (my_branches())))
  or leads_todo(assignee_id, branch_id)
  or (assignee_id = any (public.my_covered())));

create or replace function public.todo_done(p_id uuid, p_done boolean)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t public.todos; me public.employees;
begin
  select * into me from employees where auth_user_id = auth.uid() and active limit 1;
  if me.id is null then raise exception 'not_signed_in'; end if;
  select * into t from todos where id = p_id for update;
  if t.id is null then raise exception 'not_found'; end if;
  if (t.assignee_id = me.id or t.created_by = me.id
          or (t.assignee_id is null and t.branch_id = any(my_branches()))
          or leads_todo(t.assignee_id, t.branch_id)
          or t.assignee_id = any(public.my_covered())) is not true then
    raise exception 'forbidden';
  end if;
  if p_done and t.done_at is not null then raise exception 'already_done'; end if;
  update todos set
    done_at = case when p_done then now() end,
    done_by = case when p_done then me.id end,
    done_by_name = case when p_done then trim(me.first_name || ' ' || left(coalesce(me.last_name, ''), 1) || '.') end
  where id = p_id;
end $function$;

-- Weitergeben: wer die Aufgabe hat (oder vertritt, oder leitet), gibt sie an eine aktive Person weiter.
-- Die neue Person bekommt eine Mitteilung (notified_at zurück auf null).
create or replace function public.todo_handover(p_id uuid, p_to uuid, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t public.todos; me public.employees; target public.employees;
begin
  select * into me from employees where auth_user_id = auth.uid() and active limit 1;
  if me.id is null then raise exception 'not_signed_in'; end if;
  select * into t from todos where id = p_id for update;
  if t.id is null then raise exception 'not_found'; end if;
  if t.done_at is not null then raise exception 'already_done'; end if;
  if (t.assignee_id = me.id or t.created_by = me.id
          or (t.assignee_id is null and t.branch_id = any(my_branches()))
          or leads_todo(t.assignee_id, t.branch_id)
          or t.assignee_id = any(public.my_covered())) is not true then
    raise exception 'forbidden';
  end if;
  select * into target from employees where id = p_to and active;
  if target.id is null then raise exception 'unknown_person'; end if;
  if target.id = t.assignee_id then raise exception 'same_person'; end if;
  update todos set assignee_id = target.id, branch_id = null, notified_at = null,
    handed_from_name = trim(me.first_name || ' ' || left(coalesce(me.last_name, ''), 1) || '.'),
    note = case when coalesce(trim(p_note), '') = '' then note
                when coalesce(trim(note), '') = '' then 'Weitergegeben von ' || me.first_name || ': ' || trim(p_note)
                else note || E'\n\n' || 'Weitergegeben von ' || me.first_name || ': ' || trim(p_note) end
  where id = p_id;
end $function$;
grant execute on function public.todo_handover(uuid, uuid, text) to authenticated;
grant execute on function public.my_covered() to authenticated;

-- 4) Chats: Fotos in Studio- und Team-Chats
alter table public.chat_messages add column if not exists photo_path text;
insert into storage.buckets (id, name, public) values ('chat-photos', 'chat-photos', false) on conflict (id) do nothing;
create policy chat_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-photos' and public.chat_can(((storage.foldername(name))[1])::uuid));
create policy chat_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'chat-photos' and public.chat_can(((storage.foldername(name))[1])::uuid));
create policy chat_photos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'chat-photos' and (public.is_buero() or owner = auth.uid()));
-- Wird eine Nachricht gelöscht (auch durch die Aufbewahrungsfrist), kommt ihr Foto in die Löschwarteschlange
alter table public.privacy_storage_deletions add column if not exists bucket text not null default 'assistant-context';
create or replace function teamhub_private.queue_chat_photo_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.photo_path is not null then
    insert into public.privacy_storage_deletions (path, bucket) values (old.photo_path, 'chat-photos');
  end if;
  return old;
end $$;
drop trigger if exists chat_photo_delete on public.chat_messages;
create trigger chat_photo_delete after delete on public.chat_messages for each row execute function teamhub_private.queue_chat_photo_delete();

-- 5) Schulungen mit Bild
alter table public.events add column if not exists image_path text;

-- 6) Wissen: Bereiche (bisher fest im Code) und Zuordnung der Themen; Bereich „Filialleitung“ nur für Leitung und Büro
create table if not exists public.wiki_areas (
  key text primary key,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  icon text not null default 'layout',
  tone text not null default 'note',
  access_level text not null default 'alle' check (access_level in ('alle', 'filialleitung', 'buero')),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wiki_areas enable row level security;
create policy wareas_read on public.wiki_areas for select to authenticated using (public.is_staff() and public.can_read_level(access_level));
create policy wareas_write on public.wiki_areas for all to authenticated using (public.is_buero()) with check (public.is_buero());
insert into public.wiki_areas (key, name, description, icon, tone, sort) values
  ('behandlung', 'Behandlungen & Protokolle', 'Schritt-für-Schritt-Anleitungen und Standards', 'sparkles', 'learn', 10),
  ('hygiene', 'Hygiene & Arbeitsplatz', 'Desinfektion, Geräte, Reinigung und Sicherheit', 'shield', 'duty', 20),
  ('studio', 'Studio & Abläufe', 'Empfang, Kasse, Gutscheine, Bestellungen, Phorest', 'layout', 'note', 30),
  ('team', 'Team & Personal', 'Arbeitszeit, Ferien, Lohn, Regeln im Team', 'users', 'plum', 40),
  ('lernen', 'Lernen & Ausbildung', 'Lehre, Praktikum, Kurse und Leitfäden', 'graduation', 'done', 50)
on conflict (key) do nothing;
insert into public.wiki_areas (key, name, description, icon, tone, access_level, sort) values
  ('filialleitung', 'Filialleitung', 'Nur für Filialleitungen und das Büro', 'key', 'studio', 'filialleitung', 60)
on conflict (key) do nothing;
alter table public.wiki_categories add column if not exists area_key text references public.wiki_areas(key) on delete set null;

-- Bild zu einer Schulung: Filialleitung darf dafür unter media/events/ hochladen (wie bei News)
drop policy if exists files_write_news_photo on storage.objects;
create policy files_write_news_photo on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] in ('news', 'events') and (public.is_buero() or public.is_lead()));

-- Vertretung über Studios hinweg: Checklisten des vertretenen Studios sehen und abhaken
create or replace function public.covered_branches() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct b), '{}') from employees e, unnest(array_prepend(e.branch_id, e.extra_branch_ids)) b
  where e.id = any(public.my_covered()) and b <> 'buero'
$$;
grant execute on function public.covered_branches() to authenticated;
drop policy if exists tc_read on public.task_completions;
create policy tc_read on public.task_completions for select to authenticated using (is_buero() or branch_id = any(my_branches()) or branch_id = any(public.covered_branches()));
drop policy if exists tc_insert on public.task_completions;
create policy tc_insert on public.task_completions for insert to authenticated with check ((branch_id = any(my_branches()) or branch_id = any(public.covered_branches())) and done_by = my_employee_id());
-- Erste Mitteilung an die Ersatzperson, wenn eine Abwesenheit beginnt
alter table public.employee_absences add column if not exists deputy_notified_at timestamptz;
