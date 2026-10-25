-- Continued synthetic rollback suite for the service-only grading transaction.
insert into qa_ids(label) select unnest(array['quiz_article','quiz_article_test','quiz_news_test','quiz_foreign_test','quiz_choice','quiz_text','quiz_news_choice','quiz_foreign_choice']);
insert into public.wiki_articles(id,category,title,published,access_level,is_sample) values(pg_temp.qid('quiz_article'),'QA','QA atomic article',true,'alle',true);
insert into public.quizzes(id,title,article_id,news_id,pass_pct,is_sample) values
 (pg_temp.qid('quiz_article_test'),'QA mixed quiz',pg_temp.qid('quiz_article'),null,100,true),
 (pg_temp.qid('quiz_news_test'),'QA news quiz',null,pg_temp.qid('rpc_news'),100,true),
 (pg_temp.qid('quiz_foreign_test'),'QA foreign quiz',null,pg_temp.qid('rpc_foreign_news'),100,true);
insert into public.quiz_questions(id,quiz_id,kind,prompt,options,correct,rubric) values
 (pg_temp.qid('quiz_choice'),pg_temp.qid('quiz_article_test'),'single','QA choice',array['yes','no'],array[0],''),
 (pg_temp.qid('quiz_text'),pg_temp.qid('quiz_article_test'),'text','QA text','{}','{}','QA rubric'),
 (pg_temp.qid('quiz_news_choice'),pg_temp.qid('quiz_news_test'),'single','QA news',array['yes','no'],array[0],''),
 (pg_temp.qid('quiz_foreign_choice'),pg_temp.qid('quiz_foreign_test'),'single','QA foreign',array['yes','no'],array[0],'');
create temp table qa_quiz_snapshots as select q.id,
 jsonb_build_object('pass_pct',q.pass_pct,'news_id',q.news_id,'article_id',q.article_id) quiz,
 (select jsonb_object_agg(x.id::text,jsonb_build_object('kind',x.kind,'prompt',x.prompt,'options',x.options,'correct',x.correct,'rubric',x.rubric)) from public.quiz_questions x where x.quiz_id=q.id) questions,
 (select jsonb_object_agg(x.id::text,true) from public.quiz_questions x where x.quiz_id=q.id) results
from public.quizzes q where id in (pg_temp.qid('quiz_article_test'),pg_temp.qid('quiz_news_test'),pg_temp.qid('quiz_foreign_test'));
grant select on qa_quiz_snapshots to authenticated,service_role;
create function pg_temp.record_test_quiz(label text,actor text,choice boolean default true,free_text boolean default true) returns jsonb language sql as $$
 select public.record_quiz_attempt(pg_temp.qid(actor),s.id,'{}',
 case when label='quiz_article_test' then jsonb_build_object(pg_temp.qid('quiz_choice')::text,choice,pg_temp.qid('quiz_text')::text,free_text) else s.results end,
 s.quiz,s.questions) from pg_temp.qa_quiz_snapshots s where s.id=pg_temp.qid(label)
