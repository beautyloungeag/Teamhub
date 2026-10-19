-- E-Learning: Quiz zu einer News oder einem Wissensartikel (Update-Meeting 25.09.2026).
-- Bestanden ab pass_pct (Standard 80 %), Nachweis je Person. Bei einer News mit Quiz
-- gilt „Gelesen und verstanden“ erst mit bestandenem Quiz; bis dahin bleibt sie offen.
-- Freitext-Fragen (kind = 'text') werden später per KI bewertet; bis dahin zählen sie nicht.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  news_id uuid unique references public.news(id) on delete cascade,
  article_id uuid unique references public.wiki_articles(id) on delete cascade,
  title text not null default '',
  pass_pct int not null default 80 check (pass_pct between 1 and 100),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(news_id, article_id) = 1)
);
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  sort int not null default 0,
  kind text not null default 'single' check (kind in ('single','multi','text')),
  prompt text not null,
  options text[] not null default '{}',
  correct int[] not null default '{}',      -- Indizes in options (0-basiert)
  rubric text not null default ''           -- für Freitext: woran die KI eine richtige Antwort erkennt
);
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  score_pct int not null, passed boolean not null,
  answers jsonb not null default '{}', results jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_quiz on public.quiz_attempts (quiz_id, employee_id);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
create policy quiz_read on public.quizzes for select to authenticated using (public.is_staff());
create policy quiz_write on public.quizzes for all to authenticated using (public.is_buero()) with check (public.is_buero());
-- Fragen samt Lösungen nur fürs Büro; Mitarbeiterinnen bekommen sie ohne Lösung über quiz_for_me()
create policy qq_buero on public.quiz_questions for all to authenticated using (public.is_buero()) with check (public.is_buero());
create policy qa_read on public.quiz_attempts for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_buero()
         or exists (select 1 from public.employees e where e.id = employee_id and public.leads_branch(e.branch_id)));

-- Darf ich dieses Quiz machen? (sichtbare News bzw. lesbarer Artikel)
create or replace function public.quiz_visible(p_quiz uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.quizzes q
    left join public.news n on n.id = q.news_id
    left join public.wiki_articles a on a.id = q.article_id
    where q.id = p_quiz and public.is_staff() and (
      (n.id is not null and n.publish_at <= now() and public.news_for_me(n.audience_branches, n.audience_groups, n.audience_skills, n.audience_people))
      or (a.id is not null and (public.is_buero() or (a.published and public.can_read_level(a.access_level))))
    )
  )
$$;

create or replace function public.quiz_for_me(p_quiz uuid)
returns table (id uuid, sort int, kind text, prompt text, options text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.quiz_visible(p_quiz) then raise exception 'not_visible'; end if;
  return query select x.id, x.sort, x.kind, x.prompt, x.options from public.quiz_questions x where x.quiz_id = p_quiz order by x.sort;
end $$;

-- Auswerten: p_answers = { "<frage-id>": [indizes] }. Gibt Ergebnis je Frage zurück, nie die Lösung.
create or replace function public.submit_quiz(p_quiz uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q record; me uuid := public.my_employee_id(); total int := 0; ok int := 0; res jsonb := '{}'; given int[]; pct int; pass boolean; nid uuid; need int;
begin
  if me is null or not public.quiz_visible(p_quiz) then raise exception 'not_visible'; end if;
  for q in select * from public.quiz_questions where quiz_id = p_quiz and kind in ('single','multi') loop
    total := total + 1;
    given := coalesce((select array_agg(v::int order by v::int) from jsonb_array_elements_text(coalesce(p_answers -> q.id::text, '[]')) v), '{}');
    if given = (select coalesce(array_agg(c order by c), '{}') from unnest(q.correct) c) then ok := ok + 1; res := res || jsonb_build_object(q.id::text, true);
    else res := res || jsonb_build_object(q.id::text, false); end if;
  end loop;
  if total = 0 then raise exception 'no_questions'; end if;
  select pass_pct, news_id into need, nid from public.quizzes where id = p_quiz;
  pct := round(ok * 100.0 / total); pass := pct >= need;
  insert into public.quiz_attempts (quiz_id, employee_id, score_pct, passed, answers, results) values (p_quiz, me, pct, pass, p_answers, res);
  -- Bestanden = gelesen und verstanden
  if pass and nid is not null then
    insert into public.news_reads (news_id, employee_id, confirmed_at) values (nid, me, now())
      on conflict (news_id, employee_id) do update set confirmed_at = coalesce(public.news_reads.confirmed_at, now());
  end if;
  return jsonb_build_object('score_pct', pct, 'passed', pass, 'pass_pct', need, 'correct', ok, 'total', total, 'results', res);
end $$;
grant execute on function public.quiz_for_me(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;

-- Bestätigen ohne bestandenes Quiz geht nicht mehr; Öffnen prüft die neue Zielgruppe
create or replace function public.confirm_news(p_news uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.quizzes q where q.news_id = p_news)
     and not exists (select 1 from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id where q.news_id = p_news and a.employee_id = public.my_employee_id() and a.passed)
  then raise exception 'quiz_first'; end if;
  update public.news_reads set confirmed_at = coalesce(confirmed_at, now())
   where news_id = p_news and employee_id = public.my_employee_id();
  if not found then raise exception 'open_first'; end if;
end $$;
create or replace function public.open_news(p_news uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.news n where n.id = p_news and n.publish_at <= now()
                 and public.news_for_me(n.audience_branches, n.audience_groups, n.audience_skills, n.audience_people)) then raise exception 'not_visible'; end if;
  insert into public.news_reads (news_id, employee_id) values (p_news, public.my_employee_id()) on conflict do nothing;
end $$;

-- Beispiel-Quiz zur Beispiel-Pflicht-News (für die Demo; verschwindet mit dem Beispiel-Schalter)
do $$
declare nid uuid; qid uuid;
begin
  select id into nid from public.news where is_sample and must_read and title = 'Neue Hygienerichtlinie ab 1. Oktober' limit 1;
  if nid is null or exists (select 1 from public.quizzes where news_id = nid) then return; end if;
  insert into public.quizzes (news_id, title, pass_pct, is_sample) values (nid, 'Hygienerichtlinie', 80, true) returning id into qid;
  insert into public.quiz_questions (quiz_id, sort, kind, prompt, options, correct) values
    (qid, 0, 'single', 'Wann werden Liegen und Kopfstützen ab 1. Oktober desinfiziert?', array['Einmal am Abend','Nach jeder Behandlung','Zweimal pro Woche'], array[1]),
    (qid, 1, 'single', 'Wo findest du die komplette Richtlinie?', array['Im Wissen unter „Hygiene“','Im Pausenraum','Bei der Filialleitung per Mail'], array[0]),
    (qid, 2, 'multi', 'Was hat sich mit der neuen Richtlinie geändert?', array['Desinfektion der Liegen nach jeder Behandlung','Die Tagesaufgaben-Checkliste ist angepasst','Neue Öffnungszeiten'], array[0,1]);
end $$;
