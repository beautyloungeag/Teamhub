-- BLTH-21: Zuordnung Mitarbeiterin ↔ Phorest über die Firmen-Mail (eine Person kann
-- in mehreren Filialen eine Phorest-Spalte haben). Gepflegt von der Function `phorest`
-- (Aktion sync_staff), gelesen nur serverseitig.
alter table public.branches add column if not exists phorest_branch_id text;
update public.branches set phorest_branch_id = v.pid from (values
  ('basel-1','K4a2spoBS4nmyv5cA8cPCA'), ('basel-2','ArRRUg36h-9R2Fybu-moaQ'), ('oberwil','Cm4Hyfll-y7ELZaL3iY-5A'),
  ('pratteln','Xfm89oSWnSExS3cB3t7OOg'), ('reinach','hvMdQwFAy_VwRbmvDlrqpA'), ('riehen','8X_JozUyTptndA1SMxNm1g')) as v(id, pid)
where branches.id = v.id;

create table public.employee_phorest (
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id text not null references public.branches(id),
  staff_id text not null,
  display_name text not null default '',
  synced_at timestamptz not null default now(),
  primary key (employee_id, branch_id)
);
alter table public.employee_phorest enable row level security;
create policy ep_read on public.employee_phorest for select to authenticated
  using (employee_id = public.my_employee_id() or public.leads_branch(branch_id));
