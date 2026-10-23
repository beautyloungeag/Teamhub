-- Use the existing Vault-authenticated transport. Never embed credentials in cron text.
alter function public.register_event(uuid) set search_path = '';
revoke all on function public.register_event(uuid), public.decline_event(uuid) from public,anon;
grant execute on function public.register_event(uuid), public.decline_event(uuid) to authenticated;
create or replace function public.finish_phorest_event(p_event uuid,p_claim uuid,p_revision bigint,p_error text default null)
returns void language sql security invoker set search_path = '' as $$
 update public.phorest_event_jobs set
  dirty=(revision<>p_revision or p_error is not null),claim=null,claimed_at=null,
  status=case when revision<>p_revision or p_error='continue' then 'queued' when p_error is not null then 'error' else 'synced' end,
  next_at=case when p_error is null or revision<>p_revision then now() when p_error='continue' then now()+interval '1 minute' else now()+interval '5 minutes' end,
  last_error=case when p_error='continue' then null else p_error end,
  synced_at=case when p_error is null then now() else synced_at end
 where event_id=p_event and claim=p_claim
$$;
select cron.schedule('teamhub-phorest-events','* * * * *',$cron$
 select net.http_post(
  url:='https://vdekbelklbctqwucibzn.supabase.co/functions/v1/phorest-events',
  headers:=(select decrypted_secret::jsonb from vault.decrypted_secrets where name='teamhub-communication-retention-hourly-headers'),
  body:='{}'::jsonb,timeout_milliseconds:=120000
 );
$cron$);
