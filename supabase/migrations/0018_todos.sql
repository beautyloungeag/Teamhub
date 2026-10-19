-- Einzelne Aufgaben mit Frist (neben den täglichen Studio-Checklisten aus task_templates):
--   eigene To-dos (assignee = ich), von Filialleitung/Büro einer Person zugewiesen, oder einem ganzen Studio.
-- Abhaken über todo_done(): zuständige Person, bei Studio-Aufgaben jede aus dem Studio.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  note text not null default '',
  due_at timestamptz,
  assignee_id uuid references public.employees(id) on delete cascade,
  branch_id text references public.branches(id) on delete cascade,
  created_by uuid references public.employees(id) on delete set null,
  created_by_name text not null default '',
  done_at timestamptz,
  done_by uuid references public.employees(id) on delete set null,
  done_by_name text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (assignee_id is not null or branch_id is not null)
);
create index if not exists todos_assignee on public.todos (assignee_id);
create index if not exists todos_branch on public.todos (branch_id);
alter table public.todos enable row level security;

-- Filialleitung/Büro für die Person oder das Studio einer Aufgabe
create or replace function public.leads_todo(p_assignee uuid, p_branch text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_assignee is not null
    then exists (select 1 from employees e where e.id = p_assignee and leads_branch(e.branch_id))
    else leads_branch(p_branch) end
$$;

create policy todos_read on public.todos for select to authenticated using (
  assignee_id = public.my_employee_id() or created_by = public.my_employee_id()
  or (assignee_id is null and branch_id = any(public.my_branches()))
  or public.leads_todo(assignee_id, branch_id)
);
create policy todos_insert on public.todos for insert to authenticated with check (
  created_by = public.my_employee_id() and done_at is null and (
    (assignee_id = public.my_employee_id() and branch_id is null)
    or public.leads_todo(assignee_id, branch_id)
  )
);
create policy todos_update on public.todos for update to authenticated
  using (created_by = public.my_employee_id() or public.leads_todo(assignee_id, branch_id))
  with check ((assignee_id = public.my_employee_id() and branch_id is null) or public.leads_todo(assignee_id, branch_id));
create policy todos_delete on public.todos for delete to authenticated
  using (created_by = public.my_employee_id() or public.leads_todo(assignee_id, branch_id));

create or replace function public.todo_done(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.todos; me public.employees;
begin
  select * into me from employees where auth_user_id = auth.uid() and active limit 1;
  if me.id is null then raise exception 'not_signed_in'; end if;
  select * into t from todos where id = p_id;
  if t.id is null then raise exception 'not_found'; end if;
  if not (t.assignee_id = me.id or t.created_by = me.id
          or (t.assignee_id is null and t.branch_id = any(my_branches()))
          or leads_todo(t.assignee_id, t.branch_id)) then
    raise exception 'forbidden';
  end if;
  update todos set
    done_at = case when p_done then now() end,
    done_by = case when p_done then me.id end,
    done_by_name = case when p_done then trim(me.first_name || ' ' || left(coalesce(me.last_name, ''), 1) || '.') end
  where id = p_id;
end $$;
revoke all on function public.todo_done(uuid, boolean) from public;
grant execute on function public.todo_done(uuid, boolean) to authenticated;
grant execute on function public.leads_todo(uuid, text) to authenticated;
