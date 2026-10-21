# HANDOFF — Beautylounge TeamHub

Interne Mitarbeiter-App (PWA + Desktop-Backoffice) der Beautylounge AG. Kundin: Renée Baumann. PM-Projekt: `projekt.aleksa.ai`, Key **BLTH** (`d4ee5d5c-4553-436c-bba7-137a03a2b704`). ⚠️ Das Repo `beautyloungeag/Teamhub` ist **öffentlich** — nie Personendaten committen.

### Nachtrag 2026-10-21 nachts — Zeit & Ferien und Posteingang in der App

Die Inhaberin ergänzt: Zeit-/Ferienerfassung und Mail fehlen noch, sie sollen sinnvoll und ansprechend in der App stehen. Bisher waren beides nur Links.

- **Function `timebutler`** (neu, deployt, `--no-verify-jwt`):
  - API v1 `POST https://timebutler.de/api/v1/<endpoint>` mit `auth=<Firmen-Schlüssel>`, Antworten als CSV mit `;` und englischen Spalten
  - Endpunkte: `users` (Zuordnung über „E-mail address“, 10 Min. gepuffert), `holidayentitlement`, `absences` (dieses und nächstes Jahr), `worktime` (Monat), `timeclock` (`status|start|pause|resume|stop` mit `userid`)
  - Aktionen `overview` und `clock`
  - ⚠️ **Secret `TIMEBUTLER_TOKEN` fehlt noch.** Den Firmen-Schlüssel muss Beautylounge liefern (Admin-Konto, Fusszeile „Schnittstelle (API)“). Bis dahin meldet die Function `configured:false` und die App zeigt „wird gerade angebunden“ mit Link. Optional `TIMEBUTLER_BASE`.
  - API v1 kann **keine Abwesenheiten anlegen** → „Ferien beantragen“ öffnet Timebutler.
  - Quelle der Spaltennamen: Community-Client `levma/timebutler-api-client`. Mit echtem Schlüssel einmal gegenprüfen.
- **Function `mailbox`** (neu, deployt):
  - eigenes Firmenpostfach bei Cyon, IMAP `s065.cyon.net:993`, das ist der Server hinter `mail.beautylounge.ch` (Dovecot); SMTP `:465`, weil Supabase 587 sperrt
  - schlanker IMAP-Client in der Function, MIME über `npm:postal-mime`
  - Aktionen `status|connect|disconnect|list|message|send` (Senden legt eine Kopie in „Gesendet“ ab und markiert die Ausgangsmail als beantwortet)
  - Passwort je Person in `mail_accounts` (Migration `0030`, RLS ohne Policies), AES-GCM mit Secret `MAILBOX_KEY` (gesetzt 21.10.)
  - Getestet: Verbindung und Fehlanmeldung ab Supabase, Literal-/Umlaut-Parsing lokal
  - ⚠️ **Noch nicht mit einem echten Postfach getestet** (keines hier hinterlegt). Erster Test: eine Person verbindet ihr eigenes Postfach in der App.
- **App:**
  - `src/Time.tsx`: Stempeluhr dunkel, Ferienring mit Resttagen, Wochenbalken, Abwesenheiten mit Status-Etiketten
  - `src/Mail.tsx`: Verbinden-Karte, Posteingang mit Ungelesen, Mail lesen (HTML im abgeschotteten iframe), Antworten, Weiterleiten, Neu
  - Menü-Einträge und zwei Knöpfe auf „Heute“
  - `ExternalTool` entfernt
  - Lokale Beispieldaten nur im Dev-Server mit `localStorage th-demo=1` (für die Ansichts-PDF)

### Was wurde in dieser Session gemacht (2026-10-21 spät) — zweite Feedback-Runde der Inhaberin („Re: App Optik“)

Ihre Antwort: Fokus auf sauberes Wissen, News, Tages-/Wochen-/Monatslisten, Chat und Lernen untereinander; Termine und Performance „sind ja nichts Neues“, das haben die Mitarbeiterinnen in der Phorest-App. Ihre Vorlagen-Screenshots (BeautyHub/GlowTools-Mockups) liegen nicht im Repo.

- **Migration `0029_fokus_wissen_news_chats.sql`** (eingespielt):
  - News-Kategorien Wichtig/Schulung/Team/Salon (alte Studio/Marketing → Salon, Pflicht/Hygiene → Wichtig)
  - RPC `news_progress()`: „8 von 12 bestätigt“ je Pflicht-News, Zielgruppe wie `news_for_me`, ohne Büro
  - `wiki_runs` (gelesen einmal je Person, Durchgänge beliebig oft) + Leserecht auf eigene `wiki_views`
  - `employees.about` + RPC `update_my_about`
  - Team-Chats `chat_rooms`/`chat_members`/`chat_messages`: Studio-Räume je Filiale, Raum „Ganzes Team“, Direkt- und Gruppenchats per RPC `start_chat`, Zugriff über `chat_can`, Realtime auf `chat_messages`
  - Ticket-Art `Learning`: für alle Studios lesbar, Trigger `learning_quiet` verhindert Facility-Mail und Leitungs-Push, Storage-Policy `learning_media_read` für deren Fotos/Videos
- **App:**
  - News als grosse Bildkarten mit Zeit-Badge und Bestätigungsbalken; ohne eigenes Bild ein Studiofoto
  - Wissen in fünf Hauptbereichen (`AREAS`/`areaOf` in `src/lib/wiki.ts`, Treatment-/Hygiene-Titel per Regex, sonst Thema → Bereich) mit persönlichem Prozentbalken, Bereichsseite mit Themen-Chips und Häkchen
  - Artikel im Schritt-Modus: `ol`, Absätze mit fettem Anfang (Import-Protokolle „**1. Nagelhaut entfernen**-…“) und Zwischentitel werden Schritte zum Abhaken, kurze Zeilenläufe/`ul` werden Checklisten, Hinweise zur roten Regel; voller Durchgang = Eintrag in `wiki_runs` („2× durchgemacht“); unten fest „Gelesen & bestätigen“ + „Frage an Marc“
  - Profil mit grossem Foto, „Persönliches“ (selbst gepflegt), „Nachricht schreiben“
  - Reiter **Chats** statt Marc (Marc oben angeheftet, öffnet seinen Chat mit Zurück-Knopf, `BenniChat` hat dafür `onBack`); `src/Chats.tsx` mit Hub, Raum (Realtime), Personenauswahl, Punkt für ungelesene in der Navigation
  - Melden & Ideen mit drittem Knopf **Learning** (Feed mit Video/Foto, „Hilfreich“, Kommentare), „Wissen teilen“ im Wissen
  - Startseite ohne „Gleich dran“, Marc-Kundenkarte und „Heute im Studio“, dafür Pflicht-News gross, Lernstand-Kachel, Chats, Weiterlernen, Geteiltes; Kundentermine/Kundenhistorie/Performance im Menü unter „Aus Phorest“
  - Backoffice News: Kategorien wie in der App
- **Begründung gegenüber der Inhaberin:** Termine/Schichten („Mein Tag“) stehen im Projektplan als Kernmodul, Kundenhistorie + Marc zur Kundin waren ihr Wunsch vom 20.10., Performance ihr Wunsch vom 25.09. Deshalb bleiben sie erreichbar, nur nicht mehr vorne.
- **Offen:** Push bei neuer Chat-Nachricht fehlt noch (`notify` kennt Chats nicht). Fotos/Videos im Chat fehlen. Bereichszuordnung ist fest im Code, nicht im Backoffice einstellbar. Artikel mit reinem Fliesstext bleiben Fliesstext, bis jemand sie in Schritte gliedert.
- PDF für die Inhaberin neu: `~/Downloads/TeamHub-Mitarbeiter-App-neuer-Stand.pdf`. Die Beispiel-Einträge für die Aufnahmen (Direktchat, Learning, Lesefortschritt, Profiltext) sind per ID wieder gelöscht.
- Weiter nur lokal, weil Netlify pausiert ist.

### Was wurde in dieser Session gemacht (2026-10-21, Abschluss)

- **Anmeldung am Handy neu** (Commit `6aeb883`): oben das Empfangsfoto (`public/hero-empfang.jpg`, unten abgerundet), Sprachwahl als weisse Pille auf dem Foto, darunter Logo, „TeamHub“, Zeile „Melde dich mit deiner E-Mail-Adresse an.“ und das Formular, alles zentriert. Am Desktop bleibt das Bild links (`login-studio.webp`), rechts jetzt ebenfalls zentriert. Anlass: Aleksa fand die Seite ohne Bild und linksbündig verloren.
- **PDF „neuer Stand“ für die Inhaberin** gebaut (`~/Downloads/TeamHub-Mitarbeiter-App-neuer-Stand.pdf`, 24 Ansichten, Stand 21.10.), Aleksa schickt sie. Skripte in claude-team `ai-team/assets/beautylounge-teamhub/app-ansichten/`.
- **Herkunft „Meine Performance“:** Wunsch der Inhaberin aus dem Update-Meeting 25.09. (Phorest-Performancetool per Schnittstelle, zusammen mit der Umfragefunktion), **nicht** im Projektplan/Vertrag. Beides gebaut 20.10. nachts — bei einer Abrechnung von Zusätzen gehören die zwei dazu.
- **Offen aus dem Feedback (aktueller Stand):** Phorest-Hilfe als Wissen für Marc, Kundentermine in Phorest-Farben, „Learning“ (Videos teilen) in Melden & Ideen, Ziele im Phorest-Stil, Chats zwischen Mitarbeiterinnen, Antwort zur Aushilfe (geht schon: Mitarbeiterinnen tragen ihre Tage ein, die Leitung fragt über den Einsatzplan an). Erledigt: Wissen auf 6 Themen + Beliebtheit, Farben, Schrift, Gesicht, Home-Knopf, Kontaktdaten, Ziele nur Leitung.
- ⚠️ Weiter nur lokal: Netlify pausiert, live ist der Stand vom 19.10.

### Nachtrag 2026-10-21 abends — Assistent heisst Marc

