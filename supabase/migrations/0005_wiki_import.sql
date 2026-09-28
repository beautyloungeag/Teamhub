-- Import des bestehenden Beautylounge-Wikis (Statamic, beautyloungeag/wiki.beautylounge.ch).
-- Zugriffsstufen aus dem alten Wiki: Level 1 → alle, Level 2 → Filialleitung + Büro,
-- Level 3 / Superuser / ohne Stufe → nur Büro.
alter table public.wiki_articles
  add column if not exists access_level text not null default 'alle' check (access_level in ('alle','filialleitung','buero')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists blocks jsonb,           -- strukturierter Inhalt (Überschrift, Absatz, Liste, Bild, Video, Datei)
  add column if not exists source_id text unique,  -- Statamic-Eintrag, damit ein erneuter Import aktualisiert statt verdoppelt
  add column if not exists intro text not null default '';

create or replace function public.can_read_level(l text) returns boolean
language sql stable security definer set search_path = public as $$
  select case l when 'alle' then public.is_staff()
                when 'filialleitung' then public.my_role() in ('filialleitung','buero')
                else public.my_role() = 'buero' end
$$;

drop policy if exists wiki_read on public.wiki_articles;
create policy wiki_read on public.wiki_articles for select to authenticated
  using (public.is_buero() or (published and public.can_read_level(access_level)));

-- Medien liegen nach Stufe getrennt: media/wiki/<stufe>/<datei>
drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select to authenticated
  using (
    (bucket_id = 'profile-photos' and public.is_staff())
    or (bucket_id = 'media' and (
         (storage.foldername(name))[1] <> 'wiki' and public.is_staff()
         or ((storage.foldername(name))[1] = 'wiki' and public.can_read_level((storage.foldername(name))[2]))))
    or (bucket_id in ('task-proofs','ticket-photos') and (public.my_role() in ('filialleitung','buero') or (storage.foldername(name))[1] = public.my_employee_id()::text))
  );
