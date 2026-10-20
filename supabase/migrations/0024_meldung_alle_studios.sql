-- Meldung oder Idee für alle Studios: branch_id bleibt das Studio der meldenden Person (Rechte, Zuständigkeit),
-- all_studios macht sie für alle sichtbar.
alter table public.tickets add column if not exists all_studios boolean not null default false;
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated using (
  created_by = my_employee_id() or leads_branch(branch_id)
  or (is_staff() and (kind = 'Idee' or branch_id = any(my_branches()) or all_studios))
);