- Benni heisst jetzt **Marc** (voller Name Marc Beau), wie Beautylounge ihn intern nennt. Geändert in App, Backoffice, Übersetzungen und den Functions `assistant` (Anweisung: früher Benni, wer ihn so nennt, meint ihn), `newsdraft`, `phorest`, `transcribe`, alle neu deployt. Code-Namen (`BenniChat`, `benni_chats`, `public/benni.jpg`) bleiben bewusst.

### Nachtrag 2026-10-21 nachmittags — Mitarbeiter-App im Stil B (Aleksas Wahl)

- **Farben nach Wichtigkeit:** Tokens `duty` (Pflicht), `note` (Wichtig/Aktion), `learn` (Learning), `studio`, `done`, `plum` in `src/index.css`, Zuordnung in `src/tones.ts` (`toneOf` nach Tag/Name, `tileTone` für Kacheln). Schrift in der App etwa 1,5 px grösser (Mobile, Todos, Quiz, Umfrage, Benni-Chat).
- **Benni hat ein Gesicht:** `public/benni.jpg` (3D-Entwurf) ersetzt die Kugel in `BMark`/`BenniAvatar`, beim Arbeiten pulsierender Ring.
- **Heute:** Foto-Kopf mit Begrüssung und Schicht, drei Kacheln (Checkliste, Pflicht offen, Für dich), „Gleich dran“ mit Terminfarbe, Benni-Karte zur nächsten Kundin (Zusatzverkauf), Pflicht-News als Karten.
- **Wissen:** Foto-Karte „Meistgelesen“, farbige Themen-Kacheln (6 sichtbar, Rest aufklappbar), „Beliebt“. Beliebtheit zählt `wiki_views` (Migration `0028`, je Person und Tag einmal) über RPC `popular_articles`. Artikel: Etiketten, Hinweise als rote Karten, nummerierte Listen als Schritt-Karten.
- **News:** Foto-Karten mit farbigem Etikett, Filter in Farbe, eigener Lesestatus.
- **Home-Knopf** oben rechts auf jeder Unterseite. Fotos `public/hero-empfang.jpg`, `public/hero-studio.jpg` aus den eigenen Studios.

### Was wurde in dieser Session gemacht (2026-10-21) — Feedback der Inhaberin zur App

- **Umgesetzt:** Kontaktdaten von Kundinnen (Telefon, E-Mail, Adresse, Geburtstag) liefert die Function `phorest` nur noch an Leitung und Büro (`seesContact`); Mitarbeiterinnen sehen unscharfe Platzhalter (`src/ContactLock.tsx`), Suche per Telefon/E-Mail ist für sie gesperrt (`contact_search_forbidden`), Benni nennt keine Kontaktdaten. Ziele legt nur die Leitung an (Migration `0027`, Knopf in „Meine Performance“ nur für Leitung). Performance und persönliche Ziele anderer sehen Mitarbeiterinnen schon vorher nicht (RLS `goals_read`, `performance` nur eigene).
- **Design:** zwei Richtungen als Canvas (Artifact „TeamHub App · Design-Richtungen“): Farben nach Wichtigkeit (Pflicht/Wichtig/Learning/Studio/Erledigt), Schrift 17 px, Benni mit Gesicht (zwei Entwürfe), Home-Knopf oben auf Unterseiten. Aleksa hat Richtung B gewählt (siehe Nachtrag nachmittags).
- **Offen aus dem Feedback:** Phorest-Hilfe als Wissen für Benni (Phorest Learning), Wissen auf ~6 Themen reduzieren + nach Beliebtheit sortieren (braucht Lesezählung), Kundentermine in Phorest-Farben, Melden & Ideen um „Learning“ (Videos teilen) erweitern, Ziele im Phorest-Stil, Chats zwischen Mitarbeiterinnen, Antwort zur Aushilfe-Logik.

### Was wurde in dieser Session gemacht (2026-10-20)

- **Demo mit der Inhaberin 20.10. 12:00 (Google Meet), lokal gezeigt:** grundsätzlich zufrieden. **Offen: Design der Mitarbeiter-App** — Sie schickt Verbesserungsvorschläge anhand eines PDFs mit 24 nummerierten Ansichten (claude-team `ai-team/assets/beautylounge-teamhub/app-ansichten/`, dort auch die Skripte zum Neu-Aufnehmen; Bilder/PDF bewusst nicht im Repo).
- **Vorgeschlagen (Ablauf-PDF, claude-team `…/vorstellung-2026-10-20/`):** Fr 23.10. Schulung Pilotteam → Pilot bis Fr 30.10. → Go-Live Mo 02.11. Von Beautylounge bis Freitag: Pilotteam, Netlify-Abo (9 USD), Timebutler-API-Token, Facility-E-Mail. Zum Go-Live Supabase Pro empfohlen (tägliche Sicherung).
- ⚠️ **Live ist noch der Stand vom 19.10.** (Netlify-Deploys pausiert). Alles aus den Nachträgen unten läuft nur lokal; nach dem Netlify-Upgrade einmal pushen/deployen und `teamhub.beautylounge.ch` prüfen.
- **Supabase Auth:** `rate_limit_email_sent` war 2/Stunde → 1000, `smtp_max_frequency` 60 → 5 s (gilt live).
- **Noch zu tun:** Testkonten nach der Demo zurücksetzen (Abschnitt „Testkonten für die Demo“), der Inhaberin ein Büro-Konto anlegen (Adresse fehlt), Design-Runde nach ihrem Feedback.
- Code dieser Session: Nachträge „vormittags“ bis „mittags (4)“ unten, Migrationen `0022`–`0026`.

### Nachtrag 2026-10-20 mittags (4) — Favicon, Meldungen löschen

- Favicon und App-Symbole (`public/favicon.svg`, `icon-192.png`, `icon-512.png`) zeigen das B aus dem Logo, weiss auf Olive. Vorher Vite-Blitz bzw. Platzhalter „bl“.
- Meldungen und Ideen löschen (Migration `0026`): Büro alle, Filialleitung die ihres Studios, im Backoffice auf der Meldungsseite. Zuerst Foto/Video aus `ticket-photos`, dann die Zeile (Kommentare, Stimmen, Verlauf per CASCADE). Das Protokoll hält das Löschen fest.

### Nachtrag 2026-10-20 mittags (3) — Direktlinks

- `src/lib/start.ts` liest die Startadresse, bevor die App sie aufräumt. `?open=<ziel>` öffnet die Mitarbeiterin-App an einer Stelle (home, tasks, todos, ai/benni, wiki, menu, book, clients, perf, tickets, events, onboarding, me, team, install, news-list, conn, time, news:<id>, ticket:<id>), auch für Leitung und Büro am Desktop. `?bo=<seite>` öffnet das Backoffice auf einer Seite (overview, book, news, tasks, tickets, events, standby, learn, team, performance, wiki, settings, benni, me); nicht erlaubte Seiten fallen auf die Übersicht zurück. Genutzt im Ablauf-PDF der Vorstellung (claude-team `ai-team/assets/beautylounge-teamhub/vorstellung-2026-10-20/`).

### Nachtrag 2026-10-20 mittags (2) — Wissen neu im Backoffice, Lernziel für Freitext-Quiz

- **Wissen (`src/admin/Wiki.tsx`, nur Büro):** gleiche Ansicht wie in der App. Themen als Kacheln mit Emoji → Artikel eines Themas → Artikel im Aussehen der App, direkt bearbeitbar. Inhalt sind die Bausteine in `wiki_articles.blocks` (Text, Überschrift, Aufzählung, Nummerierung, Hinweis, Bild, Video hochgeladen oder YouTube, Datei). Plus zwischen den Bausteinen fügt ein, der Griff links ändert Typ, Reihenfolge, entfernt. Enter teilt einen Absatz, markierter Text bekommt fett/kursiv/Link (gespeichert als `**`, `*`, `[Text](Link)` wie beim Import). Vorher waren die 180 importierten Artikel inhaltlich gar nicht bearbeitbar. Beim Speichern wird `body` (Klartext für Suche und Benni) und die Lesezeit aus den Bausteinen erzeugt; ein altes Einzelmedium (`media_url`) wird zum ersten Baustein. Dateien liegen unter `media/wiki/<Sichtbarkeit>/…` und ziehen beim Speichern mit, wenn sich die Sichtbarkeit ändert. Die Übersetzung erneuert sich von selbst (Hash über body + blocks).
- **Themen (Migration `0025`):** Tabelle `wiki_categories` (key = Name klein, emoji), Standard-Emojis in `src/lib/wiki.ts`. Umbenennen per RPC `rename_wiki_category` zieht Artikel, News-Zuordnung und Emoji mit.
- **„Prüfung fällig“ entfernt:** Datum und Filter waren unverständlich. `review_due` bleibt in der Datenbank, „Verantwortlich“ bleibt am Artikel.
- **Onboarding-Vorschlag aus dem alten Wiki** steht jetzt unter Lernen → Lektionen (12 Lektionen, Übernehmen ersetzt die 5 Beispiel-Lektionen), nicht mehr im Wissen.
- **Freitext-Quiz:** Feld „Lernziel für Benni“ mit Erklärung, dazu „Ausprobieren“: Probeantwort, Benni bewertet sofort (Function `quiz` Aktion `try`, nur Leitung/Büro, nichts gespeichert). Bewertungsanweisung geschärft: richtig, wenn der Kern verstanden ist, falsch, wenn ein im Lernziel als wichtig genannter Punkt fehlt.
- ⚠️ **Typprüfung:** `npx tsc --noEmit -p .` prüft nichts (Root-tsconfig mit `files: []`). Richtig ist `npx tsc --noEmit -p tsconfig.app.json`.

### Nachtrag 2026-10-20 mittags — Anmeldung ohne Sperre, Studios wechseln, Rollen, Studio-Aufgaben

