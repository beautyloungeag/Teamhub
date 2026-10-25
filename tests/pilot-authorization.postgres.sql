-- Run only inside a rollback-only candidate transaction. The private runner must
-- supply pg_temp.qa_actors(label text, id uuid, auth_id uuid) for three existing
-- owner-controlled accounts: employee, lead and office. No real IDs live here.
create temporary table qa_results(name text, passed boolean, details jsonb);
create temporary table qa_ids(label text primary key, id uuid default gen_random_uuid());
insert into qa_ids(label) select unnest(array['peer','foreign','office_peer','deletable','template','item_own','item_foreign','item_self','ticket','private_ticket','comment','comment_delete','room','foreign_room','private_room','message_old','message_new','foreign_message','completion_own','completion_foreign','completion_delete']);
create temporary table qa_branches as select 'own'::text label, branch_id id from public.employees where id=(select id from qa_actors where label='employee');
insert into qa_branches select 'foreign',id from public.branches where id not in ('buero',(select id from qa_branches where label='own')) order by id limit 1;
create temporary table qa_parameters as select 'qa-'||gen_random_uuid()::text skill;
grant all on qa_results to authenticated, service_role;
grant select on qa_ids,qa_actors,qa_branches,qa_parameters to authenticated, service_role;
create function pg_temp.qid(n text) returns uuid language sql stable as $$select id from pg_temp.qa_ids where label=n union all select id from pg_temp.qa_actors where label=n limit 1$$;
create function pg_temp.qbranch(n text) returns text language sql stable as $$select id from pg_temp.qa_branches where label=n$$;
create function pg_temp.qskill() returns text language sql stable as $$select skill from pg_temp.qa_parameters$$;
create function pg_temp.claim(n text) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',auth_id,'role','authenticated')::text,true) from pg_temp.qa_actors where label=n$$;
create function pg_temp.check(n text,ok boolean,detail jsonb default null) returns void language sql as $$insert into pg_temp.qa_results values(n,coalesce(ok,false),detail)$$;
create function pg_temp.attempt(n text,q text,expected text default 'allow') returns void language plpgsql as $$
declare affected bigint; result jsonb;
begin
 begin execute q; get diagnostics affected=row_count; result:=jsonb_build_object('ok',true,'rows',affected);
 exception when others then result:=jsonb_build_object('ok',false,'code',sqlstate,'error',sqlerrm); end;
 perform pg_temp.check(n,case when expected='error' then result->>'ok'='false' when expected='deny' then (result->>'code'='42501' or (result->>'ok'='true' and (result->>'rows')::bigint=0)) else result->>'ok'='true' and (result->>'rows')::bigint>0 end,result);
end$$;

-- Synthetic fixtures and metadata only. Every write, trigger and queue row is rolled back.
insert into public.skills(name,is_sample) values(pg_temp.qskill(),true);
insert into public.employees(id,email,first_name,last_name,branch_id,app_role)
select pg_temp.qid(n),pg_temp.qid(n)::text||'@example.invalid','QA',n,
 case when n='foreign' then pg_temp.qbranch('foreign') else pg_temp.qbranch('own') end,
 case when n='office_peer' then 'buero'::public.app_role else 'mitarbeiterin'::public.app_role end
from unnest(array['peer','foreign','office_peer','deletable']) n;
insert into public.task_templates(id,name,branch_ids,is_sample) values(pg_temp.qid('template'),'QA rollback',array[pg_temp.qbranch('own'),pg_temp.qbranch('foreign')],true);
insert into public.task_items(id,template_id,title) select pg_temp.qid(n),pg_temp.qid('template'),n from unnest(array['item_own','item_foreign','item_self']) n;
insert into public.task_completions(id,item_id,branch_id,done_by,photo_path)
values(pg_temp.qid('completion_own'),pg_temp.qid('item_own'),pg_temp.qbranch('own'),pg_temp.qid('peer'),pg_temp.qid('peer')::text||'/proof.jpg'),
 (pg_temp.qid('completion_foreign'),pg_temp.qid('item_foreign'),pg_temp.qbranch('foreign'),pg_temp.qid('foreign'),pg_temp.qid('foreign')::text||'/proof.jpg');
