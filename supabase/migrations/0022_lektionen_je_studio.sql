-- Lektionen (Onboarding-Schritte) je Studio: Büro-Lektionen gelten für alle, die Filialleitung ergänzt eigene für ihr Studio.
alter table public.onboarding_steps add column if not exists branch_ids text[] not null default '{}';

drop policy if exists ob_read on public.onboarding_steps;
create policy ob_read on public.onboarding_steps for select to authenticated using (public.is_staff() and public.in_audience(branch_ids));
drop policy if exists ob_write on public.onboarding_steps;
create policy ob_write on public.onboarding_steps for all to authenticated
  using (public.is_buero() or (public.is_lead() and public.my_studios_cover(branch_ids)))
  with check (public.is_buero() or (public.is_lead() and public.my_studios_cover(branch_ids)));

-- Protokoll: Lektionen tragen ihre Studios
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  skip text[] := array['updated_at', 'created_at', 'i18n', 'notified_at', 'invite_mailed_at', 'filled_notified_at', 'last_seen_at', 'app_installed_at',
    'push_enabled', 'reminded_at', 'mail_status', 'mailed_at', 'sort', 'lead_notified_at', 'promoted_notified_at', 'summary_notified_at', 'blocks', 'tags',
    'auth_user_id', 'photo_path', 'lang', 'notify_prefs', 'version', 'source_id', 'id'];
  ch jsonb := '{}'; k text; actor uuid := public.my_employee_id(); aname text; br text[] := '{}'; ttl text;
  t text := tg_table_name;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k = any(skip) then continue; end if;
      if (o -> k) is distinct from (n -> k) then ch := ch || jsonb_build_object(k, jsonb_build_array(public.audit_short(o -> k), public.audit_short(n -> k))); end if;
    end loop;
    if ch = '{}' then return null; end if;
  else
    -- Neu oder gelöscht: kompakter Stand der Zeile (ohne leere Felder), damit man sieht, was es war
    for k in select jsonb_object_keys(r) loop
      if k = any(skip) or (r -> k) = 'null'::jsonb or (r -> k) = '[]'::jsonb or (r -> k) = '""'::jsonb then continue; end if;
      ch := ch || jsonb_build_object(k, public.audit_short(r -> k));
    end loop;
  end if;
  -- Personen ohne Konto (Dienste, Zeitpläne) erscheinen als „System“; Personen anlegen protokolliert admin-employee selbst
  if actor is null and t = 'employees' then return null; end if;
  select first_name || ' ' || last_name into aname from public.employees where id = actor;
  ttl := coalesce(r ->> 'title', r ->> 'name', nullif(trim(coalesce(r ->> 'first_name', '') || ' ' || coalesce(r ->> 'last_name', '')), ''), r ->> 'key', r ->> 'prompt');
  case t
    when 'news', 'events' then br := coalesce((select array_agg(x) from jsonb_array_elements_text(r -> 'audience_branches') x), '{}');
    when 'task_templates', 'onboarding_steps' then br := coalesce((select array_agg(x) from jsonb_array_elements_text(r -> 'branch_ids') x), '{}');
    when 'task_items' then select coalesce(branch_ids, '{}') into br from public.task_templates where id = (r ->> 'template_id')::uuid;
    when 'tickets', 'standby_requests', 'task_completions' then br := array[r ->> 'branch_id'];
    when 'todos' then br := coalesce(case when r ->> 'branch_id' is not null then array[r ->> 'branch_id'] end,
      (select array_prepend(branch_id, extra_branch_ids) from public.employees where id = (r ->> 'assignee_id')::uuid), '{}');
    when 'employees' then br := array_prepend(r ->> 'branch_id', coalesce((select array_agg(x) from jsonb_array_elements_text(r -> 'extra_branch_ids') x), '{}'));
    when 'branches' then br := array[r ->> 'id'];
    when 'event_registrations' then
      select array_prepend(e.branch_id, e.extra_branch_ids), ev.title || ' · ' || e.first_name || ' ' || e.last_name into br, ttl
        from public.employees e, public.events ev where e.id = (r ->> 'employee_id')::uuid and ev.id = (r ->> 'event_id')::uuid;
    when 'quizzes', 'polls' then select coalesce(audience_branches, '{}'), coalesce(ttl, title) into br, ttl from public.news where id = (r ->> 'news_id')::uuid;
    when 'goals' then br := coalesce(case when r ->> 'branch_id' is not null then array[r ->> 'branch_id'] end,
      (select array_prepend(branch_id, extra_branch_ids) from public.employees where id = (r ->> 'employee_id')::uuid), '{}');
    else br := '{}';
  end case;
  if t = 'task_completions' then select title into ttl from public.task_items where id = (r ->> 'item_id')::uuid; end if;
  if t = 'standby_requests' then ttl := 'Aushilfe ' || to_char((r ->> 'day')::date, 'DD.MM.') || coalesce(' ' || left(r ->> 'start_time', 5) || '–' || left(r ->> 'end_time', 5), ''); end if;
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, title, branch_ids, changes)
    values (actor, coalesce(aname, 'System'), lower(tg_op), t, coalesce(r ->> 'id', r ->> 'key', nullif(concat_ws(':', r ->> 'event_id', r ->> 'employee_id'), ''), r ->> 'name'), left(ttl, 200), coalesce(br, '{}'), ch);
  return null;
end $$;
