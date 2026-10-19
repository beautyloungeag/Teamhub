-- Protokoll: wer hat wann welche Kundin gesucht oder ihre Historie geöffnet (Kundendaten aus Phorest)
create table if not exists public.client_lookups (
  id bigint generated always as identity primary key,
  employee_id uuid references public.employees(id) on delete set null,
  action text not null check (action in ('search','history','summary')),
  query text, client_id text, result_count int,
  at timestamptz not null default now()
);
alter table public.client_lookups enable row level security;
create policy client_lookups_buero on public.client_lookups for select to authenticated using (public.is_buero());
