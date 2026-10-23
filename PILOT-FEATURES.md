# Pilot feature completion — 23 October 2026

Owner authorized the missing checklist items and explicitly requested TeamHub trainings/meetings to be written into Phorest as well. User creation and invitations remain withheld.

## Events and registration

The employee calendar now has a full upcoming-event list toggle. All active employees can see all trainings, including other studios and skill groups. Meetings/team events retain their existing studio visibility. The backoffice also lists all trainings for leadership.

Registration and decline use the same server-enforced assignment rule: studio AND skill AND selected people; each empty criterion means no additional restriction. Office retains its administrative exception. The editor can select individual people, with search; visibility does not grant participation. Non-assigned employees see a view-only label and no registration controls or meeting link. Deadline, capacity and waitlist locking remain intact.

## Confidential concerns

`Anliegen` is a separate ticket kind, exposed under Personal in Report & ideas and the backoffice. Only its author and office can read it, its comments, history and attachments. Studio leadership has no access unless they are the author. Office can assign and change status; assigning a name does not grant additional access.

There are no votes, all-studio publication, Facility dispatch or external push previews. These concerns are excluded from the assistant's automatic context. The general audit log uses a confidential office-only entry with no original title/content, including deletion records. Privacy cannot be downgraded by changing ticket kind/author/studio. Attachment ownership and immutable attachment references prevent forged visible reports from granting access to somebody else's file. These guards do not retroactively change existing ordinary reports.

## Phorest calendar writer

The general `phorest` reader remains read-only. Only the separate `phorest-events` function writes internal Phorest calendar **breaks**, using the provider's documented break API; it does not create customer appointments or send customer messages.

Enable **Bestätigte Teilnahmen in Phorest eintragen** in the event editor and set an end time. The paid-time checkbox is explicit. Existing events remain opted out. Each confirmed, non-waitlisted attendee is mapped through the existing employee/studio Phorest mappings; their mapped calendars receive the block. Waitlists do not block time. Changes update owned blocks; cancellations, opting out and deleting a future event queue their removal. Past blocks are preserved. Start/end must be on the same Swiss calendar day. No LearnUpon/Academy video or progress synchronization is implied.

A durable service-only event outbox and link ledger persist the intended create payload **before** the provider request. A unique label recovers a create whose response was lost, including cancellation before retry. Phorest timestamps with fractional seconds are canonicalized for comparison. Owned remote IDs and accepted snapshots are stored privately. Unchanged retries do not duplicate; manual provider edits and overlapping appointments/breaks produce an actionable error instead of overwriting another entry. Mapping changes require attention rather than silently moving an existing block.

`teamhub-phorest-events` runs every minute using the existing Vault-held notification headers. One event is claimed at a time with a ten-minute lease; a call processes at most 25 targets/about a minute of work and continues on the next pass. Revision-aware completion preserves concurrent changes. Provider errors retry after five minutes; the event detail exposes status/retry and sanitized error codes. Unmapped participants require a real Phorest staff mapping. The office/creating lead can inspect only owned remote entries for the event.

## Verification

- 16 automated tests: audience combinations, Swiss time/DST, exact create/readback/update/cancel, duplicate prevention, lost-response recovery, manual-edit/conflict protection, private-ticket exclusion from Facility mail, existing privacy/wiki/clock regressions.
- Real rollback-only SQL checks under author, colleague, studio leadership, office and service roles: all-training visibility; assignment enforcement; private ticket/comment/history/file/audit isolation; denied writes/votes/forged attachment pointers; confidential deletion audit; exclusive claims and concurrent revisions. Existing identities used, no test accounts created.
- Real Phorest test on one disposable far-future event: recovered the unique create after timestamp normalization, repeated sync stayed at one block, changed end time read back, cancellation removed it; remote absence verified. Customer appointments unchanged; QA event/ledger removed.
- Actual scheduled HTTP transport returned 200/`processed:0`, no timeout. No queued real events at release.
- Browser: private concern save/comment, employee list, both visible courses, assigned registration and unassigned view-only state. Temporary owner role restored and own QA data removed.
- Build, Deno checks and translation check passed. Lint exits successfully with existing warnings; security advisors also retain legacy findings, so neither is claimed globally warning-free. New service-only ledgers intentionally have no client policies.

Official provider references: https://developer.phorest.com/reference/createbreak, https://developer.phorest.com/reference/updatebreak, https://developer.phorest.com/reference/deletebreak, https://developer.phorest.com/reference/getbreaks.
