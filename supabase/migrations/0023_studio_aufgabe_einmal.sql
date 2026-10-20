-- Aufgabe fürs ganze Studio: eine Person reicht. Wer zuerst abhakt, gilt; ein zweites Abhaken überschreibt nicht.
create or replace function public.todo_done(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.todos; me public.employees;
begin
  select * into me from employees where auth_user_id = auth.uid() and active limit 1;
  if me.id is null then raise exception 'not_signed_in'; end if;
  select * into t from todos where id = p_id for update;
  if t.id is null then raise exception 'not_found'; end if;
  if not (t.assignee_id = me.id or t.created_by = me.id
          or (t.assignee_id is null and t.branch_id = any(my_branches()))
          or leads_todo(t.assignee_id, t.branch_id)) then
    raise exception 'forbidden';
  end if;
  if p_done and t.done_at is not null then raise exception 'already_done'; end if;
  update todos set
    done_at = case when p_done then now() end,
    done_by = case when p_done then me.id end,
    done_by_name = case when p_done then trim(me.first_name || ' ' || left(coalesce(me.last_name, ''), 1) || '.') end
  where id = p_id;
end $$;
