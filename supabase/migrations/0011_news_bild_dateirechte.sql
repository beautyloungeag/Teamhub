-- News mit Bild (Benni erzeugt es auf Wunsch) und Leserechte für Nachweis- und Meldungsfotos.
alter table public.news add column if not exists image_path text;   -- Bucket media, Pfad news/...

-- 0005 hat files_read neu gesetzt und dabei task-proofs und ticket-photos vergessen:
-- seitdem konnte nur die Absenderin ihr Foto sehen. Wiederhergestellt und an die Ticket-Rechte gekoppelt.
drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select to authenticated using (
  (bucket_id = 'profile-photos' and public.is_staff())
  or (bucket_id = 'media' and (((storage.foldername(name))[1] <> 'wiki' and public.is_staff())
                               or ((storage.foldername(name))[1] = 'wiki' and public.can_read_level((storage.foldername(name))[2]))))
  or (bucket_id = 'task-proofs' and ((storage.foldername(name))[1] = public.my_employee_id()::text or public.my_role() in ('buero', 'filialleitung')))
  or (bucket_id = 'ticket-photos' and ((storage.foldername(name))[1] = public.my_employee_id()::text
                                       or exists (select 1 from public.tickets t where t.photo_path = name)))
);
