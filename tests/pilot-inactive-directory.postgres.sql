-- Continued rollback-only fixture suite. No Auth users are created.
insert into qa_ids(label) select unnest(array['inactive_own','inactive_foreign','inactive_office','inactive_extra_only']);
insert into public.employees(id,email,first_name,last_name,branch_id,app_role,extra_branch_ids,active)
select pg_temp.qid(n),pg_temp.qid(n)::text||'@example.invalid','QA',n,
 case when n in ('inactive_foreign','inactive_extra_only') then pg_temp.qbranch('foreign') else pg_temp.qbranch('own') end,
 case when n='inactive_office' then 'buero'::public.app_role else 'mitarbeiterin'::public.app_role end,
 case when n='inactive_extra_only' then array[pg_temp.qbranch('own')] else '{}'::text[] end,false
from unnest(array['inactive_own','inactive_foreign','inactive_office','inactive_extra_only']) n;
select pg_temp.claim('employee');set local role authenticated;
select pg_temp.check('employee inactive own studio hidden',not exists(select 1 from public.employees where id=pg_temp.qid('inactive_own')));
select pg_temp.check('employee inactive foreign studio hidden',not exists(select 1 from public.employees where id=pg_temp.qid('inactive_foreign')));
reset role;
select pg_temp.claim('lead');set local role authenticated;
select pg_temp.check('lead inactive own primary studio visible',exists(select 1 from public.employees where id=pg_temp.qid('inactive_own')));
select pg_temp.check('lead inactive foreign primary studio hidden',not exists(select 1 from public.employees where id=pg_temp.qid('inactive_foreign')));
select pg_temp.check('lead inactive office role hidden',not exists(select 1 from public.employees where id=pg_temp.qid('inactive_office')));
select pg_temp.check('lead target extra overlap cannot expose inactive foreign primary',not exists(select 1 from public.employees where id=pg_temp.qid('inactive_extra_only')));
select pg_temp.attempt('lead actual inactive colleague reactivation',$q$update public.employees set active=true where id=pg_temp.qid('inactive_own')$q$);
select pg_temp.check('lead reactivation persisted within rollback fixture',(select active from public.employees where id=pg_temp.qid('inactive_own')));
select pg_temp.attempt('lead foreign inactive reactivation denied',$q$update public.employees set active=true where id=pg_temp.qid('inactive_foreign')$q$,'deny');
select pg_temp.attempt('lead office inactive reactivation denied',$q$update public.employees set active=true where id=pg_temp.qid('inactive_office')$q$,'deny');
select pg_temp.check('inactive directory access does not open private concerns',not exists(select 1 from public.tickets where id=pg_temp.qid('private_ticket')));
select pg_temp.check('inactive directory access does not open private concern photos',not exists(select 1 from storage.objects where bucket_id='ticket-photos' and name=pg_temp.qid('employee')::text||'/private.jpg'));
reset role;
select pg_temp.claim('office');set local role authenticated;
select pg_temp.check('office inactive foreign profiles preserved',exists(select 1 from public.employees where id=pg_temp.qid('inactive_foreign')));
select pg_temp.check('office inactive office profiles preserved',exists(select 1 from public.employees where id=pg_temp.qid('inactive_office')));
reset role;
select set_config('request.jwt.claims','{}',true);
