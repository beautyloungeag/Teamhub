# Privacy follow-up – 2026-10-23

## Current pilot position — 2026-10-26

- Shipped 26.10. afternoon (owner/reviewer feedback): knowledge articles as swipe slides with photo + grey key-info bar (`src/lib/wiki-slides.ts`), single action row at the end, Marc icon in the article header, photos between steps keep the step sequence. Wiki editing stays office-only (owner decision).
- Shipped 26.10.: Marc as back-office copilot for lead/office (`supabase/functions/assistant/actions.ts`, assistant v38): proposal cards, execution only after "Ausführen", with the person's JWT/RLS. Next-up: reviewer feedback on both; English/French result texts after execution are still German.

- Shipped: authorization, identity-cache, chat/comment, concurrent profile/skill, audience/export, realtime-progress and mobile landscape/attachment fixes (`076bccd`); quiz v6 and five migrations deployed. 75 automated tests and 189 deployed-schema rollback checks passed.
- Owner confirmed real iPhone Marc/comment keyboard layouts and office-task push receipt. Controlled pilot GO; no blanket device or external-provider acceptance.
- Reviewer access and five scoped test cases prepared; owner reports the instruction email sent. Remaining team invitations are explicitly deferred. Intended next step is reviewer feedback, then a two-week team pilot, then wider rollout if ready.
- Mailbox/Timebutler personal setup, separate physical login/landscape/camera/microphone scenarios and feedback remain follow-ups. Remove temporary reviewer test identities/fixtures and dedicated mail routing after the test phase by exact recorded IDs; no automatic cleanup is configured.
- Older pending-publication and draft-content statements below are historical; `HANDOFF.md` is current.

- Mobile push: implementation and desktop/375px/database/worker checks completed. Real iPhone install → permission → locked-screen delivery → chat tap → badge/logout acceptance still required before a device-level pilot promise. See `MOBILE-PUSH.md`.


- Latest pilot feature completion: all-training visibility/assigned registration, full upcoming list, confidential concerns, opted-in Phorest internal-calendar sync including changes/cancellations. Live backend tested; see `PILOT-FEATURES.md`. Earlier pending-frontend notes below are historical. No invitation release.


- Confirmed customer settings applied: Facility routing active independently of event invitations, exact-report links, checklist drafts individually reviewable, verified Academy course links by audience. No user creation/invitations. API/video/progress sync is not part of the current link integration. See `FACILITY-ACADEMY.md`.

- Pilot follow-up implemented: demo cleanup, three real linked quizzes, corrected progress accounting, role-consistent Marc instructions, public Phorest help, mail/Timebutler read tests and Timebutler 204 handling. Assistant v35/timebutler v7 live; frontend remains pending Netlify upgrade. Detailed acceptance/remaining work: `PILOT-PREP.md`.

- Completed: private assistant context, explicit OpenAI response storage controls, approved twelve-month retention, physical file cleanup with holds/retries. Backend deployed and tested; see `PRIVACY.md`.
- Source integration: this work remains on `codex/teamhub-privacy-20261022`. Reconcile it before deploying these functions from an older main checkout. Close is branch backup, not main merge or frontend publication.
- Contract scope: one-time setup/handover on customer accounts; no ongoing hosting/support commitment. Separate from the platform agreement for Ella and future Feleo voice/chat.
- Native customer-app HTTPS and future telephony migration remain separate work. Do not present this release as completion of those items.
