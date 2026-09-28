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
- `supabase/functions/admin-employee` — Büro legt Personen an / deaktiviert (ohne Einladungsmail)
- Deploy: `npx supabase functions deploy <name> --no-verify-jwt --project-ref vdekbelklbctqwucibzn`
