-- BLTH-15 bis BLTH-25: Profile/Skills, News, Tagesaufgaben, Meldungen & Ideen,
-- Schulungen & Events, Wissen/Onboarding. Rechte laufen über die Rollen aus 0001.
-- is_sample markiert Beispielinhalte aus dem Prototyp; echte Inhalte (BLTH-10) ersetzen sie.

create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.employees where auth_user_id = auth.uid() and active limit 1
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() is not null $$;
create or replace function public.is_buero() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() = 'buero' $$;
-- Filialleitung einer der angegebenen Filialen (oder Büro)
create or replace function public.leads_branch(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'buero' or (public.my_role() = 'filialleitung' and b = any(public.my_branches()))
$$;
-- Zielgruppe: leer = alle, sonst Überschneidung mit meinen Filialen
create or replace function public.in_audience(branches text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(cardinality(branches), 0) = 0 or public.my_role() = 'buero' or branches && public.my_branches()
$$;

-- ---------- Skills (BLTH-15) ----------
create table public.skills (name text primary key, sort int not null default 0, is_sample boolean not null default false);
alter table public.skills enable row level security;
create policy skills_read on public.skills for select to authenticated using (public.is_staff());
create policy skills_write on public.skills for all to authenticated using (public.is_buero()) with check (public.is_buero());

-- Eigene Skills nur aus dem Katalog
create or replace function public.update_my_profile(p_lang text default null, p_skills text[] default null, p_photo_path text default null)
returns public.employees language plpgsql security definer set search_path = public as $$
declare r public.employees;
begin
  if p_skills is not null and exists (select 1 from unnest(p_skills) s where s not in (select name from public.skills)) then
    raise exception 'unknown_skill';
  end if;
  update public.employees set
    lang = coalesce(p_lang, lang), skills = coalesce(p_skills, skills),
    photo_path = coalesce(p_photo_path, photo_path), updated_at = now()
  where auth_user_id = auth.uid() and active
  returning * into r;
  if r.id is null then raise exception 'not_an_employee'; end if;
  return r;
end $$;

-- ---------- News (BLTH-16) ----------
create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null, teaser text not null default '', body text not null default '',
  tag text not null default 'Studio', must_read boolean not null default false,
  audience_branches text[] not null default '{}',     -- leer = alle Studios
  author_id uuid references public.employees(id) on delete set null,
  author_name text not null default '',
  publish_at timestamptz not null default now(),       -- Zukunft = zeitgesteuert
  wiki_category text,                                   -- gesetzt = auch im Wissen
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.news_reads (
  news_id uuid not null references public.news(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  opened_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (news_id, employee_id)
);
alter table public.news enable row level security;
alter table public.news_reads enable row level security;
create policy news_read on public.news for select to authenticated
  using (public.is_buero() or (public.is_staff() and publish_at <= now() and public.in_audience(audience_branches)));
create policy news_write on public.news for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy news_reads_read on public.news_reads for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_buero()
         or exists (select 1 from public.employees e where e.id = employee_id and public.leads_branch(e.branch_id)));
-- Öffnen und Bestätigen nur über Funktionen: bestätigen geht erst nach dem Öffnen.
create or replace function public.open_news(p_news uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.news n where n.id = p_news and n.publish_at <= now() and public.in_audience(n.audience_branches)) then raise exception 'not_visible'; end if;
  insert into public.news_reads (news_id, employee_id) values (p_news, public.my_employee_id()) on conflict do nothing;
end $$;
create or replace function public.confirm_news(p_news uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.news_reads set confirmed_at = coalesce(confirmed_at, now())
   where news_id = p_news and employee_id = public.my_employee_id();
  if not found then raise exception 'open_first'; end if;
end $$;

-- ---------- Tagesaufgaben (BLTH-17) ----------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  repeat text not null default 'daily' check (repeat in ('daily','weekly','monthly')),
  weekday int check (weekday between 1 and 7),   -- ISO: 1 = Montag
  monthday int check (monthday between 1 and 31),
  branch_ids text[] not null default '{}',       -- leer = alle Studios
  active boolean not null default true, sort int not null default 0,
  is_sample boolean not null default false, created_at timestamptz not null default now()
);
create table public.task_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  title text not null, due_time time, prio boolean not null default false,
  proof_photo boolean not null default false, sort int not null default 0
);
-- Ein Eintrag je Punkt, Filiale und Tag: der „tägliche Reset“ ist einfach ein neuer Tag,
-- alte Nachweise bleiben erhalten.
create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.task_items(id) on delete cascade,
  branch_id text not null references public.branches(id),
  day date not null default (now() at time zone 'Europe/Zurich')::date,
  done_by uuid references public.employees(id) on delete set null,
  done_by_name text not null default '',
  done_at timestamptz not null default now(),
  photo_path text,
  unique (item_id, branch_id, day)
);
alter table public.task_templates enable row level security;
alter table public.task_items enable row level security;
alter table public.task_completions enable row level security;
create policy tt_read on public.task_templates for select to authenticated using (public.is_staff());
create policy tt_write on public.task_templates for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy ti_read on public.task_items for select to authenticated using (public.is_staff());
create policy ti_write on public.task_items for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy tc_read on public.task_completions for select to authenticated
  using (public.is_buero() or branch_id = any(public.my_branches()));
