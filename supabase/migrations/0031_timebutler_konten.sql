-- 0031: Timebutler je Person (API v2 arbeitet nur für die angemeldete Person). Gespeichert wird der rotierende
-- Refresh-Token und das kurzlebige Zugriffstoken, beide verschlüsselt durch die Function `timebutler` (MAILBOX_KEY),
-- nie das Passwort. Keine Policies: nur die Function mit Dienstrechten liest und schreibt.
create table if not exists public.timebutler_accounts (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  tb_email text not null,
  refresh text not null,
  access text,
  access_exp timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.timebutler_accounts enable row level security;