insert into public.task_completions(id,item_id,branch_id,day,done_by,done_by_name) values(pg_temp.qid('completion_delete'),pg_temp.qid('item_own'),pg_temp.qbranch('own'),current_date-30,pg_temp.qid('deletable'),'QA Former');
insert into storage.objects(bucket_id,name) values
 ('task-proofs',pg_temp.qid('peer')::text||'/proof.jpg'),('task-proofs',pg_temp.qid('foreign')::text||'/proof.jpg'),
 ('task-proofs',pg_temp.qid('employee')::text||'/unlinked.jpg'),('task-proofs',pg_temp.qid('peer')::text||'/unlinked.jpg');
insert into public.tickets(id,kind,title,branch_id,created_by,is_sample,lead_notified_at,mail_status,photo_path)
values(pg_temp.qid('ticket'),'Meldung','QA report',pg_temp.qbranch('own'),pg_temp.qid('employee'),true,now(),'uebersprungen',null),
 (pg_temp.qid('private_ticket'),'Anliegen','QA private concern',pg_temp.qbranch('own'),pg_temp.qid('employee'),true,now(),'uebersprungen',pg_temp.qid('employee')::text||'/private.jpg');
insert into storage.objects(bucket_id,name) values ('ticket-photos',pg_temp.qid('employee')::text||'/private.jpg');
insert into public.ticket_comments(id,ticket_id,author_id,author_name,body) values(pg_temp.qid('comment_delete'),pg_temp.qid('ticket'),pg_temp.qid('deletable'),'QA Former','QA rollback');
update qa_ids set id=(select id from public.chat_rooms where kind='studio' and branch_id=pg_temp.qbranch('own')) where label='room';
update qa_ids set id=(select id from public.chat_rooms where kind='studio' and branch_id=pg_temp.qbranch('foreign')) where label='foreign_room';
insert into public.chat_rooms(id,kind,title) values(pg_temp.qid('private_room'),'gruppe','QA private');
delete from public.chat_members where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee');
insert into public.chat_messages(id,room_id,sender_id,body,created_at) values
 (pg_temp.qid('message_old'),pg_temp.qid('room'),pg_temp.qid('peer'),'QA first',now()-interval '2 minutes'),
 (pg_temp.qid('message_new'),pg_temp.qid('room'),pg_temp.qid('peer'),'QA second',now()-interval '1 minute'),
 (pg_temp.qid('foreign_message'),pg_temp.qid('foreign_room'),pg_temp.qid('foreign'),'QA foreign',now()-interval '1 minute');
insert into public.chat_members(room_id,employee_id) values(pg_temp.qid('private_room'),pg_temp.qid('employee'));

