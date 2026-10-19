-- Benni: mehrere Gespräche je Person (wie in ChatGPT), parallel nutzbar, löschbar.
-- Die Function `assistant` schreibt Frage und Antwort selbst, damit eine Antwort auch ankommt,
-- wenn man währenddessen in einen anderen Chat wechselt oder die App schliesst.
create table if not exists public.benni_chats (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists benni_chats_owner on public.benni_chats (employee_id, updated_at desc);
create table if not exists public.benni_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.benni_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null default '',
  data jsonb not null default '{}'::jsonb,   -- Quellen, Meldungsvorschlag, Kundenkarte, Lernkarte, Auswahl, Kontrollfrage, Dateinamen
  created_at timestamptz not null default now()
);
create index if not exists benni_messages_chat on public.benni_messages (chat_id, created_at);
alter table public.benni_chats enable row level security;
alter table public.benni_messages enable row level security;
create policy benni_chats_own on public.benni_chats for all to authenticated
  using (employee_id = public.my_employee_id()) with check (employee_id = public.my_employee_id());
create policy benni_messages_own on public.benni_messages for all to authenticated
  using (exists (select 1 from public.benni_chats c where c.id = chat_id and c.employee_id = public.my_employee_id()))
  with check (exists (select 1 from public.benni_chats c where c.id = chat_id and c.employee_id = public.my_employee_id()));
