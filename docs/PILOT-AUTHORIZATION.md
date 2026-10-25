# Pilot authorization hardening

Migration: `20261025225346_pilot_authorization_hardening.sql`.

This closes four confirmed authorization paths and makes chat read state explicit. It does not rewrite employee permissions, historical comments or stored file content.

## Employee administration

Ordinary staff and studio leads cannot self-assign roles, studios, additional studios, qualifications, audience/job groups, activation or auth mappings. A lead can edit qualifications/job groups of another non-office employee in their studios. Office users retain management of other profiles and their own job/qualification fields, but cannot change their own role, studio scope or activation. Identity, email, authentication linkage and Phorest mapping belong to the trusted administration/service path.

`update_my_profile(text,text[],text)` keeps its signature. A non-null `p_skills` is rejected; callers must omit it. Language, own photo, about text and notification preferences continue to work. Server-derived device readiness remains writable by its maintenance functions. `admin-employee` service operations remain supported. The directory policy permits leads to find inactive non-office profiles whose primary studio they manage, so deactivation and subsequent reactivation remain usable. The trusted `admin-employee` path also remains supported.

## Proof photos and comment authors

Task proof reads allow the uploader (including preview before completion), office, and a lead whose authorized studio owns a completion referencing the exact path. Other staff and unrelated leads cannot read the object. A client cannot attach another uploader's path to manufacture a visible completion. Private ticket attachment rules remain intact.

Comment author IDs must match the active employee. Display name and creation time come from the server; identity fields cannot later be patched. Employee deletion may null the author FK while retaining the historical name. Existing rows are not backfilled; UI should prefer a resolvable current employee name and avoid trusting unverified legacy labels.

## Chat and Realtime

`mark_chat_read(p_room uuid, p_message uuid) RETURNS timestamptz` validates active membership and the message's room, derives the cursor from that stored message, and advances monotonically. Call it after a message is visibly rendered. Sending updates the room summary without silently acknowledging incoming messages. Direct member cursors are clamped to persisted messages/server time; membership IDs are immutable.

Realtime additionally publishes employees, tickets, comments and votes, with DEFAULT replica identity. Changes invalidate state; refetch through RLS. DELETE contains row identity and must not be treated as an authorized old row. Realtime does not guarantee immediate permission-revocation delivery; profile revalidation on focus and periodically remains necessary.

## Verification

`tests/pilot-authorization.postgres.sql` contains 109 checks across all three roles: direct writes, SECURITY DEFINER-like contexts, profile RPCs, private Storage metadata, reference forgery, comment attribution, allowed administration, historical FK deletion, inactive sessions and read ordering.

The suite requires a temporary `qa_actors(label,id,auth_id)` table for existing owner-controlled employee/lead/office accounts and MUST run in a rollback-only transaction. Fixtures contain synthetic data and Storage metadata, never file content or new Auth users. No secrets, real identities or project IDs are committed.

The private runner uses one implicit SQL batch, a 1.5-second lock timeout and a 20-second statement timeout. DDL and test writes run in a PL/pgSQL subtransaction that always raises a sentinel. Its exception rolls back every candidate change; only in-memory results are returned via a temporary table. Unexpected errors abort the implicit batch without leaving an explicit transaction open in the pool.

Initial candidate: **108/108 passed** (the current combined suite below supersedes this count). Before/after function definitions/ACLs, policies, triggers, publication, replica identities, defaults and protected employee fields matched exactly. This is a candidate result, not a persistent deployment. Evidence is private outside the public repository.

Existing Supabase advisor warnings were captured separately; this bounded fix does not claim all legacy advisors are clean. Persistent deployment requires subsequent role/UI checks and advisor review.

References: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

## Additional RPC review

`20261025230316_pilot_rpc_authorization.sql` closes a separately confirmed legacy NULL-authorization class. Before the fix, anonymous calls could delete an unused synthetic skill, rename a synthetic category, and read a synthetic poll's free-text answers. An unrelated active employee could complete an unreadable, unassigned foreign-studio todo because a nullable FK made `IF NOT(...)` evaluate to NULL. Each finding was reproduced with synthetic rollback-only fixtures; none was left changed.

Authorization helpers now return explicit false for absent/inactive staff. Administrative and todo/poll guards use NULL-safe checks. Event counts follow event visibility. Anonymous/PUBLIC EXECUTE is removed from all public SECURITY DEFINER functions while each legitimate authenticated/service grant is preserved. Trigger functions and waitlist maintenance are not callable as client RPCs; their trusted trigger paths still work. The three advisory-listed mutable search paths are fixed.

`tests/pilot-rpc-authorization.postgres.sql` adds 41 checks, including anonymous access, authenticated JWTs without a profile, all three roles, hidden todo mutation, poll disclosure, event count scope, and allowed registration/automatic waitlist promotion. Combined candidate result: **149/149 passed**, with exact schema/ACL/protected-profile restoration after forced rollback. The original authorization coverage remains intact; the directory lifecycle extension adds an explicit intermediate deactivated-row check.

