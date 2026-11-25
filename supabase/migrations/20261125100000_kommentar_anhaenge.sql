-- Kommentare zu Meldungen und Ideen (Wunsch Büro 19./24.11.):
--   1) Anhänge am Kommentar (Fotos, Videos, PDF und andere Dateien), bis sechs je Kommentar
--   2) Mitteilung an die Beteiligten, sobald jemand kommentiert (notified_at, verarbeitet die Function notify)

alter table public.ticket_comments add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.ticket_comments add column if not exists notified_at timestamptz;
-- Bestehende Kommentare nicht nachträglich melden
update public.ticket_comments set notified_at = now() where notified_at is null;

alter table public.ticket_comments drop constraint if exists ticket_comments_body_check;
alter table public.ticket_comments add constraint ticket_comments_body_check
  check (length(trim(body)) > 0 or jsonb_array_length(attachments) > 0);
alter table public.ticket_comments drop constraint if exists ticket_comments_attachments_check;
alter table public.ticket_comments add constraint ticket_comments_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 6);

-- Ein Kommentar darf nur Dateien aus dem eigenen Ordner der Schreiberin nennen (sonst liesse sich über einen
-- Kommentar das Leserecht auf fremde Dateien erschleichen). Anhänge und Meldestand sind danach unveränderlich.
create or replace function teamhub_private.guard_comment_attachments()
returns trigger language plpgsql set search_path = '' as $$
declare a jsonb;
begin
  if auth.role() = 'service_role' or (auth.uid() is null and current_user in ('postgres','supabase_admin','service_role')) then return new; end if;
  if tg_op = 'UPDATE' then
    if new.attachments is distinct from old.attachments or new.notified_at is distinct from old.notified_at then
      raise exception 'comment_attachments_immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  new.notified_at := null;
  for a in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(a) <> 'object'
      or coalesce(a->>'path', '') !~ ('^' || new.author_id::text || '/c-' || new.id::text || '-[0-9]\.[a-z0-9]{1,8}$')
      or length(coalesce(a->>'name', '')) > 200 then
      raise exception 'comment_attachment_path' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function teamhub_private.guard_comment_attachments() from public, anon, authenticated;
drop trigger if exists comment_attachments_guard on public.ticket_comments;
create trigger comment_attachments_guard before insert or update on public.ticket_comments
for each row execute function teamhub_private.guard_comment_attachments();

-- Lesen: wer den Kommentar lesen darf (Regel tcom_read über die Meldung), darf auch seine Anhänge lesen
alter policy files_read on storage.objects using (
  (bucket_id = 'profile-photos' and public.is_staff())
  or (bucket_id = 'media' and (
    ((storage.foldername(name))[1] <> 'wiki' and public.is_staff())
    or ((storage.foldername(name))[1] = 'wiki' and public.can_read_level((storage.foldername(name))[2]))))
  or (bucket_id = 'task-proofs' and public.is_staff() and (
    (storage.foldername(name))[1] = public.my_employee_id()::text
    or public.is_buero()
    or exists (select 1 from public.task_completions c where c.photo_path = objects.name and public.leads_branch(c.branch_id))))
  or (bucket_id = 'ticket-photos' and (
    (storage.foldername(name))[1] = public.my_employee_id()::text
    or exists (select 1 from public.tickets t where t.photo_path = objects.name)
    or exists (select 1 from public.ticket_comments c where c.attachments @> jsonb_build_array(jsonb_build_object('path', objects.name)))))
);

-- Löschen: Büro alles; Filialleitung auch die Kommentar-Anhänge der Meldungen ihres Studios
alter policy files_delete_ticket on storage.objects using (
  bucket_id = 'ticket-photos' and (public.is_buero()
    or exists (select 1 from public.tickets t where t.photo_path = objects.name and public.leads_branch(t.branch_id))
    or exists (select 1 from public.ticket_comments c join public.tickets t on t.id = c.ticket_id
               where c.attachments @> jsonb_build_array(jsonb_build_object('path', objects.name)) and public.leads_branch(t.branch_id)))
);
