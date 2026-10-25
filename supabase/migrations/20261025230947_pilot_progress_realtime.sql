-- Progress changes invalidate each signed-in role's own RLS-protected snapshot.
-- Clients never consume old DELETE payloads as authorized application records.
do $$ declare t text; begin
 foreach t in array array['event_registrations','task_completions','news_reads','quiz_attempts','onboarding_progress','wiki_runs'] loop
  execute format('alter table public.%I replica identity default',t);
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
