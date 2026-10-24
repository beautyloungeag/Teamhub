# Employee mobile usability review — 24 October 2026

The owner's installed iPhone screenshot showed another keyboard-related failure in the assistant after the previous login-only correction. This release reviews the employee experience as a whole and fixes shared layout causes. The established design, roles and backend remain in place.

## Shared changes

- One visible frame measures both visual-viewport height and vertical pan. Resize, pan, focus, orientation and foreground changes update it; zoom preserves the existing layout, and stale offsets are bounded when the keyboard closes. The body is no longer fixed. Login retains native document scrolling.
- Flex panes can shrink through the complete shell/chat hierarchy. Assistant and team messages scroll only their own transcript, not the document or navigation. Transcript resizing keeps the latest response reachable; long drafts have bounded, scrollable editors. While editing in a reduced viewport, bottom navigation yields space to the field.
- Task, people-picker, calendar-detail, leave and mail sheets use a common body portal outside animated ancestors, bounded by the same visible frame. Dialogs identify themselves, isolate background focus, trap Tab, support Escape and restore the opener's focus. Opening a sheet does not automatically summon the keyboard. Task close controls stay outside the form's scroll area.
- Assistant buttons have larger targets, stay on one row and expose accessible input names. The model menu stays inside narrow/short screens and scrolls. Text drafts are scoped to employee/conversation in memory, up to 20 drafts; switching history does not carry an unsent question into the wrong chat. Attachments are not persisted as drafts.
- Page headers can wrap their secondary action onto another row. Small home metrics, report/photo/studio/send controls, history filters and the client-search field/button fit narrow screens. Client search can be submitted from the keyboard and does not suggest restricted contact searches to ordinary employees. The appointment book uses available flex space instead of a separate screen-height calculation; date arrows are labelled and disabled at their bounds.
- Toasts wrap, stay within the visible frame, can be dismissed and remain available outside modal background isolation. Errors have more reading time. Login validation dismisses the keyboard and reveals the error. Unmapped performance profiles no longer show a permanent reviews-loading placeholder. Muted mobile text is darker.

## Reviewed flows

| Step | Employee flow | Result and boundary |
|---|---|---|
| 1 | Email/code login | Short-height scrolling and local invalid-code feedback checked without sending a login email. |
| 2 | Home and bottom navigation | Narrow cards, normal scrolling and fixed frame checked. |
| 3 | Personal tasks and checklists | Entry/empty states and task dialog checked; close, field focus and form end remain reachable at 260px height. No task saved. |
| 4 | Assistant input/model/history | Narrow/multiline input, model menu, response positioning, history and conversation-bound draft restoration checked. One synthetic real request returned OK; its chat/messages were removed. |
| 5 | Studio/team chats | Existing rooms and an unsent multiline draft checked at short height. No team message or invitation sent. |
| 6 | Knowledge/search/article | Header action, search, article content and scrolling checked. Normal article opening also triggered its existing automatic translation. |
| 7 | Article quiz | Existing linked quiz opened; questions/options and navigation inspected. No quiz attempt submitted. |
| 8 | Reports/ideas/personal concerns/Learning | Forms, privacy hint, media/studio controls, empty history and disabled empty submission checked. No report, Facility email or Learning post sent. |
| 9 | Event calendar/list | Calendar/list switching and current empty-list state checked. No registration changed. |
| 10 | Appointment book | Loaded real read-only calendar, local horizontal/vertical panes and bounded page checked. No Phorest write. |
| 11 | Client history | Search form and role-appropriate hint checked; no customer record edited. |
| 12 | Profile/team/onboarding | Profile, studio filters, directory, onboarding links and long descriptions inspected. No profile/availability changed. |
| 13 | Time and leave | Real unconnected-account screen checked. Leave-form UI separately exercised with synthetic types and provider submission replaced by a no-op. No clock/leave operation. |
| 14 | Mailbox and composer | Real unconnected-account screen and focused password field checked. Composer UI separately exercised with a synthetic unsent draft and provider submission replaced by a no-op. No external mail. |
| 15 | App/notifications/connections/performance | Setup instructions, connection status and unmapped-profile state inspected. No notification permission changed or native push claimed. |
| 16 | Errors/navigation/regressions | Long toast, modal focus restoration, menu→detail→back, zoom/pan logic, landscape and desktop employee layout checked. |

## Verification and limits

The current browser run used the in-app browser with actual 320×568, 320×260, 320/393×320, 393×760, 430×844, 740×360 and 1024×800 layouts. Document widths remained bounded in the recorded mobile screens. A development-only controlled 320px-high viewport with 140px vertical pan placed the real shell at y140–460 and kept its input inside that frame; this is simulation, not a physical keyboard. Temporary fixtures and controls are removed before building and publishing.

31 automated tests pass, including new visible-frame/pan/zoom/dismissal/event-cleanup and pane-scroll regressions. TypeScript/production build and translations pass. Lint retains existing repository warnings; this is not a full accessibility certification or an exhaustive test of every article, dataset, browser or external provider flow.

The agent has no attached physical iPhone. The owner's screenshot is the physical failure evidence; Safari/PWA keyboard animation, real camera/file chooser, microphone and locked-screen Apple push still require device acceptance. The browser measurements and controlled viewport tests must not be described as native iPhone acceptance. Existing real Timebutler/mail connections were not borrowed again for this layout review. Role policies, private-chat enablement, notification routing, retention and the separate Railway services are unchanged. Both owner test profiles remain active; the pilot is not invited.

Screenshots, measurements, release identity and cleanup receipts are stored in the private team workspace under `mobile-audit-2026-10-24/` and `mobile-usability-verification-2026-10-24.json`.