### Advisor classification (original snapshot: 107)

- 44 anonymous SECURITY DEFINER warnings: included real authorization defects above; the follow-up migration removes anonymous access throughout this group. Treat as blocking until applied.
- 49 authenticated SECURITY DEFINER warnings: the todo NULL-guard was a real defect and is fixed; callable trigger/internal maintenance grants are removed. Remaining authenticated helpers/RPCs intentionally implement RLS-safe lookup or authorized app operations. Their mere SECURITY DEFINER designation is not proof of a defect.
- 9 RLS-enabled/no-policy notices: backend-only mail credentials, provider accounts/jobs, privacy queues and notification queues. No policy means client access is denied; adding a broad policy would be harmful.
- 3 mutable search-path warnings: pure/row-only helpers, now fixed as additional hardening.
- 1 `pg_net` extension-placement warning: managed extension, not an exposed anonymous TeamHub RPC. No relocation attempted in this patch.
- 1 leaked-password-protection warning: separate Auth hardening. The current app uses email OTP with `shouldCreateUser: false`, not a password-login UI; this warning alone is not an OTP pilot blocker. It must not be described as already enabled.

This classification does not claim a fresh live advisor scan is clean. The final live scan belongs after applying both migrations.

## Inactive directory lifecycle

`20261025230614_pilot_lead_inactive_directory.sql` aligns the existing lead-management interface with database visibility. An active lead can read an inactive non-office profile only when its primary studio is in the lead's authorized studio list. A target's additional-studio overlap alone does not suffice. Inactive office profiles and unrelated studios stay hidden; ordinary staff remain active-directory-only. No ticket/private-concern policy changes.

`tests/pilot-inactive-directory.postgres.sql` adds 14 boundary/lifecycle checks. The first suite now also verifies the actual deactivated intermediate state before reactivation. **Final combined candidate: 164/164 passed** (109 + 41 + 14), with exact rollback comparison. No persistent migration application is claimed.

## Atomic quiz persistence and progress updates

`20261025230806_pilot_quiz_atomic_results.sql` retires direct client access to the obsolete choice-only `submit_quiz` RPC, which otherwise bypassed free-text grading in mixed quizzes. The trusted quiz Edge Function now calls service-only `record_quiz_attempt`. It rechecks the active employee and current quiz visibility, verifies the exact quiz/question snapshot used for grading, derives the score from complete boolean results, and atomically writes the attempt plus the news/article completion marker. Any marker failure rolls back the attempt too. Existing article-read markers remain unique across repeat passes.

Relevant employee, quiz, question and source rows are locked for the short persistence transaction; no lock is held during model grading. Revoked access, changed questions/settings, incomplete results, transport errors and unconfirmed persistence produce explicit failure responses. The Edge Function's persistence contract is `pilot-quiz-atomic-v1`. Models, prompts and providers are unchanged.

`20261025230947_pilot_progress_realtime.sql` publishes six progress tables with DEFAULT replica identity for authorized client invalidation/refetch: event registrations, task completions, news reads, quiz attempts, onboarding progress and wiki runs.

`tests/pilot-quiz-atomic.postgres.sql` adds 25 checks, including a deliberately failing final article-marker trigger that proves successful attempts cannot survive partial persistence. `tests/quiz-persistence.test.ts` executes the real Edge handler with injected database/grader transports (six passing cases), including persistence failure, changed quiz, revoked access, lost acknowledgement and grader failure. `deno check --node-modules-dir=none supabase/functions/quiz/index.ts` passed.

**Current final combined SQL candidate: 189/189 passed** (109 + 41 + 14 + 25); exact before/after rollback confirmed. The updated Edge Function and all five migrations are prepared for deployment, not represented here as already deployed. After database deployment, deploy `quiz` before declaring the persistence fix active.

## Local SQL harness limit

The isolated local Supabase image (PostgreSQL 17.6, aarch64, GCC 15.2) crashed with signal 11 while a `postgres` psql session used `SET LOCAL ROLE anon` and executed an expected permission-denied function. A minimal direct SQL denial reproduced the crash too, including with JIT disabled; it is not specific to fixture writes or the large test suite. The precise engine/extension/session interaction was not established. This is an unresolved local SQL-harness limitation, not evidence that the application or production database crashes. No host/provider update or persistent database setting was changed.

The real local HTTP/PostgREST path remained stable: seven anonymous RPC requests returned HTTP 401 with SQLSTATE 42501; six requests using an authenticated local JWT without an employee returned denied/error responses. Database health remained normal after those 13 requests. Separate remote candidate verification had already passed all 189 checks and rolled back exactly. The entire directly installed local SQL suite must not be described as passed; use the completed HTTP/UI checks plus the explicitly scoped candidate evidence, and retain this limitation in the release record.