create policy tc_insert on public.task_completions for insert to authenticated
  with check (branch_id = any(public.my_branches()) and done_by = public.my_employee_id());
create policy tc_delete on public.task_completions for delete to authenticated
  using (done_by = public.my_employee_id() and day = (now() at time zone 'Europe/Zurich')::date or public.leads_branch(branch_id));

-- ---------- Meldungen & Ideen (BLTH-19) ----------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('Meldung','Idee')),
  title text not null, body text not null default '',
  branch_id text not null references public.branches(id),
  created_by uuid references public.employees(id) on delete set null,
  created_by_name text not null default '',
  via_ai boolean not null default false, photo_path text,
  status text not null default 'Neu' check (status in ('Neu','Zugewiesen','In Arbeit','Erledigt')),
  assignee text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  at timestamptz not null default now(), by_name text not null default '', what text not null
);
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
create policy tickets_read on public.tickets for select to authenticated
  using (created_by = public.my_employee_id() or public.leads_branch(branch_id));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (created_by = public.my_employee_id() and status = 'Neu' and assignee is null and branch_id = any(public.my_branches()));
create policy tickets_update on public.tickets for update to authenticated using (public.is_buero()) with check (public.is_buero());
create policy tev_read on public.ticket_events for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));
-- Verlauf schreibt die Datenbank selbst
create or replace function public.ticket_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce((select first_name || ' ' || last_name from public.employees where auth_user_id = auth.uid()), 'System');
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, by_name, what) values (new.id, who, 'Erfasst');
  else
    if new.assignee is distinct from old.assignee then insert into public.ticket_events (ticket_id, by_name, what) values (new.id, who, 'Zugewiesen an ' || coalesce(new.assignee, '–')); end if;
    if new.status is distinct from old.status then insert into public.ticket_events (ticket_id, by_name, what) values (new.id, who, 'Status: ' || new.status); end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger tickets_history_ins after insert on public.tickets for each row execute function public.ticket_history();
create trigger tickets_history_upd before update on public.tickets for each row execute function public.ticket_history();

-- ---------- Schulungen & Events (BLTH-23) ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null, kind text not null default 'Schulung' check (kind in ('Schulung','Meeting','Team')),
  description text not null default '',
  starts_at timestamptz not null, ends_at timestamptz,
  place text not null default '', link text,
  capacity int check (capacity > 0),                 -- leer = unbegrenzt
  register_until timestamptz,
  audience_branches text[] not null default '{}',
  audience_skills text[] not null default '{}',
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.event_registrations (
  event_id uuid not null references public.events(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, employee_id)
);
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
create policy events_read on public.events for select to authenticated using (public.is_staff() and public.in_audience(audience_branches));
create policy events_write on public.events for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy evreg_read on public.event_registrations for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_buero()
         or exists (select 1 from public.employees e where e.id = employee_id and public.leads_branch(e.branch_id)));
