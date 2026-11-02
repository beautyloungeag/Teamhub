-- Stundensaldo aus Timebutler (Matteo 29.10.). Die Function `timebutler` holt ihn dreimal am Tag über die API v1
-- (Firmen-Token, Secret TIMEBUTLER_V1_TOKEN) für alle Mitarbeiterinnen und legt ihn hier ab; die App liest nur den eigenen
-- Saldo über die Function. Ohne Token passiert nichts.
create table if not exists public.timebutler_balances (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  tb_userid text not null,
  balance_minutes integer,
  as_of date not null,
  row jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.timebutler_balances enable row level security;
revoke all on public.timebutler_balances from anon, authenticated;
grant all on public.timebutler_balances to service_role;

-- 06, 12 und 18 Uhr Schweizer Winterzeit (Sommer eine Stunde später); Timebutler erlaubt 12 Abrufe je Tag
select cron.unschedule('teamhub-timebutler-saldo') where exists (select 1 from cron.job where jobname = 'teamhub-timebutler-saldo');
select cron.schedule('teamhub-timebutler-saldo', '0 5,11,17 * * *', $cron$
select net.http_post(
  url := 'https://vdekbelklbctqwucibzn.supabase.co/functions/v1/timebutler',
  headers := jsonb_build_object('Content-Type','application/json','x-notify-secret',(select regexp_replace(command, '.*x-notify-secret'',''([0-9a-f]+)''.*', '\1') from cron.job where jobname = 'teamhub-notify')),
  body := '{"action":"balance_sync"}'::jsonb, timeout_milliseconds := 120000)
$cron$);
