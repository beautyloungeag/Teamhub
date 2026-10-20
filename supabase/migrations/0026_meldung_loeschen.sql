-- Meldungen und Ideen löschen: Büro alle, Filialleitung die ihres Studios. Das Protokoll hält es fest (audit_row).
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated using (public.is_buero() or public.leads_branch(branch_id));
-- Foto/Video dazu: vor dem Löschen der Meldung entfernen (solange sie noch da ist)
drop policy if exists files_delete_ticket on storage.objects;
create policy files_delete_ticket on storage.objects for delete to authenticated using (
  bucket_id = 'ticket-photos' and (public.is_buero() or exists (select 1 from public.tickets t where t.photo_path = objects.name and public.leads_branch(t.branch_id)))
);
