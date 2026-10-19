-- Melden & Ideen (Feedback Aleksa 19.10.): Meldungen sieht das ganze Studio, damit niemand doppelt meldet
-- und alle mit „Upvote“ zeigen können, dass sie es auch bemerkt haben. Melden geht für jedes Studio
-- (wer woanders aushilft, meldet dort). Upvotes gibt es für Meldungen und Ideen.
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated
  using (created_by = public.my_employee_id() or public.leads_branch(branch_id)
         or (public.is_staff() and (kind = 'Idee' or branch_id = any(public.my_branches()))));
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (created_by = public.my_employee_id() and status = 'Neu' and assignee is null
              and (branch_id = any(public.my_branches()) or exists (select 1 from public.branches b where b.id = branch_id and not b.is_office)));
drop policy if exists tvote_insert on public.ticket_votes;
create policy tvote_insert on public.ticket_votes for insert to authenticated
  with check (employee_id = public.my_employee_id() and exists (select 1 from public.tickets t where t.id = ticket_id));
