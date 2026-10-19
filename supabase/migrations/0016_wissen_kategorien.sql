-- Wissen als Kategorie-Karten: je Kategorie das erste Bild aus ihren Artikeln (RLS der Artikel gilt)
create or replace function public.wiki_category_covers() returns table(category text, cover text)
language sql stable security invoker set search_path = public as $$
  select distinct on (a.category) a.category, b->>'src'
  from public.wiki_articles a
  cross join lateral jsonb_array_elements(case when jsonb_typeof(a.blocks) = 'array' then a.blocks else '[]'::jsonb end) with ordinality as x(b, i)
  where a.published and b->>'t' = 'img' and coalesce(b->>'src', '') <> ''
  -- Fotos vor Bildschirmfotos und Scans, damit die Karte nach Studio aussieht
  order by a.category, (b->>'src' ~* 'bildschirm|screenshot|scan|capture'), a.sort nulls last, a.title, x.i
$$;
grant execute on function public.wiki_category_covers() to authenticated;
