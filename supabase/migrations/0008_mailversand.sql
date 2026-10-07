-- E-Mail-Versand (BLTH-20 Facility-Meldungen, BLTH-23 Einladungen/Erinnerungen, BLTH-34 Zustellfehler).
-- Doppelt gesperrt: ohne Resend-Schlüssel (Secret RESEND_API_KEY) UND ohne den Schalter
-- app_settings.mail_enabled = true geht keine einzige Mail raus. Der Schalter steht auf false,
-- bis das Büro ihn im Backoffice umlegt (frühestens zum Pilot).

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_buero on public.app_settings for all to authenticated
  using (public.is_buero()) with check (public.is_buero());
insert into public.app_settings (key, value) values
  ('mail_enabled', 'false'::jsonb),
  ('facility_email', '""'::jsonb),          -- zentrale Facility-Adresse, falls ein Studio keine eigene hat
  ('event_reminder_days', '2'::jsonb)       -- Erinnerung X Tage vor Beginn an Angemeldete
on conflict (key) do nothing;

-- Facility-Empfänger je Studio (leer = zentrale Adresse aus app_settings)
alter table public.branches add column if not exists facility_email text;

-- Versandstand je Meldung / Schulung / Anmeldung
alter table public.tickets add column if not exists mail_status text check (mail_status in ('gesendet','fehler','uebersprungen'));
alter table public.tickets add column if not exists mailed_at timestamptz;
alter table public.events add column if not exists invite_mailed_at timestamptz;
alter table public.event_registrations add column if not exists reminded_at timestamptz;

-- Alles, was vor dieser Migration existiert, gilt als erledigt: beim Einschalten geht nichts Altes raus.
update public.tickets set mail_status = 'uebersprungen', mailed_at = now() where mail_status is null;
update public.events set invite_mailed_at = now() where invite_mailed_at is null;
update public.event_registrations set reminded_at = now() where reminded_at is null;

-- Protokoll jeder Zustellung (auch Fehler) für das Büro
create table if not exists public.mail_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,                      -- facility | einladung | erinnerung | test
  ref text,                                -- ticket-/event-id
  recipient text not null,
  subject text not null,
  status text not null check (status in ('gesendet','fehler')),
  error text,
  provider_id text
);
alter table public.mail_log enable row level security;
create policy mail_log_read on public.mail_log for select to authenticated using (public.is_buero());
create index if not exists mail_log_at_idx on public.mail_log (at desc);
