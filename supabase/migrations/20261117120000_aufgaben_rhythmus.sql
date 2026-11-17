-- Checklisten: mehrere Wochentage und „alle X Tage“ (Renée, 16.11.2026)
alter table public.task_templates
  add column if not exists weekdays int[],
  add column if not exists every_days int,
  add column if not exists start_day date;

alter table public.task_templates drop constraint if exists task_templates_repeat_check;
alter table public.task_templates add constraint task_templates_repeat_check
  check (repeat in ('daily','weekly','monthly','interval'));
alter table public.task_templates drop constraint if exists task_templates_every_days_check;
alter table public.task_templates add constraint task_templates_every_days_check
  check (every_days is null or every_days between 2 and 31);
alter table public.task_templates drop constraint if exists task_templates_weekdays_check;
alter table public.task_templates add constraint task_templates_weekdays_check
  check (weekdays is null or weekdays <@ array[1,2,3,4,5,6,7]);
alter table public.task_templates drop constraint if exists task_templates_interval_check;
alter table public.task_templates add constraint task_templates_interval_check
  check (repeat <> 'interval' or (every_days is not null and start_day is not null));

-- Bestehende Wochenlisten: der eine Wochentag wird die Liste
update public.task_templates set weekdays = array[weekday]
  where repeat = 'weekly' and weekday is not null and weekdays is null;
