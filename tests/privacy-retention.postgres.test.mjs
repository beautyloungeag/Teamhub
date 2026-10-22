import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const database='privacy_teamhub_qa'
const sql=(input,db=database)=>execFileSync('docker',['exec','-i','beautylounge-privacy-qa','psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-q'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']})
test('Postgres: private context RLS, retention holds, recent messages and file cleanup queue',()=>{
  sql(`drop database if exists ${database}; create database ${database};`,'postgres')
  sql(`
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,created_at timestamptz default now());
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create function my_employee_id() returns uuid language sql stable as $$ select nullif(current_setting('qa.employee',true),'')::uuid $$;
    create table benni_chats(id uuid primary key,employee_id uuid,created_at timestamptz,updated_at timestamptz);
    create table benni_messages(chat_id uuid references benni_chats on delete cascade,created_at timestamptz);
    create table chat_messages(id uuid primary key,room_id uuid,created_at timestamptz);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select,insert,delete on storage.objects to authenticated;
    grant select on benni_chats to authenticated;
    grant all on all tables in schema public,storage to service_role;
  `)
  for(const name of ['20261022203912_assistant_private_context.sql','20261022204456_communication_retention.sql']) sql(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
  sql(`begin;
    insert into benni_chats select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '14 months',now()-interval '13 months' from generate_series(1,3)i;
    insert into benni_messages values('00000000-0000-4000-8000-000000000003',now());
    insert into privacy_chat_holds values('assistant','00000000-0000-4000-8000-000000000002','QA'),('team','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','QA');
    insert into chat_messages values(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '13 months'),
      (gen_random_uuid(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()-interval '13 months'),
      (gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now());
    insert into storage.objects values('assistant-context','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/00000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.json',now()-interval '13 months');
    set local role authenticated;
    set local qa.employee='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    do $$ begin if exists(select 1 from storage.objects) then raise exception 'cross employee context leak'; end if; end $$;
    set local qa.employee='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    do $$ begin if (select count(*) from storage.objects)<>1 then raise exception 'owner cannot read'; end if; end $$;
    do $$ begin
      begin insert into storage.objects values('assistant-context','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/00000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.json',now());
        raise exception 'foreign upload accepted'; exception when insufficient_privilege then null; end;
      if has_function_privilege('authenticated','privacy_retention_batch()','execute') then raise exception 'unsafe retention grant'; end if;
    end $$;
    set local role service_role;
    select privacy_retention_batch();
    do $$ begin if (select count(*) from benni_chats)<>3 then raise exception 'disabled retention deleted chats'; end if; end $$;
    update privacy_retention_settings set enabled=true;
    select privacy_retention_batch();
    do $$ begin
      if (select count(*) from benni_chats)<>2 then raise exception 'held or recent chat deleted'; end if;
      if (select count(*) from chat_messages)<>2 then raise exception 'incorrect team message expiry'; end if;
      if (select count(*) from privacy_storage_deletions)<>1 then raise exception 'context file not queued'; end if;
      if (select count(*) from storage.objects)<>1 then raise exception 'object metadata directly deleted'; end if;
    end $$;
    select privacy_retention_batch();
    do $$ begin if (select count(*) from privacy_storage_deletions)<>1 then raise exception 'duplicate cleanup'; end if; end $$;
    rollback;
  `)
  sql(`drop database ${database};`,'postgres')
})