- **Anmeldesperre aufgehoben:** Supabase Auth erlaubte nur 2 Anmelde-Mails pro Stunde (`rate_limit_email_sent`) und eine je Adresse pro 60 s. Per Management API gesetzt: `rate_limit_email_sent` 1000, `smtp_max_frequency` 5, `rate_limit_otp`/`rate_limit_verify` 300, `rate_limit_token_refresh` 600. Versand läuft über Resend (eigenes SMTP), deshalb sind die hohen Werte erlaubt.
- **Kundentermine:** alle Studios wählbar, das eigene ist voreingestellt und markiert (Function `phorest` `branch_day` für alle Angemeldeten offen, `team_today` bleibt bei der Leitung). Phorest-Knopf mit Logo (`public/phorest.png`): Computer → `app.phorest.com` (PhorestDesktop im Browser), Android → App `com.phorest.go`, iPhone → App Store `id1584319502`. „Kundin“ in der Oberfläche durch „Kunden“ ersetzt (Aleksas Wunsch, es gibt auch Männer als Kunden).
- **Studio-Aufgaben (Migration `0023`):** eine Aufgabe fürs Studio ist eine Zeile; wer zuerst abhakt, gilt, ein zweites Abhaken wirft `already_done` statt den Namen zu überschreiben. Dialog und App erklären „eine Person reicht“. Büro und Filialleitung mit mehreren Studios können „Alle Studios“ wählen, dann bekommt jedes Studio die Aufgabe einmal.
- **Rollen:** Einstellungen → Rollen zeigt, was Mitarbeiterin, Filialleitung und Büro dürfen und wer welche Rolle hat. Das Büro ändert Rollen dort oder auf der Personenseite (Function `admin-employee` Aktion `set_role`, nie die eigene, wird protokolliert). Stand 20.10.: 5 Büro-Konten, 10 Filialleitungen; **Die Inhaberin hat noch kein Konto.**
- **Meldungen für alle Studios (Migration `0024`):** `tickets.all_studios`; `branch_id` bleibt das Studio der meldenden Person (Zuständigkeit, Rechte), sichtbar ist die Meldung für alle.
- **Profil im Backoffice:** Klick auf den eigenen Namen unten links öffnet „Mein Profil“ (Profilbild, Kontakt, Sprache). Kommentare zeigen das Profilbild der Person.

### Nachtrag 2026-10-20 vormittags — Backoffice neu gestaltet nach den Regeln des feleo-Designsystems

Aleksas Rückmeldung: zu generisch, zu viel Text, Kästen in Kästen, rechte Spalten, nichts sieht klickbar aus, keine Diagramme, Kundendaten wirken wie Fliesstext. Übernommen wurden die bei feleo abgenommenen Regeln (Datenzeilen, flache Listen, Detailseiten mit Zurück, Status als Icon plus Wort, Statistik mit Verläufen, Dialog mit Unschärfe).

- **Bausteine** `admin/kit.tsx`: `Seg` mit gleitender Markierung, `Back`, `Section` (Titel + Zähler + Aktion), `Empty` (ein Satz), `Status` (Icon + Wort), `DataRow` (Bezeichnung links, Wert rechts, Kopieren beim Darüberfahren), `RecordHead` (Link-Icon + Quelle), `ReadOnly` (Schloss + Grund), `RowLink`; Dialog-Hintergrund mit `backdrop-blur`. **Diagramme** ohne Bibliothek in `admin/charts.tsx`: `Donut`, `DonutParts`, `LineChart` (Linie + gestrichelter Vergleich, Hover), `Columns`, `BarList`.
- **Übersicht** `admin/Overview.tsx`: Kennzahlen ohne Kacheln, jede klickbar (Checklisten heute, Pflicht-News, Meldungen, Behandlungen 7 Tage), Termine je Tag aus Phorest mit Vorwoche, Checklisten der letzten 14 Tage als Säulen, Meldungen als Ring, Heute im Studio, Als Nächstes, Startbereitschaft. Büro mit Studio-Umschalter. `phorest` → `performance` liefert dafür `series`/`prev_series` je Tag.
- **Aufgaben** neu (`admin/Tasks.tsx`): Heute je Studio als Tabelle je Checkliste („für alle in Basel 1“, Fälligkeit, wer wann abgehakt hat, Foto) plus Einzelaufgaben mit Frist; Einzelaufgaben anklickbar und bearbeitbar (Frist, für wen, wieder öffnen, löschen); Checklisten als **eigene Seite** mit Punkten zum direkten Bearbeiten, Büro-Listen für die Filialleitung nur lesend mit Begründung.
- **Schulungen & Events**: Liste ohne Seitenspalte, Klick öffnet die Seite des Termins (Datenzeilen, Ring Kommen/Warteliste/Absagen/offen, Teilnehmende filterbar, **Erinnern je Person** und für alle, CSV). `notify` → `remind_event` nimmt `employee_ids`.
- **Aushilfe**: „Wer kann wann“ als Einsatzplan (Personen × 14 Tage, Punkt = kann, Klick fragt an); Anfragen als Liste mit Detailseite (Können/Können nicht, Einteilen, Telefon). Testkonten erscheinen, wenn sie Tage eingetragen haben (markiert).
- **Lernen**: Fortschritt mit drei Ringen; **Lektionen** (vorher Onboarding) mit Studio-Bezug — Migration `0022_lektionen_je_studio.sql`: `onboarding_steps.branch_ids`, Lesen über `in_audience`, Filialleitung schreibt fürs eigene Studio; **Quiz** mit Detailseite (Ergebnisse je Person) und Editor als Seite. „Neues Quiz“ hat die Filialleitung jetzt immer: Lernstoff neu schreiben (wird Pflicht-News mit Quiz) oder an eine eigene News hängen. Fehler behoben: gewählte Zahl bei den Kontrollfragen wurde beim Darüberfahren weiss auf weiss.
- **News** und **Meldungen & Ideen** (`admin/Tickets.tsx`): Liste, Klick öffnet Detailseite (Lesebestätigung je Person bzw. Status/Zuständig/Verlauf). Zuweisen und Status bleiben in der Liste änderbar.
- **Benni** im Backoffice als Vollbild-Chat mit Chatliste (wie in der App), die Seitenleiste ist weg.
- **Kundendaten** im Termin (`Calendar.tsx` `AppointmentSheet`, App und Backoffice): Datensatz mit Link-Icon, Datenzeilen mit Kopieren (Telefon, E-Mail), „Mehr anzeigen“, Historie mit Zähler; Zusatzleistungen („- ohne Achseln“) hängen an der Hauptbehandlung desselben Tages.
- **Personenseite**, **Wissen** (Bearbeiten im Dialog) ohne Kästen.
- Getestet 20.10. im Browser als Filialleitung (alle Seiten oben). Testdaten (Aushilfe-Tage, Lektion) per ID gelöscht.

### Nachtrag 2026-10-20 nachts — Audit gegen Projektplan und Gespräche: Protokoll, Einstellungen, Umfragen, Performance

Abgleich mit Projektplan/Roadmap (18.08.), Vertrag, Gesprächen 25./26.08., Abnahmeprüfung 28.09. und Renées zwei Mails nach dem Update-Meeting 25.09. (Performance-Tool aus Phorest, Umfragefunktion). Beides war bis heute nicht gebaut.

- **Migration `0021_protokoll_umfragen_ziele.sql`** (eingespielt):
  - **Protokoll** `audit_log` per Trigger `audit_row()` auf News, Termine, Anmeldungen, Checklisten, Aufgaben, Meldungen, Personen, Aushilfe, Quiz, Umfragen, Ziele, Wissen, Onboarding, Studios, Skills, Einstellungen; Haken zurücknehmen (Abhaken selbst steht bei den Aufgaben). Speichert wer, wann, was, Studios und geänderte Felder (lange Texte gekürzt, technische Felder wie `i18n`/`notified_at` zählen nicht). Büro sieht alles, Filialleitung ihre Studios und eigene Aktionen. Personen anlegen/sperren/löschen trägt `admin-employee` selbst ein (läuft mit Dienstrechten). Aufbewahrung `app_settings.audit_days` (Standard 365), Cron `teamhub-audit-cleanup` 03:30.
  - **Mitteilungen für Leitung** `employees.notify_prefs` + RPC `set_notify_prefs`. `notify` Schritte 7–11: neue Meldung/Idee im Studio, Zusage auf Aushilfe-Anfrage, Zusammenfassung zum Anmeldeschluss (an die Person, die den Termin angelegt hat), nachgerückt von der Warteliste, Checkliste 30 Min. nach letzter Fälligkeit noch offen (`lead_alerts`, einmal je Studio/Liste/Tag, 06–21 Uhr). Standards je Rolle in `notify` und `admin/Settings.tsx` gleich halten.
  - **Warteliste** `event_registrations.waitlist/promoted_at`: `register_event` gibt jetzt `'ok'|'waitlist'` zurück (statt Fehler „full“), Trigger rückt bei Absage/Abmeldung oder mehr Plätzen automatisch nach.
  - **Umfragen** `polls`, `poll_questions`, `poll_answers` (an News; Auswahl, Mehrfachauswahl, Skala 1–5, Freitext; anonym, Ergebnis für Teilnehmende, Ende). Ergebnisse nur über `poll_results()` (Leitung mit Namen ausser anonym). Übersetzung über `translate` (`poll_questions`). Erinnern: `notify` Aktion `remind_poll`.
  - **Ziele** `goals` (Person oder Team, Kennzahl, Ziel, Zeitraum ≤ 92 Tage).
  - **Fehlerprotokoll** `client_errors` (`src/lib/errors.ts` + `ErrorBoundary`, nur Büro liest, 90 Tage).
  - **Wissen** `wiki_articles.owner_id/review_due` (laut abgestimmtem Wiki-Format jährlich prüfen).
