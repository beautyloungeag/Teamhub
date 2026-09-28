# CLAUDE.md — Beautylounge TeamHub

Interne Mitarbeiter-App der Beautylounge AG (6 Studios + Büro, ~50 Personen). Einstieg immer über `HANDOFF.md`.

- ⚠️ `beautyloungeag/Teamhub` ist öffentlich: keine echten Namen, Mails, Kundendaten im Code. Echte Daten gehören in Supabase.
- Push nur per SSH (`git@github.com:beautyloungeag/Teamhub.git`).
- Supabase `vdekbelklbctqwucibzn`, PAT `~/.supabase/access-token`. Functions immer `--no-verify-jwt` deployen (sie prüfen selbst).
- Rechte liegen in der Datenbank (RLS, Rollen `mitarbeiterin` / `filialleitung` / `buero`), nicht nur in der Oberfläche. Neue Tabellen: RLS mit `to authenticated` + Rollenfunktionen aus Migration 0001/0002.
- Phorest nur lesend über die Function `phorest`.
- Keine Mails an Mitarbeiterinnen vor dem Pilot. Konten still anlegen (`admin-employee`, `email_confirm`).
- Beispielinhalte tragen `is_sample = true`.
