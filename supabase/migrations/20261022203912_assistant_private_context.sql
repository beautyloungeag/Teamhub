-- Private replay context, including attachments; no public/signed links.
-- Objects are immutable per reply. Cleanup uses the Storage API, never SQL DELETE.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('assistant-context','assistant-context',false,50331648,array['application/json'])
on conflict(id) do nothing;

create policy assistant_context_read on storage.objects for select to authenticated
using (bucket_id='assistant-context'
  and (storage.foldername(name))[1]=public.my_employee_id()::text
  and exists(select 1 from public.benni_chats c where c.id::text=(storage.foldername(name))[2]
    and c.employee_id=public.my_employee_id()));
create policy assistant_context_insert on storage.objects for insert to authenticated
with check (bucket_id='assistant-context'
  and (storage.foldername(name))[1]=public.my_employee_id()::text
  and exists(select 1 from public.benni_chats c where c.id::text=(storage.foldername(name))[2]
    and c.employee_id=public.my_employee_id()));
create policy assistant_context_delete on storage.objects for delete to authenticated
using (bucket_id='assistant-context'
  and (storage.foldername(name))[1]=public.my_employee_id()::text);
