# Privacy architecture – 2026-10-23

This document covers the privacy slice; see `HANDOFF.md` for the rest of the application.

## Marc back-office copilot (2026-10-26)

No schema change. `assistant` offers lead/office `vorschlag_*` tools; each validated proposal is stored as a card in `benni_messages.data.actions` (status offen → laeuft → ausgefuehrt | fehler | verworfen, 24 h validity). `{action: 'decide'}` claims a card with a conditional JSON update (`data->actions->i->>status`) and executes with the caller's user-scoped client, i.e. existing RLS on `news`, `events`, `todos`, `standby_requests`, `tickets`, `wiki_articles`, `media` storage, plus `admin-employee`, `notify`, `translate`. Attached photos wait as JSON in the caller's `assistant-context` folder and are removed after deciding. Lead/office own to-dos also go through a card (`add_todo` remains employee-only).

## Pilot authorization and realtime hardening (2026-10-26)

Migrations `20261025225346`, `20261025230316`, `20261025230614`, `20261025230806`, and `20261025230947` are deployed. They guard employee authorization fields, task-proof references and comment identity; fail closed for missing identities; remove anonymous privileged-RPC execution; scope inactive directory access; and make quiz attempt/read-marker persistence atomic through service-only `record_quiz_attempt`. Quiz v6 uses this contract. `mark_chat_read` advances only to a persisted visible message; sending does not acknowledge unseen messages.

Client caches share an account/session/permission lifetime with synchronous invalidation and stale-request fences. Realtime payloads invalidate progress/tickets; authorized refetches remain authoritative. See `docs/PILOT-AUTHORIZATION.md` for exact grants, migrations, tests and limitations. No customer identities or provisioning ledgers belong in this public repository.

- `20261022203912_assistant_private_context.sql`: private assistant-context bucket and employee/chat ownership policies. Assistant v34 keeps bounded immutable context snapshots in Supabase, scoped to employee/chat/model/current role and branch. OpenAI requests explicitly use `store:false`; encrypted reasoning and tool outputs are replayed. No previous-response chain. Superseded snapshots are removed after a successful save; failures are cleaned or later queued.
- `20261022204456_communication_retention.sql`: service-only settings, holds, run summaries and durable Storage deletion queue. Assistant chats expire after twelve months of inactivity; team messages individually after twelve months. Rooms and memberships remain. Context snapshots have a 30-day cleanup threshold; active chats can carry bounded context forward. Holds are honoured.
- `privacy-retention` v1 uses the existing notification secret; hourly job at minute 35 UTC reads its headers from Vault. Object removal goes through Storage API before queue acknowledgement. Settings are enabled by explicit owner approval. This is not deletion of HR, learning, wiki, tickets or external mailboxes.

Exact verification, scope and limits: `PRIVACY.md`. No frontend deployment in this release.

## Pilot feature extension (23 October 2026)

Five additive migrations `20261023135138`–`20261023140714` separate training visibility from audience registration, enforce confidential tickets/files/audit, and add service-only Phorest event outbox/link ledgers plus claim/finish functions. `phorest-events` is the only new calendar writer, using existing provider credentials and Vault-authenticated minute transport. General `phorest`, Academy links and customer bookings remain unchanged. Operational contract: `PILOT-FEATURES.md`.

## Mobile push (23 October 2026)

`20261023142539_mobile_push_delivery.sql` adds service-only per-message/device chat deliveries, private permission/unread helpers, claims/acks/validity checks and immediate Vault-authenticated notification wake-up. The minute retry is independent of the app being open. Server-owned clocks and immutable member identities protect read/routing semantics. Subscription readiness is aggregated across devices; employee deactivation revokes subscriptions. `notify/chat-push.ts` delivers only current eligible rows; the service worker binds display to the current account. No native binary or iPhone delivery acceptance is claimed. Scope and acceptance: `MOBILE-PUSH.md`.
