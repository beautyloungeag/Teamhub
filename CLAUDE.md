# CLAUDE.md — Beautylounge TeamHub

Interne Mitarbeiter-App der Beautylounge AG (6 Studios + Büro, ~50 Personen). Einstieg immer über `HANDOFF.md`.

- Aktueller Stand 2026-10-26: kontrollierter Pilot technisch freigegeben, Reviewer-Zugänge vorbereitet und Zugangsmail laut Owner gesendet. Übriges Pilotteam erst auf neue Anweisung einladen. Aktuelle Rechte-/Realtime-Verträge in `docs/PILOT-AUTHORIZATION.md`; echte Testidentitäten, IDs und Mailrouting ausschliesslich im privaten Team-Workspace dokumentieren.

- ⚠️ `beautyloungeag/Teamhub` ist öffentlich: keine echten Namen, Mails, Kundendaten im Code. Echte Daten gehören in Supabase.
- Push nur per SSH (`git@github.com:beautyloungeag/Teamhub.git`).
- Supabase `vdekbelklbctqwucibzn`, PAT `~/.supabase/access-token`. Functions immer `--no-verify-jwt` deployen (sie prüfen selbst).
- Rechte liegen in der Datenbank (RLS, Rollen `mitarbeiterin` / `filialleitung` / `buero`), nicht nur in der Oberfläche. Neue Tabellen: RLS mit `to authenticated` + Rollenfunktionen aus Migration 0001/0002.
- Phorest-Kundentermine weiterhin nur lesend über `phorest`. Ausnahme auf ausdrücklichen Ownerauftrag 23.10.: `phorest-events` schreibt opt-in interne Kalendersperren für bestätigte Schulungs-/Meeting-Teilnahmen; keine Kundenbuchungen. Regeln/Tests: `PILOT-FEATURES.md`.
- Keine Mails an Mitarbeiterinnen vor dem Pilot. Konten still anlegen (`admin-employee`, `email_confirm`).
- Beispielinhalte tragen `is_sample = true`.
