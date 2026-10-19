-- Audit 20.10.: Protokoll (wer hat was geändert), eigene Mitteilungs-Einstellungen für Filialleitung/Büro,
-- Umfragen an News, Ziele (Meine Performance), Warteliste bei Schulungen, Fehlerprotokoll, Prüfdatum im Wissen.

-- ---------- 1) Protokoll ----------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.employees(id) on delete set null,
  actor_name text,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity text not null,
  entity_id text,
  title text,
  branch_ids text[] not null default '{}',
  changes jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_branches on public.audit_log using gin (branch_ids);
create index if not exists audit_log_entity on public.audit_log (entity, entity_id);
alter table public.audit_log enable row level security;
-- Büro sieht alles, Filialleitung was ihre Studios betrifft und was sie selbst getan hat; niemand schreibt direkt
create policy audit_read on public.audit_log for select to authenticated using (
  public.my_role() = 'buero' or (public.my_role() = 'filialleitung' and (branch_ids && array_remove(public.my_branches(), 'buero') or actor_id = public.my_employee_id())));

-- Lange Texte im Protokoll kürzen
create or replace function public.audit_short(v jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 280 then to_jsonb(left(v #>> '{}', 280) || '…') else v end
$$;

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  skip text[] := array['updated_at', 'created_at', 'i18n', 'notified_at', 'invite_mailed_at', 'filled_notified_at', 'last_seen_at', 'app_installed_at',
    'push_enabled', 'reminded_at', 'mail_status', 'mailed_at', 'sort', 'lead_notified_at', 'promoted_notified_at', 'summary_notified_at', 'blocks', 'tags',
    'auth_user_id', 'photo_path', 'lang', 'notify_prefs', 'version', 'source_id', 'id'];
  ch jsonb := '{}'; k text; actor uuid := public.my_employee_id(); aname text; br text[] := '{}'; ttl text;
  t text := tg_table_name;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k = any(skip) then continue; end if;
      if (o -> k) is distinct from (n -> k) then ch := ch || jsonb_build_object(k, jsonb_build_array(public.audit_short(o -> k), public.audit_short(n -> k))); end if;
    end loop;
    if ch = '{}' then return null; end if;
  else
    -- Neu oder gelöscht: kompakter Stand der Zeile (ohne leere Felder), damit man sieht, was es war
    for k in select jsonb_object_keys(r) loop
      if k = any(skip) or (r -> k) = 'null'::jsonb or (r -> k) = '[]'::jsonb or (r -> k) = '""'::jsonb then continue; end if;
      ch := ch || jsonb_build_object(k, public.audit_short(r -> k));
    end loop;
  end if;
  -- Personen ohne Konto (Dienste, Zeitpläne) erscheinen als „System“; Personen anlegen protokolliert admin-employee selbst
  if actor is null and t = 'employees' then return null; end if;
  select first_name || ' ' || last_name into aname from public.employees where id = actor;
  ttl := coalesce(r ->> 'title', r ->> 'name', nullif(trim(coalesce(r ->> 'first_name', '') || ' ' || coalesce(r ->> 'last_name', '')), ''), r ->> 'key', r ->> 'prompt');
  case t
    when 'news', 'events' then br := coalesce((select array_agg(x) from jsonb_array_elements_text(r -> 'audience_branches') x), '{}');
    when 'task_templates' then br := coalesce((select array_agg(x) from jsonb_array_elements_text(r -> 'branch_ids') x), '{}');
    when 'task_items' then select coalesce(branch_ids, '{}') into br from public.task_templates where id = (r ->> 'template_id')::uuid;
    when 'tickets', 'standby_requests', 'task_completions' then br := array[r ->> 'branch_id'];
    when 'todos' then br := coalesce(case when r ->> 'branch_id' is not null then array[r ->> 'branch_id'] end,
      (select array_prepend(branch_id, extra_branch_ids) from public.employees where id = (r ->> 'assignee_id')::uuid), '{}');
    when 'employees' then br := array_prepend(r ->> 'branch_id', coalesce((select array_agg(x) from jsonb_array_elements_text(r -> 'extra_branch_ids') x), '{}'));
    when 'branches' then br := array[r ->> 'id'];
    when 'event_registrations' then
      select array_prepend(e.branch_id, e.extra_branch_ids), ev.title || ' · ' || e.first_name || ' ' || e.last_name into br, ttl
        from public.employees e, public.events ev where e.id = (r ->> 'employee_id')::uuid and ev.id = (r ->> 'event_id')::uuid;
    when 'quizzes', 'polls' then select coalesce(audience_branches, '{}'), coalesce(ttl, title) into br, ttl from public.news where id = (r ->> 'news_id')::uuid;
    when 'goals' then br := coalesce(case when r ->> 'branch_id' is not null then array[r ->> 'branch_id'] end,
      (select array_prepend(branch_id, extra_branch_ids) from public.employees where id = (r ->> 'employee_id')::uuid), '{}');
    else br := '{}';
  end case;
  if t = 'task_completions' then select title into ttl from public.task_items where id = (r ->> 'item_id')::uuid; end if;
  if t = 'standby_requests' then ttl := 'Aushilfe ' || to_char((r ->> 'day')::date, 'DD.MM.') || coalesce(' ' || left(r ->> 'start_time', 5) || '–' || left(r ->> 'end_time', 5), ''); end if;
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, title, branch_ids, changes)
    values (actor, coalesce(aname, 'System'), lower(tg_op), t, coalesce(r ->> 'id', r ->> 'key', nullif(concat_ws(':', r ->> 'event_id', r ->> 'employee_id'), ''), r ->> 'name'), left(ttl, 200), coalesce(br, '{}'), ch);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['news', 'events', 'task_templates', 'task_items', 'todos', 'tickets', 'employees', 'standby_requests', 'quizzes', 'wiki_articles',
    'onboarding_steps', 'branches', 'skills', 'app_settings', 'event_registrations'] loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
  -- Abhaken steht schon bei den Aufgaben; im Protokoll nur, wenn ein Haken zurückgenommen wird
  drop trigger if exists audit on public.task_completions;
  create trigger audit after delete on public.task_completions for each row execute function public.audit_row();
end $$;

-- Wie lange das Protokoll bleibt (Tage)
insert into public.app_settings (key, value) values ('audit_days', '365'::jsonb) on conflict (key) do nothing;

-- ---------- 2) Mitteilungen für Filialleitung und Büro ----------
alter table public.employees add column if not exists notify_prefs jsonb not null default '{}';
create or replace function public.set_notify_prefs(p jsonb) returns void language sql security definer set search_path = public as $$
  update public.employees set notify_prefs = coalesce(p, '{}') where auth_user_id = auth.uid() and active
$$;
grant execute on function public.set_notify_prefs(jsonb) to authenticated;

alter table public.tickets add column if not exists lead_notified_at timestamptz;
update public.tickets set lead_notified_at = coalesce(lead_notified_at, now());
alter table public.standby_responses add column if not exists notified_at timestamptz;
update public.standby_responses set notified_at = coalesce(notified_at, now());
alter table public.events add column if not exists summary_notified_at timestamptz;
update public.events set summary_notified_at = now() where coalesce(register_until, starts_at - interval '1 day') < now();
-- Überfällige Checklisten: eine Mitteilung je Studio, Liste und Tag
create table if not exists public.lead_alerts (day date not null, branch_id text not null, template_id uuid not null, sent_at timestamptz not null default now(), primary key (day, branch_id, template_id));
alter table public.lead_alerts enable row level security;

-- ---------- 3) Warteliste bei Schulungen und Events ----------
alter table public.event_registrations add column if not exists waitlist boolean not null default false;
alter table public.event_registrations add column if not exists promoted_at timestamptz;
alter table public.event_registrations add column if not exists promoted_notified_at timestamptz;

