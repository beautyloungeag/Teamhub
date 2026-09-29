# HANDOFF — Beautylounge TeamHub

Interne Mitarbeiter-App (PWA + Desktop-Backoffice) der Beautylounge AG. Kundin: Renée Baumann. PM-Projekt: `projekt.aleksa.ai`, Key **BLTH** (`d4ee5d5c-4553-436c-bba7-137a03a2b704`). ⚠️ Das Repo `beautyloungeag/Teamhub` ist **öffentlich** — nie Personendaten committen.

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
- Migrationen `supabase/migrations/0001–0007` (Login/Rollen, Module, Beispielinhalte `is_sample`, Phorest-Mapping, Wiki-Import, Wiki-Vorschläge, Mitteilungen).
- Functions (alle `--no-verify-jwt`, prüfen selbst per `current_employee`): `phorest` (my_day, branch_day, team_today, sync_staff), `assistant` (KI-Reiter), `admin-employee` (Person anlegen/deaktivieren), `notify` (Push, Cron + Secret oder angemeldet; `action:test` = Probe an sich selbst).
- Wiki-Import: `scripts/import_wiki.py <wiki-klon>` — wiederholbar, `--no-media` / `--dry`. Medien in `media/wiki/<alle|filialleitung|buero>/…`, Storage-Policy je Stufe.

## Offen / Blocker

1. **Resend-API-Schlüssel** (Beautylounge-Resend, Domain `teamhub.beautylounge.ch`) → eigene SMTP in Supabase. Ohne: Supabase mailt nur an Org-Mitglieder, nur Link statt Code, und der Link wird vom Microsoft-Mailscanner vorab verbraucht. Blockiert Login für alle + Schulungs-Erinnerungen.
2. **Repo privat stellen** (Renée/Matteo, Admin-Recht).
3. **Hosting:** Netlify auf Beautylounge-Konto + Cyon-DNS `teamhub.beautylounge.ch`.
4. **Renée bestätigen:** Wiki-Stand (letzter Commit 29.09.2025), Stufen-Zuordnung (L1 alle / L2 FL+Büro / L3 Büro), Muster-Darstellung (BLTH-8/18), Vorschläge freigeben, Glossar, Name KI „Benni“ vs. Vertrag „Marc Beau“, neue Wünsche (Phorest-Performancetool, Umfragen).
5. **OpenAI-Key** (Beautylounge) für frei formulierende KI; bis dahin Wissensmodus.
6. Nicht gebaut: Timebutler (BLTH-22), Postfach (BLTH-24), Facility-Mail (BLTH-20), Studios im Backoffice anlegen, DE/EN/FR-Übersetzung.
7. Termine: Vertrag sah Demo 28.09./Pilot 29.09. vor — neue Termine mit Renée schriftlich (§ 2.3).

## Testen ohne echte Konten

Admin-OTP: `POST /auth/v1/admin/generate_link {type:magiclink,email:info@aleksa.ai}` → `email_otp` in der App bei „Ich habe schon einen Code“ eingeben. Für die Mitarbeiterinnen-Sicht das Testkonto kurz auf `mitarbeiterin`/Filiale setzen und danach zurück auf `buero`/`buero`. Nie echte Konten imitieren; Testdaten danach löschen.
