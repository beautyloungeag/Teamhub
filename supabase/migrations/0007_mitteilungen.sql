-- BLTH-27: Push-Mitteilungen und Startbereitschaft.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.push_subscriptions (
  endpoint text primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  p256dh text not null, auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_error text
);
alter table public.push_subscriptions enable row level security;
create policy ps_own on public.push_subscriptions for all to authenticated
  using (employee_id = public.my_employee_id()) with check (employee_id = public.my_employee_id());

-- Startbereitschaft je Person: App vom Homescreen geöffnet, Mitteilungen erlaubt
alter table public.employees add column if not exists app_installed_at timestamptz,
  add column if not exists push_enabled boolean not null default false,
  add column if not exists last_seen_at timestamptz;
create or replace function public.report_device(p_standalone boolean, p_push boolean) returns void
language sql security definer set search_path = public as $$
  update public.employees set last_seen_at = now(), push_enabled = p_push,
    app_installed_at = case when p_standalone then coalesce(app_installed_at, now()) else app_installed_at end
  where auth_user_id = auth.uid() and active
$$;
grant execute on function public.report_device(boolean, boolean) to authenticated;
revoke execute on function public.report_device(boolean, boolean) from anon;

-- Was schon gemeldet wurde (die Function `notify` setzt das)
alter table public.news add column if not exists notified_at timestamptz;
alter table public.events add column if not exists notified_at timestamptz;
alter table public.ticket_events add column if not exists notified_at timestamptz;
-- Bestehende Inhalte nicht nachträglich melden
update public.news set notified_at = now() where notified_at is null and publish_at <= now();
update public.events set notified_at = now() where notified_at is null;
update public.ticket_events set notified_at = now() where notified_at is null;
