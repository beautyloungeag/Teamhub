-- Durable per-event outbox. No browser access to remote IDs, provider errors or leases.
create table public.phorest_event_jobs (
 event_id uuid primary key, revision bigint not null default 1, dirty boolean not null default true,
 claim uuid, claimed_at timestamptz, next_at timestamptz not null default now(),
 status text not null default 'queued', last_error text, synced_at timestamptz
);
create table public.phorest_event_links (
 event_id uuid not null, employee_id uuid not null, branch_id text not null,
 phorest_branch_id text not null, staff_id text not null, break_id text,
 snapshot jsonb, updated_at timestamptz not null default now(),
 primary key(event_id, employee_id, branch_id)
);
alter table public.phorest_event_jobs enable row level security;
alter table public.phorest_event_links enable row level security;
revoke all on public.phorest_event_jobs, public.phorest_event_links from public, anon, authenticated;
grant all on public.phorest_event_jobs, public.phorest_event_links to service_role;
create or replace function public.queue_phorest_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare eid uuid; enabled boolean;
begin
 if tg_table_name = 'events' then
   eid := case when tg_op = 'DELETE' then old.id else new.id end;
   enabled := case when tg_op = 'DELETE' then old.phorest_sync else new.phorest_sync end;
 else
   eid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
   select phorest_sync into enabled from public.events where id=eid;
 end if;
 if coalesce(enabled,false) or exists(select 1 from public.phorest_event_jobs where event_id=eid) then
  insert into public.phorest_event_jobs(event_id) values(eid)
  on conflict(event_id) do update set revision=phorest_event_jobs.revision+1, dirty=true, next_at=now(), status='queued', last_error=null;
 end if;
 return null;
end $$;
create trigger phorest_event_queue after insert or delete or update of title,kind,starts_at,ends_at,phorest_sync,phorest_paid,is_sample on public.events
 for each row execute function public.queue_phorest_event();
create trigger phorest_registration_queue after insert or update or delete on public.event_registrations
 for each row execute function public.queue_phorest_event();
create function public.claim_phorest_events(p_event uuid default null)
returns setof public.phorest_event_jobs language sql security invoker set search_path = '' as $$
 update public.phorest_event_jobs j set claim=gen_random_uuid(), claimed_at=now(), status='running'
 where event_id in (select event_id from public.phorest_event_jobs where dirty and next_at<=now()
  and (claim is null or claimed_at<now()-interval '10 minutes') and (p_event is null or event_id=p_event)
  order by next_at for update skip locked limit 1) returning j.*
$$;
create function public.finish_phorest_event(p_event uuid,p_claim uuid,p_revision bigint,p_error text default null)
returns void language sql security invoker set search_path = '' as $$
 update public.phorest_event_jobs set
  dirty=(revision<>p_revision or p_error is not null), claim=null, claimed_at=null,
  status=case when revision<>p_revision then 'queued' when p_error is not null then 'error' else 'synced' end,
  next_at=case when p_error is null or revision<>p_revision then now() else now()+interval '5 minutes' end,
  last_error=p_error, synced_at=case when p_error is null then now() else synced_at end
 where event_id=p_event and claim=p_claim
$$;
revoke all on function public.queue_phorest_event(),public.claim_phorest_events(uuid),public.finish_phorest_event(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_phorest_events(uuid),public.finish_phorest_event(uuid,uuid,bigint,text) to service_role;
-- UI status excludes provider payloads and participant identifiers.
create function public.phorest_event_status(p_event uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.events e where e.id=p_event and
  (public.is_buero() or (public.my_role()='filialleitung' and e.created_by=public.my_employee_id())))
 then (select jsonb_build_object('status',status,'error',last_error,'syncedAt',synced_at) from public.phorest_event_jobs where event_id=p_event)
 else null end
$$;
revoke all on function public.phorest_event_status(uuid) from public,anon;
grant execute on function public.phorest_event_status(uuid) to authenticated;
-- Mapping changes are deliberately surfaced as conflicts rather than silently moving blocks.
create function public.phorest_mapping_requeue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.phorest_event_jobs(event_id)
 select distinct e.id from public.events e join public.event_registrations r on r.event_id=e.id
 where e.phorest_sync and e.starts_at>now() and
 (case when tg_table_name='employee_phorest' then r.employee_id in (case when tg_op<>'INSERT' then old.employee_id end,case when tg_op<>'DELETE' then new.employee_id end)
       else r.employee_id = new.id end)
 on conflict(event_id) do update set revision=phorest_event_jobs.revision+1,dirty=true,next_at=now(),status='queued',last_error=null;
 return null;
end $$;
create trigger phorest_mapping_requeue after insert or update or delete on public.employee_phorest
 for each row execute function public.phorest_mapping_requeue();
create trigger phorest_employee_requeue after update of active on public.employees
 for each row execute function public.phorest_mapping_requeue();
revoke all on function public.phorest_mapping_requeue() from public,anon,authenticated;
