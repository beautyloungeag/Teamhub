-- All trainings are visible; registration remains limited to the assigned audience.
alter table public.events add column if not exists audience_people uuid[] not null default '{}';
alter table public.events add column if not exists phorest_sync boolean not null default false;
alter table public.events add column if not exists phorest_paid boolean not null default true;
alter table public.events add constraint events_phorest_end check (not phorest_sync or (ends_at is not null and ends_at > starts_at));
drop policy events_read on public.events;
create policy events_read on public.events for select to authenticated using (
  public.is_staff() and (kind = 'Schulung' or public.in_audience(audience_branches)));
create or replace function public.event_is_assigned(p_event uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select public.is_staff() and exists (
    select 1 from public.events e where e.id = p_event and (
      public.is_buero() or (
        public.in_audience(e.audience_branches)
        and (cardinality(e.audience_people) = 0 or public.my_employee_id() = any(e.audience_people))
        and (cardinality(e.audience_skills) = 0 or exists (
          select 1 from public.employees x where x.id = public.my_employee_id() and x.skills && e.audience_skills)))))
$$;
revoke all on function public.event_is_assigned(uuid) from public, anon;
grant execute on function public.event_is_assigned(uuid) to authenticated;
create or replace function public.register_event(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e public.events; n int; me uuid := public.my_employee_id(); is_full boolean;
begin
  select * into e from public.events where id = p_event for update;
  if me is null or not public.event_is_assigned(p_event) then raise exception 'not_assigned'; end if;
  if e.starts_at < now() or (e.register_until is not null and now() > e.register_until) then raise exception 'deadline_passed'; end if;
  if exists (select 1 from public.event_registrations where event_id = p_event and employee_id = me and coming) then
    return case when (select waitlist from public.event_registrations where event_id = p_event and employee_id = me) then 'waitlist' else 'ok' end;
  end if;
  select count(*) into n from public.event_registrations where event_id = p_event and coming and not waitlist;
  is_full := e.capacity is not null and n >= e.capacity;
  insert into public.event_registrations (event_id, employee_id, coming, waitlist, promoted_at) values (p_event, me, true, is_full, null)
    on conflict (event_id, employee_id) do update set coming = true, waitlist = is_full, promoted_at = null, created_at = now();
  return case when is_full then 'waitlist' else 'ok' end;
end $$;
create or replace function public.decline_event(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.event_is_assigned(p_event) then raise exception 'not_assigned'; end if;
  insert into public.event_registrations (event_id, employee_id, coming, waitlist)
  values (p_event, public.my_employee_id(), false, false)
  on conflict (event_id, employee_id) do update set coming = false, waitlist = false, created_at = now();
end $$;

-- Personal concerns: author + office only, including inherited comments/history/storage policies.
alter table public.tickets drop constraint tickets_kind_check;
alter table public.tickets add constraint tickets_kind_check check (kind in ('Meldung','Idee','Learning','Anliegen'));
alter table public.tickets add constraint personal_concern_not_public check (kind <> 'Anliegen' or not all_studios);
drop policy tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated using (
  public.is_staff() and (created_by = public.my_employee_id() or public.is_buero()
    or (kind <> 'Anliegen' and (public.leads_branch(branch_id) or kind in ('Idee','Learning') or branch_id = any(public.my_branches()) or all_studios))));
drop policy tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_buero() or (kind <> 'Anliegen' and public.leads_branch(branch_id)))
  with check (public.is_buero() or (kind <> 'Anliegen' and public.leads_branch(branch_id)));
drop policy tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.is_buero() or (kind <> 'Anliegen' and public.leads_branch(branch_id)));
drop policy tvote_insert on public.ticket_votes;
create policy tvote_insert on public.ticket_votes for insert to authenticated with check (
  employee_id = public.my_employee_id() and exists (select 1 from public.tickets t where t.id = ticket_id and t.kind <> 'Anliegen'));
create or replace function public.personal_concern_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.kind = 'Anliegen' or old.kind = 'Anliegen')
    and (new.kind is distinct from old.kind or new.created_by is distinct from old.created_by or new.branch_id is distinct from old.branch_id) then
    raise exception 'personal_concern_identity_immutable';
  end if;
  if new.kind = 'Anliegen' then
    new.all_studios := false;
    new.mail_status := 'uebersprungen';
    -- No title/body on external notifications or the Facility channel.
    new.lead_notified_at := coalesce(new.lead_notified_at, now());
  end if;
  return new;
end $$;
create trigger personal_concern_guard before insert or update on public.tickets
  for each row execute function public.personal_concern_guard();
-- The general protocol must not reveal confidential titles/contents to studio leadership,
-- including after the concern itself is deleted.
alter table public.audit_log add column if not exists confidential boolean not null default false;
create or replace function public.personal_concern_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.entity = 'tickets' and (
    exists (select 1 from public.tickets t where t.id::text = new.entity_id and t.kind = 'Anliegen')
    or new.changes ->> 'kind' = 'Anliegen') then
    new.confidential := true;
    new.title := 'Persönliches Anliegen'; new.changes := '{}'::jsonb; new.branch_ids := '{}';
  end if;
  return new;
end $$;
create trigger personal_concern_audit before insert on public.audit_log
  for each row execute function public.personal_concern_audit();
create policy audit_confidential on public.audit_log as restrictive for select to authenticated
  using (not confidential or public.is_buero());
revoke all on function public.personal_concern_guard(), public.personal_concern_audit() from public, anon, authenticated;
-- Personal concern updates stay inside the app, with no external title previews.
create or replace function public.personal_concern_history_quiet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tickets t where t.id = new.ticket_id and t.kind = 'Anliegen') then new.notified_at := now(); end if;
  return new;
end $$;
create trigger personal_concern_history_quiet before insert on public.ticket_events
  for each row execute function public.personal_concern_history_quiet();
revoke all on function public.personal_concern_history_quiet() from public, anon, authenticated;
