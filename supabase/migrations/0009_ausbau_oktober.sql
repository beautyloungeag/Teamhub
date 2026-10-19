-- Ausbau nach dem Update-Meeting 25.09.2026 (Stand 19.10.):
-- Beispielinhalte schaltbar, News-Zielgruppen, Melden & Ideen, Pikett, Event-Absagen.

-- ---------- Beispielinhalte ein/aus (Büro schaltet, alle lesen) ----------
insert into public.app_settings (key, value) values ('demo_data', 'true'::jsonb) on conflict (key) do nothing;
create or replace function public.app_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('demo_data', coalesce((select value from public.app_settings where key = 'demo_data'), 'true'::jsonb))
$$;
grant execute on function public.app_flags() to authenticated;

-- ---------- Gruppen aus der Funktion (keine eigene Pflege nötig) ----------
-- Filialleitung (Respo, Stv.R), Kosmetikerinnen (inkl. auf Abruf), Lernende (Lehrling, Praktikantin, Berufsbildnerin), Büro
create or replace function public.job_groups(title text) returns text[]
language sql immutable as $$
  select array_remove(array[
    case when title ~* '(respo|stv\.?\s*r|filialleit)' then 'Filialleitung' end,
    case when title ~* 'kosmetik' then 'Kosmetikerinnen' end,
    case when title ~* '(lehrling|lernend|praktik|berufsbild)' then 'Lernende' end,
    case when title ~* '(büro|buero|\mhr\M|fibu|office)' then 'Büro' end
  ], null)
$$;

-- ---------- News: Zielgruppe nach Studio, Gruppe, Skill oder Person ----------
alter table public.news add column if not exists audience_groups text[] not null default '{}';
alter table public.news add column if not exists audience_skills text[] not null default '{}';
alter table public.news add column if not exists audience_people uuid[] not null default '{}';
-- Personen gewählt = genau diese Personen. Sonst Studio UND Gruppe UND Skill (leer = alle).
create or replace function public.news_for_me(p_branches text[], p_groups text[], p_skills text[], p_people uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'buero' then true
    when coalesce(cardinality(p_people), 0) > 0 then public.my_employee_id() = any(p_people)
    else public.in_audience(p_branches)
      and (coalesce(cardinality(p_groups), 0) = 0 or exists (select 1 from public.employees e where e.id = public.my_employee_id() and public.job_groups(e.job_title) && p_groups))
      and (coalesce(cardinality(p_skills), 0) = 0 or exists (select 1 from public.employees e where e.id = public.my_employee_id() and e.skills && p_skills))
  end
$$;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to authenticated
  using (public.is_buero() or (public.is_staff() and publish_at <= now() and public.news_for_me(audience_branches, audience_groups, audience_skills, audience_people)));

-- ---------- Melden & Ideen ----------
-- Ideen sieht das ganze Team (zum Unterstützen), Meldungen weiter nur Meldende + Leitung.
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated
  using (created_by = public.my_employee_id() or public.leads_branch(branch_id) or (kind = 'Idee' and public.is_staff()));
-- Filialleitung darf Meldungen ihres Studios bearbeiten (erledigt abhaken, zuweisen)
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_buero() or public.leads_branch(branch_id)) with check (public.is_buero() or public.leads_branch(branch_id));
alter table public.tickets add column if not exists media_kind text not null default 'photo' check (media_kind in ('photo','video'));

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.employees(id) on delete set null,
  author_name text not null default '',
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
alter table public.ticket_comments enable row level security;
create policy tcom_read on public.ticket_comments for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy tcom_insert on public.ticket_comments for insert to authenticated
  with check (author_id = public.my_employee_id() and exists (select 1 from public.tickets t where t.id = ticket_id));
create policy tcom_delete on public.ticket_comments for delete to authenticated
  using (author_id = public.my_employee_id() or public.is_buero());
create index if not exists ticket_comments_ticket on public.ticket_comments (ticket_id, created_at);

create table if not exists public.ticket_votes (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, employee_id)
);
alter table public.ticket_votes enable row level security;
create policy tvote_read on public.ticket_votes for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy tvote_insert on public.ticket_votes for insert to authenticated
  with check (employee_id = public.my_employee_id() and exists (select 1 from public.tickets t where t.id = ticket_id and t.kind = 'Idee'));
create policy tvote_delete on public.ticket_votes for delete to authenticated using (employee_id = public.my_employee_id());

-- ---------- Pikett: Tage, an denen jemand aushelfen kann ----------
create table if not exists public.standby_days (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (employee_id, day)
);
alter table public.standby_days enable row level security;
create policy standby_read on public.standby_days for select to authenticated using (public.is_staff());
create policy standby_insert on public.standby_days for insert to authenticated
  with check (employee_id = public.my_employee_id() and day >= current_date);
create policy standby_delete on public.standby_days for delete to authenticated
  using (employee_id = public.my_employee_id() or public.is_buero());

-- ---------- Events: Zusage und Absage ----------
alter table public.event_registrations add column if not exists coming boolean not null default true;
create or replace function public.register_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events; n int;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not public.in_audience(e.audience_branches) then raise exception 'not_visible'; end if;
  if e.register_until is not null and now() > e.register_until then raise exception 'deadline_passed'; end if;
  select count(*) into n from public.event_registrations where event_id = p_event and coming and employee_id <> public.my_employee_id();
  if e.capacity is not null and n >= e.capacity then raise exception 'full'; end if;
  insert into public.event_registrations (event_id, employee_id, coming) values (p_event, public.my_employee_id(), true)
    on conflict (event_id, employee_id) do update set coming = true, created_at = now();
end $$;
create or replace function public.decline_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not public.in_audience(e.audience_branches) then raise exception 'not_visible'; end if;
  insert into public.event_registrations (event_id, employee_id, coming) values (p_event, public.my_employee_id(), false)
    on conflict (event_id, employee_id) do update set coming = false, created_at = now();
end $$;
grant execute on function public.decline_event(uuid) to authenticated;
create or replace function public.event_counts() returns table(event_id uuid, taken int)
language sql stable security definer set search_path = public as $$
  select event_id, count(*)::int from public.event_registrations where coming group by event_id
$$;
