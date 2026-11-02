-- Firmen-Schlüssel für Timebutler API v1 (Stundensaldo). Das Büro trägt ihn unter Einstellungen → Allgemein ein,
-- die Function `timebutler` prüft ihn sofort und legt ihn verschlüsselt (MAILBOX_KEY) ab. Eine Zeile, nur service_role.
create table if not exists public.timebutler_company (
  id integer primary key default 1 check (id = 1),
  token_sealed text not null,
  set_by uuid references public.employees(id) on delete set null,
  set_at timestamptz not null default now()
);
alter table public.timebutler_company enable row level security;
revoke all on public.timebutler_company from anon, authenticated;
grant all on public.timebutler_company to service_role;
