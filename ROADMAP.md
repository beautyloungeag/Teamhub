# Privacy follow-up – 2026-10-23

- Confirmed customer settings applied: Facility routing active independently of event invitations, exact-report links, checklist drafts individually reviewable, verified Academy course links by audience. No user creation/invitations. API/video/progress sync is not part of the current link integration. See `FACILITY-ACADEMY.md`.

- Pilot follow-up implemented: demo cleanup, three real linked quizzes, corrected progress accounting, role-consistent Marc instructions, public Phorest help, mail/Timebutler read tests and Timebutler 204 handling. Assistant v35/timebutler v7 live; frontend remains pending Netlify upgrade. Detailed acceptance/remaining work: `PILOT-PREP.md`.

- Completed: private assistant context, explicit OpenAI response storage controls, approved twelve-month retention, physical file cleanup with holds/retries. Backend deployed and tested; see `PRIVACY.md`.
- Source integration: this work remains on `codex/teamhub-privacy-20261022`. Reconcile it before deploying these functions from an older main checkout. Close is branch backup, not main merge or frontend publication.
- Contract scope: one-time setup/handover on customer accounts; no ongoing hosting/support commitment. Separate from the platform agreement for Ella and future Feleo voice/chat.
- Native customer-app HTTPS and future telephony migration remain separate work. Do not present this release as completion of those items.