- **`phorest` → `performance`** {from, to, employee_id | branch, totals_only}: Behandlungen (Status PAID), DL-Umsatz laut Terminpreis, Ø je Besuch, Kundinnen, Wunschtermine (`staffRequest`), Online-Anteil (`source = ECOMM_WEB_APP`), Bewertungen (Phorest filtert Reviews weder nach Person noch Datum, deshalb seitenweise neueste zuerst). Vergleich zum gleich langen Vorzeitraum. **Verkaufsumsatz fehlt:** Phorest gibt Verkäufe nicht per GET heraus (`purchase` 500, nur CSV-Exportjob per POST).
- **Oberfläche:** App Menü → **Meine Performance** (`src/Performance.tsx`: Kennzahlen, Ziele, eigene Bewertungen). Backoffice neue Seite **Performance** (je Person, Teamziele, neueste Bewertungen, CSV) und Block auf der Personenseite. **Einstellungen** (`admin/Settings.tsx`) ersetzt den Reiter Studios: Mitteilungen (inkl. Push an diesem Gerät), Protokoll (`admin/Protocol.tsx`), Export (Aufgaben-Nachweis je Monat inkl. offener Aufgaben, Teilnehmende, Lesebestätigungen, Umfrage, Team, alles CSV für Excel mit `;` und BOM, `src/lib/csv.ts`); nur Büro: Allgemein (Beispielinhalte, Protokoll-Aufbewahrung, E-Mail-Versand), Studios (`admin/Studios.tsx`), System (Fehler, Zugriffe auf Kundendaten). **News** lassen sich jetzt bearbeiten und bekommen eine Umfrage (Fragen fest, sobald jemand geantwortet hat). **Schulungen & Events:** Warteliste (Tab in der Teilnehmerübersicht, App-Knopf „Auf die Warteliste“) und **Jahresplan**.
- Getestet 20.10. nachts: News mit Umfrage als Filialleitung an das Testkonto, Antwort als Mitarbeiterin in der App, Ergebnis in App und Backoffice; Ziel in der App; Warteliste per Skript (ok → waitlist → Absage → nachgerückt); Protokoll mit allen Schritten; Performance je Person und Studio mit echten Phorest-Zahlen; Rechte (Mitarbeiterin bekommt für ein Studio nur Summen, sonst 403); Fehlerprotokoll. Testdaten und ihre Protokollzeilen per ID gelöscht.

### Nachtrag 2026-10-20 vormittags — Backoffice für die Filialleitung neu (Audit)

- **Gemeinsamer Baukasten** `src/admin/kit.tsx`: eigenes Dropdown `Select` (Suche ab 8 Einträgen, Gruppen, öffnet per Portal und klappt nach oben, wenn unten kein Platz ist) statt nativer Auswahllisten, dazu `Modal`, `InfoTip` (Erklärtext als ⓘ neben dem Titel statt eigener Textspalte), `Seg`, `Chips`, `Dot`. Formulare laufen jetzt in Dialogen statt inline.
- **Module je Bereich** in `src/admin/`: `Team.tsx` (Liste mit Filter Funktion/Studio/Rolle, Klick öffnet eine ganze Personenseite mit Zurück und „1 von 8“ vor/zurück, Profilbild, Kontakt mit Kopieren/Anrufen wie in der App, Phorest-Schichten, Lernstand), `Tasks.tsx` (Heute je Studio anklickbar: welche Aufgabe offen/erledigt, von wem, wann, Foto; Vortage wählbar; Zugewiesen; Checklisten), `Events.tsx` (farbige Zusagen/Absagen/offen, Detail mit Teilnehmerliste, „Erinnern“ an alle ohne Antwort, Anlegen/Bearbeiten), `Standby.tsx` + `src/standby.ts` (Aushilfe anfragen und einteilen, „Wer kann wann“), `Learn.tsx` (Fortschritt je Person, Quiz, Onboarding, Einstellungen), `News.tsx` (Liste mit Lesestand, Verfassen mit Benni-Entwurf). `Backoffice.tsx` behält Übersicht, Meldungen, Studios, Wissen, Mail.
- **Migration `0020_filialleitung_rechte.sql`** (eingespielt): Filialleitung darf für **eigene Studios** News schreiben (`news_write_lead`, sieht eigene Entwürfe), Quiz zu eigenen News, Events anlegen (`events.created_by`), Studio-Checklisten anlegen/ändern. Prüfung über `my_studios_cover()` (nicht leer, kein Büro, nur eigene Studios). Onboarding-Schritte, globale Vorlagen und Quiz-Einstellungen bleiben beim Büro. Neue Tabellen `standby_requests` + `standby_responses`.
- **Aushilfe-Anfragen:** Filialleitung fragt für Tag/Zeit/Skill an (an alle oder nur an Leute mit eingetragenem Aushilfe-Tag). `notify` schickt Push (Schritt 5) und nach dem Einteilen an die eingeteilte Person (Schritt 6). In der App steht auf Heute „Aushilfe gesucht“ mit „Ich kann“ / „Leider nicht“, nach dem Einteilen „Du hilfst aus“.
- **`notify` → `remind_event`** (Büro oder Filialleitung): Push an alle der Zielgruppe ohne Antwort. **`newsdraft`** jetzt auch für die Filialleitung.
- **Sichtbarkeit:** Filialleitung sieht nur Personen ihrer Studios (Basel 1: 14). Die Rolle Büro sieht alle Studios, das ist der Super-Admin.
- **Sprache:** `store.tsx` übernimmt beim Anmelden die Browsersprache ins Profil, wenn dort DE steht. Wer Tests mit geleertem `localStorage` in einem englischen Browser fährt, stellt damit das Testkonto auf EN um (passiert am 20.10., zurückgesetzt).
- Getestet 20.10. lokal als Filialleitung (Team, Personenseite, Aufgaben Heute/Vortag, Zuweisen, Events, Aushilfe anfragen → zusagen → einteilen → Karte in der App, Lernen, News) und per Skript (RLS: eigenes Studio ja, fremdes Studio und „alle“ nein). Testdaten per ID gelöscht.

### Nachtrag 2026-10-20 früh — Seitenleiste zuklappbar, Abmelden, Diktat-Stopp, Kontrollfragen einstellbar

- **Seitenleiste** (`src/Nav.tsx`, `SideNav`) für App am Desktop und Backoffice: „Einklappen“ unten zeigt nur noch Symbole (oben das „B“ aus dem Logo, `LogoMark`), gilt auf allen Seiten und bleibt im Browser gespeichert (`th-nav-mini`). Unten Profil und **Abmelden**; Abmelden zusätzlich im eigenen Profil.
- **Diktat:** während der Aufnahme „Stopp“ (Text kommt zum Bearbeiten ins Feld) und der Pfeil (sofort senden), dazu Abbrechen.
- **Kontrollfragen einstellbar:** Backoffice → Lernen → „Lernen mit Benni“: Fragen je Lektion (1–5, Standard 3) und „Bestanden ab … richtigen“ (Standard 2). Ändern kann das Büro, die Filialleitung sieht die Werte. Gespeichert in `app_settings` (`learn_questions`, `learn_min_correct`), gelesen über `app_flags()` (Migration `0019`). Benni bewertet jede Antwort (`graded`), `mark_step_done` zählt die richtigen seit dem letzten Aufdecken im Chat und lehnt ab, wenn es zu wenige sind; dann „Nochmal versuchen“ mit neuer Zählung. Getestet: 0/3 und 1/3 nicht bestanden, 3/3 bestanden.

### Nachtrag 2026-10-20 nachts — Aufgaben mit Frist, Kundenhistorie, Wissen-Karten, Benni-Layout

- **Aufgaben, zwei Bereiche:** „Für mich“ (neu, Tabelle `todos`, Migration `0018`) und „Studio-Checklisten“ (die bisherigen Vorlagen, jetzt mit „bis“-Zeit je Liste). Einzelne Aufgaben: eigene To-dos (Frist Heute/Morgen/Datum, optional Uhrzeit) oder von Filialleitung/Büro im Backoffice unter Aufgaben → „Aufgabe zuweisen“ an eine Person oder ein ganzes Studio. Abhaken per RPC `todo_done` (zuständige Person, bei Studio-Aufgaben jede im Studio). RLS über `leads_todo()`. Push über `notify` (Schritt 4, nur wenn jemand anderes zuweist, öffnet `/?open=todos`). Auf „Heute“ steht „Für dich“, sobald etwas offen ist. Benni kennt die offenen Aufgaben und legt auf Wunsch eigene To-dos an (`add_todo`). Testkonten heissen in der Auswahl „(Testkonto)“, weil sie Namen echter Kolleginnen tragen.
- **Kundenhistorie:** Schnellwahl „Deine Kundinnen heute“ (aus `my_day`), Detail mit Kontakt (Mobil, Festnetz, E-Mail mit Kopieren/Anrufen), „Angaben aus Phorest“ (Geschlecht, Geburtstag, Adresse, bevorzugt, zuletzt da, erster Besuch, Treuepunkte, offener Betrag, Erinnerungen, Werbe-Einwilligung — nur was gefüllt ist), Kundennotiz (Phorest-Feld `notes`, geht auch in Bennis Zusammenfassung) und „Frag Benni zu …“ direkt unter der Zusammenfassung (ohne gespeicherten Chat). Phorest füllt laut Stichprobe Geschlecht fast immer, PLZ bei knapp der Hälfte, Geburtstag und Notiz selten.
- **Wissen:** Kategorien als Emoji-Karten statt Fotos (Zuordnung `CAT_EMOJI` in `Mobile.tsx`, Rückfall 📄). `wiki_category_covers()` bleibt in der Datenbank, wird aber nicht mehr genutzt.
- **Benni am Desktop:** Chatliste als eigene Spalte bündig an der Navigation (gruppiert Heute/Gestern/Letzte 7 Tage/Älter), Gespräch mittig (max. 760 px), neuer Chat zentriert mit Vorschlägen. Benni scrollt selbst, die Shell scrollt im Benni-Reiter nicht.
- **Aushilfe-Tage im Profil:** Monatskalender (heute bis drei Monate voraus), vergangene Tage grau.
- **Zeitumstellung:** Tage werden jetzt als Kalendertage gezählt (`addDays` in `store.tsx`, `zDay` in `assistant`, `staff_week` in `phorest`). Vorher stand der 25.10. (Ende Sommerzeit) in „Arbeitszeiten · nächste 7 Tage“ doppelt.

