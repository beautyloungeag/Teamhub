-- Lernen mit Benni: wie viele Kontrollfragen je Lektion und ab wie vielen richtigen sie bestanden ist.
-- Einstellbar vom Büro im Backoffice (Lernen), gelesen über app_flags() (auch von Benni).
create or replace function public.app_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'demo_data', coalesce((select value from public.app_settings where key = 'demo_data'), 'true'::jsonb),
    'learn_questions', coalesce((select value from public.app_settings where key = 'learn_questions'), '3'::jsonb),
    'learn_min_correct', coalesce((select value from public.app_settings where key = 'learn_min_correct'), '2'::jsonb)
  )
$$;
insert into public.app_settings (key, value) values ('learn_questions', '3'::jsonb), ('learn_min_correct', '2'::jsonb) on conflict (key) do nothing;
