# HANDOFF — Beautylounge TeamHub

Interne Mitarbeiter-App (PWA + Desktop-Backoffice) der Beautylounge AG. Kundin: Renée Baumann. PM-Projekt: `projekt.aleksa.ai`, Key **BLTH** (`d4ee5d5c-4553-436c-bba7-137a03a2b704`). ⚠️ Das Repo `beautyloungeag/Teamhub` ist **öffentlich** — nie Personendaten committen.

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