### Nachtrag 2026-10-19 kurz vor Mitternacht — Benni mit Chats, Dateien, Diktat, Kundenkarte und Lernmodus

- **Mehrere Chats** (wie ChatGPT): Tabellen `benni_chats` + `benni_messages` (Migration `0017`, nur eigene per RLS). Die Function `assistant` speichert Frage und Antwort selbst, damit eine Antwort auch ankommt, wenn man den Chat wechselt; Chats laufen parallel (Zustand ausserhalb der Komponenten in `src/BenniChat.tsx`). Titel vergibt `gpt-5.4-nano` beim ersten Satz (`TITLE_MODEL`). Löschen mit zweitem Tipp. Am Handy Liste als Schublade („Chats“), am Desktop Spalte links, im Backoffice als Panel (gleiche Komponente, `variant="panel"`).
- **Gesprächsstand:** Benni macht am gespeicherten Stand bei OpenAI weiter (`previous_response_id`, 25 Tage), kennt also Dateien und Werkzeugergebnisse der vorigen Fragen; bei Modellwechsel oder abgelaufenem Stand die letzten 16 Nachrichten als Text.
- **Eingabeleiste:** Dateien und Fotos (Büroklammer, Einfügen, Ziehen; Fotos auf 1600 px verkleinert; PDF, .docx, .xlsx, .pptx gehen direkt als Datei an OpenAI, CSV/TXT als Text; max. 4 Dateien, 10 MB), Modellwahl Schnell `gpt-5.4-mini` / Standard `gpt-5.6-sol` / Gründlich `gpt-6.1-sol` (merkt sich der Browser), Websuche-Schalter (`web_search`; verträgt sich nicht mit dem JSON-Modus, deshalb dann freies JSON aus dem Text), Diktat.
- **Diktat:** neue Function `transcribe`. Während der Aufnahme geht jede Sekunde der Stand an `gpt-4o-mini-transcribe` (Live-Text, nie zwei Anfragen gleichzeitig), beim Fertig-Haken einmal alles an `gpt-4o-transcribe` mit Studio-Wörtern als Hinweis. Pegelanzeige, Abbrechen, max. 3 Minuten. Kein Google-Dienst des Browsers.
- **Kundenkarte:** Benni darf dem Team Telefon und E-Mail von Kundinnen nennen (Aleksa 19.10.). `phorest` → `client_history` liefert dafür `email`/`phone`; setzt Benni `client_card`, zeigt die App Kontakt (Kopieren, Anrufen, Mail), nächste Termine, letzte Besuche, Notizen und „Ganze Historie“ (springt in die Kundenhistorie).
- **Lernmodus:** Lernkarten als eigene Karten, danach „Bereit für eine Kontrollfrage?“ mit Knöpfen „Ja, frag mich“ / „Erst weiterlernen“. Bei der Frage werden die Karten des Abschnitts weichgezeichnet (Funkeln), zwei Fragen je Schritt, danach `reveal` und Abhaken. Antwortmöglichkeiten mischt der Server. Einstieg „Mit Benni lernen“ öffnet einen neuen Chat.
- **Sprechblasen** mit Name, Uhrzeit und Bild (Benni als Standbild der Kugel, `BenniAvatar`, damit nicht jede Nachricht einen WebGL-Kontext braucht).
- `Avatar` und `ContactRow` liegen jetzt in `src/People.tsx`.

### Nachtrag 2026-10-19 nachts — Audit und Korrekturen (Glocke wieder raus, Kalender neu)

- **Glocke entfernt** (Aleksa: bringt nichts, zu viel). Pflicht-News stehen auf Heute als ruhiger Abschnitt „Bitte lesen“ (Messing-Überschrift, Punkt, Liste), ohne Puls und ohne Knopf.
- **Kalender (Menü → Kalender) neu:** Filter Alles / Meine Termine / Schulungen & Events, Punkte für eigene Phorest-Termine im ganzen Monat (neue Aktion `phorest` → `my_month`, ein Abruf je Monat mit `staff_id`-Filter), Schicht beim gewählten Tag, Liste „als Nächstes“ (springt zum Tag), vergangene Events ohne Knöpfe, „Ich komme nicht“ auch nach Anmeldeschluss.
- **Migration `0014_audit_fixes.sql`** (eingespielt): `leads_branch` und `employees_write_filiale` schliessen das Büro aus (Sicherheitslücke: Filialleitung mit Zusatzstudio „buero“ konnte Büro-Konten per REST ändern), `delete_skill()` entfernt einen Skill überall, `register_event` prüft Skill-Zielgruppe und vergangene Events, `report_device` setzt „Mitteilungen an“ aus `push_subscriptions` statt vom zuletzt geöffneten Gerät.
- **Datenschicht:** Skills und Sprache werden wirklich gespeichert (RPC lief vorher ohne `then` nie los), Sprache springt nicht mehr zurück, alle Seiten bei Tabellen über 1000 Zeilen, Neuladen alle 2 Min. und bei Fokus, Zusatzstudios (`extra_branch_ids`) in Zielgruppen/Berechtigungen, Events mit Skill-Zielgruppe nur für Passende, Beispiel-News nicht mehr im Wissen bei ausgeschaltetem Schalter, fehlgeschlagener Upload bricht ab, Zuweisen setzt den Status nicht mehr zurück, Monatsvorlagen am 29.–31. laufen am Monatsletzten.
- **App:** Push-Tipp öffnet News auch bei laufender App (lädt nach), Ticket-Push öffnet die Meldung, Zurück-Geste (Android) geht eine Ebene zurück, Unterseiten öffnen oben, Benni-Verlauf bleibt erhalten, Onboarding aktualisiert nach Benni, Büro sieht geplante News nicht vorab, fremde Haken nicht rückgängig, Wissen ohne Entwürfe, Kundenhistorie mit kommenden Terminen, Kundentermine „Nur ich / Ganzes Team“ mit klaren Leer-Texten, Netzfehler beim Start meldet nicht mehr ab („Erneut versuchen“), Abmelden meldet Push des Geräts ab.
- **Backoffice:** Filialleitung kommt nicht mehr über die Übersicht in Büro-Bereiche, Kennzahlen nur fürs eigene Studio, „ohne Zuweisung“ = ohne Person, Testkonten (`…@aleksa.ai`) zählen nirgends mit, Gruppe „Büro“ hat Reichweite, Vorlagen **bearbeiten** (auch Vorschläge) und **wieder einschalten**, Skill löschen mit Rückfrage, genaue Fehler beim Anlegen (halbe Person wird zurückgerollt), eigenes Konto nicht deaktivierbar, Benni-Chat mit Meldungs-Knopf, Rückfragen beim Beispiel-Schalter und beim Löschen von News.
- **Bewusst offen:** Quiz-Nachweis der Filialleitung für News-Quiz (braucht RPC), Wissens-Medien beim Wechsel der Sichtbarkeit, Personen bearbeiten (Rolle/Studio), Phorest-Zuordnung neu aufbauen (würde die Demo-Zuordnung löschen), Volltextsuche im Wissen, Kategorien EN/FR einheitlich, Aufgaben/Meldungen für Personen mit Zusatzstudio (Studio-Umschalter).

### Nachtrag 2026-10-19 spätabends — Benni deutlich klüger, Arbeitsschritte, Aufgaben, Glocke

- **Benni (`assistant`, neu geschrieben):** Responses-API mit Nachdenken (`reasoning.effort` Standard `low`, Secret `ASSISTANT_REASONING`), Rückfall auf chat/completions ohne Nachdenken, dann Wissensmodus. ⚠️ Die Responses-API verlangt das Wort „JSON“ in den Eingabe-Nachrichten (nicht nur in `instructions`), deshalb eine `developer`-Nachricht vorn. Im Prompt: wer fragt (Rolle, Studio, Skills), Datum/Uhrzeit Zürich, **Lagebild** (offene Pflicht-News, neueste News, Tagesaufgaben des Studios inkl. Nächstes, Events mit eigener Antwort, eigene Meldungen, Onboarding, Aushilfe-Tage), App-Leitfaden, Regeln (erst Werkzeug, dann antworten; nie „kann ich nicht sehen“ ohne Versuch; Kontaktdaten nie weitergeben).
- **Werkzeuge:** `my_day`, `my_week`, `studio_day` (wer arbeitet, freie Zeiten je Person, alle Termine; Mitarbeiterin nur eigenes Studio), `client_history` (jetzt mit kommenden Terminen), `services` (Katalog mit Dauer/Preis CHF/online), `phorest_read` (nur Filialleitung eigenes Studio ohne Umsätze, Büro alles; Nachschlagewerk der geprüften Endpunkte im Werkzeug), `search_knowledge`, `read_article`, `news`, `onboarding_status`, `mark_step_done`.
- **`phorest` neu:** `read {path}` (nur GET, Allowlist branch/client/voucher, Kundenzugriffe protokolliert), `services {q, branch}`, `branch_day` liefert `free` je Spalte, `client_history` liefert `upcoming`. Geprüft am 19.10.: branch, staff, worktimetable, appointment, service, service-category, package, course, product, room, machine, review, client, voucher.
- **Arbeitsschritte sichtbar:** `{stream: true}` liefert NDJSON `{step, detail}` und am Ende `{done: true, …}`. App/Backoffice nutzen `src/BenniChat.tsx` (`askBenni`, `BenniWorking` mit Schimmer-Text und erledigten Schritten, `BenniText` für Listen/fett).
- **Aufgaben-Seite neu:** Fortschritt oben, je Liste „Jeden Tag · 07:45–07:55“ (Regel der Vorlage + Zeitfenster), deutlicher „Erledigt“-Knopf (mit Kamera bei Fotopflicht), „fällig seit“ in Rot, Erklärung unten.
- **Heute:** Pflicht-News als Messing-Karte mit „Lesen“, **Glocke** oben rechts (Pflicht-News, überfällige Aufgaben, Event-Einladungen ohne Antwort, Status/Kommentare eigener Meldungen, neue News, Onboarding). Gesehen-Stand im Browser (`th-bell-v1`).
- Getestet 19.10. lokal (Handy + Desktop) und per Skript mit allen drei Rollen.

