-- Aus dem importierten Wiki abgeleitete Tagesaufgaben und Onboarding-Schritte.
-- Sie liegen als Vorschlag vor (proposed = true, inaktiv) und gelten erst, wenn das Büro
-- sie im Backoffice freigibt. Mit der ersten Freigabe fallen die Beispielinhalte weg.
alter table public.task_templates add column if not exists proposed boolean not null default false,
  add column if not exists source_article_id uuid references public.wiki_articles(id) on delete set null;
alter table public.task_items add column if not exists article_id uuid references public.wiki_articles(id) on delete set null;
alter table public.onboarding_steps add column if not exists proposed boolean not null default false;

do $$
declare kasse uuid := (select id from wiki_articles where title = 'Tagesabschluss Kasse');
        reinig uuid := (select id from wiki_articles where title = 'Reinigung in den Filialen');
        aemtli uuid := (select id from wiki_articles where title = 'Ämtlipläne & Wochen-Putzdienste');
        t uuid;
begin
  -- Tagesabschluss Kasse (täglich)
  insert into task_templates (name, repeat, active, proposed, source_article_id, sort) values ('Tagesabschluss Kasse', 'daily', false, true, kasse, 20) returning id into t;
  insert into task_items (template_id, title, prio, sort, article_id) values
    (t, 'Eigene Kundenzahlungen im Orderbird mit den Terminen abgleichen (Bar, Karte, Gutschein)', true, 0, kasse),
    (t, 'Falsch getippte Behandlungen mit der Filialleitung stornieren und korrekt einbuchen', false, 1, kasse),
    (t, 'Z-Bericht öffnen, Bargeld zählen und in die Bargeld-Einnahme-Tasche legen', false, 2, kasse),
    (t, 'Kartenterminal abschliessen (Stopp, 2, 3) und Total mit dem Z-Bericht vergleichen', true, 3, kasse),
    (t, 'Kassenstock prüfen', true, 4, kasse),
    (t, 'Z-Bericht, Terminalzettel und Kartenbelege zusammenheften, in die weisse Kiste am Empfang', false, 5, kasse),
    (t, 'Bargeld im Safe einschliessen', true, 6, kasse),
    (t, 'Wurden Wertgutscheine eingelöst: Tagesabschluss per WhatsApp ans Büro senden', false, 7, kasse);
  -- Wochenreinigung (mindestens 1x pro Woche laut Wiki; Wochentag im Backoffice anpassbar)
  insert into task_templates (name, repeat, weekday, active, proposed, source_article_id, sort) values ('Wochenreinigung Nailtische', 'weekly', 1, false, true, reinig, 21) returning id into t;
  insert into task_items (template_id, title, sort, article_id) values
    (t, 'Tische inkl. aller Flaschen reinigen und von Gelresten befreien', 0, reinig), (t, 'Schubladen von Staub reinigen', 1, reinig),
    (t, 'Plexiglas mit Glasreiniger reinigen', 2, reinig), (t, 'UV-Lampen reinigen', 3, reinig), (t, 'Nagellackhälse reinigen', 4, reinig);
  insert into task_templates (name, repeat, weekday, active, proposed, source_article_id, sort) values ('Wochenreinigung Pedicure-Stühle', 'weekly', 1, false, true, reinig, 22) returning id into t;
  insert into task_items (template_id, title, sort, article_id) values
    (t, 'Sessel abwischen', 0, reinig), (t, 'Station abstauben, Nagelreste abstauben und saugen', 1, reinig),
    (t, 'Fettflecken von der Creme entfernen', 2, reinig), (t, 'UV-Lampen reinigen', 3, reinig), (t, 'Plexiglas reinigen', 4, reinig);
  insert into task_templates (name, repeat, weekday, active, proposed, source_article_id, sort) values ('Wochenreinigung Empfang & Studio', 'weekly', 1, false, true, reinig, 23) returning id into t;
  insert into task_items (template_id, title, sort, article_id) values
    (t, 'Empfang abstauben, Fettflecken entfernen, Plexiglas reinigen', 0, reinig), (t, 'Böden von Gelresten befreien', 1, reinig),
    (t, 'Alles abstauben: Lampen, Regale, Produkte', 2, reinig), (t, 'Ordnung halten und ausmisten', 3, reinig);
  -- Ämtliplan: die eigentlichen Pläne liegen im Wiki als Bilder; hier nur die Planung
  insert into task_templates (name, repeat, weekday, active, proposed, source_article_id, sort) values ('Putzdienst-Wochenplan', 'weekly', 5, false, true, aemtli, 24) returning id into t;
  insert into task_items (template_id, title, prio, sort, article_id) values
    (t, 'Filialleitung: Ämtli- und Putzdienstplan für die nächste Kalenderwoche einteilen und in der Küche aufhängen', true, 0, aemtli),
    (t, 'Ämtliplan der laufenden Woche kontrollieren und abzeichnen („Ok“)', false, 1, aemtli);

  -- Onboarding für Neue aus vorhandenen Artikeln
  insert into onboarding_steps (title, minutes, article_id, sort, proposed)
  select v.title, coalesce(w.minutes, 2), w.id, v.n + 100, true
  from (values (1, 'Unternehmensstruktur Beautylounge und Verantwortlichkeiten'), (2, 'Personalreglement Beautylounge'), (3, 'Äusseres Erscheinungsbild'),
               (4, 'Arbeitskleidung Beautylounge'), (5, 'Arbeitszeit und Pausen'), (6, 'Benutzung Kommunikationsmitteln in der Beautylounge'),
               (7, 'Arbeitsschutz, Hygiene & Sicherheit'), (8, 'Das Empfangen eines Kunden/ Terminorganisation'), (9, 'Tagesabschluss Kasse'),
               (10, 'Krankheitsbedingte Abwesenheit Vorgehen'), (11, 'Ferien beantragen im Timebutler'), (12, 'E-Mail Adresse auf dem Handy installieren')) as v(n, title)
  join wiki_articles w on w.title = v.title;
end $$;

-- Freigabe durch das Büro: Vorschläge aktivieren, Beispielinhalte abschalten
create or replace function public.approve_wiki_proposals(p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_buero() then raise exception 'forbidden'; end if;
  if p_kind = 'tasks' then
    update task_templates set active = true, proposed = false where proposed; get diagnostics n = row_count;
    update task_templates set active = false where is_sample;
  elsif p_kind = 'onboarding' then
    update onboarding_steps set proposed = false where proposed; get diagnostics n = row_count;
    delete from onboarding_steps where is_sample;
  else raise exception 'unknown_kind'; end if;
  return n;
end $$;
grant execute on function public.approve_wiki_proposals(text) to authenticated;
revoke execute on function public.approve_wiki_proposals(text) from anon;
