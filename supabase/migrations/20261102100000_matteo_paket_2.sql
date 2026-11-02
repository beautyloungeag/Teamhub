-- Matteos Mails vom 29./30.10.: Titelbild je Artikel, Themenname wie getippt, Quiz mit Fragenpool je Person.

-- 1) Titelbild: ein Feld, das Startseite, Liste und Titelfolie gleich lesen. Bisher galt nur der Trick
--    „Foto ganz oben im Artikel“, und die Startseite zeigte trotzdem das Stockfoto des Bereichs.
alter table public.wiki_articles add column if not exists cover_path text;
-- Bestehende Artikel: das erste Foto vor der ersten Überschrift bzw. vor den Schritten, sonst das alte Einzelfoto
update public.wiki_articles a set cover_path = coalesce(
  (select e.b->>'src' from jsonb_array_elements(coalesce(a.blocks, '[]'::jsonb)) with ordinality e(b, i)
    where e.b->>'t' = 'img' and coalesce(e.b->>'src', '') <> ''
      and e.i < coalesce((select min(f.i) from jsonb_array_elements(coalesce(a.blocks, '[]'::jsonb)) with ordinality f(b, i) where f.b->>'t' in ('h', 'ol')), 1000000)
    order by e.i limit 1),
  case when a.media_kind = 'photo' and coalesce(a.media_url, '') <> '' then a.media_url end)
where a.cover_path is null;

-- 2) Themenname so, wie das Büro ihn tippt („Wimpern & Brauen“). key bleibt klein und dient der Zuordnung.
alter table public.wiki_categories add column if not exists name text;
-- Bestehende Themen: Hauptwörter gross, Bindewörter klein (alle heutigen Themen sind Hauptwort-Reihen)
update public.wiki_categories c set name = (
  select string_agg(case when w.x ~ '^(&|und|oder|für|mit|von|vom|im|am|zu|zur|zum|bei|der|die|das|des|den|dem|in|an|auf|ohne)$' then w.x
    else upper(left(w.x, 1)) || substr(w.x, 2) end, ' ' order by w.i)
  from regexp_split_to_table(c.key, '\s+') with ordinality w(x, i))
where c.name is null;

-- Umbenennen setzt den Anzeigenamen und behält Bereich und Emoji (vorher ging der Bereich beim Umbenennen verloren)
create or replace function public.rename_wiki_category(p_old text, p_new text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.is_buero() is not true then raise exception 'forbidden'; end if;
  if trim(coalesce(p_new, '')) = '' then raise exception 'empty'; end if;
  update wiki_articles set category = trim(p_new), updated_at = now() where lower(category) = lower(trim(p_old));
  update news set wiki_category = trim(p_new) where lower(wiki_category) = lower(trim(p_old));
  if lower(trim(p_new)) <> lower(trim(p_old)) then
    insert into wiki_categories (key, emoji, area_key, name)
      select lower(trim(p_new)), emoji, area_key, trim(p_new) from wiki_categories where key = lower(trim(p_old))
      on conflict (key) do update set name = excluded.name;
    delete from wiki_categories where key = lower(trim(p_old));
  end if;
  insert into wiki_categories (key, name) values (lower(trim(p_new)), trim(p_new))
    on conflict (key) do update set name = excluded.name, updated_at = now();
end $function$;

-- 3) Quiz mit Fragenpool: je Durchgang zieht der Server N Fragen in zufälliger Reihenfolge, die Antworten gemischt.
--    Die Ziehung liegt nur auf dem Server (Lösungen und Reihenfolge verlassen ihn nie), ausgewertet werden nur gezogene Fragen.
alter table public.quizzes add column if not exists draw_count integer check (draw_count is null or draw_count between 1 and 20);
alter table public.quiz_attempts add column if not exists question_ids uuid[];