### Nachtrag 2026-10-19 nachts — Benni kennt Termine an jedem Tag

- **Vorher:** Den eigenen Tag bekam Benni nur, wenn die Frage bestimmte Stichwörter enthielt (`isShift`), und nur für heute. „Welchen Termin habe ich morgen um 14 Uhr?“ lief ins Leere.
- **Jetzt:** Werkzeuge `my_day {date}` (Schicht + Termine mit `client_id`, 60 Tage zurück/voraus), `my_week` (Arbeitszeiten 7 Tage), `team_day {date, branch}` (nur Filialleitung für das eigene Studio und Büro). Der Systemprompt nennt Datum und Uhrzeit in Zürich, Benni rechnet „morgen“, „Freitag“ selbst um. Anschlussfrage „Worauf muss ich bei ihr achten?“: Benni ruft `my_day` erneut auf und holt mit der `client_id` die Historie. `phorest` → `my_day` liefert dafür `client_id` mit (die App ignoriert das Feld). Ohne KI-Schlüssel bleibt der alte Weg (nur heute).
- Getestet 19.10. mit den Demo-Konten: Termin morgen 14 Uhr mit Kundin, Historie dazu, Arbeitswoche, „heute frei“, Team morgen in Basel 1.

### Nachtrag 2026-10-19 nachts — Testkonten für die Demo 20.10.

- ⚠️ **Beide Testkonten tragen bis nach der Demo Namen, Funktion und Phorest-Spalte zweier echter Kolleginnen aus Basel 1** (Mitarbeiterin = eine Kosmetikerin, Filialleitung = die Respo), damit die Demo aussieht wie im Betrieb. Die Login-Adressen bleiben die Testadressen. Folgen: Die beiden erscheinen in Team-Listen doppelt, und alles, was in der Demo angelegt wird, steht unter ihrem Namen, also nach der Demo löschen.
- **Rückweg nach der Demo:**
  ```sql
  begin;
  update employees set first_name='Test', last_name='Mitarbeiterin', job_title='Kosmetikerin' where email='info+mitarbeiterin@aleksa.ai';
  update employees set first_name='Test', last_name='Filialleitung', job_title='Respo' where email='info+filialleitung@aleksa.ai';
  delete from employee_phorest where employee_id in (select id from employees where email in ('info+mitarbeiterin@aleksa.ai','info+filialleitung@aleksa.ai'));
  commit;
  ```
  Vor dem Pilot die Testkonten ohnehin ganz löschen (Zeile in `employees` + Auth-Konto).

### Nachtrag 2026-10-19 spät nachts — Benni-Kugel, Netlify-Credits

- **Benni hat ein Profilbild:** schwebende Kugel wie die Feleo-Agenten, in Olivtönen (`src/BenniOrb.tsx`, CSS `.benni-orb` in `index.css`). `BMark` rendert sie überall; `working` lässt sie schneller laufen (Chat wartet, News-Entwurf). Commit `deb189e`. **Noch nicht live**, siehe nächster Punkt.
- ⚠️ **Netlify-Credits (Gratis-Plan des Teams „Beautylounge“):** 300 Credits im Monat, jeder Produktions-Deploy kostet 15, also 20 Deploys. Am 19.10. waren es 20 Commits auf main, danach hat Netlify die Produktions-Deploys pausiert. Die Seite bleibt online (Stand Übersetzung, `6b18994`). Weiter geht es erst nach einem Upgrade oder mit dem neuen Abrechnungszeitraum; dann einmal neu pushen oder in Netlify „Trigger deploy“.
- **Gegenmassnahmen:** `netlify.toml` → `ignore` baut nur, wenn sich `src`, `public`, `index.html`, `package*.json`, `vite.config.ts`, `tsconfig*` oder `netlify.toml` ändern. Doku (`*.md`), `supabase/` (Functions/Migrationen gehen per CLI) und `scripts/` lösen keinen Deploy mehr aus. **Pushes bündeln:** ein Push je fertigem Arbeitsblock, Doku im selben Commit wie der Code, keine Zwischenstände auf main.

### Nachtrag 2026-10-19 spät nachts — Inhalte automatisch auf EN/FR

- **Function `translate`:** `sync` übersetzt kurze Felder (News, Aufgaben-Vorlagen und -Punkte, Onboarding, Events, Quiz-Titel und -Fragen, im Wissen Titel/Kategorie/Kurzfassung) und legt sie je Zeile in `i18n = {h, EN, FR}` ab (Migration 0013). `h` ist der Hash der deutschen Felder: übersetzt wird nur, was neu oder geändert ist. Läuft per Cron `teamhub-translate` alle 10 Min. (Secret wie `teamhub-notify`) und sofort nach jedem Speichern im Backoffice (`retranslate()`). Quiz-Lösungen und `rubric` gehen nie an die Übersetzung.
- **Volltexte im Wissen:** `article {id, lang}` übersetzt erst beim ersten Öffnen auf EN/FR (~10 s), danach aus dem Cache `i18n.full_EN/full_FR` (~1 s). Ändert sich `RULES` in der Function, `RULES_V` hochzählen, dann werden alle Volltexte beim nächsten Öffnen neu übersetzt.
- **Regeln:** Team wird geduzt, Kundinnen in Skripten gesiezt (FR vous); Eigen-, Studio-, Produkt- und Behandlungsnamen bleiben.
- **App:** `tx()` im Store wählt die Sprache des Profils, Rückfall Deutsch. News und Wissen haben den Umschalter „Automatisch übersetzt · Original“ (im Original auch Titel und Kurzfassung deutsch). Getestet auf FR mit der Test-Mitarbeiterin (Heute, Aufgaben, Pflicht-News, Quiz, Wissen).

### Nachtrag 2026-10-19 nachts — KI-Funktionen (OpenAI-Schlüssel von Aleksa als Secret `OPENAI_API_KEY`)

- **Modell:** `gpt-5.6-sol` (Standard in `_shared/openai.ts`, überschreibbar mit Secret `AI_MODEL`/`ASSISTANT_MODEL`; Bilder `gpt-image-2.5-sunburst`, Secret `IMAGE_MODEL`). Liste der freigeschalteten Modelle: `assistant` mit `{action:"models"}` (nur Büro).
- **Benni (Function `assistant`) mit Werkzeugen:** `client_history` (Kundin suchen, bei mehreren Treffern nachfragen), `onboarding_status` + `read_article` + `mark_step_done` (Lernbegleiter: kurzes Häppchen, Kontrollfrage, bei richtiger Antwort Schritt erledigt; Schritte ohne Artikel bekommen den passendsten Wiki-Artikel). ⚠️ Werkzeuge gehen in `chat/completions` nur mit `reasoning_effort: 'none'`. Fällt die KI aus, antwortet Benni im Wissensmodus und gibt `reason` mit.
- **Quiz:** Function `quiz` wertet aus (ersetzt `submit_quiz` im Browser), Freitext-Fragen bewertet die KI gegen die Vorgabe (`rubric`) mit einem Satz Rückmeldung. Editor kann „Freitext“. Beispiel-Quiz hat jetzt eine Freitext-Frage.
- **News-Entwurf (Function `newsdraft`, nur Büro):** Stichworte → Titel, Kurzfassung, Text; Bild auf Wunsch (Storage `media/news/…`, Spalte `news.image_path`, Migration 0011). App zeigt das Bild in der News.
- **Kundenhistorie:** `phorest` Aktionen `client_search` und `client_history` (12 Monate, alle Studios, Termin-Notizen, Namen der Behandelnden aus Phorest, auf Wunsch KI-Zusammenfassung; Kontaktdaten gehen nicht ans Modell). Jeder Zugriff landet in `client_lookups` (Migration 0012, lesbar nur Büro). App: Menü → Kundenhistorie.
- **Behoben (0011):** Seit 0005 konnten Fotos zu Meldungen und Aufgaben-Nachweisen nur von der Absenderin geladen werden; `files_read` wieder vollständig, Meldungsfotos an die Ticket-Rechte gekoppelt.
- **Offen:** Wiki-Aufräumen (Liste von Renée), Timebutler (Firmen-Token von Beautylounge).

### Nachtrag 2026-10-19 spät — Quiz (E-Learning)

- **Migration `0010_quiz.sql`** (eingespielt): `quizzes` (je News ODER Wissensartikel, `pass_pct` Standard 80), `quiz_questions` (single/multi/text, Lösungen nur fürs Büro lesbar), `quiz_attempts` (Nachweis je Person). RPCs `quiz_for_me()` (Fragen ohne Lösung), `submit_quiz()` (wertet serverseitig aus; bestanden + News → `news_reads.confirmed_at`), `confirm_news()` verlangt bei News mit Quiz ein bestandenes Quiz (`quiz_first`), `open_news()` prüft jetzt `news_for_me()`.
- **App:** `src/QuizRunner.tsx` unter News und Artikeln — Fragen, Auswerten, Ergebnis je Frage richtig/falsch (Lösung wird nicht verraten), nochmal versuchen. Eine Pflicht-News mit Quiz bleibt auf „Heute“, bis das Quiz bestanden ist.
- **Backoffice „Lernen“** (Büro bearbeitet, Filialleitung sieht ihr Studio): Liste mit „x von y bestanden“, Editor (Eine/Mehrere richtig, Antworten markieren), Nachweis je Person mit Datum oder bestem Ergebnis.
- Beispiel-Quiz (3 Fragen) zur Beispiel-Pflicht-News „Neue Hygienerichtlinie“, verschwindet mit dem Beispiel-Schalter.
- **Freitext-Fragen mit KI-Bewertung fehlen noch** (Spalte `rubric` ist da, `submit_quiz` zählt `text` noch nicht): sobald der OpenAI-Schlüssel da ist.
- Getestet 19.10.: Lösungen per REST nicht lesbar, Bestätigen ohne Quiz abgelehnt, 67 % nicht bestanden, 100 % bestanden und bestätigt, Editor speichert. Testversuche gelöscht.

