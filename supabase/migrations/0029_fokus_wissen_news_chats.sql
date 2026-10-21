-- 0029: Zweite Feedback-Runde der Inhaberin (21.10.): Fokus auf Wissen, News, Lernen und Austausch im Team.
--   News-Kategorien Wichtig/Schulung/Team/Salon, Bestätigungsstand je Pflicht-News, Lesefortschritt und Durchgänge
--   im Wissen, „Persönliches“ im Profil, Team-Chats, Learning (Wissen teilen) in Melden & Ideen.

-- News-Kategorien wie gewünscht (Wichtig, Schulung, Team, Salon)
update public.news set tag = 'Salon' where tag in ('Studio', 'Marketing');
update public.news set tag = 'Wichtig' where tag in ('Pflicht', 'Hygiene');

-- Bestätigungsstand der Pflicht-News: „8 von 12 bestätigt“. Zählt alle aktiven Personen der Zielgruppe (ohne Büro,
-- ausser es ist namentlich adressiert), auch wenn die Lesende selbst die anderen Bestätigungen nicht sehen darf.
create or replace function public.news_progress()
returns table (news_id uuid, confirmed int, total int)
language sql stable security definer set search_path = public as $$
  select n.id,
    (select count(*) from public.news_reads r join public.employees e on e.id = r.employee_id and e.active
      where r.news_id = n.id and r.confirmed_at is not null)::int,
    (select count(*) from public.employees e where e.active and (
      case when coalesce(cardinality(n.audience_people), 0) > 0 then e.id = any(n.audience_people)
      else e.app_role <> 'buero'
        and (coalesce(cardinality(n.audience_branches), 0) = 0 or array_prepend(e.branch_id, e.extra_branch_ids) && n.audience_branches)
        and (coalesce(cardinality(n.audience_groups), 0) = 0 or public.job_groups(e.job_title) && n.audience_groups)
        and (coalesce(cardinality(n.audience_skills), 0) = 0 or e.skills && n.audience_skills)
      end))::int
  from public.news n
  where n.must_read and public.is_staff() and n.publish_at <= now()
    and public.news_for_me(n.audience_branches, n.audience_groups, n.audience_skills, n.audience_people)
$$;
grant execute on function public.news_progress() to authenticated;

-- Wissen: eigene Öffnungen lesen (für „schon angeschaut“)
drop policy if exists wv_read on public.wiki_views;
create policy wv_read on public.wiki_views for select to authenticated using (employee_id = public.my_employee_id());

-- Wissen: „Gelesen & bestätigt“ (einmal je Person) und jeder abgeschlossene Durchgang einer Schritt-Anleitung
create table if not exists public.wiki_runs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.wiki_articles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('gelesen', 'durchgang')),
  created_at timestamptz not null default now()
);
create index if not exists wiki_runs_person on public.wiki_runs (employee_id, article_id);
create unique index if not exists wiki_runs_gelesen_once on public.wiki_runs (article_id, employee_id) where kind = 'gelesen';
alter table public.wiki_runs enable row level security;
drop policy if exists wr_read on public.wiki_runs;
create policy wr_read on public.wiki_runs for select to authenticated using (employee_id = public.my_employee_id() or public.leads_person(employee_id));
drop policy if exists wr_insert on public.wiki_runs;
create policy wr_insert on public.wiki_runs for insert to authenticated with check (employee_id = public.my_employee_id());

-- Profil: „Persönliches“ (Hobbys, was man über mich wissen darf), jede Person pflegt es selbst
alter table public.employees add column if not exists about text;
create or replace function public.update_my_about(p_about text)
returns void language sql security definer set search_path = public as $$
  update public.employees set about = nullif(left(btrim(coalesce(p_about, '')), 600), ''), updated_at = now()
  where auth_user_id = auth.uid() and active
$$;
grant execute on function public.update_my_about(text) to authenticated;

-- Team-Chats: ein Raum je Studio, ein Raum fürs ganze Team, Direkt- und Gruppenchats
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('studio', 'team', 'direkt', 'gruppe')),
  branch_id text references public.branches(id) on delete cascade,
  title text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create unique index if not exists chat_rooms_studio on public.chat_rooms (branch_id) where kind = 'studio';
