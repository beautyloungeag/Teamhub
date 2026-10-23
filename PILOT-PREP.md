# Pilot preparation – 2026-10-23

Owner authorized demo cleanup, article quizzes, mail/Timebutler checks, assistant contact-policy correction and public Phorest help. Netlify plan change is for the customer to perform; no production frontend publication or billing change in this work.

## Completed

- Demo content flag disabled. The two existing demo identities were renamed to neutral test names, their copied Phorest mappings/photo links removed and the accounts deactivated after verification. Original production staff records were not changed; private recovery snapshots exist. Sample records remain recoverable rather than being bulk-deleted.
- Three real pilot articles now have quizzes (5, 4 and 3 single-choice questions). Backend verification covered blocked premature read confirmation, hidden answer keys, wrong-answer failure, successful read confirmation and idempotent repeat success. QA attempts/read markers were removed afterwards. Other articles do not automatically acquire a quiz.
- Browser verified article → quiz → 100% passed → confirmed with a neutral test identity. `wiki-progress.ts` also fixes the old-read-marker case when a quiz is added or replaced later, and removes the shared cross-account progress cache.
- Assistant v35 uses a role-dependent contact policy consistent with the existing API restriction. Live employee-role requests refused contact disclosure; email/phone lookups and privileged raw read returned 403. Previous private-context and retention protections remain intact.
- A published knowledge article links and summarises verified public Phorest guidance. A live assistant response used the source and correctly said it cannot access the protected Academy. The Academy URL provided by the owner still requires an invitation/course access; no protected courses were imported.
- A borrowed existing customer mailbox passed the real app connect/encrypted-storage/list/disconnect flow and SMTP authentication. A temporary clearly labelled QA identity was used and deleted. No emails sent, no existing messages marked read, no credentials left connected.
- The provided personal Timebutler token passed all seven read endpoints used by the overview; returned shapes match the UI. Actual time-clock/absence records were not changed. Password/MFA login and refresh-token lifecycle still require an actual personal login; API-token read tests do not prove that flow.
- Timebutler v7 handles documented successful HTTP 204 clock-stop responses correctly, with status readback. Unit tests cover 200/204/409 responses. Password-reset and Microsoft-login guidance added in DE/EN/FR. These UI updates await the frontend release.

## Verification

Eight automated tests passed (private context, quiz progress, clock response semantics); Deno checks passed with `--node-modules-dir=none`; frontend production build passed. Lint exits successfully with existing warnings; no claim of a warning-free codebase. Existing large-bundle warning remains. No schema migration in this change. Provider source bundles were privately backed up before deploying only `assistant` and `timebutler`.

Final live readback: demo flag false, zero active legacy test accounts, three article quizzes, one published public-help article, zero retained mail/Timebutler test connections. Temporary tokens and raw HR response bodies removed; aggregate verification retained privately.

## Remaining before rollout

- Customer upgrades Netlify, then release the validated frontend from a source state that also retains the privacy changes. Primary checkout was not changed here.
- Five active checklist templates were all marked sample; hiding samples leaves no real pilot checklists. Confirm actual daily/weekly/monthly lists with the customer, do not silently publish examples as business rules.
- Facility recipient and Academy invitation requested in draft messages, not yet supplied.
- Real personal Timebutler connection and actual workplace clock/leave workflows need a participant-controlled acceptance test. Mail send delivery was not tested by sending to anyone.
- Previous audit items not part of this implementation remain: chat push/media and actual Phorest appointment colours.
- Railway credential incident is separate. Invalidated Railway tokens do not prove there was no credential exposure. No Railway token or underlying service credential was rotated in this task.

Drafts and detailed private receipts: team workspace `ai-team/assets/beautylounge-teamhub/`; operator-private `~/.codex/backups/beautylounge-pilot-20261023/`. Public repository contains no borrowed credentials, HR payloads or mailbox contents.
