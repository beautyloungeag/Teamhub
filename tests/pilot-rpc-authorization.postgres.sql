-- Run after pilot-authorization.postgres.sql, in the same forced-rollback harness.
-- All fixtures are synthetic. Never run this file as a committed SQL batch.
grant all on pg_temp.qa_results to anon;
grant select on pg_temp.qa_ids,pg_temp.qa_actors,pg_temp.qa_branches,pg_temp.qa_parameters to anon;
insert into qa_ids(label) select unnest(array['rpc_news','rpc_foreign_news','rpc_poll','rpc_foreign_poll','rpc_question','rpc_foreign_question','rpc_todo_own','rpc_todo_foreign','rpc_todo_private','rpc_event_training','rpc_event_meeting']);
insert into public.skills(name,is_sample) values(pg_temp.qskill(),true);
insert into public.wiki_categories(key,emoji) values(pg_temp.qskill(),'QA');
insert into public.news(id,title,body,publish_at,audience_branches,is_sample,notified_at,author_id) values
 (pg_temp.qid('rpc_news'),'QA own poll','',now(),array[pg_temp.qbranch('own')],true,now(),pg_temp.qid('office')),
 (pg_temp.qid('rpc_foreign_news'),'QA foreign poll','',now(),array[pg_temp.qbranch('foreign')],true,now(),pg_temp.qid('office'));
insert into public.polls(id,news_id,anonymous,show_results) values
 (pg_temp.qid('rpc_poll'),pg_temp.qid('rpc_news'),false,false),(pg_temp.qid('rpc_foreign_poll'),pg_temp.qid('rpc_foreign_news'),false,false);
insert into public.poll_questions(id,poll_id,kind,prompt) values
 (pg_temp.qid('rpc_question'),pg_temp.qid('rpc_poll'),'text','QA own prompt'),(pg_temp.qid('rpc_foreign_question'),pg_temp.qid('rpc_foreign_poll'),'text','QA private prompt');
insert into public.poll_answers(question_id,poll_id,employee_id,value) values
 (pg_temp.qid('rpc_question'),pg_temp.qid('rpc_poll'),pg_temp.qid('employee'),'"QA own response"'),
 (pg_temp.qid('rpc_foreign_question'),pg_temp.qid('rpc_foreign_poll'),pg_temp.qid('foreign'),'"QA confidential response"');
insert into public.todos(id,title,branch_id,assignee_id,created_by,notified_at) values
 (pg_temp.qid('rpc_todo_own'),'QA own unassigned',pg_temp.qbranch('own'),null,null,now()),
 (pg_temp.qid('rpc_todo_foreign'),'QA foreign unassigned',pg_temp.qbranch('foreign'),null,null,now()),
 (pg_temp.qid('rpc_todo_private'),'QA private deleted creator',null,pg_temp.qid('peer'),null,now());
insert into public.events(id,title,kind,starts_at,audience_branches,capacity,created_by,is_sample,notified_at,phorest_sync) values
 (pg_temp.qid('rpc_event_training'),'QA training','Schulung',now()+interval '3 days',array[pg_temp.qbranch('own')],1,pg_temp.qid('office'),true,now(),false),
 (pg_temp.qid('rpc_event_meeting'),'QA foreign meeting','Meeting',now()+interval '3 days',array[pg_temp.qbranch('foreign')],null,pg_temp.qid('office'),true,now(),false);
insert into public.event_registrations(event_id,employee_id,coming) values
 (pg_temp.qid('rpc_event_training'),pg_temp.qid('peer'),true),(pg_temp.qid('rpc_event_meeting'),pg_temp.qid('foreign'),true);

-- Anonymous access: the RPC boundary itself rejects every definer helper.
select set_config('request.jwt.claims','{"role":"anon"}',true);set local role anon;
select pg_temp.attempt('anon delete skill denied',$q$select public.delete_skill(pg_temp.qskill())$q$,'deny');
select pg_temp.attempt('anon rename category denied',$q$select public.rename_wiki_category(pg_temp.qskill(),pg_temp.qskill()||'-renamed')$q$,'deny');
select pg_temp.attempt('anon proposals approval denied',$q$select public.approve_wiki_proposals('tasks')$q$,'deny');
select pg_temp.attempt('anon poll disclosure denied',$q$select public.poll_results(pg_temp.qid('rpc_poll'))$q$,'deny');
select pg_temp.attempt('anon event metadata denied',$q$select * from public.event_counts()$q$,'deny');
select pg_temp.attempt('anon waitlist mutation denied',$q$select public.promote_waitlist(pg_temp.qid('rpc_event_training'))$q$,'deny');
reset role;
select pg_temp.check('no anonymous executable public definer functions',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')));
select pg_temp.check('no client executable trigger functions',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype in ('trigger'::regtype,'event_trigger'::regtype) and has_function_privilege('authenticated',p.oid,'EXECUTE')));