create unique index if not exists chat_rooms_team on public.chat_rooms (kind) where kind = 'team';
create table if not exists public.chat_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, employee_id)
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.employees(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room on public.chat_messages (room_id, created_at desc);

-- Wer darf in einen Raum: Studio-Raum = eigenes Studio, Team-Raum = alle, sonst eingetragene Mitglieder
create or replace function public.chat_can(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() and exists (select 1 from public.chat_rooms r where r.id = p_room and (
    r.kind = 'team'
    or (r.kind = 'studio' and (public.my_role() = 'buero' or r.branch_id = any(public.my_branches())))
    or exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = public.my_employee_id())))
$$;
grant execute on function public.chat_can(uuid) to authenticated;

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
drop policy if exists cr_read on public.chat_rooms;
create policy cr_read on public.chat_rooms for select to authenticated using (public.chat_can(id));
drop policy if exists cm_read on public.chat_members;
create policy cm_read on public.chat_members for select to authenticated using (public.chat_can(room_id));
drop policy if exists cm_upsert on public.chat_members;
create policy cm_upsert on public.chat_members for insert to authenticated with check (employee_id = public.my_employee_id() and public.chat_can(room_id));
drop policy if exists cm_update on public.chat_members;
create policy cm_update on public.chat_members for update to authenticated using (employee_id = public.my_employee_id()) with check (employee_id = public.my_employee_id());
drop policy if exists cmsg_read on public.chat_messages;
create policy cmsg_read on public.chat_messages for select to authenticated using (public.chat_can(room_id));
drop policy if exists cmsg_insert on public.chat_messages;
create policy cmsg_insert on public.chat_messages for insert to authenticated with check (sender_id = public.my_employee_id() and public.chat_can(room_id));
drop policy if exists cmsg_delete on public.chat_messages;
create policy cmsg_delete on public.chat_messages for delete to authenticated using (sender_id = public.my_employee_id() or public.is_buero());

create or replace function public.chat_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id;
  insert into public.chat_members (room_id, employee_id, last_read_at) values (new.room_id, new.sender_id, new.created_at)
    on conflict (room_id, employee_id) do update set last_read_at = excluded.last_read_at;
  return new;
end $$;
drop trigger if exists chat_touch on public.chat_messages;
create trigger chat_touch after insert on public.chat_messages for each row execute function public.chat_touch();

-- Direktchat mit einer Person (vorhandenen wiederverwenden) oder Gruppenchat mit Titel
create or replace function public.start_chat(p_people uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_employee_id(); others uuid[]; rid uuid;
begin
  if me is null then raise exception 'not_an_employee'; end if;
  select array_agg(distinct x) into others from unnest(p_people) x
    where x <> me and exists (select 1 from public.employees e where e.id = x and e.active);
  if coalesce(cardinality(others), 0) = 0 then raise exception 'no_people'; end if;
  if cardinality(others) = 1 and coalesce(btrim(p_title), '') = '' then
    select r.id into rid from public.chat_rooms r where r.kind = 'direkt'
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = me)
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = others[1])
      and (select count(*) from public.chat_members m where m.room_id = r.id) = 2 limit 1;
    if rid is not null then return rid; end if;
    insert into public.chat_rooms (kind, created_by) values ('direkt', me) returning id into rid;
  else
    insert into public.chat_rooms (kind, title, created_by) values ('gruppe', nullif(btrim(p_title), ''), me) returning id into rid;
  end if;
  insert into public.chat_members (room_id, employee_id) select rid, x from unnest(array_append(others, me)) x on conflict do nothing;
  return rid;
end $$;
grant execute on function public.start_chat(uuid[], text) to authenticated;

insert into public.chat_rooms (kind, branch_id, title) select 'studio', id, name from public.branches where id <> 'buero' on conflict do nothing;
insert into public.chat_rooms (kind, title) values ('team', 'Ganzes Team') on conflict do nothing;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Learning: Kolleginnen teilen Videos, Fotos und Tipps (dritter Knopf in Melden & Ideen, „Wissen teilen“ im Wissen).
-- Für alle Studios sichtbar wie Ideen, geht nie an Facility oder als Mitteilung an die Leitung.
alter table public.tickets drop constraint if exists tickets_kind_check;
alter table public.tickets add constraint tickets_kind_check check (kind = any (array['Meldung', 'Idee', 'Learning']));
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated using (
  created_by = public.my_employee_id() or public.leads_branch(branch_id)
  or (public.is_staff() and (kind in ('Idee', 'Learning') or branch_id = any(public.my_branches()) or all_studios)));
create or replace function public.learning_quiet() returns trigger language plpgsql as $$
begin
  if new.kind = 'Learning' then new.lead_notified_at := coalesce(new.lead_notified_at, now()); new.mail_status := coalesce(new.mail_status, 'uebersprungen'); end if;
  return new;
end $$;
drop trigger if exists learning_quiet on public.tickets;
create trigger learning_quiet before insert on public.tickets for each row execute function public.learning_quiet();

-- Fotos und Videos aus Learning-Beiträgen dürfen alle Mitarbeiterinnen sehen (sonst nur eigene, Leitung und Büro)
drop policy if exists learning_media_read on storage.objects;
create policy learning_media_read on storage.objects for select to authenticated using (
  bucket_id = 'ticket-photos' and public.is_staff()
  and exists (select 1 from public.tickets t where t.photo_path = storage.objects.name and t.kind = 'Learning'));
