-- Wissen nach Beliebtheit (Renée 20.10.): jedes Öffnen eines Artikels zählt, je Person und Tag höchstens einmal.
create table if not exists public.wiki_views (
  article_id uuid not null references public.wiki_articles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Zurich')::date,
  primary key (article_id, employee_id, day)
);
alter table public.wiki_views enable row level security;
drop policy if exists wv_insert on public.wiki_views;
create policy wv_insert on public.wiki_views for insert to authenticated with check (employee_id = public.my_employee_id());
-- Beliebteste Artikel der letzten Tage, nur Anzahl, keine Namen; sieht nur, was die Person auch lesen darf
create or replace function public.popular_articles(p_days int default 30) returns table (article_id uuid, views bigint)
language sql stable security definer set search_path = public as $$
  select v.article_id, count(*) from wiki_views v join wiki_articles a on a.id = v.article_id
  where v.day >= current_date - p_days and a.published and (is_buero() or can_read_level(a.access_level))
  group by v.article_id order by count(*) desc limit 20
$$;
grant execute on function public.popular_articles(int) to authenticated;
