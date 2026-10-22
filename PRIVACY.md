# TeamHub privacy implementation — 22 October 2026

## Model context

The assistant now explicitly sends `store:false` to the Responses API, Chat Completions fallback and title generation. It no longer chains `previous_response_id`. Within tool loops it replays complete outputs, including encrypted reasoning and tool results, so disabling provider storage does not break tool execution.

Conversation context, including submitted files and tool results, is stored in the private `assistant-context` bucket in this project's Zurich region. It is bound to employee/chat/model/current role and branch. The bucket is not public. Cross-employee access is denied by RLS; snapshots are immutable per reply, with a fresh path. Superseded snapshots are removed after successfully saving the replacement message. A failed save is cleaned up; remaining orphans are handled by retention.

Context is limited to twelve turns and 48 MiB; a snapshot is reused only when the previous response is less than 25 days old. Snapshots older than 30 days are cleaned up. Active chats can carry bounded content into a newer snapshot, so this is not a 30-day content-deletion guarantee measured from the original upload. If a complete current turn is too large or cannot be stored, the answer is still delivered and the user is told to attach the file again for follow-up questions. Existing textual history is preserved; old files held only in pre-change OpenAI response state are not retrospectively imported. Switching model or authorization scope starts from local text history.

This disables additional provider response storage, not OpenAI's independent abuse-monitoring logs. No claim of account-level Zero Data Retention, disabled training opt-in or EU-only processing was verified.

## Approved retention

The owner approved activation for TeamHub; Retell is explicitly outside this release.

- Inactive assistant conversations expire after twelve calendar months, based on chat and actual message timestamps.
- Team-chat messages expire individually after twelve months. Rooms and memberships remain.
- `privacy_chat_holds` excludes assistant conversations or whole team rooms from this automated workflow.
- Temporary assistant context expires after 30 days, or after its conversation is deleted, unless a hold applies.
- Wiki, onboarding/quiz evidence, HR records, tickets, external mailboxes and account credentials are not deleted by this feature.

`teamhub-communication-retention-hourly` runs at minute 35 UTC. It calls the secret-protected `privacy-retention` function; header material is read from Vault. Settings/holds/queues/RPCs are service-only. The file queue is acknowledged only after Storage API success. A disabled policy does not undo past deletion.

## Delivery and checks

- Applied migrations: `20261022203912_assistant_private_context.sql`, `20261022204456_communication_retention.sql`.
- Published functions: `assistant` v34 and `privacy-retention` v1. Frontend deployment remains separate.
- Local checks: stateless tool/reasoning/file replay, scope/model boundaries, private path checks, bounded history, Postgres RLS, holds, fresh child messages, disabled defaults and physical-deletion queue semantics. App build and Deno checks pass.
- A synthetic three-request OpenAI test retained tool context with `store:false`; retrieving the final response returned 404.
- A real TeamHub test read a synthetic attachment, answered a later question from the private snapshot and denied anonymous snapshot access. Test chat, objects and test session were cleaned up.
- A disposable aged assistant chat/context file and an old message in a disposable team room expired through the real retention endpoint. Physical storage deletion and cleanup were confirmed.
- The scheduled `pg_net` HTTP path returned 200 with zero failures and no pending files.
- Security advisors identify the new private service tables only as `rls_enabled_no_policy` (INFO), which is intentional. This is not a clean bill of health for unrelated pre-existing project findings.

Source branch: `codex/teamhub-privacy-20261022`, separate `teamhub-privacy` worktree. No GitHub push. Do not deploy an older assistant source over v34. Private operator backups remain outside the repository.

To repeat the isolated SQL checks, start an empty local container (no production database connection):

```sh
docker run -d --name beautylounge-privacy-qa -e POSTGRES_PASSWORD=privacy-qa-local-only public.ecr.aws/supabase/postgres:17.6.1.106
# Wait until docker exec beautylounge-privacy-qa pg_isready -U postgres reports ready.
node --test tests/privacy-context.test.ts tests/privacy-retention.postgres.test.mjs
docker rm -f beautylounge-privacy-qa
```

The test recreates only its named `privacy_teamhub_qa` database inside that container.