create or replace function public.event_counts() returns table(event_id uuid, taken int)
language sql stable security definer set search_path = public as $$
  select event_id, count(*)::int from public.event_registrations where coming and not waitlist group by event_id
$$;

create or replace function public.promote_waitlist(p_event uuid) returns void language plpgsql security definer set search_path = public as $$
declare cap int; n int; nxt uuid;
begin
  select capacity into cap from public.events where id = p_event and starts_at > now();
  if not found then return; end if;
  loop
    select count(*) into n from public.event_registrations where event_id = p_event and coming and not waitlist;
    exit when cap is not null and n >= cap;
    select employee_id into nxt from public.event_registrations where event_id = p_event and coming and waitlist order by created_at limit 1;
    exit when nxt is null;
    update public.event_registrations set waitlist = false, promoted_at = now() where event_id = p_event and employee_id = nxt;
  end loop;
end $$;

create or replace function public.event_reg_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.coming and not old.waitlist then perform public.promote_waitlist(old.event_id); end if;
    return null;
  end if;
  if old.coming and not old.waitlist and not new.coming then perform public.promote_waitlist(new.event_id); end if;
  return null;
end $$;
drop trigger if exists promote on public.event_registrations;
create trigger promote after update or delete on public.event_registrations for each row execute function public.event_reg_changed();

create or replace function public.event_capacity_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.capacity is distinct from old.capacity then perform public.promote_waitlist(new.id); end if;
  return null;
end $$;
drop trigger if exists promote on public.events;
create trigger promote after update of capacity on public.events for each row execute function public.event_capacity_changed();

