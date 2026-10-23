-- Preserve create intent before calling Phorest, so a cancellation after a lost response
-- can find and remove the exact owned block without creating a duplicate.
alter table public.phorest_event_links add column intent jsonb;
create or replace function public.phorest_mapping_requeue() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if tg_table_name='employee_phorest' then
  if tg_op='DELETE' then ids:=array[old.employee_id];
  elsif tg_op='INSERT' then ids:=array[new.employee_id];
  else ids:=array[old.employee_id,new.employee_id]; end if;
 else ids:=array[new.id]; end if;
 insert into public.phorest_event_jobs(event_id)
 select distinct e.id from public.events e join public.event_registrations r on r.event_id=e.id
 where e.phorest_sync and e.starts_at>now() and r.employee_id=any(ids)
 on conflict(event_id) do update set revision=phorest_event_jobs.revision+1,dirty=true,next_at=now(),status='queued',last_error=null;
 return null;
end $$;
