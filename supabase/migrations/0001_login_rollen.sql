-- BLTH-14: Login, Rollen, Filial- und Gesamtsicht.
-- Anmelden kann nur, wer in employees steht (Selbstregistrierung ist abgeschaltet,
-- Auth-Konten legt das Büro bzw. der Import an). Rollen:
--   mitarbeiterin  sieht Team und eigene Filiale
--   filialleitung  zusätzlich Verwaltung der eigenen Filiale(n)
--   buero          Gesamtsicht und Verwaltung aller Filialen (Backoffice)

create type public.app_role as enum ('mitarbeiterin', 'filialleitung', 'buero');

create table public.branches (
  id text primary key,                 -- z.B. 'basel-1'
  name text not null unique,           -- Anzeige, z.B. 'Basel 1'
  is_office boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique check (email = lower(email)),
  first_name text not null,
  last_name text not null,
  phone text,
  job_title text not null default '',          -- Rolle laut MA-Liste, z.B. 'Respo'
  app_role public.app_role not null default 'mitarbeiterin',
  branch_id text not null references public.branches(id),
  extra_branch_ids text[] not null default '{}', -- z.B. Riehen/Basel 2
  skills text[] not null default '{}',
  lang text not null default 'DE' check (lang in ('DE','EN','FR')),
  photo_path text,
  phorest_staff_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_branch_idx on public.employees(branch_id);

-- Wer bin ich? (security definer, damit RLS-Policies sich nicht selbst abfragen)
create or replace function public.current_employee() returns public.employees
language sql stable security definer set search_path = public as $$
  select * from public.employees where auth_user_id = auth.uid() and active limit 1
$$;
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select app_role from public.employees where auth_user_id = auth.uid() and active limit 1
$$;
create or replace function public.my_branches() returns text[]
language sql stable security definer set search_path = public as $$
  select array_prepend(branch_id, extra_branch_ids) from public.employees where auth_user_id = auth.uid() and active limit 1
$$;

-- Auth-Konto mit Mitarbeiterin verknüpfen, sobald es angelegt wird (Abgleich per E-Mail).
create or replace function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.employees set auth_user_id = new.id, updated_at = now()
   where email = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_auth_user();

-- Eigene Einstellungen ändern, ohne Rolle/Filiale anfassen zu können.
create or replace function public.update_my_profile(p_lang text default null, p_skills text[] default null, p_photo_path text default null)
returns public.employees language plpgsql security definer set search_path = public as $$
declare r public.employees;
begin
  update public.employees set
    lang = coalesce(p_lang, lang),
    skills = coalesce(p_skills, skills),
    photo_path = coalesce(p_photo_path, photo_path),
    updated_at = now()
  where auth_user_id = auth.uid() and active
  returning * into r;
  if r.id is null then raise exception 'not_an_employee'; end if;
  return r;
end $$;

alter table public.branches enable row level security;
alter table public.employees enable row level security;

create policy branches_read on public.branches for select to authenticated
  using (public.my_role() is not null);
create policy branches_write on public.branches for all to authenticated
  using (public.my_role() = 'buero') with check (public.my_role() = 'buero');

-- Team-Verzeichnis: alle aktiven Kolleginnen sind für Angemeldete sichtbar.
create policy employees_read on public.employees for select to authenticated
  using (public.my_role() is not null and (active or public.my_role() = 'buero'));
-- Büro verwaltet alle, Filialleitung nur die eigene(n) Filiale(n), aber niemanden zum Büro befördern.
create policy employees_write_buero on public.employees for all to authenticated
  using (public.my_role() = 'buero') with check (public.my_role() = 'buero');
create policy employees_write_filiale on public.employees for update to authenticated
  using (public.my_role() = 'filialleitung' and branch_id = any(public.my_branches()))
  with check (public.my_role() = 'filialleitung' and branch_id = any(public.my_branches()) and app_role <> 'buero');

grant execute on function public.update_my_profile(text, text[], text) to authenticated;
revoke execute on function public.update_my_profile(text, text[], text) from anon;

insert into public.branches (id, name, is_office, sort) values
  ('basel-1', 'Basel 1', false, 1), ('basel-2', 'Basel 2', false, 2), ('oberwil', 'Oberwil', false, 3),
  ('pratteln', 'Pratteln', false, 4), ('reinach', 'Reinach', false, 5), ('riehen', 'Riehen', false, 6),
  ('buero', 'Büro', true, 7);
