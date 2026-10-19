-- Filialleitung gestaltet für ihr Studio selbst: News, Quiz zu eigenen News, Schulungen/Events,
-- Studio-Checklisten. Alles nur mit Zielgruppe = eigene Studios. Dazu Aushilfe-Anfragen.

-- Liegen alle Studios eines Inhalts in den eigenen (und ist mindestens eines gewählt)?
create or replace function public.my_studios_cover(b text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(array_length(b, 1), 0) > 0 and not ('buero' = any(b)) and b <@ array_remove(public.my_branches(), 'buero')
$$;
create or replace function public.is_lead() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() = 'filialleitung' $$;
grant execute on function public.my_studios_cover(text[]) to authenticated;
grant execute on function public.is_lead() to authenticated;

-- News
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to authenticated using (
  public.is_buero() or author_id = public.my_employee_id()
  or (public.is_staff() and publish_at <= now() and public.news_for_me(audience_branches, audience_groups, audience_skills, audience_people)));
create policy news_write_lead on public.news for all to authenticated
  using (public.is_lead() and author_id = public.my_employee_id())
  with check (public.is_lead() and author_id = public.my_employee_id() and public.my_studios_cover(audience_branches));

-- Quiz zu eigenen News
create policy quiz_write_lead on public.quizzes for all to authenticated
  using (public.is_lead() and exists (select 1 from public.news n where n.id = news_id and n.author_id = public.my_employee_id()))
  with check (public.is_lead() and exists (select 1 from public.news n where n.id = news_id and n.author_id = public.my_employee_id()));
create policy qq_lead on public.quiz_questions for all to authenticated
  using (public.is_lead() and exists (select 1 from public.quizzes q join public.news n on n.id = q.news_id where q.id = quiz_id and n.author_id = public.my_employee_id()))
  with check (public.is_lead() and exists (select 1 from public.quizzes q join public.news n on n.id = q.news_id where q.id = quiz_id and n.author_id = public.my_employee_id()));

-- Schulungen und Events
alter table public.events add column if not exists created_by uuid references public.employees(id) on delete set null;
create policy events_write_lead on public.events for all to authenticated
  using (public.is_lead() and created_by = public.my_employee_id())
  with check (public.is_lead() and created_by = public.my_employee_id() and public.my_studios_cover(audience_branches));

-- Studio-Checklisten nur fürs eigene Studio (gemeinsame Vorlagen bleiben beim Büro)
create policy tt_write_lead on public.task_templates for all to authenticated
  using (public.is_lead() and public.my_studios_cover(branch_ids)) with check (public.is_lead() and public.my_studios_cover(branch_ids));
create policy ti_write_lead on public.task_items for all to authenticated
  using (public.is_lead() and exists (select 1 from public.task_templates t where t.id = template_id and public.my_studios_cover(t.branch_ids)))
  with check (public.is_lead() and exists (select 1 from public.task_templates t where t.id = template_id and public.my_studios_cover(t.branch_ids)));

-- Aushilfe-Anfragen: Filialleitung/Büro sucht für einen Tag jemanden, Mitarbeitende antworten
create table if not exists public.standby_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id) on delete cascade,
  day date not null,
  start_time time, end_time time,
  skill text,
  note text not null default '',
  to_all boolean not null default false,      -- auch an alle im Studio-Verbund, nicht nur an Eingetragene
  status text not null default 'offen' check (status in ('offen', 'besetzt', 'abgesagt')),
  filled_by uuid references public.employees(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  created_by_name text not null default '',
  notified_at timestamptz, filled_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.standby_responses (
  request_id uuid not null references public.standby_requests(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  answer text not null check (answer in ('ja', 'nein')),
  created_at timestamptz not null default now(),
  primary key (request_id, employee_id)
);
alter table public.standby_requests enable row level security;
alter table public.standby_responses enable row level security;
create policy sreq_read on public.standby_requests for select to authenticated using (public.is_staff());
create policy sreq_write on public.standby_requests for all to authenticated
  using (public.leads_branch(branch_id)) with check (public.leads_branch(branch_id));
create policy sresp_read on public.standby_responses for select to authenticated using (
  employee_id = public.my_employee_id()
  or exists (select 1 from public.standby_requests r where r.id = request_id and public.leads_branch(r.branch_id)));
create policy sresp_own on public.standby_responses for all to authenticated
  using (employee_id = public.my_employee_id())
  with check (employee_id = public.my_employee_id() and exists (select 1 from public.standby_requests r where r.id = request_id and r.status = 'offen'));
