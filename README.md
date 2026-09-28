# Beautylounge TeamHub

Interne Mitarbeiter-App (PWA) der Beautylounge AG. Aktueller Stand: klickbarer Prototyp aus der Layout-Abstimmung (BLTH-7), alle Inhalte sind Beispieldaten.

- Stack: Vite, React, TypeScript, Tailwind
- Backend: Supabase-Projekt „Teamhub“ (`vdekbelklbctqwucibzn`, Beautylounge-Konto) — Client in `src/lib/supabase.ts`
- Lokal: `cp .env.example .env`, Anon Key eintragen, dann `npm install && npm run dev`

Personenbezogene Daten (Mitarbeiterliste, Phorest-Termine) gehören in Supabase, nie ins Repo.

## Aufbau (Stand 28.09.2026)

- `supabase/migrations/` — 0001 Login/Rollen, 0002 Module (News, Aufgaben, Meldungen, Schulungen, Wissen, Onboarding, Skills, Dateien), 0003 Beispielinhalte (`is_sample = true`, löschen sobald echte Inhalte da sind), 0004 Phorest-Zuordnung
- `supabase/functions/phorest` — Phorest nur lesend: `my_day`, `branch_day`, `team_today`, `sync_staff` (Zuordnung per Firmen-Mail). Secrets `PHOREST_AUTH`, `PHOREST_BUSINESS_ID`
- `supabase/functions/assistant` — KI-Reiter: antwortet aus freigegebenem Wissen und dem eigenen Tag, schlägt Meldungen vor. Mit Secret `OPENAI_API_KEY` als Sprachmodell, ohne ihn nur aus dem Wissen
- `supabase/functions/notify` — Push-Mitteilungen (Web Push, VAPID): News bei Veröffentlichung (auch zeitgesteuert), neue Schulungen an die Zielgruppe, Statuswechsel an die Meldende. Läuft alle 2 Min per pg_cron (`teamhub-notify`, Geheimnis `NOTIFY_SECRET`) und direkt nach Veröffentlichen. Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; Frontend braucht `VITE_VAPID_PUBLIC_KEY`
- `supabase/functions/admin-employee` — Büro legt Personen an / deaktiviert (ohne Einladungsmail)
- `scripts/import_wiki.py` — übernimmt das bisherige Wiki (Statamic, `beautyloungeag/wiki.beautylounge.ch`, per SSH klonen) mit Bildern (verkleinert, WebP), YouTube und PDFs. Zugriffsstufen: Level 1 → alle, Level 2 → Filialleitung + Büro, Level 3/Superuser/ohne → Büro. Erneut ausführbar (`--no-media` nur Texte, `--dry` Probelauf)
- Deploy: `npx supabase functions deploy <name> --no-verify-jwt --project-ref vdekbelklbctqwucibzn`