-- Anmelden: ist es voll, kommt man auf die Warteliste (Rückgabe 'ok' oder 'waitlist')
drop function if exists public.register_event(uuid);
create function public.register_event(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e public.events; n int; me uuid := public.my_employee_id(); is_full boolean;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not public.in_audience(e.audience_branches) then raise exception 'not_visible'; end if;
  if coalesce(cardinality(e.audience_skills), 0) > 0 and public.my_role() <> 'buero'
     and not exists (select 1 from public.employees x where x.id = me and x.skills && e.audience_skills) then raise exception 'not_visible'; end if;
  if e.starts_at < now() or (e.register_until is not null and now() > e.register_until) then raise exception 'deadline_passed'; end if;
  if exists (select 1 from public.event_registrations where event_id = p_event and employee_id = me and coming) then
    return case when (select waitlist from public.event_registrations where event_id = p_event and employee_id = me) then 'waitlist' else 'ok' end;
  end if;
  select count(*) into n from public.event_registrations where event_id = p_event and coming and not waitlist;
  is_full := e.capacity is not null and n >= e.capacity;
  insert into public.event_registrations (event_id, employee_id, coming, waitlist, promoted_at) values (p_event, me, true, is_full, null)
    on conflict (event_id, employee_id) do update set coming = true, waitlist = is_full, promoted_at = null, created_at = now();
  return case when is_full then 'waitlist' else 'ok' end;
end $$;
grant execute on function public.register_event(uuid) to authenticated;

create or replace function public.decline_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not public.in_audience(e.audience_branches) then raise exception 'not_visible'; end if;
  insert into public.event_registrations (event_id, employee_id, coming, waitlist) values (p_event, public.my_employee_id(), false, false)
    on conflict (event_id, employee_id) do update set coming = false, waitlist = false, created_at = now();
end $$;

-- ---------- 4) Umfragen an News ----------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null unique references public.news(id) on delete cascade,
  anonymous boolean not null default false,
  show_results boolean not null default true,
  closes_at timestamptz,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_questions (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  sort int not null default 0,
  kind text not null check (kind in ('single', 'multi', 'scale', 'text')),
  prompt text not null,
  options text[] not null default '{}',
  i18n jsonb
);
create table if not exists public.poll_answers (
  question_id uuid not null references public.poll_questions(id) on delete cascade,
  poll_id uuid not null references public.polls(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  primary key (question_id, employee_id)
);
alter table public.polls enable row level security;
alter table public.poll_questions enable row level security;
alter table public.poll_answers enable row level security;
-- Lesen: wer die News sehen darf (RLS der News greift in der Unterabfrage)
create policy polls_read on public.polls for select to authenticated using (exists (select 1 from public.news n where n.id = news_id));
create policy pq_read on public.poll_questions for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id));
-- Schreiben: Büro oder die Filialleitung, die die News geschrieben hat
create or replace function public.can_edit_news(p_news uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'buero' or (public.my_role() = 'filialleitung' and exists (select 1 from public.news where id = p_news and author_id = public.my_employee_id()))
$$;
create policy polls_write on public.polls for all to authenticated using (public.can_edit_news(news_id)) with check (public.can_edit_news(news_id));
create policy pq_write on public.poll_questions for all to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and public.can_edit_news(p.news_id)))
  with check (exists (select 1 from public.polls p where p.id = poll_id and public.can_edit_news(p.news_id)));
-- Antworten: nur eigene, nur solange offen
create policy pa_own_read on public.poll_answers for select to authenticated using (employee_id = public.my_employee_id());
create policy pa_own_write on public.poll_answers for insert to authenticated with check (employee_id = public.my_employee_id()
  and exists (select 1 from public.polls p join public.poll_questions q on q.poll_id = p.id where p.id = poll_answers.poll_id and q.id = poll_answers.question_id and (p.closes_at is null or p.closes_at > now())));
create policy pa_own_update on public.poll_answers for update to authenticated using (employee_id = public.my_employee_id())
  with check (employee_id = public.my_employee_id() and exists (select 1 from public.polls p where p.id = poll_id and (p.closes_at is null or p.closes_at > now())));
create policy pa_own_delete on public.poll_answers for delete to authenticated using (employee_id = public.my_employee_id()
  and exists (select 1 from public.polls p where p.id = poll_id and (p.closes_at is null or p.closes_at > now())));

