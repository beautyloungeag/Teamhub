-- A visible report must not be usable as a forged pointer to somebody else's private file.
-- Existing UI uploads use <author employee UUID>/<unique filename>; attachments are not edited.
create function public.ticket_attachment_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null then
  if tg_op='INSERT' and new.photo_path is not null and split_part(new.photo_path,'/',1) is distinct from new.created_by::text then
   raise exception 'attachment_owner_mismatch';
  end if;
  if tg_op='UPDATE' and new.photo_path is distinct from old.photo_path then
   raise exception 'attachment_immutable';
  end if;
 end if;
 return new;
end $$;
create trigger ticket_attachment_guard before insert or update on public.tickets
 for each row execute function public.ticket_attachment_guard();
revoke all on function public.ticket_attachment_guard() from public,anon,authenticated;