-- An authenticated JWT without an active employee must fail closed too; merely
-- revoking anonymous access would leave this same NULL-role hole open.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid())::text,true);set local role authenticated;
select pg_temp.check('missing profile role helpers false',public.is_buero() is false and public.is_lead() is false and public.in_audience('{}') is false and public.poll_lead(pg_temp.qid('rpc_poll')) is false);
select pg_temp.attempt('missing profile delete skill denied',$q$select public.delete_skill(pg_temp.qskill())$q$,'error');
select pg_temp.attempt('missing profile rename category denied',$q$select public.rename_wiki_category(pg_temp.qskill(),pg_temp.qskill()||'-renamed')$q$,'error');
select pg_temp.attempt('missing profile proposal approval denied',$q$select public.approve_wiki_proposals('tasks')$q$,'error');
select pg_temp.attempt('missing profile poll disclosure denied',$q$select public.poll_results(pg_temp.qid('rpc_poll'))$q$,'error');
select pg_temp.check('missing profile event counts empty',not exists(select 1 from public.event_counts()));
reset role;

select pg_temp.claim('employee');set local role authenticated;
select pg_temp.check('foreign todo not readable',not exists(select 1 from public.todos where id=pg_temp.qid('rpc_todo_foreign')));
select pg_temp.attempt('foreign unassigned todo mutation denied',$q$select public.todo_done(pg_temp.qid('rpc_todo_foreign'),true)$q$,'error');
select pg_temp.attempt('private deleted-creator todo mutation denied',$q$select public.todo_done(pg_temp.qid('rpc_todo_private'),true)$q$,'error');
select pg_temp.attempt('own studio unassigned todo allowed',$q$select public.todo_done(pg_temp.qid('rpc_todo_own'),true)$q$);
select pg_temp.attempt('employee closed poll result denied',$q$select public.poll_results(pg_temp.qid('rpc_poll'))$q$,'error');
select pg_temp.attempt('employee administrative skill deletion denied',$q$select public.delete_skill(pg_temp.qskill())$q$,'error');
select pg_temp.attempt('employee direct waitlist maintenance denied',$q$select public.promote_waitlist(pg_temp.qid('rpc_event_training'))$q$,'deny');
select pg_temp.check('employee counts exclude foreign meeting',not exists(select 1 from public.event_counts() where event_id=pg_temp.qid('rpc_event_meeting')));
select pg_temp.check('employee counts retain readable training',exists(select 1 from public.event_counts() where event_id=pg_temp.qid('rpc_event_training') and taken=1));
select pg_temp.attempt('employee allowed training registration waitlists',$q$select public.register_event(pg_temp.qid('rpc_event_training'))$q$);
select pg_temp.check('registration remains waitlisted',(select waitlist from public.event_registrations where event_id=pg_temp.qid('rpc_event_training') and employee_id=pg_temp.qid('employee')));
reset role;

select pg_temp.claim('lead');set local role authenticated;
select pg_temp.attempt('lead own studio poll results allowed',$q$select public.poll_results(pg_temp.qid('rpc_poll'))$q$);
select pg_temp.attempt('lead foreign poll disclosure denied',$q$select public.poll_results(pg_temp.qid('rpc_foreign_poll'))$q$,'error');
select pg_temp.attempt('lead foreign unassigned todo denied',$q$select public.todo_done(pg_temp.qid('rpc_todo_foreign'),true)$q$,'error');
select pg_temp.attempt('lead own todo undo allowed',$q$select public.todo_done(pg_temp.qid('rpc_todo_own'),false)$q$);
select pg_temp.check('lead counts exclude foreign meeting',not exists(select 1 from public.event_counts() where event_id=pg_temp.qid('rpc_event_meeting')));
reset role;

select pg_temp.claim('office');set local role authenticated;
select pg_temp.attempt('office foreign todo allowed',$q$select public.todo_done(pg_temp.qid('rpc_todo_foreign'),true)$q$);
select pg_temp.attempt('office private poll allowed',$q$select public.poll_results(pg_temp.qid('rpc_foreign_poll'))$q$);
select pg_temp.check('office counts include foreign meeting',exists(select 1 from public.event_counts() where event_id=pg_temp.qid('rpc_event_meeting') and taken=1));
select pg_temp.attempt('office legitimate category rename',$q$select public.rename_wiki_category(pg_temp.qskill(),pg_temp.qskill()||'-renamed')$q$);
select pg_temp.attempt('office legitimate catalog deletion',$q$select public.delete_skill(pg_temp.qskill())$q$);
select pg_temp.attempt('office event capacity change still promotes through trusted trigger',$q$update public.events set capacity=2 where id=pg_temp.qid('rpc_event_training')$q$);
select pg_temp.check('trusted waitlist promotion succeeded',(select not waitlist and promoted_at is not null from public.event_registrations where event_id=pg_temp.qid('rpc_event_training') and employee_id=pg_temp.qid('employee')));
select pg_temp.attempt('office allows respondents results',$q$update public.polls set show_results=true where id=pg_temp.qid('rpc_poll')$q$);
reset role;
select pg_temp.claim('employee');set local role authenticated;
select pg_temp.attempt('employee permitted answered poll results',$q$select public.poll_results(pg_temp.qid('rpc_poll'))$q$);
reset role;
select set_config('request.jwt.claims','{}',true);
select pg_temp.check('foreign mutation denied until office completed it',(select done_by=pg_temp.qid('office') from public.todos where id=pg_temp.qid('rpc_todo_foreign')));
select pg_temp.check('private todo remained unchanged',(select done_at is null from public.todos where id=pg_temp.qid('rpc_todo_private')));
