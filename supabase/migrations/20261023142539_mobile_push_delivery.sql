-- Immediate, durable chat push. No historical messages are backfilled.
create schema if not exists teamhub_private;
revoke all on schema teamhub_private from public,anon,authenticated;
grant usage on schema teamhub_private to service_role;
create function teamhub_private.chat_allows(p_room uuid,p_employee uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.employees e join public.chat_rooms r on r.id=p_room
 where e.id=p_employee and e.active and (
  r.kind='team' or (r.kind='studio' and (e.app_role='buero' or r.branch_id=any(array_prepend(e.branch_id,e.extra_branch_ids))))
  or (r.kind in ('direkt','gruppe') and coalesce((select value from public.app_settings where key='chat_private'),'false'::jsonb)='true'::jsonb
   and exists(select 1 from public.chat_members m where m.room_id=r.id and m.employee_id=e.id))))
$$;
create function teamhub_private.unread_chats(p_employee uuid) returns integer
language sql stable security invoker set search_path='' as $$
 with rooms as materialized(select id from public.chat_rooms r where teamhub_private.chat_allows(r.id,p_employee))
 select least(999,count(*))::integer from rooms r join public.chat_messages msg on msg.room_id=r.id
 where msg.sender_id<>p_employee
 and msg.created_at>coalesce((select last_read_at from public.chat_members where room_id=msg.room_id and employee_id=p_employee),'-infinity'::timestamptz)
$$;
create function public.my_chat_unread_count() returns integer
language sql stable security definer set search_path='' as $$
 select case when public.my_employee_id() is not null then teamhub_private.unread_chats(public.my_employee_id()) else 0 end
$$;
revoke all on function public.my_chat_unread_count() from public,anon;
grant execute on function public.my_chat_unread_count() to authenticated;
revoke all on all functions in schema teamhub_private from public,anon,authenticated;
grant execute on all functions in schema teamhub_private to service_role;

-- Browser-issued provider URLs only; a subscription must not become a server-side HTTP proxy.
alter table public.push_subscriptions add constraint push_endpoint_provider check (
 endpoint ~ '^https://([A-Za-z0-9-]+\.)*push\.apple\.com/' or
 endpoint ~ '^https://fcm\.googleapis\.com/(fcm/send|wp)/' or
 endpoint ~ '^https://([A-Za-z0-9-]+\.)*push\.services\.mozilla\.com/' or
 endpoint ~ '^https://([A-Za-z0-9-]+\.)*notify\.windows\.com/');
create table public.chat_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.chat_messages(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','skipped','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 claim uuid, claimed_at timestamptz, delivered_at timestamptz, last_error text,
 created_at timestamptz not null default now(), unique(message_id,endpoint)
);
create index chat_push_pending on public.chat_push_deliveries(available_at) where status in ('pending','sending');
alter table public.chat_push_deliveries enable row level security;
revoke all on public.chat_push_deliveries from public,anon,authenticated;
grant all on public.chat_push_deliveries to service_role;
create function teamhub_private.queue_chat_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.chat_push_deliveries(message_id,employee_id,endpoint)
 select new.id,s.employee_id,s.endpoint from public.push_subscriptions s
 where s.employee_id<>new.sender_id and teamhub_private.chat_allows(new.room_id,s.employee_id);
 if found then
  -- pg_net sends only after commit. A failed wake-up leaves the durable rows for cron.
  begin
   perform net.http_post(url:='https://vdekbelklbctqwucibzn.supabase.co/functions/v1/notify',
    headers:=(select decrypted_secret::jsonb from vault.decrypted_secrets where name='teamhub-communication-retention-hourly-headers'),
    body:='{"action":"chat_push"}'::jsonb,timeout_milliseconds:=60000);
  exception when others then null;
  end;
 end if;
 return null;
end $$;
create trigger chat_push_queue after insert on public.chat_messages for each row execute function teamhub_private.queue_chat_push();
revoke all on function teamhub_private.queue_chat_push() from public,anon,authenticated;

create function public.claim_chat_push(p_limit integer default 80)
returns table(delivery_id uuid,claim_id uuid,endpoint text,p256dh text,auth text,employee_id uuid,lang text,
 room_id uuid,room_kind text,room_title text,sender_name text,message_body text,message_id uuid,badge_count integer)
language plpgsql security invoker set search_path='' as $$
begin
 update public.chat_push_deliveries d set status='failed',claim=null,claimed_at=null,last_error='push_attempts_exhausted'
 where d.status in ('pending','sending') and d.attempts>=8 and (d.claim is null or d.claimed_at<now()-interval '3 minutes');
 -- Permissions and read markers are rechecked at delivery time, not only at enqueue time.
 update public.chat_push_deliveries d set status='skipped',claim=null,claimed_at=null
 from public.chat_messages m
 where m.id=d.message_id and d.status in ('pending','sending') and (d.claim is null or d.claimed_at<now()-interval '3 minutes')
 and (not teamhub_private.chat_allows(m.room_id,d.employee_id) or m.sender_id=d.employee_id or m.created_at<now()-interval '24 hours'
  or exists(select 1 from public.chat_members c where c.room_id=m.room_id and c.employee_id=d.employee_id and c.last_read_at>=m.created_at));
 return query
 with candidates as (
  select d.id from public.chat_push_deliveries d
  where d.status in ('pending','sending') and d.attempts<8 and d.available_at<=now()
   and (d.claim is null or d.claimed_at<now()-interval '3 minutes')
  order by d.available_at,d.created_at for update skip locked limit least(greatest(p_limit,1),80)
 ), claimed as (
  update public.chat_push_deliveries d set status='sending',claim=gen_random_uuid(),claimed_at=now(),attempts=d.attempts+1
  where d.id in (select c.id from candidates c) returning d.*
 )
 select c.id,c.claim,s.endpoint,s.p256dh,s.auth,e.id,e.lang::text,r.id,r.kind,
  case when r.kind='studio' then coalesce(b.name,r.title,'') else coalesce(r.title,'') end,
  coalesce(sender.first_name,''),m.body,m.id,teamhub_private.unread_chats(e.id)
 from claimed c join public.push_subscriptions s on s.endpoint=c.endpoint and s.employee_id=c.employee_id
 join public.employees e on e.id=c.employee_id
 join public.chat_messages m on m.id=c.message_id join public.chat_rooms r on r.id=m.room_id
 left join public.branches b on b.id=r.branch_id left join public.employees sender on sender.id=m.sender_id;