create table if not exists public.quiz_draws (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  question_ids uuid[] not null,
  -- je Frage die Reihenfolge der Antworten: angezeigte Position -> ursprüngliche Position
  option_orders jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists quiz_draws_person on public.quiz_draws (employee_id, quiz_id, created_at desc);
alter table public.quiz_draws enable row level security;
revoke all on public.quiz_draws from anon, authenticated;
grant all on public.quiz_draws to service_role;

drop function if exists public.record_quiz_attempt(uuid, uuid, jsonb, jsonb, jsonb, jsonb);
create or replace function public.record_quiz_attempt(p_employee uuid, p_quiz uuid, p_answers jsonb, p_results jsonb, p_quiz_snapshot jsonb, p_question_snapshot jsonb, p_draw uuid default null)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 person public.employees; quiz public.quizzes; actual_questions jsonb; total integer; correct integer;
 pct integer; passed boolean; attempt uuid; visible boolean; draw public.quiz_draws; asked uuid[];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
 select * into person from public.employees where id=p_employee and active for share;
 if person.id is null then raise exception 'not_visible' using errcode='42501'; end if;
 -- Locks also block new question FK references during snapshot verification.
 select * into quiz from public.quizzes where id=p_quiz for update;
 if quiz.id is null then raise exception 'not_visible' using errcode='42501'; end if;
 perform 1 from public.quiz_questions where quiz_id=p_quiz for share;
 perform 1 from public.news where id=quiz.news_id for share;
 perform 1 from public.wiki_articles where id=quiz.article_id for share;
 select exists (
  select 1 from public.quizzes q
  left join public.news n on n.id=q.news_id
  left join public.wiki_articles a on a.id=q.article_id
  where q.id=p_quiz and (
   (n.id is not null and n.publish_at<=now() and (
    person.app_role='buero' or case when coalesce(cardinality(n.audience_people),0)>0
     then person.id=any(n.audience_people)
     else (coalesce(cardinality(n.audience_branches),0)=0 or array_prepend(person.branch_id,person.extra_branch_ids)&&n.audience_branches)
      and (coalesce(cardinality(n.audience_groups),0)=0 or public.job_groups(person.job_title)&&n.audience_groups)
      and (coalesce(cardinality(n.audience_skills),0)=0 or person.skills&&n.audience_skills)
    end))
   or (a.id is not null and (person.app_role='buero' or (a.published and
    (a.access_level='alle' or (a.access_level='filialleitung' and person.app_role='filialleitung')))))
  )
 ) into visible;
 if visible is not true then raise exception 'not_visible' using errcode='42501'; end if;
 if p_quiz_snapshot is distinct from jsonb_build_object('pass_pct',quiz.pass_pct,'news_id',quiz.news_id,'article_id',quiz.article_id) then
  raise exception 'quiz_changed' using errcode='40001';
 end if;
 select jsonb_object_agg(q.id::text,jsonb_build_object('kind',q.kind,'prompt',q.prompt,'options',q.options,'correct',q.correct,'rubric',q.rubric)),count(*)::integer
 into actual_questions,total from public.quiz_questions q where q.quiz_id=p_quiz;
 if total=0 or p_question_snapshot is distinct from actual_questions then raise exception 'quiz_changed' using errcode='40001'; end if;
 -- Gezogene Fragen: nur diese zählen, die Ziehung gilt für genau einen Versuch dieser Person
 if p_draw is not null then
  select * into draw from public.quiz_draws where id=p_draw and quiz_id=p_quiz and employee_id=p_employee and used_at is null for update;
  if draw.id is null then raise exception 'draw_invalid' using errcode='22023'; end if;
  if exists(select 1 from unnest(draw.question_ids) x where not actual_questions ? x::text) then raise exception 'quiz_changed' using errcode='40001'; end if;
  asked:=draw.question_ids; total:=cardinality(asked);
  update public.quiz_draws set used_at=now() where id=draw.id;
 else
  select array_agg(q.id order by q.sort) into asked from public.quiz_questions q where q.quiz_id=p_quiz;
 end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(p_results) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_results))<>total
  or exists(select 1 from jsonb_each(p_results) r where jsonb_typeof(r.value)<>'boolean' or not (r.key::uuid = any(asked)))
 then raise exception 'invalid_grading_result' using errcode='22023'; end if;
 select count(*)::integer into correct from jsonb_each(p_results) r where r.value='true'::jsonb;
 pct:=round(correct*100.0/total); passed:=pct>=quiz.pass_pct;
 insert into public.quiz_attempts(quiz_id,employee_id,score_pct,passed,answers,results,question_ids)
 values(p_quiz,p_employee,pct,passed,p_answers,p_results,asked) returning id into attempt;
 if passed and quiz.news_id is not null then
  insert into public.news_reads(news_id,employee_id,confirmed_at) values(quiz.news_id,p_employee,now())
  on conflict(news_id,employee_id) do update set confirmed_at=coalesce(public.news_reads.confirmed_at,excluded.confirmed_at);
 end if;
 if passed and quiz.article_id is not null then
  insert into public.wiki_runs(article_id,employee_id,kind) values(quiz.article_id,p_employee,'gelesen')
  on conflict(article_id,employee_id) where kind='gelesen' do nothing;
 end if;
 return jsonb_build_object('ok',true,'attempt_id',attempt,'score_pct',pct,'passed',passed,
  'pass_pct',quiz.pass_pct,'correct',correct,'total',total,'results',p_results);
end $function$;
revoke all on function public.record_quiz_attempt(uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_quiz_attempt(uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
