-- 0032: Dritte Feedback-Runde der Inhaberin (22.10.)
--   Checklistenpunkte können auf eine Anleitung zeigen (Artikel im Wissen oder Link, z. B. das Sonos-Video),
--   zum Start nur die festen Gruppenchats (Studio, ganzes Team), Artikel mit Test gelten erst nach bestandenem Test als gelesen.

alter table public.task_items add column if not exists link_url text;

-- Einzel- und eigene Gruppenchats erst, wenn das Büro sie einschaltet (app_settings chat_private = true)
create or replace function public.app_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'demo_data', coalesce((select value from public.app_settings where key = 'demo_data'), 'true'::jsonb),
    'learn_questions', coalesce((select value from public.app_settings where key = 'learn_questions'), '3'::jsonb),
    'learn_min_correct', coalesce((select value from public.app_settings where key = 'learn_min_correct'), '2'::jsonb),
    'chat_private', coalesce((select value from public.app_settings where key = 'chat_private'), 'false'::jsonb)
  )
$$;
insert into public.app_settings (key, value) values ('chat_private', 'false'::jsonb) on conflict (key) do nothing;

create or replace function public.start_chat(p_people uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_employee_id(); others uuid[]; rid uuid;
begin
  if me is null then raise exception 'not_an_employee'; end if;
  if coalesce((select value from public.app_settings where key = 'chat_private'), 'false'::jsonb) <> 'true'::jsonb then raise exception 'private_chats_off'; end if;
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

-- Solange private Chats aus sind, bleiben bestehende Einzel- und Gruppenchats unsichtbar und gesperrt
create or replace function public.chat_can(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() and exists (select 1 from public.chat_rooms r where r.id = p_room and (
    r.kind = 'team'
    or (r.kind = 'studio' and (public.my_role() = 'buero' or r.branch_id = any(public.my_branches())))
    or (coalesce((select value from public.app_settings where key = 'chat_private'), 'false'::jsonb) = 'true'::jsonb
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = public.my_employee_id()))))
$$;

-- „Gelesen & bestätigt“ bei Artikeln mit Test erst nach bestandenem Test (der Test trägt es dann selbst ein)
create or replace function public.wiki_read_needs_quiz() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'gelesen'
    and exists (select 1 from public.quizzes q where q.article_id = new.article_id)
    and not exists (select 1 from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id
      where q.article_id = new.article_id and a.employee_id = new.employee_id and a.passed) then
    raise exception 'quiz_not_passed';
  end if;
  return new;
end $$;
drop trigger if exists wiki_read_needs_quiz on public.wiki_runs;
create trigger wiki_read_needs_quiz before insert on public.wiki_runs for each row execute function public.wiki_read_needs_quiz();
