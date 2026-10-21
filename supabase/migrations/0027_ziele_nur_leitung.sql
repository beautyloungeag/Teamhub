-- Ziele legt nur die Leitung an (Renée 20.10.): Mitarbeiterinnen sehen ihre eigenen und die Teamziele, ändern nichts.
drop policy if exists goals_write on public.goals;
create policy goals_write on public.goals for all to authenticated
  using ((scope = 'person' and public.leads_person(employee_id)) or (scope = 'team' and public.leads_branch(branch_id)))
  with check ((scope = 'person' and public.leads_person(employee_id)) or (scope = 'team' and public.leads_branch(branch_id)));
