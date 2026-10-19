-- Automatische Übersetzung der Inhalte (DE → EN, FR). Je Zeile eine Spalte i18n:
--   { "h": "<hash der deutschen Felder>", "EN": { feld: text, … }, "FR": { … } }
-- Wissensartikel bekommen Titel/Kategorie/Kurzfassung im Abgleich; den Volltext übersetzt
-- die Function `translate` erst, wenn ihn jemand auf EN/FR öffnet ("full_EN"/"full_FR").
alter table public.news             add column if not exists i18n jsonb not null default '{}';
alter table public.task_templates   add column if not exists i18n jsonb not null default '{}';
alter table public.task_items       add column if not exists i18n jsonb not null default '{}';
alter table public.wiki_articles    add column if not exists i18n jsonb not null default '{}';
alter table public.onboarding_steps add column if not exists i18n jsonb not null default '{}';
alter table public.events           add column if not exists i18n jsonb not null default '{}';
alter table public.quizzes          add column if not exists i18n jsonb not null default '{}';
alter table public.quiz_questions   add column if not exists i18n jsonb not null default '{}';

-- Fragen samt Übersetzung (ohne Lösungen); die Reihenfolge der Antworten bleibt gleich
drop function if exists public.quiz_for_me(uuid);
create or replace function public.quiz_for_me(p_quiz uuid)
returns table (id uuid, sort int, kind text, prompt text, options text[], i18n jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.quiz_visible(p_quiz) then raise exception 'not_visible'; end if;
  return query select x.id, x.sort, x.kind, x.prompt, x.options, x.i18n - 'h' from public.quiz_questions x where x.quiz_id = p_quiz order by x.sort;
end $$;
grant execute on function public.quiz_for_me(uuid) to authenticated;

-- Abgleich alle 10 Minuten (übersetzt nur, was neu oder geändert ist)
select cron.schedule('teamhub-translate', '*/10 * * * *', $$select net.http_post(
  url := 'https://vdekbelklbctqwucibzn.supabase.co/functions/v1/translate',
  headers := jsonb_build_object('Content-Type','application/json','x-notify-secret',(select regexp_replace(command, '.*x-notify-secret'',''([0-9a-f]+)''.*', '\1') from cron.job where jobname = 'teamhub-notify')),
  body := '{"action":"sync"}'::jsonb, timeout_milliseconds := 150000)$$);