end $$;
create function public.finish_chat_push(p_delivery uuid,p_claim uuid,p_result text,p_error text default null)
returns void language sql security invoker set search_path='' as $$
 update public.chat_push_deliveries set
  status=case when p_result='sent' then 'sent' when p_result='skipped' then 'skipped' when attempts>=8 then 'failed' else 'pending' end,
  delivered_at=case when p_result='sent' then now() else delivered_at end,
  available_at=now()+make_interval(secs=>least(900,15*(2^least(attempts,6))::int)),
  claim=null,claimed_at=null,last_error=left(p_error,60)
 where id=p_delivery and claim=p_claim
$$;
revoke all on function public.claim_chat_push(integer),public.finish_chat_push(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_chat_push(integer),public.finish_chat_push(uuid,uuid,text,text) to service_role;

-- Readiness represents all registered devices, not whichever device reported last.
create function teamhub_private.push_readiness() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if tg_op='INSERT' then ids:=array[new.employee_id]; elsif tg_op='DELETE' then ids:=array[old.employee_id]; else ids:=array[old.employee_id,new.employee_id]; end if;
 update public.employees e set push_enabled=exists(select 1 from public.push_subscriptions s where s.employee_id=e.id) where e.id=any(ids);
 return null;
end $$;
create trigger push_readiness after insert or update or delete on public.push_subscriptions for each row execute function teamhub_private.push_readiness();
revoke all on function teamhub_private.push_readiness() from public,anon,authenticated;
create or replace function public.report_device(p_standalone boolean,p_push boolean) returns void
language sql security definer set search_path='' as $$
 update public.employees e set last_seen_at=now(),
  push_enabled=exists(select 1 from public.push_subscriptions s where s.employee_id=e.id),
  app_installed_at=case when p_standalone then coalesce(e.app_installed_at,now()) else e.app_installed_at end
 where e.auth_user_id=auth.uid() and e.active
$$;
revoke all on function public.report_device(boolean,boolean) from public,anon;
grant execute on function public.report_device(boolean,boolean) to authenticated;
select cron.schedule('teamhub-chat-push-retry','* * * * *',$cron$
 select net.http_post(url:='https://vdekbelklbctqwucibzn.supabase.co/functions/v1/notify',
 headers:=(select decrypted_secret::jsonb from vault.decrypted_secrets where name='teamhub-communication-retention-hourly-headers'),
 body:='{"action":"chat_push"}'::jsonb,timeout_milliseconds:=60000);
$cron$);
select cron.schedule('teamhub-chat-push-cleanup','15 3 * * *',$cron$
 delete from public.chat_push_deliveries where created_at<now()-interval '7 days';
$cron$);
create function public.chat_push_valid(p_delivery uuid,p_claim uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.chat_push_deliveries d
 join public.chat_messages m on m.id=d.message_id
 join public.push_subscriptions s on s.endpoint=d.endpoint and s.employee_id=d.employee_id
 where d.id=p_delivery and d.claim=p_claim and d.status='sending'
 and m.created_at>now()-interval '24 hours' and teamhub_private.chat_allows(m.room_id,d.employee_id)
 and not exists(select 1 from public.chat_members c where c.room_id=m.room_id and c.employee_id=d.employee_id and c.last_read_at>=m.created_at))
$$;
revoke all on function public.chat_push_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chat_push_valid(uuid,uuid) to service_role;
-- Device clocks cannot move unread markers into the future. Membership IDs are not editable.
create function teamhub_private.chat_clock() returns trigger
language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null then
  if tg_table_name='chat_messages' then new.created_at:=clock_timestamp();
  else
   if tg_op='UPDATE' and (new.room_id is distinct from old.room_id or new.employee_id is distinct from old.employee_id) then raise exception 'chat_membership_immutable'; end if;
   if new.employee_id=public.my_employee_id() then new.last_read_at:=clock_timestamp(); end if;
  end if;
 end if;
 return new;
end $$;
create trigger chat_message_clock before insert on public.chat_messages for each row execute function teamhub_private.chat_clock();
create trigger chat_member_clock before insert or update on public.chat_members for each row execute function teamhub_private.chat_clock();
revoke all on function teamhub_private.chat_clock() from public,anon,authenticated;
create function teamhub_private.revoke_employee_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not new.active then delete from public.push_subscriptions where employee_id=new.id; end if;
 return null;
end $$;
create trigger revoke_employee_push after update of active on public.employees for each row execute function teamhub_private.revoke_employee_push();
revoke all on function teamhub_private.revoke_employee_push() from public,anon,authenticated;