$$;
select pg_temp.claim('employee');set local role authenticated;
select pg_temp.attempt('legacy choice-only quiz bypass denied',$q$select public.submit_quiz(pg_temp.qid('quiz_article_test'),jsonb_build_object(pg_temp.qid('quiz_choice')::text,jsonb_build_array(0)))$q$,'deny');
select pg_temp.attempt('client cannot supply forged grading results',$q$select pg_temp.record_test_quiz('quiz_article_test','employee')$q$,'deny');
select pg_temp.attempt('employee can still load quiz questions',$q$select * from public.quiz_for_me(pg_temp.qid('quiz_article_test'))$q$);
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);set local role service_role;
select pg_temp.attempt('service mixed quiz includes failed free text',$q$select pg_temp.record_test_quiz('quiz_article_test','employee',true,false)$q$);
select pg_temp.check('mixed quiz cannot pass by ignoring free text',(select score_pct=50 and not passed from public.quiz_attempts where quiz_id=pg_temp.qid('quiz_article_test') and employee_id=pg_temp.qid('employee')));
select pg_temp.check('failed quiz does not mark article read',not exists(select 1 from public.wiki_runs where article_id=pg_temp.qid('quiz_article') and employee_id=pg_temp.qid('employee') and kind='gelesen'));
select pg_temp.attempt('service rejects employee outside quiz audience',$q$select pg_temp.record_test_quiz('quiz_foreign_test','employee')$q$,'deny');
select pg_temp.attempt('service accepts office foreign quiz',$q$select pg_temp.record_test_quiz('quiz_foreign_test','office')$q$);
select pg_temp.attempt('service accepts lead readable quiz',$q$select pg_temp.record_test_quiz('quiz_news_test','lead')$q$);
select pg_temp.check('passed news quiz confirms news',(select confirmed_at is not null from public.news_reads where news_id=pg_temp.qid('rpc_news') and employee_id=pg_temp.qid('lead')));
select pg_temp.attempt('service incomplete grading rejected',$q$select public.record_quiz_attempt(pg_temp.qid('employee'),s.id,'{}','{}',s.quiz,s.questions) from pg_temp.qa_quiz_snapshots s where id=pg_temp.qid('quiz_article_test')$q$,'error');
select pg_temp.attempt('service changed quiz snapshot rejected',$q$select public.record_quiz_attempt(pg_temp.qid('employee'),s.id,'{}',s.results,s.quiz||'{"pass_pct":1}',s.questions) from pg_temp.qa_quiz_snapshots s where id=pg_temp.qid('quiz_article_test')$q$,'error');
select pg_temp.attempt('service changed questions snapshot rejected',$q$select public.record_quiz_attempt(pg_temp.qid('employee'),s.id,'{}',s.results,s.quiz,'{}') from pg_temp.qa_quiz_snapshots s where id=pg_temp.qid('quiz_article_test')$q$,'error');
reset role;
select set_config('request.jwt.claims','{}',true);
-- Inject a failure at the final completion-marker insert. Earlier attempt writes
-- must disappear too; a success response may never conceal partial persistence.
create temp table qa_quiz_failure(enabled boolean);insert into qa_quiz_failure values(true);
create function pg_temp.reject_quiz_marker() returns trigger language plpgsql as $$begin
 if new.article_id=pg_temp.qid('quiz_article') and exists(select 1 from pg_temp.qa_quiz_failure where enabled) then raise exception 'qa_marker_failure'; end if;return new;end$$;
create trigger qa_quiz_marker_failure before insert on public.wiki_runs for each row execute function pg_temp.reject_quiz_marker();
select set_config('request.jwt.claims','{"role":"service_role"}',true);set local role service_role;
select pg_temp.attempt('marker failure aborts grading transaction',$q$select pg_temp.record_test_quiz('quiz_article_test','employee')$q$,'error');
select pg_temp.check('marker failure leaves no successful attempt',not exists(select 1 from public.quiz_attempts where quiz_id=pg_temp.qid('quiz_article_test') and passed));
reset role;
update qa_quiz_failure set enabled=false;
select set_config('request.jwt.claims','{"role":"service_role"}',true);set local role service_role;
select pg_temp.attempt('service successful attempt and marker atomic',$q$select pg_temp.record_test_quiz('quiz_article_test','employee')$q$);
select pg_temp.check('successful quiz persisted',(select count(*)=1 from public.quiz_attempts where quiz_id=pg_temp.qid('quiz_article_test') and passed));
select pg_temp.check('successful quiz article marker persisted',(select count(*)=1 from public.wiki_runs where article_id=pg_temp.qid('quiz_article') and employee_id=pg_temp.qid('employee') and kind='gelesen'));
select pg_temp.attempt('service repeat pass preserves marker uniqueness',$q$select pg_temp.record_test_quiz('quiz_article_test','employee')$q$);
select pg_temp.check('repeat pass has exactly one article marker',(select count(*)=1 from public.wiki_runs where article_id=pg_temp.qid('quiz_article') and employee_id=pg_temp.qid('employee') and kind='gelesen'));
select pg_temp.attempt('service deactivates synthetic test identity in transaction',$q$update public.employees set active=false where id=pg_temp.qid('employee')$q$);
select pg_temp.attempt('grading rejects access revoked in flight',$q$select pg_temp.record_test_quiz('quiz_article_test','employee')$q$,'deny');
select pg_temp.attempt('service restores test identity in transaction',$q$update public.employees set active=true where id=pg_temp.qid('employee')$q$);
reset role;
select set_config('request.jwt.claims','{}',true);
select pg_temp.check('all progress tables publish invalidations',(select count(*)=6 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=any(array['event_registrations','task_completions','news_reads','quiz_attempts','onboarding_progress','wiki_runs'])));
select pg_temp.check('progress deletes retain default replica identity',(select bool_and(relreplident='d') from pg_class where oid=any(array['public.event_registrations'::regclass,'public.task_completions'::regclass,'public.news_reads'::regclass,'public.quiz_attempts'::regclass,'public.onboarding_progress'::regclass,'public.wiki_runs'::regclass])));
