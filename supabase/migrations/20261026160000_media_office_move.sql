-- Wissen: Dateien ziehen beim Wechsel der Sichtbarkeit in den passenden Ordner um (wiki/<alle|filialleitung|buero>/).
-- Bisher fehlte dafür eine Update-Regel, der Umzug scheiterte still und Bilder von „Nur Büro“-Artikeln blieben im Ordner „alle“.
-- Nur das Büro darf Dateien im Bucket media verschieben und löschen (wie hochladen).
create policy files_update_media on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_buero())
  with check (bucket_id = 'media' and public.is_buero());
create policy files_delete_media on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_buero());
