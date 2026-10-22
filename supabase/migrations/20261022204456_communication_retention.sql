-- Communications only: never deletes wiki, learning evidence, HR or mailbox data.
create table public.privacy_retention_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  months integer not null default 12 check(months between 1 and 120)
);
insert into public.privacy_retention_settings(singleton) values(true);
create table public.privacy_chat_holds (
  kind text not null check(kind in ('assistant','team')),
  chat_id uuid not null,
  reason text not null check(length(reason) between 1 and 300),
  primary key(kind,chat_id)
);
create table public.privacy_storage_deletions (
  id bigint generated always as identity primary key,
  path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.privacy_retention_settings enable row level security;
alter table public.privacy_chat_holds enable row level security;
alter table public.privacy_storage_deletions enable row level security;
revoke all on public.privacy_retention_settings,public.privacy_chat_holds,public.privacy_storage_deletions from public,anon,authenticated;
grant all on public.privacy_retention_settings,public.privacy_chat_holds,public.privacy_storage_deletions to service_role;
grant usage,select on sequence public.privacy_storage_deletions_id_seq to service_role;

create function public.privacy_retention_preview()
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('enabled',s.enabled,'months',s.months,
   'assistant_chats',(select count(*) from public.benni_chats c
      where greatest(c.created_at,c.updated_at,(select max(m.created_at) from public.benni_messages m where m.chat_id=c.id))<now()-make_interval(months=>s.months)
      and not exists(select 1 from public.privacy_chat_holds h where h.kind='assistant' and h.chat_id=c.id)),
   'team_messages',(select count(*) from public.chat_messages m where m.created_at<now()-make_interval(months=>s.months)
      and not exists(select 1 from public.privacy_chat_holds h where h.kind='team' and h.chat_id=m.room_id)))
 from public.privacy_retention_settings s where singleton
$$;

create function public.privacy_retention_batch()
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s record; c record; n integer:=0; m integer:=0;
begin
 select * into s from public.privacy_retention_settings where singleton for update skip locked;
 if not found or not s.enabled then return jsonb_build_object('enabled',false,'assistant_chats_deleted',0,'team_messages_deleted',0); end if;
 for c in select b.id,b.employee_id from public.benni_chats b
   where greatest(b.created_at,b.updated_at,(select max(x.created_at) from public.benni_messages x where x.chat_id=b.id))<now()-make_interval(months=>s.months)
   and not exists(select 1 from public.privacy_chat_holds h where h.kind='assistant' and h.chat_id=b.id)
   order by b.updated_at limit 25 for update of b skip locked loop
   insert into public.privacy_storage_deletions(path)
      select name from storage.objects where bucket_id='assistant-context'
      and starts_with(name,c.employee_id::text||'/'||c.id::text||'/') on conflict(path) do nothing;
   delete from public.benni_chats where id=c.id;
   n:=n+1;
 end loop;
 -- Team rooms persist, their individual old messages expire. A hold covers a room.
 with expired as (select cm.id from public.chat_messages cm
   where cm.created_at<now()-make_interval(months=>s.months)
   and not exists(select 1 from public.privacy_chat_holds h where h.kind='team' and h.chat_id=cm.room_id)
   order by cm.created_at limit 1000 for update of cm skip locked)
 delete from public.chat_messages where id in (select id from expired);
 get diagnostics m=row_count;
 -- Context is a bounded cache: 30 days, or removed when its chat is deleted.
 -- A hold also protects this copy. Supabase Storage API removes the actual bytes.
 insert into public.privacy_storage_deletions(path)
   select o.name from storage.objects o where o.bucket_id='assistant-context'
   and (o.created_at<now()-interval '30 days' or not exists(select 1 from public.benni_chats b where b.id::text=split_part(o.name,'/',2)))
   and not exists(select 1 from public.privacy_chat_holds h where h.kind='assistant' and h.chat_id::text=split_part(o.name,'/',2))
   on conflict(path) do nothing;
 return jsonb_build_object('enabled',true,'assistant_chats_deleted',n,'team_messages_deleted',m);
end $$;
revoke all on function public.privacy_retention_preview(),public.privacy_retention_batch() from public,anon,authenticated;
grant execute on function public.privacy_retention_preview(),public.privacy_retention_batch() to service_role;
