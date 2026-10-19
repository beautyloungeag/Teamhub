-- Audit 19.10.2026: Rechte und Datenpflege, die im Test aufgefallen sind.

-- 1) Filialleitung verwaltet nie das Büro, auch wenn „Büro“ als Zusatzstudio eingetragen ist
--    (sonst konnte sie per REST Büro-Konten ändern und deren Lesebestätigungen lesen).
create or replace function public.leads_branch(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'buero' or (public.my_role() = 'filialleitung' and b <> 'buero' and b = any(public.my_branches()))
$$;
drop policy if exists employees_write_filiale on public.employees;
create policy employees_write_filiale on public.employees for update to authenticated
  using (public.my_role() = 'filialleitung' and branch_id <> 'buero' and branch_id = any(public.my_branches()))
  with check (public.my_role() = 'filialleitung' and branch_id <> 'buero' and branch_id = any(public.my_branches()) and app_role <> 'buero');

-- 2) Skill löschen: aus dem Katalog und überall, wo der Name steht. Vorher blieb er in
--    employees.skills stehen, und update_my_profile lehnte jede Änderung mit unknown_skill ab.
create or replace function public.delete_skill(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'buero' then raise exception 'forbidden'; end if;
  delete from public.skills where name = p_name;
  update public.employees set skills = array_remove(skills, p_name) where p_name = any(skills);
  update public.news set audience_skills = array_remove(audience_skills, p_name) where p_name = any(audience_skills);
  update public.events set audience_skills = array_remove(audience_skills, p_name) where p_name = any(audience_skills);
end $$;
grant execute on function public.delete_skill(text) to authenticated;

-- 3) Anmeldung zu Events: Skill-Zielgruppe gilt auch hier, und vergangene Events nehmen keine Anmeldung mehr
create or replace function public.register_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events; n int;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not public.in_audience(e.audience_branches) then raise exception 'not_visible'; end if;
  if coalesce(cardinality(e.audience_skills), 0) > 0 and public.my_role() <> 'buero'
     and not exists (select 1 from public.employees x where x.id = public.my_employee_id() and x.skills && e.audience_skills) then raise exception 'not_visible'; end if;
  if e.starts_at < now() or (e.register_until is not null and now() > e.register_until) then raise exception 'deadline_passed'; end if;
  select count(*) into n from public.event_registrations where event_id = p_event and coming and employee_id <> public.my_employee_id();
  if e.capacity is not null and n >= e.capacity then raise exception 'full'; end if;
  insert into public.event_registrations (event_id, employee_id, coming) values (p_event, public.my_employee_id(), true)
    on conflict (event_id, employee_id) do update set coming = true, created_at = now();
end $$;

-- 4) „Mitteilungen an“ hängt nicht am zuletzt geöffneten Gerät, sondern daran, ob es irgendein Gerät mit Push gibt
create or replace function public.report_device(p_standalone boolean, p_push boolean) returns void
language sql security definer set search_path = public as $$
  update public.employees e set last_seen_at = now(),
    push_enabled = exists (select 1 from public.push_subscriptions s where s.employee_id = e.id),
    app_installed_at = case when p_standalone then coalesce(app_installed_at, now()) else app_installed_at end
  where e.auth_user_id = auth.uid() and e.active
$$;
