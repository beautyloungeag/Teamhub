-- Fail closed for absent/inactive identities, including callable RPCs.
-- Preserve authenticated application helpers and trusted trigger/service flows.

CREATE OR REPLACE FUNCTION public.is_buero()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.my_role() = 'buero'), false)
$function$;

CREATE OR REPLACE FUNCTION public.leads_branch(b text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.my_role() = 'buero' or (public.my_role() = 'filialleitung' and b <> 'buero' and b = any(public.my_branches()))), false)
$function$;

CREATE OR REPLACE FUNCTION public.in_audience(branches text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select coalesce(cardinality(branches), 0) = 0 or public.my_role() = 'buero' or branches && public.my_branches()), false)
$function$;

CREATE OR REPLACE FUNCTION public.can_read_level(l text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select case l when 'alle' then public.is_staff()
                when 'filialleitung' then public.my_role() in ('filialleitung','buero')
                else public.my_role() = 'buero' end), false)
$function$;

CREATE OR REPLACE FUNCTION public.news_for_me(p_branches text[], p_groups text[], p_skills text[], p_people uuid[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select case
    when public.my_role() = 'buero' then true
    when coalesce(cardinality(p_people), 0) > 0 then public.my_employee_id() = any(p_people)
    else public.in_audience(p_branches)
      and (coalesce(cardinality(p_groups), 0) = 0 or exists (select 1 from public.employees e where e.id = public.my_employee_id() and public.job_groups(e.job_title) && p_groups))
      and (coalesce(cardinality(p_skills), 0) = 0 or exists (select 1 from public.employees e where e.id = public.my_employee_id() and e.skills && p_skills))
  end), false)
$function$;

CREATE OR REPLACE FUNCTION public.quiz_visible(p_quiz uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select exists (
    select 1 from public.quizzes q
    left join public.news n on n.id = q.news_id
    left join public.wiki_articles a on a.id = q.article_id
    where q.id = p_quiz and public.is_staff() and (
      (n.id is not null and n.publish_at <= now() and public.news_for_me(n.audience_branches, n.audience_groups, n.audience_skills, n.audience_people))
      or (a.id is not null and (public.is_buero() or (a.published and public.can_read_level(a.access_level))))
    )
  )), false)
$function$;

CREATE OR REPLACE FUNCTION public.leads_todo(p_assignee uuid, p_branch text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select case when p_assignee is not null
    then exists (select 1 from employees e where e.id = p_assignee and leads_branch(e.branch_id))
    else leads_branch(p_branch) end), false)
$function$;

CREATE OR REPLACE FUNCTION public.my_studios_cover(b text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select coalesce(array_length(b, 1), 0) > 0 and not ('buero' = any(b)) and b <@ array_remove(public.my_branches(), 'buero')), false)
$function$;

CREATE OR REPLACE FUNCTION public.is_lead()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.my_role() = 'filialleitung'), false)
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_news(p_news uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.my_role() = 'buero' or (public.my_role() = 'filialleitung' and exists (select 1 from public.news where id = p_news and author_id = public.my_employee_id()))), false)
$function$;

CREATE OR REPLACE FUNCTION public.poll_lead(p_poll uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.my_role() = 'buero' or exists (select 1 from public.polls p join public.news n on n.id = p.news_id where p.id = p_poll and public.my_role() = 'filialleitung'
    and (n.author_id = public.my_employee_id() or (coalesce(cardinality(n.audience_branches), 0) > 0 and n.audience_branches && array_remove(public.my_branches(), 'buero'))))), false)
$function$;

CREATE OR REPLACE FUNCTION public.leads_person(p_emp uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.my_role() = 'buero' or exists (select 1 from public.employees e where e.id = p_emp and public.my_role() = 'filialleitung'
    and array_prepend(e.branch_id, e.extra_branch_ids) && array_remove(public.my_branches(), 'buero'))), false)
$function$;