-- Darf ich die Ergebnisse sehen? Leitung der Zielstudios/Autorin/Büro immer, alle anderen nur nach eigener Antwort und wenn freigegeben
create or replace function public.poll_lead(p_poll uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'buero' or exists (select 1 from public.polls p join public.news n on n.id = p.news_id where p.id = p_poll and public.my_role() = 'filialleitung'
    and (n.author_id = public.my_employee_id() or (coalesce(cardinality(n.audience_branches), 0) > 0 and n.audience_branches && array_remove(public.my_branches(), 'buero'))))
$$;

-- Ergebnisse je Frage; Namen nur für die Leitung und nur bei nicht anonymen Umfragen
create or replace function public.poll_results(p_poll uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.polls; lead boolean := public.poll_lead(p_poll); out jsonb;
begin
  select * into p from public.polls where id = p_poll;
  if p.id is null then raise exception 'not_found'; end if;
  if not lead and not (p.show_results and exists (select 1 from public.poll_answers where poll_id = p_poll and employee_id = public.my_employee_id())) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'respondents', (select count(distinct employee_id) from public.poll_answers where poll_id = p_poll),
    'who', case when lead and not p.anonymous then (select coalesce(jsonb_agg(distinct a.employee_id), '[]') from public.poll_answers a where a.poll_id = p_poll) else null end,
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'options', q.options,
      'answers', (select coalesce(jsonb_agg(jsonb_build_object('value', a.value,
        'name', case when lead and not p.anonymous then e.first_name || ' ' || e.last_name end,
        'branch', case when lead and not p.anonymous then e.branch_id end) order by a.created_at), '[]')
        from public.poll_answers a join public.employees e on e.id = a.employee_id where a.question_id = q.id)) order by q.sort)
      from public.poll_questions q where q.poll_id = p_poll), '[]')) into out;
  return out;
end $$;
grant execute on function public.poll_results(uuid) to authenticated;

-- ---------- 5) Ziele (Meine Performance) ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('person', 'team')),
  employee_id uuid references public.employees(id) on delete cascade,
  branch_id text references public.branches(id) on delete cascade,
  metric text not null check (metric in ('revenue', 'treatments', 'avg_ticket', 'clients', 'requested', 'rating', 'reviews')),
  target numeric not null check (target > 0),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  title text,
  created_by uuid references public.employees(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  check ((scope = 'person' and employee_id is not null) or (scope = 'team' and branch_id is not null))
);
alter table public.goals enable row level security;
create or replace function public.leads_person(p_emp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'buero' or exists (select 1 from public.employees e where e.id = p_emp and public.my_role() = 'filialleitung'
    and array_prepend(e.branch_id, e.extra_branch_ids) && array_remove(public.my_branches(), 'buero'))
$$;
create policy goals_read on public.goals for select to authenticated using (
  (scope = 'person' and (employee_id = public.my_employee_id() or public.leads_person(employee_id)))
  or (scope = 'team' and (public.my_role() = 'buero' or branch_id = any(public.my_branches()))));
create policy goals_write on public.goals for all to authenticated
  using ((scope = 'person' and (employee_id = public.my_employee_id() or public.leads_person(employee_id))) or (scope = 'team' and public.leads_branch(branch_id)))
  with check ((scope = 'person' and (employee_id = public.my_employee_id() or public.leads_person(employee_id))) or (scope = 'team' and public.leads_branch(branch_id)));

-- ---------- 6) Fehlerprotokoll der App ----------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  employee_id uuid references public.employees(id) on delete set null,
  message text, stack text, url text, ua text, version text
);
alter table public.client_errors enable row level security;
create policy ce_insert on public.client_errors for insert to authenticated with check (employee_id is null or employee_id = public.my_employee_id());
create policy ce_read on public.client_errors for select to authenticated using (public.my_role() = 'buero');

-- ---------- 7) Wissen: verantwortlich und nächste Prüfung (Wiki-Format: mindestens einmal im Jahr prüfen) ----------
alter table public.wiki_articles add column if not exists owner_id uuid references public.employees(id) on delete set null;
alter table public.wiki_articles add column if not exists review_due date;

-- ---------- 8) Neue Tabellen ins Protokoll ----------
drop trigger if exists audit on public.polls;
create trigger audit after insert or update or delete on public.polls for each row execute function public.audit_row();
drop trigger if exists audit on public.goals;
create trigger audit after insert or update or delete on public.goals for each row execute function public.audit_row();

-- ---------- 9) Aufräumen: Protokoll nach `audit_days`, Fehler nach 90 Tagen ----------
select cron.unschedule('teamhub-audit-cleanup') where exists (select 1 from cron.job where jobname = 'teamhub-audit-cleanup');
select cron.schedule('teamhub-audit-cleanup', '30 3 * * *', $$
  delete from public.audit_log where at < now() - make_interval(days => coalesce((select (value #>> '{}')::int from public.app_settings where key = 'audit_days'), 365));
  delete from public.client_errors where at < now() - interval '90 days';
  delete from public.lead_alerts where day < current_date - 7;
$$);
