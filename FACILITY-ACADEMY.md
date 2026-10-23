# Facility routing and Academy access – 2026-10-23

Owner requested applying the customer's confirmed settings, while explicitly deferring user creation and invitations.

## Configuration and behaviour

- Central Facility recipient is configured in `app_settings.facility_email`; every studio currently inherits it. The actual address stays in customer data, not this public repository.
- Mailer separates Facility from event mail through `facility_mail_enabled` and `event_mail_enabled`, under the existing master `mail_enabled`. Missing scope flags retain the old behaviour for compatibility. Current configuration: master on, Facility on, event invitations/reminders off.
- Only real `Meldung` reports go to Facility. Ideas, Learning and examples do not. Sending updates the mail status and keeps the report in TeamHub. Email links open the exact report. The existing `teamhub-mailer` cron runs every five minutes.
- Backoffice Settings → General shows the recipient and both scopes explicitly. Preview does not send anything. No user invitations or test emails were sent during setup.
- Five real, inactive checklist proposals derived from existing wiki protocols are individually accessible under Tasks → Checklists. They remain drafts pending review. Individual activation now also clears the proposal flag; merely viewing a template does not activate it. Demo examples remain hidden.

## Academy

The customer-shared Academy access was used to inspect course overviews only and then logged out. No course was started, completed or enrolled, no credentials were stored in TeamHub, and no users were created.

Verified generic course overview URLs are linked in knowledge for daily work and, in a leadership-only guide, cash closing:

- `https://phorestacademydach.learnupon.com/content-details/4235838/0`
- `https://phorestacademydach.learnupon.com/content-details/5012306/0`

Users open them with their personal Academy accounts. Videos and course progress stay in the Academy. This is a course-link integration, not a video import or progress synchronization. LearnUpon's API requires separate portal API credentials; an ordinary learner login is not an API key. No API credentials were generated and no external support inquiry was sent.

## Verification

- Ten tests pass, including an actual mailer-handler test with a mocked provider: exactly one real repair report routes to Facility; examples, ideas and Learning do not; event/recipient tables are not processed when event mail is off; the report stays in storage. Existing private-context, quiz-progress and Timebutler tests remain passing.
- Live preview confirms central recipient and exact-ticket links. Live empty-queue run: zero sent, zero failed, mail-log count unchanged.
- RLS transaction tests confirm a report stays visible to the office before and after sent status; test transaction rolled back. Role checks confirm the general Academy article is visible to staff and the extra leadership guide is not.
- Browser checked recipient/scopes and opened a non-first checklist proposal. Typecheck and build passed; known bundle-size warning remains.
- No new schema, users, invitations, password changes or external account grants. Private receipts and provider rollback bundle are in the operator backup directory, outside Git.
