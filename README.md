# Beautylounge TeamHub

Interne Mitarbeiter-App (PWA) der Beautylounge AG. Aktueller Stand: klickbarer Prototyp aus der Layout-Abstimmung (BLTH-7), alle Inhalte sind Beispieldaten.

- Stack: Vite, React, TypeScript, Tailwind
- Backend: Supabase-Projekt „Teamhub“ (`vdekbelklbctqwucibzn`, Beautylounge-Konto) — Client in `src/lib/supabase.ts`
- Lokal: `cp .env.example .env`, Anon Key eintragen, dann `npm install && npm run dev`

Personenbezogene Daten (Mitarbeiterliste, Phorest-Termine) gehören in Supabase, nie ins Repo.