CREATE OR REPLACE FUNCTION public.chat_can(p_room uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.is_staff() and coalesce((select public.is_staff() and exists (select 1 from public.chat_rooms r where r.id = p_room and (
    r.kind = 'team'
    or (r.kind = 'studio' and (public.my_role() = 'buero' or r.branch_id = any(public.my_branches())))
    or (coalesce((select value from public.app_settings where key = 'chat_private'), 'false'::jsonb) = 'true'::jsonb
      and exists (select 1 from public.chat_members m where m.room_id = r.id and m.employee_id = public.my_employee_id()))))), false)
$function$;

CREATE OR REPLACE FUNCTION public.approve_wiki_proposals(p_kind text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if public.is_buero() is not true then raise exception 'forbidden'; end if;
  if p_kind = 'tasks' then
    update task_templates set active = true, proposed = false where proposed; get diagnostics n = row_count;
    update task_templates set active = false where is_sample;
  elsif p_kind = 'onboarding' then
    update onboarding_steps set proposed = false where proposed; get diagnostics n = row_count;
    delete from onboarding_steps where is_sample;
  else raise exception 'unknown_kind'; end if;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.rename_wiki_category(p_old text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_buero() is not true then raise exception 'forbidden'; end if;
  if trim(coalesce(p_new, '')) = '' then raise exception 'empty'; end if;
  update wiki_articles set category = trim(p_new), updated_at = now() where category = p_old;
  update news set wiki_category = trim(p_new) where wiki_category = p_old;
  if lower(trim(p_new)) <> lower(trim(p_old)) then
    insert into wiki_categories (key, emoji) select lower(trim(p_new)), emoji from wiki_categories where key = lower(trim(p_old))
      on conflict (key) do nothing;
    delete from wiki_categories where key = lower(trim(p_old));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_skill(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.my_role() is distinct from 'buero' then raise exception 'forbidden'; end if;
  delete from public.skills where name = p_name;
  update public.employees set skills = array_remove(skills, p_name) where p_name = any(skills);
  update public.news set audience_skills = array_remove(audience_skills, p_name) where p_name = any(audience_skills);
  update public.events set audience_skills = array_remove(audience_skills, p_name) where p_name = any(audience_skills);
end $function$;

CREATE OR REPLACE FUNCTION public.todo_done(p_id uuid, p_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t public.todos; me public.employees;
begin
  select * into me from employees where auth_user_id = auth.uid() and active limit 1;
  if me.id is null then raise exception 'not_signed_in'; end if;
  select * into t from todos where id = p_id for update;
  if t.id is null then raise exception 'not_found'; end if;
  if (t.assignee_id = me.id or t.created_by = me.id
          or (t.assignee_id is null and t.branch_id = any(my_branches()))
          or leads_todo(t.assignee_id, t.branch_id)) is not true then
    raise exception 'forbidden';
  end if;
  if p_done and t.done_at is not null then raise exception 'already_done'; end if;
  update todos set
    done_at = case when p_done then now() end,
    done_by = case when p_done then me.id end,
    done_by_name = case when p_done then trim(me.first_name || ' ' || left(coalesce(me.last_name, ''), 1) || '.') end
  where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.poll_results(p_poll uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.polls; lead boolean := public.poll_lead(p_poll); out jsonb;
begin
  select * into p from public.polls where id = p_poll;
  if p.id is null then raise exception 'not_found'; end if;
  if (lead or (p.show_results and exists (select 1 from public.poll_answers where poll_id = p_poll and employee_id = public.my_employee_id()))) is not true then raise exception 'forbidden'; end if;
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
end $function$;

-- Counts reveal only events the current active employee can read.
create or replace function public.event_counts()
returns table(event_id uuid, taken integer) language sql stable security definer set search_path = '' as $$
 select r.event_id, count(*)::integer from public.event_registrations r
 join public.events e on e.id=r.event_id
 where r.coming and not r.waitlist and public.is_staff()
   and (e.kind='Schulung' or public.in_audience(e.audience_branches)
     or (public.is_lead() and e.created_by=public.my_employee_id()))
 group by r.event_id
$$;

-- These pure/row-only helpers need no caller-controlled schema resolution.
alter function public.job_groups(text) set search_path = '';
alter function public.audit_short(jsonb) set search_path = '';
alter function public.learning_quiet() set search_path = '';

-- No SECURITY DEFINER RPC is part of the anonymous/public TeamHub interface.
-- Preserve each existing authenticated/service grant before removing PUBLIC.
-- Trigger functions and waitlist maintenance are not client RPCs.
do $$ declare f record; auth_allowed boolean; service_allowed boolean; begin
 for f in select p.oid,p.proname,p.prorettype,p.oid::regprocedure as signature
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and p.prokind='f' loop
  auth_allowed:=has_function_privilege('authenticated',f.oid,'EXECUTE');
  service_allowed:=has_function_privilege('service_role',f.oid,'EXECUTE');
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  if auth_allowed and f.prorettype not in ('trigger'::regtype,'event_trigger'::regtype) and f.proname<>'promote_waitlist' then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
  if service_allowed then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