### Nachtrag 2026-10-19 abends — Ausbau nach Update-Meeting 25.09.

- **Migration `0009_ausbau_oktober.sql`** (eingespielt): `app_flags()` + `app_settings.demo_data`, `job_groups(title)` (Filialleitung, Kosmetikerinnen, Lernende, Büro aus `job_title`), News-Spalten `audience_groups/_skills/_people` + `news_for_me()` in der RLS, Ideen fürs ganze Team sichtbar (Meldungen weiter nur Meldende + Leitung), Filialleitung darf Meldungen ihres Studios bearbeiten, `tickets.media_kind` (Foto/Video), Tabellen `ticket_comments`, `ticket_votes` (nur Ideen), `standby_days` (Pikett), `event_registrations.coming` + RPC `decline_event`, `event_counts` zählt nur Zusagen.
- **Beispielinhalte-Schalter** im Backoffice unter Studios (gilt für alle, löscht nichts; Filter clientseitig über `is_sample`). Steht auf an.
- **News-Zielgruppe:** Studios, Gruppen, Skills (Schnittmenge) oder einzelne Personen (dann nur diese), Live-Zähler. `notify` nutzt dieselbe Regel.
- **Melden & Ideen:** Foto oder Video, Kommentare (Verlauf), Unterstützen bei Ideen, Filter offen/erledigt, Detailansicht in App und Backoffice (`src/TicketParts.tsx`).
- **Profil:** Arbeitszeiten der Woche aus Phorest (neue Aktion `staff_week`, sieben Tagesabfragen, weil Phorest bei Datumsbereich nur einen Eintrag liefert), Anrufen-Knopf, eigene Aushilfe-Tage (8 Wochen).
- **Backoffice „Aushilfe“** (Büro + Filialleitung): Tag wählen, Skills filtern, Telefonnummer, Rangliste eingetragener Tage (60 Tage).
- **Events:** „Ich komme“ / „Ich komme nicht“, Backoffice zeigt Zusagen, Absagen, noch keine Antwort; Erinnerungsmails nur an Zusagen.
- Alles am 19.10. lokal mit Test-Mitarbeiterin und Büro durchgeklickt, Rechte per REST geprüft (News an eine Person sieht nur sie). Testdaten wieder gelöscht.
- **Offen aus Teil 2:** Wiki-Aufräumen (Liste von Renée), Benni entwirft News, Kundenhistorie, Lernbegleiter (alle drei brauchen den OpenAI-Schlüssel bzw. Bennis Anbindung). Danach Quiz.
- **Timebutler (Recherche 19.10.):** API v1 mit Firmen-Token (Admin) liest Nutzer, Abwesenheiten, Resturlaub, Arbeitszeit und kann für jede Person stempeln; API v2 nur persönliche Tokens; keine Webhooks, kein OAuth-Plugin. Empfehlung: v1-Token als Supabase-Secret.

### Nachtrag 2026-10-19

- **Design System (Aleksas Wahl 19.10.):** Olive #495940 / Stein #F5F5F2 / Messing #B08A52 nur für „heute wichtig“, Jost (Titel, Rubriken gesperrt) + Albert Sans (Text), Titel nie fett. Handy Variante B (weisse Gruppen auf Stein, Schicht auf Olive 800), Seitenleisten dunkel Olive mit Logo (`src/Logo.tsx`), Benni als Monogramm statt Funkel-Icon, Status als Punkt + Wort, Kennzahlen ohne Kacheln, Menü als Liste. Tokens in `src/index.css` (alte `sage-*`-Namen zeigen auf die neuen Werte). Referenzseite mit Befund: claude-team `ai-team/assets/beautylounge-teamhub/design-system/index.html`. Backoffice-Unterseiten (News, Aufgaben, Meldungen, Schulungen, Team, Studios, Wissen, Benni-Seitenleiste) ebenfalls überarbeitet: flache Tabellen (`.tbl`), Formulare und Vorschläge als `Panel` auf Stein, Detailspalten als `Side` mit Linie, Rubriken `Sec`, Erklärsätze entfernt. Anmeldung am Desktop mit Studio-Foto `public/login-studio.webp` (Nagelplätze, von Aleksa am 19.10.; weitere Fotos in claude-team `ai-team/assets/beautylounge-teamhub/fotos/`).
- **Live:** `https://teamhub.beautylounge.ch` ist öffentlich, Login per Code dort getestet (Test-Filialleitung). Supabase-URL, Anon-Key und VAPID-Public-Key stehen seit `ad3fb25` als Standard im Code (alle öffentlich), Netlify-Variablen sind dafür nicht mehr nötig. **Kein Handyrahmen mehr** (`useDesktop` in `App.tsx`, Grenze 768 px): am Desktop Mitarbeiterin-App mit Seitenleiste und Inhalt in 760 px Breite, Büro/Filialleitung starten im Backoffice (vollflächig) und wechseln über die Seitenleiste; am Handy immer die App mit Leiste unten, kein Backoffice. Login am Desktop als Karte.
- **Testkonten für die Demo-Übung:** `info+mitarbeiterin@aleksa.ai` (Rolle Mitarbeiterin) und `info+filialleitung@aleksa.ai` (Rolle Filialleitung), beide Studio Basel 1, Name „Test …“. Codes landen per Plus-Adresse im Postfach info@aleksa.ai (geprüft). Test-Mitarbeiterin hängt in `employee_phorest` an der Spalte einer echten Kollegin in Basel 1, „Mein Tag“ zeigt damit echte Termine. ⚠️ Ein `sync_staff` löscht diese Zeile wieder. Test-Filialleitung ohne Phorest-Spalte. ⚠️ **Vor dem Pilot löschen** (Zeile in `employees` + Auth-Konto), sonst zählen sie in Listen und Startbereitschaft mit.

### Nachtrag 2026-10-09

