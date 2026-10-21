-- 0030: Persönlicher Posteingang (Vertrag § 1.3, Wunsch der Inhaberin 21.10.). Je Person das eigene Postfach-Passwort,
-- verschlüsselt durch die Function `mailbox` (AES-GCM, Schlüssel nur als Secret MAILBOX_KEY). Keine Policies: nur die
-- Function mit Dienstrechten liest und schreibt, nicht einmal die Person selbst sieht den verschlüsselten Wert.
create table if not exists public.mail_accounts (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  address text not null,
  secret text not null,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.mail_accounts enable row level security;