create policy evreg_delete on public.event_registrations for delete to authenticated using (employee_id = public.my_employee_id());
-- Anmelden über Funktion: prüft Frist und freie Plätze unter Sperre (keine Überbuchung).
create or replace function public.register_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events; n int;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not public.in_audience(e.audience_branches) then raise exception 'not_visible'; end if;
  if e.register_until is not null and now() > e.register_until then raise exception 'deadline_passed'; end if;
  select count(*) into n from public.event_registrations where event_id = p_event;
  if e.capacity is not null and n >= e.capacity then raise exception 'full'; end if;
  insert into public.event_registrations (event_id, employee_id) values (p_event, public.my_employee_id()) on conflict do nothing;
end $$;
-- Teilnehmerzahl sehen alle, Namen nur Berechtigte
create or replace function public.event_counts() returns table(event_id uuid, taken int)
language sql stable security definer set search_path = public as $$
  select event_id, count(*)::int from public.event_registrations group by event_id
$$;

-- ---------- Wissen & Onboarding (BLTH-18) ----------
create table public.wiki_articles (
  id uuid primary key default gen_random_uuid(),
  category text not null, title text not null,
  body text not null default '',                    -- Absätze mit Leerzeile getrennt
  minutes int not null default 3,
  media_kind text not null default 'none' check (media_kind in ('none','photo','video','youtube')),
  media_url text,
  published boolean not null default true, sort int not null default 0,
  is_sample boolean not null default false,
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  title text not null, minutes int not null default 3,
  article_id uuid references public.wiki_articles(id) on delete set null,
  sort int not null default 0, is_sample boolean not null default false
);
create table public.onboarding_progress (
  step_id uuid not null references public.onboarding_steps(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (step_id, employee_id)
);
alter table public.wiki_articles enable row level security;
alter table public.onboarding_steps enable row level security;
alter table public.onboarding_progress enable row level security;
create policy wiki_read on public.wiki_articles for select to authenticated using (public.is_staff() and (published or public.is_buero()));
create policy wiki_write on public.wiki_articles for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy ob_read on public.onboarding_steps for select to authenticated using (public.is_staff());
create policy ob_write on public.onboarding_steps for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy obp_read on public.onboarding_progress for select to authenticated
  using (employee_id = public.my_employee_id()
         or exists (select 1 from public.employees e where e.id = employee_id and public.leads_branch(e.branch_id)));
create policy obp_insert on public.onboarding_progress for insert to authenticated with check (employee_id = public.my_employee_id());
create policy obp_delete on public.onboarding_progress for delete to authenticated using (employee_id = public.my_employee_id());

-- ---------- Dateien ----------
insert into storage.buckets (id, name, public) values
  ('profile-photos', 'profile-photos', false), ('task-proofs', 'task-proofs', false),
  ('ticket-photos', 'ticket-photos', false), ('media', 'media', false)
on conflict (id) do nothing;
-- Pfade beginnen mit der eigenen employee-id: <employee_id>/<datei>
create policy files_read on storage.objects for select to authenticated
  using (bucket_id in ('profile-photos','media') and public.is_staff()
         or bucket_id in ('task-proofs','ticket-photos') and (public.leads_branch('buero') or (storage.foldername(name))[1] = public.my_employee_id()::text
            or public.my_role() = 'filialleitung'));
create policy files_write_own on storage.objects for insert to authenticated
  with check (bucket_id in ('profile-photos','task-proofs','ticket-photos') and (storage.foldername(name))[1] = public.my_employee_id()::text);
create policy files_update_own on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = public.my_employee_id()::text);
create policy files_write_media on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_buero());

grant execute on function public.open_news(uuid), public.confirm_news(uuid), public.register_event(uuid), public.event_counts() to authenticated;
revoke execute on function public.open_news(uuid), public.confirm_news(uuid), public.register_event(uuid), public.event_counts() from anon;