-- Ordinary employee: profile changes remain useful, authorization never self-assigned.
select pg_temp.claim('employee'); set local role authenticated;
select pg_temp.attempt('employee RPC language',$q$select public.update_my_profile(p_lang=>'EN')$q$);
select pg_temp.check('employee language persisted within test',(select lang='EN' from public.employees where id=pg_temp.qid('employee')));
select pg_temp.attempt('employee RPC own photo',$q$select public.update_my_profile(p_photo_path=>pg_temp.qid('employee')::text||'/avatar.jpg')$q$);
select pg_temp.attempt('employee RPC foreign photo denied',$q$select public.update_my_profile(p_photo_path=>pg_temp.qid('peer')::text||'/avatar.jpg')$q$,'deny');
select pg_temp.attempt('employee RPC skills denied',$q$select public.update_my_profile(p_skills=>array[pg_temp.qskill()])$q$,'deny');
select pg_temp.attempt('employee about',$q$select public.update_my_about('QA personal profile')$q$);
select pg_temp.attempt('employee notification preferences',$q$select public.set_notify_prefs('{"chat":true}'::jsonb)$q$);
select pg_temp.attempt('employee device report',$q$select public.report_device(true,false)$q$);
select pg_temp.attempt('employee direct extra scope denied',$q$update public.employees set extra_branch_ids=array[pg_temp.qbranch('foreign')] where id=pg_temp.qid('employee')$q$,'deny');
select pg_temp.attempt('employee direct skills denied',$q$update public.employees set skills=array[pg_temp.qskill()] where id=pg_temp.qid('employee')$q$,'deny');
select pg_temp.attempt('employee direct role denied',$q$update public.employees set app_role='buero' where id=pg_temp.qid('employee')$q$,'deny');
select pg_temp.attempt('employee raw create denied',$q$insert into public.employees(email,first_name,last_name,branch_id) values(gen_random_uuid()::text||'@example.invalid','QA','Raw',pg_temp.qbranch('own'))$q$,'deny');
select pg_temp.check('employee pre-upload own proof visible',exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('employee')::text||'/unlinked.jpg'));
select pg_temp.check('employee other proof hidden',not exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('peer')::text||'/proof.jpg'));
select pg_temp.attempt('employee own proof upload metadata',$q$insert into storage.objects(bucket_id,name) values('task-proofs',pg_temp.qid('employee')::text||'/new.jpg')$q$);
select pg_temp.attempt('employee foreign proof upload denied',$q$insert into storage.objects(bucket_id,name) values('task-proofs',pg_temp.qid('foreign')::text||'/new.jpg')$q$,'deny');
select pg_temp.attempt('employee forged proof link denied',$q$insert into public.task_completions(item_id,branch_id,done_by,photo_path) values(pg_temp.qid('item_self'),pg_temp.qbranch('own'),pg_temp.qid('employee'),pg_temp.qid('foreign')::text||'/proof.jpg')$q$,'deny');
select pg_temp.attempt('employee legitimate proof link',$q$insert into public.task_completions(item_id,branch_id,done_by,done_by_name,photo_path) values(pg_temp.qid('item_self'),pg_temp.qbranch('own'),pg_temp.qid('employee'),'Forged name',pg_temp.qid('employee')::text||'/new.jpg')$q$);
select pg_temp.check('proof actor name server derived',(select c.done_by_name=trim(e.first_name||' '||left(e.last_name,1)||'.') from public.task_completions c join public.employees e on e.id=c.done_by where c.item_id=pg_temp.qid('item_self')));
select pg_temp.attempt('employee forged comment ID denied',$q$insert into public.ticket_comments(ticket_id,author_id,body) values(pg_temp.qid('ticket'),pg_temp.qid('office'),'QA spoof')$q$,'deny');
select pg_temp.attempt('employee comment canonicalized',$q$insert into public.ticket_comments(id,ticket_id,author_id,author_name,body,created_at) values(pg_temp.qid('comment'),pg_temp.qid('ticket'),pg_temp.qid('employee'),'Forged Office Name','QA comment','2099-01-01')$q$);
select pg_temp.check('comment real author and server clock',(select c.author_name=trim(e.first_name||' '||e.last_name) and c.created_at<now()+interval '1 minute' from public.ticket_comments c join public.employees e on e.id=c.author_id where c.id=pg_temp.qid('comment')));
select pg_temp.attempt('employee comment metadata patch denied',$q$update public.ticket_comments set author_name='Forged' where id=pg_temp.qid('comment')$q$,'deny');
select pg_temp.attempt('read displayed older message',$q$select public.mark_chat_read(pg_temp.qid('room'),pg_temp.qid('message_old'))$q$);
select pg_temp.check('newer message stays unread',(select last_read_at=(select created_at from public.chat_messages where id=pg_temp.qid('message_old')) from public.chat_members where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')),(select jsonb_build_object('cursor',last_read_at,'old',(select created_at from public.chat_messages where id=pg_temp.qid('message_old')),'new',(select created_at from public.chat_messages where id=pg_temp.qid('message_new'))) from public.chat_members where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')));
select pg_temp.attempt('send without automatic read acknowledgment',$q$insert into public.chat_messages(room_id,sender_id,body) values(pg_temp.qid('room'),pg_temp.qid('employee'),'QA outgoing before render')$q$);
select pg_temp.check('send preserves rendered read cursor',(select last_read_at=(select created_at from public.chat_messages where id=pg_temp.qid('message_old')) from public.chat_members where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')));
select pg_temp.attempt('read latest displayed message',$q$select public.mark_chat_read(pg_temp.qid('room'),pg_temp.qid('message_new'))$q$);
select pg_temp.attempt('read older message again',$q$select public.mark_chat_read(pg_temp.qid('room'),pg_temp.qid('message_old'))$q$);
select pg_temp.check('read cursor monotonic',(select last_read_at=(select created_at from public.chat_messages where id=pg_temp.qid('message_new')) from public.chat_members where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')));
select pg_temp.attempt('message from wrong room rejected',$q$select public.mark_chat_read(pg_temp.qid('room'),pg_temp.qid('foreign_message'))$q$,'error');
select pg_temp.attempt('foreign studio read cursor denied',$q$select public.mark_chat_read(pg_temp.qid('foreign_room'),pg_temp.qid('foreign_message'))$q$,'deny');
select pg_temp.attempt('private disabled read cursor denied',$q$select public.mark_chat_read(pg_temp.qid('private_room'),pg_temp.qid('message_old'))$q$,'deny');
select pg_temp.attempt('future cursor clamped',$q$update public.chat_members set last_read_at='2099-01-01' where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')$q$);
select pg_temp.check('future cursor cannot acknowledge future messages',(select last_read_at=(select max(created_at) from public.chat_messages where room_id=pg_temp.qid('room')) from public.chat_members where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')));
reset role;

-- Leadership: own authorization is immutable, colleague skills remain manageable.
select pg_temp.claim('lead'); set local role authenticated;
select pg_temp.attempt('lead self scope expansion denied',$q$update public.employees set extra_branch_ids=array[pg_temp.qbranch('foreign')] where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead self branch move denied',$q$update public.employees set branch_id=pg_temp.qbranch('foreign') where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead self role elevation denied',$q$update public.employees set app_role='buero' where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead self qualification denied',$q$update public.employees set skills=array[pg_temp.qskill()] where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead self audience group denied',$q$update public.employees set job_title='QA expanded' where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead RPC qualification denied',$q$select public.update_my_profile(p_skills=>array[pg_temp.qskill()])$q$,'deny');
select pg_temp.attempt('lead personal about allowed',$q$select public.update_my_about('QA lead profile')$q$);
select pg_temp.attempt('lead personal language allowed',$q$select public.update_my_profile(p_lang=>'FR')$q$);
select pg_temp.attempt('lead own studio colleague skills allowed',$q$update public.employees set skills=array[pg_temp.qskill()],job_title='QA qualified' where id=pg_temp.qid('peer')$q$);
select pg_temp.attempt('lead foreign colleague modification denied',$q$update public.employees set skills=array[pg_temp.qskill()] where id=pg_temp.qid('foreign')$q$,'deny');
select pg_temp.attempt('lead colleague scope expansion denied',$q$update public.employees set extra_branch_ids=array[pg_temp.qbranch('foreign')] where id=pg_temp.qid('peer')$q$,'deny');
select pg_temp.attempt('lead colleague role grant denied',$q$update public.employees set app_role='filialleitung' where id=pg_temp.qid('peer')$q$,'deny');
select pg_temp.attempt('lead office profile modification denied',$q$update public.employees set skills=array[pg_temp.qskill()] where id=pg_temp.qid('office_peer')$q$,'deny');
select pg_temp.attempt('lead auth identity remap denied',$q$update public.employees set auth_user_id=null where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead own activation change denied',$q$update public.employees set active=false where id=pg_temp.qid('lead')$q$,'deny');
select pg_temp.attempt('lead forged device readiness denied',$q$update public.employees set push_enabled=true where id=pg_temp.qid('peer')$q$,'deny');
select pg_temp.attempt('lead legitimate own colleague deactivation',$q$update public.employees set active=false where id=pg_temp.qid('peer')$q$);
select pg_temp.check('deactivated own peer stays manageable',(select not active from public.employees where id=pg_temp.qid('peer')));
select pg_temp.attempt('lead legitimate reactivate colleague',$q$update public.employees set active=true where id=pg_temp.qid('peer')$q$);
select pg_temp.check('lead linked own studio proof visible',exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('peer')::text||'/proof.jpg'));
select pg_temp.check('lead foreign studio proof hidden',not exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('foreign')::text||'/proof.jpg'));
select pg_temp.check('lead unlinked colleague proof hidden',not exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('peer')::text||'/unlinked.jpg'));
select pg_temp.check('lead private concern attachment hidden',not exists(select 1 from storage.objects where bucket_id='ticket-photos' and name=pg_temp.qid('employee')::text||'/private.jpg'));
select pg_temp.attempt('lead permitted report comment',$q$insert into public.ticket_comments(ticket_id,author_id,author_name,body) values(pg_temp.qid('ticket'),pg_temp.qid('lead'),'Fake','QA lead')$q$);
select pg_temp.attempt('lead private concern comment denied',$q$insert into public.ticket_comments(ticket_id,author_id,body) values(pg_temp.qid('private_ticket'),pg_temp.qid('lead'),'QA forbidden')$q$,'deny');
reset role;

-- Office: authorized management preserved, self scope and identity mappings guarded.
select pg_temp.claim('office'); set local role authenticated;
select pg_temp.attempt('office legitimate colleague role branch skills',$q$update public.employees set app_role='filialleitung',branch_id=pg_temp.qbranch('foreign'),extra_branch_ids=array[pg_temp.qbranch('own')],skills=array[pg_temp.qskill()] where id=pg_temp.qid('peer')$q$);
select pg_temp.attempt('office legitimate own job skills',$q$update public.employees set job_title='QA Office',skills=array[pg_temp.qskill()] where id=pg_temp.qid('office')$q$);
select pg_temp.attempt('office self role change denied',$q$update public.employees set app_role='filialleitung' where id=pg_temp.qid('office')$q$,'deny');
select pg_temp.attempt('office self branch change denied',$q$update public.employees set branch_id=pg_temp.qbranch('foreign') where id=pg_temp.qid('office')$q$,'deny');
select pg_temp.attempt('office self deactivate denied',$q$update public.employees set active=false where id=pg_temp.qid('office')$q$,'deny');
select pg_temp.attempt('office auth mapping change denied',$q$update public.employees set auth_user_id=null where id=pg_temp.qid('employee')$q$,'deny');
select pg_temp.attempt('office email identity change denied',$q$update public.employees set email='qa-identity-change@example.invalid' where id=pg_temp.qid('employee')$q$,'deny');
select pg_temp.attempt('office valid employee record create',$q$insert into public.employees(email,first_name,last_name,branch_id,skills) values(gen_random_uuid()::text||'@example.invalid','QA','Office created',pg_temp.qbranch('own'),array[pg_temp.qskill()])$q$);
select pg_temp.attempt('office prelinked auth record create denied',$q$insert into public.employees(email,first_name,last_name,branch_id,auth_user_id) values(gen_random_uuid()::text||'@example.invalid','QA','Forged',pg_temp.qbranch('own'),(select auth_id from pg_temp.qa_actors where label='employee'))$q$,'deny');
select pg_temp.check('office foreign proof visible',exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('foreign')::text||'/proof.jpg'));
select pg_temp.check('office private concern attachment visible',exists(select 1 from storage.objects where bucket_id='ticket-photos' and name=pg_temp.qid('employee')::text||'/private.jpg'));
select pg_temp.attempt('office permitted private concern comment',$q$insert into public.ticket_comments(ticket_id,author_id,author_name,body) values(pg_temp.qid('private_ticket'),pg_temp.qid('office'),'Fake','QA office')$q$);
select pg_temp.attempt('office historical actor deletion',$q$delete from public.employees where id=pg_temp.qid('deletable')$q$);
select pg_temp.check('historical comment preserved with nulled actor',(select author_id is null and author_name='QA Former' from public.ticket_comments where id=pg_temp.qid('comment_delete')));
select pg_temp.check('historical proof actor nulling preserved',(select done_by is null and done_by_name='QA Former' from public.task_completions where id=pg_temp.qid('completion_delete')));
select pg_temp.attempt('office catalog skill removal cascades safely',$q$select public.delete_skill(pg_temp.qskill())$q$);
select pg_temp.check('office skill removal changed employee arrays',not exists(select 1 from public.employees where pg_temp.qskill()=any(skills)));
reset role;

-- Trigger checks independently of existing RLS (defence against future policy drift).
select pg_temp.claim('employee');
select pg_temp.attempt('trigger self skills even definer denied',$q$update public.employees set skills=array['QA forbidden'] where id=pg_temp.qid('employee')$q$,'deny');
select pg_temp.attempt('trigger comment identity even definer denied',$q$update public.ticket_comments set author_name='Spoofed' where id=pg_temp.qid('comment')$q$,'deny');
select pg_temp.attempt('trigger proof relink even definer denied',$q$update public.task_completions set photo_path=pg_temp.qid('foreign')::text||'/proof.jpg' where item_id=pg_temp.qid('item_self')$q$,'deny');
select pg_temp.attempt('chat membership ID immutable',$q$update public.chat_members set employee_id=pg_temp.qid('lead') where room_id=pg_temp.qid('room') and employee_id=pg_temp.qid('employee')$q$,'deny');
-- Every protected self-field is checked through a privileged function-like
-- context as well as Data API RLS; SECURITY DEFINER must not bypass the trigger.
do $$ declare field text; assignment text; who text; begin
 foreach who in array array['employee','lead'] loop
  perform pg_temp.claim(who);
  for field,assignment in select * from (values
   ('scope','extra_branch_ids=array[pg_temp.qbranch(''foreign'')]'),
   ('branch','branch_id=pg_temp.qbranch(''foreign'')'),
   ('role','app_role=''buero'''),('active','active=false'),
   ('auth','auth_user_id=null'),('email','email=gen_random_uuid()::text||''@example.invalid'''),
   ('skills','skills=array[''QA forbidden'']'),('job','job_title=''QA unauthorized''')
  ) cases(field,assignment) loop
   perform pg_temp.attempt(who||' privileged self '||field||' denied','update public.employees set '||assignment||' where id=pg_temp.qid('||quote_literal(who)||')','deny');
  end loop;
 end loop;
end $$;
select pg_temp.claim('office');
select pg_temp.attempt('office peer scope metadata allowed',$q$update public.employees set extra_branch_ids=array[pg_temp.qbranch('foreign')] where id=pg_temp.qid('peer')$q$);
select set_config('request.jwt.claims','{"role":"service_role"}',true); set local role service_role;
select pg_temp.attempt('service create path preserved',$q$insert into public.employees(email,first_name,last_name,branch_id,app_role) values(gen_random_uuid()::text||'@example.invalid','QA','Service',pg_temp.qbranch('own'),'filialleitung')$q$);
select pg_temp.attempt('service administrative role path preserved',$q$update public.employees set app_role='mitarbeiterin',extra_branch_ids='{}' where id=pg_temp.qid('peer')$q$);
select pg_temp.attempt('service profile deactivation path',$q$update public.employees set active=false where id=pg_temp.qid('employee')$q$);
reset role;
select pg_temp.claim('employee'); set local role authenticated;
select pg_temp.attempt('deactivated session profile RPC denied',$q$select public.update_my_profile(p_lang=>'EN')$q$,'deny');
select pg_temp.attempt('deactivated session chat RPC denied',$q$select public.mark_chat_read(pg_temp.qid('room'),pg_temp.qid('message_new'))$q$,'deny');
select pg_temp.check('deactivated session file hidden',not exists(select 1 from storage.objects where bucket_id='task-proofs' and name=pg_temp.qid('employee')::text||'/unlinked.jpg'));
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true); set local role service_role;
select pg_temp.attempt('service profile reactivation path',$q$update public.employees set active=true where id=pg_temp.qid('employee')$q$);
reset role;
select set_config('request.jwt.claims','{}',true);
select pg_temp.check('all requested realtime tables published',(select count(*)=4 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=any(array['employees','tickets','ticket_comments','ticket_votes'])));
select pg_temp.check('realtime deletes contain only identity',(select bool_and(relreplident='d') from pg_class where oid=any(array['public.employees'::regclass,'public.tickets'::regclass,'public.ticket_comments'::regclass,'public.ticket_votes'::regclass])));
select pg_temp.check('anonymous profile RPC revoked',not has_function_privilege('anon','public.update_my_profile(text,text[],text)','execute'));
select pg_temp.check('anonymous read RPC revoked',not has_function_privilege('anon','public.mark_chat_read(uuid,uuid)','execute'));
