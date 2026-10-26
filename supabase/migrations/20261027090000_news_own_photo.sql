-- Eigenes Foto zu einer News hochladen (27.10.): bisher ging nur „Bild erzeugen“ über Marc.
-- Filialleitung schreibt News fürs eigene Studio und darf dafür Fotos unter media/news/ ablegen; das Büro durfte schon alles in media.
create policy files_write_news_photo on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'news' and (public.is_buero() or public.is_lead()));
