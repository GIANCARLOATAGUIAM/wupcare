# Sensitive-action confirmations — 2026-10-20

Targeted UI safeguards using the existing shadcn-style **Radix AlertDialog** wrapper. No native confirm/alert, new dependency, database change, account mutation, or live write-based test.

## Review and protected actions

| Area | Before | Current behavior |
|---|---|---|
| Admin personnel/student account menus | Existing Radix dialogs for deactivate/reactivate and personnel promotion | Retained Radix/menu flow; shared dialog rendering and guarded async runner, explicit current/new role, connection-error feedback and duplicate prevention |
| Account detail access | Deactivate used inline confirmation; reactivate saved immediately | Both require explicit confirmation; Keep Account/Keep Inactive cancel options |
| Account detail role edit | Save immediately applied role choice | Prompts only when changing to another allowed staff/admin role; shows current/new role and permission consequences. Name-only saves stay direct. Self and student role restrictions are unchanged |
| Temporary password | Immediate submission | Confirms that the current password will stop working; never displays the password in the dialog |
| Student record status | Status saved immediately | Changing to Inactive/Graduated prompts before archiving; explains history is retained and nothing deleted. Unchanged status and ordinary edits stay direct |
| Staff appointment decline/reschedule | Immediate submission | Explicit action-specific prompt; declining uses destructive styling, rescheduling stays blue |
| Staff appointment cancellation | Inline confirmation | Shared dialog with Keep Appointment; history retained |
| Medicine deactivation | Inline confirmation | Shared dialog; issuance stops until reactivated, stock/history retained |
| Medicine stock adjustment | Immediate submission | Confirms balance/ledger consequences and asks staff to check quantity/sign; existing reason validation unchanged |
| Student appointment cancellation | Inline confirmation | Shared dialog clearly identifies cancellation of the student's pending request |
| Logout (admin, clinic personnel desktop/mobile, student portal) | Immediate sign-out | `LogoutButton`: "Log out of WUPCare?" with Cancel / Log Out (blue). Uses `confirmedLogout`, which keeps the dialog open with an error if Supabase sign-out fails. The blocked-account notice on `/login` keeps its direct sign-out |
| Student-registration link approval | Existing inline confirmation | Same required safeguard presented through the shared dialog; no change to approval rules |

Ordinary create/update workflows, appointment approval/completion, medicine issuance/restocking and medicine reactivation were not given additional confirmation steps. Their existing form labels, server validation and business rules remain responsible for the normal workflow. There is still no clinical hard-delete operation.

## Shared behavior

- Compact white/card surface with existing medical-blue components, border and spacing. The surface scrolls within the viewport; buttons stack at narrow widths. Only destructive actions use red confirmation buttons.
- Action-specific title, short consequences, explicit confirm label and Cancel/Keep button. Role changes name both roles. Confirmation captures the submitted values; cancel does not submit or reset them.
- Radix supplies the modal focus trap, accessibility title/description association, outside-click protection and keyboard behavior. Initial focus goes to Cancel/Keep. Closing returns focus to the initiating button; if the account row was removed, focus falls back to main content.
- Escape cancels when idle. Pending controls are disabled; Escape/cancel cannot dismiss an in-flight request. A synchronous ref guard blocks duplicate events before the pending render.
- Returned validation/authorization errors and caught connection errors stay visible in the open dialog. Users can retry or cancel to correct fields. Errors do not reset typed form values. Success closes the dialog, displays existing feedback, resets successful small action forms, and retains existing server revalidation/redirects. Account-menu success also refreshes the list.
- Existing Next.js redirect/notFound control-flow exceptions are rethrown, so adding a dialog cannot swallow authorization redirects.

Confirmation is UX only. All existing server role checks, RLS ownership/status rules, account self-protection, constraints and retention policies remain unchanged. No server action or database file was edited for this task.

## Files changed

- New: `components/app/confirmation.ts`, `confirmation-dialog.tsx`, `use-action-runner.ts`.
- Shared integration: `components/app/action-form.tsx`, `components/ui/alert-dialog.tsx` (viewport scrolling only).
- Admin: `features/users/row-actions.tsx`, `features/users/user-detail.tsx`.
- Student record editing: `features/students/components/student-form.tsx` (status gate and pending controls).
- Staff: `app/(clinic)/appointments/[id]/page.tsx`, `medications/[id]/page.tsx`, `students/registrations/page.tsx`.
- Portal: `app/(portal)/portal/page.tsx`.
- Tests: `tests/confirmation-harness.cjs`, `confirmations.test.cjs`, `confirmation-actions.test.cjs` (new).
- Documentation: this file, `docs/DEVLOG.md`, `docs/TEST_CASES.md`, `SYSTEM_SPEC.md`.

## Verification and limits

`npm test`: **125/125 pass**, including 16 new confirmation tests. TypeScript passes. ESLint has no errors and five existing warnings in `.pixel-agents/dashboard/app.js`. Production build verification is recorded in `DEVLOG.md`.

New tests use fictional data, a small Node hook/event harness, mocked server boundaries and blocked network fetch. They exercise cancel/no mutation, single confirm dispatch, loading/disabled states, validation/authorization and connection errors remaining open, retry/success feedback, redirect propagation, conditional role/status prompts, account refresh, actual server guards before database work, and self-account UI restrictions. Focus/Escape handlers and compact/mobile class contracts are checked in isolation.

No browser surface was connected. Real Tab/Shift+Tab trapping, screen-reader behavior, focus through actual menu/portal transitions, mobile touch/scroll rendering and responsive screenshots remain manual QA items. Radix owns those browser primitives; callback/markup tests are not a substitute for testing them in a browser. No live accounts or clinical/demo records were modified to test these changes.
