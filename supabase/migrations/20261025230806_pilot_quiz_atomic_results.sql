-- The legacy RPC grades only choice questions. Clients must use the authenticated
-- quiz Edge Function, which also grades free text; no parallel grading bypass.
revoke all on function public.submit_quiz(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_quiz(uuid,jsonb) to service_role;

-- One short transaction persists an evaluated result and its completion markers.
-- Only the trusted grading service can supply results; clients cannot self-pass.
create or replace function public.record_quiz_attempt(
 p_employee uuid, p_quiz uuid, p_answers jsonb, p_results jsonb,
 p_quiz_snapshot jsonb, p_question_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 person public.employees; quiz public.quizzes; actual_questions jsonb; total integer; correct integer;
 pct integer; passed boolean; attempt uuid; visible boolean;
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
 if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(p_results) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_results))<>total
  or exists(select 1 from jsonb_each(p_results) r where jsonb_typeof(r.value)<>'boolean' or not actual_questions ? r.key)
 then raise exception 'invalid_grading_result' using errcode='22023'; end if;
 select count(*)::integer into correct from jsonb_each(p_results) r where r.value='true'::jsonb;
 pct:=round(correct*100.0/total); passed:=pct>=quiz.pass_pct;
 insert into public.quiz_attempts(quiz_id,employee_id,score_pct,passed,answers,results)
 values(p_quiz,p_employee,pct,passed,p_answers,p_results) returning id into attempt;
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
end $$;
revoke all on function public.record_quiz_attempt(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_quiz_attempt(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to service_role;
