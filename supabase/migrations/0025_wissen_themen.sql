-- Themen im Wissen: Emoji je Thema, im Backoffice wählbar (vorher fest im Code).
-- key = Themenname klein geschrieben, wie wiki_articles.category ohne Gross/Klein.
create table if not exists public.wiki_categories (
  key text primary key,
  emoji text not null,
  updated_at timestamptz not null default now()
);
alter table public.wiki_categories enable row level security;
drop policy if exists wcat_read on public.wiki_categories;
create policy wcat_read on public.wiki_categories for select to authenticated using (true);
drop policy if exists wcat_write on public.wiki_categories;
create policy wcat_write on public.wiki_categories for all to authenticated using (public.is_buero()) with check (public.is_buero());

-- Thema umbenennen: Artikel, News-Zuordnung und Emoji ziehen mit (nur Büro)
create or replace function public.rename_wiki_category(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_buero() then raise exception 'forbidden'; end if;
  if trim(coalesce(p_new, '')) = '' then raise exception 'empty'; end if;
  update wiki_articles set category = trim(p_new), updated_at = now() where category = p_old;
  update news set wiki_category = trim(p_new) where wiki_category = p_old;
  if lower(trim(p_new)) <> lower(trim(p_old)) then
    insert into wiki_categories (key, emoji) select lower(trim(p_new)), emoji from wiki_categories where key = lower(trim(p_old))
      on conflict (key) do nothing;
    delete from wiki_categories where key = lower(trim(p_old));
  end if;
end $$;
revoke all on function public.rename_wiki_category(text, text) from public;
grant execute on function public.rename_wiki_category(text, text) to authenticated;