- **Netlify verbunden (Matteo, 08.10.):** Projekt `beautyloungeteamhub`, Site-ID `832aed21-21a5-4615-a0c4-e21411bffe11`, erster Deploy von `main` auf `beautyloungeteamhub.netlify.app`, Zugriff noch „Private“ (401). Aleksa hat `teamhub.beautylounge.ch` in Netlify eingetragen, Status „Pending External DNS verification“.
- **DNS (am 09.10. geprüft):** `teamhub` hat bei Cyon noch A `149.126.4.74` + AAAA `2a01:ab20:0:4::74` (Shared Hosting, 404, selbst signiertes Zertifikat). Matteo soll beide löschen und CNAME `teamhub` → `beautyloungeteamhub.netlify.app` anlegen. Resend-Einträge (`resend._domainkey.teamhub`, `send.teamhub` MX/SPF) bleiben, sie sind davon nicht betroffen. Mail an Matteo als Entwurf bei Aleksa.
- **Noch offen fürs Hosting:** Netlify-Env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`; „Private“ erst zum Start lösen; danach Supabase Auth Site-/Redirect-URL auf `https://teamhub.beautylounge.ch` und Login-Code an info@aleksa.ai testen.
- **Railway „Trial Plan Alert“ (08.10., von Matteo weitergeleitet):** Projekt „Teamhub Beautylounge“ seit 09.09. (Workspace „beautyloungeag's Projects“), darin `benni-agent`, `benni-quality`, `Teamhub`. Anhang nicht maschinell lesbar, Plan mit Projekt-Token nicht abfragbar. Empfehlung an Beautylounge: Hobby-Plan, sonst stoppt Benni.

### Nachtrag 2026-10-07

- **Mailversand** (BLTH-20/23/34): Function `mailer` (Resend) + Cron `teamhub-mailer` alle 5 Min (gleicher `x-notify-secret` wie notify). Facility-Meldungen (Art „Meldung“) an `branches.facility_email` oder `app_settings.facility_email`, Einladungen zu neuen Events an die Zielgruppe, Erinnerung `event_reminder_days` vorher an Angemeldete, je Sprache. **Doppelt gesperrt:** Secret `RESEND_API_KEY` fehlt noch UND `app_settings.mail_enabled` = false; Schalter im Backoffice unter Studios (nur mit Schlüssel aktiv). Beim Einschalten wird nichts Altes nachgeschickt (Meldungen > 24 h, Events > 48 h gelten als übersprungen). Protokoll `mail_log`, im Backoffice sichtbar. Migration `0008_mailversand.sql`. Optional `MAIL_FROM`, `APP_URL` als Secrets.
- **Resend live (07.10.):** Schlüssel aus dem PM-Tool (Account „resend_api“) als Secret `RESEND_API_KEY` + `MAIL_FROM`, Auth-SMTP auf `smtp.resend.com`, deutsche Code-Mail aktiv. Domain nach DKIM-Korrektur durch Matteo bestätigt. Testaktionen der Function `mailer` (nur Büro, gehen nur an die eigene Adresse, unabhängig vom Schalter): `test_facility` (jüngste eigene Meldung inkl. Foto-Link), `test_invite` (`event_id`), `test_error` (ungültige Adresse → Fehler im Protokoll). Am 07.10. alle drei an info@aleksa.ai getestet, Testdaten gelöscht.
- **Hosting (Stand 07.10. abends):** Aleksa ist im Beautylounge-Netlify eingeloggt (Login im PM-Tool „Netlify“), sieht dort aber die GitHub-Org `beautyloungeag` nicht: er ist nur externer Collaborator am Repo, kein Org-Mitglied, deshalb kann er die Netlify-GitHub-App weder installieren noch anfragen. Matteo (Org-Owner) wurde per Mail gebeten, die App unter github.com/apps/netlify/installations/new nur für `Teamhub` zu installieren oder Aleksa in die Org einzuladen. Danach: Site anlegen, Env `VITE_SUPABASE_URL/ANON_KEY/VAPID_PUBLIC_KEY`, Auth-Site-URL prüfen. Repo privat = PM-Aufgabe BLTH-57. Fallback ohne GitHub: Netlify Personal Access Token → Deploy per API.
- **PM-Stand 07.10.:** keine überfälligen Aufgaben mehr; BLTH-4/14/22/23 erledigt, Wochenstatus-Aufgaben 40–45 gelöscht (Aleksa schickt keinen). Was nur Renée entscheiden kann, ist auf die Demo 09.10. gelegt, Agenda in BLTH-29. ⚠️ Renée und Matteo sehen alle PM-Docs des Projekts — Entwürfe erst nach Aleksas Freigabe dort ablegen.
- **Code-Mail-Vorlage** `supabase/templates/anmeldecode.html`: Supabase lehnt eigene Vorlagen im Gratis-Tarif ohne eigenes SMTP ab → zusammen mit Resend-SMTP setzen (`PATCH /config/auth` `mailer_templates_magic_link_content`, Betreff „Dein TeamHub-Code: {{ .Token }}“).
- **Zeit & Ferien / Posteingang:** direkte Zugänge zu Timebutler (App/Browser) und Cyon-Webmail. Einbetten verbieten alle drei Dienste (Header geprüft), Details im PM-Doc „Anmeldung, Einbettung und Schnittstellen“.
- **PM-Docs neu:** Betrieb/Konten (§ 5.1), Wiki-Format (Vorschlag), Inhalte/Lücken/Terminfolgen (§ 2.3), Anmeldung/Einbettung. Renée und Matteo sehen die Projekt-Docs.

### Nachtrag 2026-10-05

- **Studios im Backoffice** (Reiter „Studios“, nur Büro): anlegen, umbenennen, Reihenfolge, Phorest-Filial-ID, löschen nur ohne Personen/Verweise. Büro bleibt unten. Rechte über die bestehende RLS `branches_write`.
- **Oberfläche DE/EN/FR** (BLTH-26, Teil Oberfläche): `src/lib/i18n/` — Schlüssel = deutscher Text, Werte `[EN, FR]`, Dateien je Bereich (`common`, `mobile`, `calendar`, `login`). `t()` aus `useApp()`, ausserhalb von Komponenten `tr()`. Gleiches Wort, andere Bedeutung: `'Anmelden|event'`. Platzhalter `{n}`. Prüfen: `node scripts/check_i18n.mjs`. Sprache vor dem Login = zuletzt gewählt bzw. Gerätesprache, danach Profil (`employees.lang`). Übersetzt: Mitarbeiterinnen-App, Login, Kalender, Push-Rahmentexte (Function `notify` bündelt je Sprache). **Bewusst Deutsch:** Backoffice (Büro/Filialleitung) und alle Inhalte aus der Datenbank (News, Wissen, Aufgaben, Skills) — die Inhaltsübersetzung ist der zweite Teil von BLTH-26.
- **Hosting vorbereitet:** `netlify.toml` (SPA-Weiterleitung, `sw.js` ohne Cache). Nicht deployt: Der Netlify-Connector dieser Maschine ist an ein fremdes Konto angemeldet. Beim Einrichten: Env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`; in Supabase Auth die neue Adresse als Site-/Redirect-URL eintragen.

### Nachtrag 2026-09-29

- **Push-Mitteilungen (BLTH-27, Commit 160c889):** Function `notify` (News bei `publish_at`, neue Events an Zielgruppe, Meldungs-Status an Meldende; `notified_at` wird vor dem Senden gesetzt). Cron `teamhub-notify` alle 2 Min mit Header `x-notify-secret`; Backoffice ruft `notifyNow` direkt nach Veröffentlichen. Secrets `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`, `NOTIFY_SECRET`; `VITE_VAPID_PUBLIC_KEY` in `.env`. Tabelle `push_subscriptions`, `employees.app_installed_at/push_enabled/last_seen_at` (RPC `report_device`). App: Installationsanleitung im Onboarding + Screen `install`, Push-Schalter mit Probe im Profil, Startbereitschaft je Studio im Backoffice. Serverseitig verifiziert; **echtes Gerät erst mit https-Hosting** (iOS nur als Home-Bildschirm-App).
- **Abnahme (BLTH-28):** PM-Doc „Abnahmeprüfung MVP (28.09.2026)“ — 7 erfüllt / 5 teilweise / 3 offen, Blocker nach Schwere.

### Was wurde in dieser Session gemacht (2026-09-28)

- **Prototyp übernommen** (Renée am 25.09. sehr zufrieden) und auf echte Daten umgestellt. Frische Git-Historie nur mit Beispieldaten; der alte Stand mit echten Namen liegt **nur lokal** im Branch `prototyp-echtdaten` (nie pushen).
- **Login + Rollen (BLTH-14):** Supabase-OTP, Selbstregistrierung aus, 50 Mitarbeiterinnen aus der MA-Liste + `info@aleksa.ai` (Büro-Testkonto) importiert, Auth-Konten still angelegt (keine Mail an Mitarbeiterinnen verschickt — belegt). Rollen `mitarbeiterin` / `filialleitung` (Respo, Stv.R) / `buero`, RLS je Rolle getestet.
- **Module (BLTH-15/16/17/19/21/23/25):** Profile+Skills, News (Zielgruppe, Zeitplan, Bestätigen erst nach Öffnen, News→Wissen), Tagesaufgaben (Vorlagen, Nachweis Person/Zeit/Foto), Meldungen & Ideen (Verlauf automatisch), Schulungen (Frist, Kapazität), Mein Tag + Kundentermine live aus Phorest, KI-Reiter.
- **Bisheriges Wiki importiert:** `beautyloungeag/wiki.beautylounge.ch` (Statamic) → 180 Artikel, 363 Bilder, 58 PDFs, 80 YouTube, Zugriffsstufen übernommen. KI-Reiter mit IDF-Ranking: 7/7 Testfragen.
- **Vorschläge aus dem Wiki (warten auf Renée):** 5 Aufgaben-Vorlagen (Kassenabschluss, Wochenreinigung ×3, Putzdienstplan) + Onboarding mit 12 Artikeln — Freigabe im Backoffice. Glossar-Entwurf (49 Begriffe DE/EN/FR) als PM-Doc.
- PM-Tool: BLTH-7, 15, 16, 17, 19, 21, 25 erledigt; Stand/Offenes an den übrigen Aufgaben notiert.

## Zugänge

- **Supabase** „Teamhub“ `vdekbelklbctqwucibzn` (eu-central-2, Beautylounge-Org, Free-Tier) — erreichbar mit `~/.supabase/access-token` (Aleksa ist Org-Owner). Anon-/Service-Key per Management API `…/api-keys`.
- **GitHub:** `beautyloungeag/Teamhub` und `beautyloungeag/wiki.beautylounge.ch` — **nur per SSH** (`git@github.com:…`). Der Keychain-PAT ist fine-grained und sieht die Kunden-Repos nicht (HTTPS 403, API „Not Found“).
- **Phorest:** Basic-Auth aus Ellas Tool-Secret (aleksa-ai-app, `chat_agent_tool_secrets` für `find_client`) → als Supabase-Secrets `PHOREST_AUTH`, `PHOREST_BUSINESS_ID` gesetzt.
- Lokal: `.env` mit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (gitignored), Preview `teamhub` (Port 5190) in claude-team `.claude/launch.json`.

## Architektur

- Vite + React + TS + Tailwind, `src/store.tsx` = Datenschicht (lädt alles je Rolle per RLS, Wissen nur als Liste; Artikelinhalt beim Öffnen).
- Migrationen `supabase/migrations/0001–0008` (Login/Rollen, Module, Beispielinhalte `is_sample`, Phorest-Mapping, Wiki-Import, Wiki-Vorschläge, Mitteilungen, Mailversand).
- Functions (alle `--no-verify-jwt`, prüfen selbst per `current_employee`): `phorest` (my_day, branch_day, team_today, sync_staff), `assistant` (KI-Reiter), `admin-employee` (Person anlegen/deaktivieren), `notify` (Push, Cron + Secret oder angemeldet; `action:test` = Probe an sich selbst).
- Wiki-Import: `scripts/import_wiki.py <wiki-klon>` — wiederholbar, `--no-media` / `--dry`. Medien in `media/wiki/<alle|filialleitung|buero>/…`, Storage-Policy je Stufe.

## Offen / Blocker

1. **Resend-API-Schlüssel** (Beautylounge-Resend, Domain `teamhub.beautylounge.ch`) → eigene SMTP in Supabase. Ohne: Supabase mailt nur an Org-Mitglieder, nur Link statt Code, und der Link wird vom Microsoft-Mailscanner vorab verbraucht. Blockiert Login für alle + Schulungs-Erinnerungen.
2. **Repo privat stellen** (Renée/Matteo, Admin-Recht).
3. **Hosting:** Netlify auf Beautylounge-Konto + Cyon-DNS `teamhub.beautylounge.ch`.
4. **Renée bestätigen:** Wiki-Stand (letzter Commit 29.09.2025), Stufen-Zuordnung (L1 alle / L2 FL+Büro / L3 Büro), Muster-Darstellung (BLTH-8/18), Vorschläge freigeben, Glossar, Name KI „Benni“ vs. Vertrag „Marc Beau“, neue Wünsche (Phorest-Performancetool, Umfragen).
5. **OpenAI-Key** (Beautylounge) für frei formulierende KI; bis dahin Wissensmodus.
6. Nicht gebaut: persönlicher Posteingang in TeamHub (BLTH-24, braucht Entscheidung: IMAP nur mit gespeichertem Postfach-Passwort), Übersetzung der Inhalte (BLTH-26 Teil 2). Facility-/Event-Mails gebaut, aber gesperrt bis Resend.
7. Termine: Vertrag sah Demo 28.09./Pilot 29.09. vor — neue Termine mit Renée schriftlich (§ 2.3).

## Testen ohne echte Konten

Admin-OTP: `POST /auth/v1/admin/generate_link {type:magiclink,email:info@aleksa.ai}` → `email_otp` in der App bei „Ich habe schon einen Code“ eingeben. Für die Mitarbeiterinnen-Sicht das Testkonto kurz auf `mitarbeiterin`/Filiale setzen und danach zurück auf `buero`/`buero`. Nie echte Konten imitieren; Testdaten danach löschen.
