# WUPCare Development Log

Records the technology stack, iteration dates, completed features, and tests, as required by Paper §3.D.

Current status is recorded in the **2026-10-20 stabilization** entry at the end. Earlier migration, provisioning, and QA statements describe their historical run dates; external scratchpad test counts are not repository-owned reproducible tests.

## Stack

| Item | Version |
|---|---|
| Node.js | 24.19.0 |
| Next.js (App Router, Turbopack) | 16.4.0 |
| React | 19.3.0 |
| TypeScript | 5 (strict) |
| Tailwind CSS | 4 |
| shadcn/ui | radix-nova style, Radix base |
| @supabase/supabase-js | 2.117.3 |
| @supabase/ssr | 0.12.7 |
| zod | 4.6.7 |

## Phase 1: Project setup and authentication — 2026-10-14

### Completed
- Removed `cacheComponents` and `partialPrefetching` from `next.config.ts` (decision 2).
- shadcn/ui initialized. Components: button, input, label, alert, sheet, separator, badge.
- Design tokens: deep green accent, green-tinted neutrals, status colors, light theme only.
- Supabase clients: server, browser, admin (server-only), session proxy helper.
- `proxy.ts`: refreshes the session; redirects signed-out users to `/login`.
- Data Access Layer (`lib/auth/dal.ts`): `getAuthState()` and `requireRole()`. Role comes from `public.profiles`. Denies by default.
- Login page (email and password), logout, blocked-account notice, missing-config notice.
- Role layouts: clinic shell (administrator, clinic personnel) with sidebar and mobile sheet; student portal shell.
- Dashboard placeholders for each role.

### Tests
| Test | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `npm run lint` | Pass (0 errors; 5 warnings in `.pixel-agents/`, not app code) |
| `npm run build` | Pass. All auth routes are dynamic (`ƒ`). |
| Signed out: `/`, `/dashboard`, `/portal`, `/students`, `/admin/users` | 307 to `/login` |
| Forged session cookie on `/dashboard` | 307 to `/login` |
| `/login` desktop and 500px width | Renders; config notice shown; form disabled |

### Blocked until Phase 2
- No user can get past login: `public.profiles` does not exist, so every signed-in user is shown "Your account is not set up yet".
- Role routing, dashboards, and sidebars could not be tested signed in.
- No Supabase project for WUPCare is configured in `.env.local`.

## Phase 2: Database schema and RLS — 2026-10-14 (database complete; self-registration pending decision)

Target: Supabase project "Research" (`rlpppneoxsbebathqzfw`), Postgres 17.

### Applied migrations
| Version | Name | Result |
|---|---|---|
| 20261014112222 | 0001_enums | Applied. 5 enums, `private` schema (no anon access). |
| 20261014112305 | 0002_tables | Applied. 10 tables, RLS on all, default anon/authenticated grants revoked. |
| 20261014112330 | 0003_helpers | Applied. 8 private functions, 10 triggers, `on_auth_user_created`. |
| 20261014112410 | 0004_inventory | Applied. 5 inventory/save RPCs; `issue_items` not callable by clients. |
| 20261014112431 | 0005_appointments | Applied. |
| 20261014112454 | 0006_rls | Applied. 21 policies, 0 anon grants, 0 DELETE grants. |
| 20261014112528 | 0007_reports | Applied. |
| 20261014112539 | 0008_reference_data | Applied. 10 concern categories, default clinic hours. |
| (applied) | 0009_fix_auth_provisioning | Applied after approval. Trigger now `AFTER INSERT OR UPDATE OF raw_app_meta_data`. |

Post-apply checks: 26 functions in `public`/`private`, all with `search_path = ''`; none executable by `anon`; 27 foreign keys. `types/database.ts` generated from the live schema.

### Advisors
- Security: 12 × WARN `0029 authenticated_security_definer_function_executable`. Intentional: the 5 inventory/save RPCs, 5 reports, and 2 admin linking functions. Each checks the caller's role first; none is executable by `anon`. No ERROR-level findings.
- Performance: INFO only. 18 unindexed foreign keys (audit columns such as `updated_by`, `attended_by`, and composite same-student keys); 16 unused indexes (database is empty). No action for now.

### Live verification (real Auth users, real JWTs, PostgREST, `next start`)
Temporary fictional accounts `p2test-*@wupcare.test` were created with the Auth Admin API and deleted afterwards. All test rows were removed. 0 auth users and 0 data rows remain (reference data kept).

Passed live:
- `anon` gets `42501` on all tables and RPCs.
- The `private` schema is not exposed through the Data API (`PGRST106 Invalid schema: private`) for anon and signed-in users.
- Admin and student JWTs read 0 rows from `students`, `health_records`, `clinic_visits`, `health_incidents`, `medication_transactions`, and `medicines`.
- Nobody can insert a profile. A role in `user_metadata` is ignored.
- An unprovisioned JWT reads nothing and cannot run reports.
- Clinic staff can't set `is_demo`, write stock directly, write the ledger, or delete students.

**Failed live: account provisioning (defect found).**
Supabase Auth's admin `createUser` inserts `auth.users` with default `app_metadata`, then writes the custom `app_metadata` in a separate UPDATE. Evidence: `updated_at` is 22 ms after `created_at`, and the stored `app_metadata` has `wupcare_role`, but no profile exists. The 0003 `AFTER INSERT` trigger never saw the role, so:
- no profiles were created;
- an invalid role was not rejected;
- every role-dependent live test (clinic staff, student, admin reports, deactivation, app redirects) could not run.

The PGlite offline suite did not catch this, because it inserted `app_metadata` in one statement. This is the item flagged earlier as "needs live verification."

Fix: `0009_fix_auth_provisioning.sql` also fires the trigger on `UPDATE OF raw_app_meta_data`. It creates the profile only if none exists (`on conflict (id) do nothing`), so it never changes an existing role. Offline suite: 137/137 pass, including the GoTrue insert-then-update sequence.

### Build checks
| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `npm run lint` | Pass (0 errors; 5 warnings in `.pixel-agents/`, not app code) |
| `npm run build` | Pass |

### Live re-test after 0009 — 107/107 passed
Run with temporary fictional accounts (`p2test-*@wupcare.test`), real sign-ins, PostgREST, and `next start`.

| Area | Result |
|---|---|
| Provisioning | The trigger creates admin, clinic staff, and student profiles from `app_metadata`. An invalid role and a second account for an already-linked student both fail `createUser` ("Database error creating new user"), and **no orphan auth user is left** (same transaction). |
| Escalation | A role in `user_metadata` is ignored. A signed-in user calling `updateUser({ data: { wupcare_role: "admin" } })` gets no profile and cannot write `app_metadata`. No one can insert a profile. Admins cannot demote or deactivate themselves. |
| Anon / Data API | `42501` on all tables and RPCs. `private` schema not exposed (`PGRST106`). |
| Role isolation | Admin and student read 0 rows from all clinical tables. A student sees only their own profile and appointments. Admin linking functions return only id, number, and name. |
| Inventory | Restock and adjust work, and adjusting below zero is rejected. Direct stock and ledger writes are denied. A visit with 2+1 of the same medicine saves; an over-issue rolls back the whole visit (stock unchanged, ledger sum = stock). `attended_by` is forced to the caller. The same-student foreign key holds. An incident with medication saves. |
| Appointments | Clinic hours, Sunday, self-approve, and another-student requests are rejected. One pending request per student (`appointments_one_pending_per_student`). Approve, reschedule (count + 1), complete, and the declined-needs-remark rule all work. A student can cancel their own pending request only. |
| Reports | Staff get exact counts. An admin's per-day request is refused; admin counts below 5 return null. Students are refused. |
| Deactivation | An inactive student or clinic staff member gets 0 rows and "Not allowed." An Auth ban blocks sign-in ("User is banned"). |
| Routing | Signed out → `/login`. Admin and clinic staff → `/dashboard`, student → `/portal`, with cross-role pages redirected. Inactive and unprovisioned users → `/login`. After sign-out → `/login`. |

Residual data after cleanup: 0 auth users, 0 identities, 0 rows in all data tables. Reference data remains: 10 categories, 1 `clinic_settings` row (unchanged, `updated_by` null).

Security advisor after 0009: unchanged (12 intentional `0029` WARNs, no ERROR).

Build checks after 0009: `tsc` pass, lint 0 errors (5 warnings in `.pixel-agents/`), `npm run build` pass.

### Open items
- **Student self-registration:** approved design (Supabase Auth only, clinic staff approve the link). SYSTEM_SPEC.md and PLAN.md updated to v2.1. `0010_student_self_registration.sql` prepared and tested offline (PGlite 160/160, including sign-up before and after confirmation, a forged role in `user_metadata`, admin `createUser` with `email_confirm`, pending-account isolation, and approval rules). **Not applied.**
- Email delivery for real students (spec Q-A1): the built-in email service delivers only to the Supabase organization's team members.
- Auth settings for self-registration (sign-ups on, "Confirm email" on, redirect URLs): not changed; needs approval.
- First administrator: manual dashboard step (docs/AUTH_PROVISIONING.md §4). Not done.
- Service-role key rotation: deferred by the client, risk acknowledged.

## Development accounts and demo data (2026-10-14)
For development, fictional accounts were created through the Auth Admin API: `dev-admin@wupcare.test`, `dev-nurse@wupcare.test`, and `dev-student@wupcare.test` (the last linked to `DEMO-0001`). Passwords are random and kept only on the developer machine, outside the repository. A minimal demo dataset was added: 4 students `DEMO-0001`–`DEMO-0004` and 5 medicines (one low on stock, one expired), all with `is_demo = true` and fictional data. Starting stock is recorded as restock rows in the stock ledger. The Phase 8 seed will replace this data.

Testing: end-to-end tests drive the installed Microsoft Edge through `playwright-core`, installed outside the project, so no project dependency was added. They run against `next build` + `next start`. Test rows use the `E2E-` prefix.

## Phase 3: Student and health records — 2026-10-14
- Shared building blocks: typed Supabase clients (`types/database.ts`); Manila-time formatting helpers; `FormState` + zod `parseForm`; safe database error messages (`lib/db-errors.ts`); labeled fields with inline errors; native select, textarea, and table components; filters that work as plain GET forms; pagination (25 rows); link-based tabs; status and DEMO badges. The sidebar now enables all modules, shows the pending-appointment count, and is hidden when printing. The clinic layout gained a `<main>` landmark.
- `/students`: search by number or name, plus filters for college, year, status, and Real/Demo/All.
- `/students/new` and `/students/[id]/edit`: validation, a field error for a duplicate number, and the `DEMO-` prefix blocked on new records. Archiving is done by setting the status to Inactive or Graduated.
- `/students/[id]`: header with DEMO and status badges and allergy/condition alerts. Tabs: Health record, Visits, Appointments, Incidents, Medications. Quick actions: new visit, book appointment, record incident, history report.
- `/students/[id]/health/edit`: shows who last updated the record and when.
- E2E: **27/27 passed**. Covered list and filters, create with validation, typed values kept after an error, duplicate and `DEMO-` rejection, edit, health record editing with the "updated by" line, all tabs, 404, admin and student redirects, and 360px layouts.

## Phase 4: Clinic visits — 2026-10-14
- `/visits/new`: student picker (GET search), allergy alert, DFD 3.1–3.4 fields, concern category, and repeatable medication rows listing only active, unexpired, in-stock medicines that match the student's demo/real side. Saves through `create_visit_with_medications` (one transaction). Can link a completed appointment (`?appointment=`).
- `/visits`: log with student search, date range, concern, and scope filters.
- `/visits/[id]`: detail, read-only issued medicines, related incidents, "last edited by".
- `/visits/[id]/edit`: corrections. Issued medicines can't be changed here; stock is corrected by an adjustment.
- E2E: **19/19 passed**. Covered the allergy alert, the medicine list (expired medicine hidden), required fields, a rejected over-issue that saved nothing (other stock unchanged), a visit with 2 tablets (stock 50 → 48), the edit audit line, the log filters, the student history and medications tabs, admin blocked, and 360px layout.

## Phase 5: Appointments, medication inventory, clinic hours — 2026-10-14
- `/settings/clinic-hours`: open days, opening and closing time, days ahead. Validated in the form and in the database. Shows who last changed it.
- Student portal:
  - `/portal`: own appointments with status, schedule, staff remarks, and a reschedule note.
  - Students can cancel a pending request.
  - Requesting is blocked while a request is pending; the database also enforces this with the one-pending index.
  - Shows "Waiting for clinic approval" if the account has no student link.
- `/portal/request`: date and time limited to the clinic hours. The database rejects anything outside them.
- Staff:
  - `/appointments`: views Pending, Today, Upcoming, Completed, Declined, Cancelled, and All, with student, date, and scope filters. The pending count shows in the sidebar.
  - `/appointments/[id]`: approve with a schedule; decline (remark required); reschedule (remark required; the database counts reschedules); cancel; complete. A completed appointment offers "Record visit" with the link pre-filled.
  - `/appointments/new`: staff booking, saved as approved.
- Medications:
  - `/medications`: stock, reorder level, expiry, and Low / Expiring (30 days) / Expired / Inactive flags, plus filters.
  - `/medications/new`: starting stock is saved as a restock row.
  - `/medications/[id]`: issue to a student by student number, restock, adjust (reason required), transaction history, ledger check, deactivate or reactivate.
  - `/medications/[id]/edit`.
- `ActionForm`: inline action form that keeps typed values when the server returns an error and shows field messages in its alert.
- E2E: **44/44 passed** (after fixing ActionForm error display). Covered:
  - clinic hours: validation and save, after which the request form and the database both follow the new closing time;
  - portal: request, pending block, cancel, re-request;
  - staff: queue and sidebar count, approve, reschedule (remark required, count 1, student sees the remark), complete → record visit → visit linked, decline (remark required) visible to the student, staff booking;
  - inventory: flags and filters, new medicine with starting stock, restock, adjust (negative rejected, values kept), issue (demo/real mismatch, stock limit, and unknown number all blocked), edit, deactivate/reactivate, expired medicine blocked;
  - role redirects and 360px layouts.
- Database check: stock equals the ledger sum for all 7 medicines.

## Phase 6: Health incidents — 2026-10-14
- `/incidents/new`: student picker, allergy alert, type, date and time, location, description, action taken, an optional link to one of the student's visits, and optional medication rows. Saves through `create_incident_with_medications` (one transaction).
- `/incidents`: log with student, type, date range, and scope filters.
- `/incidents/[id]`: detail with medication given, the related visit, and recorded/edited by.
- `/incidents/[id]/edit`: corrections.
- Linked records show up where they belong: the visit page lists related incidents, and the medicine history links to the incident.
- E2E: **18/18 passed**. Covered required fields, a rejected over-issue that saved nothing, a saved incident with medication (stock 20 → 19) and visit link, the cross-links, edit with audit line, type and scope filters, student history, admin blocked, and 360px layout.

## Phase 7: Reports and administration — 2026-10-14
- `/reports` (administrators and clinic personnel): clinic visits per day or month, common health concerns, medication usage plus current stock, incidents per type, and appointments per status. Each has a date range and a Real (default) / Demo / All scope, uses the `report_*` functions, and has a print-friendly layout with a report header (the app shell is hidden when printing). Administrators see whole months only and "<5" for small counts (FR-RPT-3a), with an explanatory note.
- `/reports/student/[id]` (clinic personnel only): printable clinic history covering the profile, health record, visits, incidents, medicines issued, and appointments.
- Dashboards:
  - clinic personnel: visits today, pending requests, today's appointments, low stock, expiring within 30 days, incidents this month; today's appointment list; medicines needing attention;
  - administrator: this month's visits, incidents, and appointments by status (real records, masked), and active users by role.
- `/admin/users`: list with search, role and status filters, and linked student number.
  - `/admin/users/new`: create clinic personnel, administrator, or student accounts. Student accounts use a picker that shows number and name only, for students without an account. Uses the service role only in `features/users/actions.ts`, after `requireRole("admin")`.
  - `/admin/users/[id]`: edit name, switch between staff and admin roles, set a temporary password, deactivate (also bans sign-in) or reactivate. An admin can't demote or deactivate themselves.
- `/account` and `/portal/account`: change own password; the current password is checked first.
- E2E: **40/40 passed** (one check fixed for CSS uppercase text). Covered:
  - reports: visits report total matches the visit log count; concerns, medication usage (2 issued, 48 left), incidents, and appointment status; Real-only default; print layout; admin monthly-only and `<5` masking; admin blocked from the student history report;
  - dashboards for both roles;
  - users: list, create (short password rejected and never echoed back, duplicate email rejected), new account signs in; password change (wrong current password and confirmation mismatch rejected, then success); deactivation ends an open session and blocks sign-in; reactivation; temporary password; staff → admin role change; admin self-protection; a student account linked to `DEMO-0002` sees only its own appointments;
  - access control for staff and students, and 360px layouts.
- Phase 3 regression after all changes: 27/27.

### Test data cleanup
- Deleted the 2 E2E accounts.
- Deleted all E2E rows: `E2E-*` students and their health records, the `E2E Ibuprofen` medicines, and the E2E visits, incidents, appointments, and their stock transactions. Stock for demo medicines was restored in the same transaction.
- Result: 3 dev accounts, 4 demo students, 5 demo medicines, 0 visits, 0 appointments, 0 incidents. Stock equals the ledger for every medicine. Clinic hours are back at Mon–Fri 08:00–17:00, 30 days ahead.

### Security advisor (after Phases 3–7)
No database changes were made in Phases 3–7. Findings:
- 12 intentional `0029` WARNs on the SECURITY DEFINER functions, as before;
- 1 new Auth WARN: leaked-password protection is disabled. This is an Auth setting and is listed for Phase 8.

## Phase 8A: Stability and demo preparation — 2026-10-14
- **Port 3100 failures:** not an application bug.
  - 10 of 11 runs reached `Ready`; their exit code 1 came from the forced stops (`taskkill /F`) during rebuilds.
  - One run failed with `EADDRINUSE`: stopping the background task killed the `npx` wrapper but left its child `next start` holding the port.
  - The logs show no runtime errors.
  - The server is now started with `node node_modules/next/dist/bin/next start`, so stopping it kills the right process.
- **Fixes:**
  - Clinic-hours form keeps submitted values, including the checked days, after a validation error.
  - New medicine with the same name (any case) and the same expiry as an existing real medicine is blocked, with a "use Restock" message. Stock integrity is unchanged: the medicine starts at 0 and the starting stock is a ledger restock. If that restock fails, the medicine page explains it and pre-fills the quantity.
  - Search values are quoted in PostgREST `or()`, so names like "O'Brien" or "Ma. Cristina" match and filter-syntax characters are harmless.
  - Asking for a page past the end (PostgREST `PGRST103`) redirects to page 1 instead of "Could not load".
  - New: `loading.tsx` skeleton and `error.tsx` boundary for the clinic and portal route groups, and a global 404 page.
- **Demo scripts (prepared, NOT run on the live database):**
  - `supabase/seed.sql`: 18 students, 12 medicines (one low, one expiring, one expired), about 40 visits, 15 appointments in every status, 8 incidents.
  - `supabase/remove-demo.sql`: deletes demo rows only and keeps demo students linked to accounts.
  - Offline PGlite validation: **25/25**. Covered a refusal when no clinic staff account exists; correct counts; stock equal to the ledger; existing edited records not overwritten; no duplicates; a second run changes nothing; cleanup removes demo data only; real records byte-identical throughout.
  - The live `auth.uid()` definition matches the offline stub. The seed would act as `dev-nurse`, the only active clinic staff account.
- **Gap E2E suite** (`phase8a`, 23 checks):
  - fixes from this phase: clinic-hours inputs kept, duplicate medicine blocked, a separate batch with a different expiry allowed, restock prefill;
  - search: punctuation in names, filter-syntax characters, wildcard-only text;
  - an out-of-range page redirects; the 404 page;
  - filters not tested before: appointment date filter, staff monthly report, user list role and status filters, inactive medicine filter;
  - **two simultaneous issuances that together exceed stock: exactly one succeeds, stock 2, ledger matches**;
  - the streamed page sends the loading skeleton first.
- **Streaming note:** with route-level `loading.tsx`, pages stream. When `notFound()` runs after streaming has started, the response status is already 200, but the "Page not found" page is still shown. The test helpers now wait for the skeleton to clear before reading a page.
- **Regression fix:** the Account link added to the portal header made the page scroll sideways at 360px. Small screens now show only the brand mark.
- **Full regression on a clean baseline:** Phase 3: 27/27; Phase 4: 19/19; Phase 5: 44/44; Phase 6: 18/18; Phase 7: 40/40; Phase 8A: 23/23 → **171/171**.
- `tsc` passes; lint has 0 errors (5 warnings, all in `.pixel-agents/`); the production build passes.
- **Test data:** removed after every run with a scoped script (E2E rows and E2E accounts only; demo stock restored). The database is back at its baseline: 3 dev accounts, 4 demo students, 5 demo medicines, no activity, stock equals the ledger.
- **Remaining E2E gaps (not automated):**
  - an unlinked student account (needs migration 0010);
  - error-boundary rendering (no safe way to force a server error);
  - calling a server action directly with another role (covered by `requireRole` in every action plus database RLS, which was verified live in Phase 2);
  - session expiry;
  - keyboard and screen-reader checks (Phase 8B).
- **Demo seed: run once on the live database (approved), 2026-10-14.**
  - Preflight:
    - project Research, `ACTIVE_HEALTHY`;
    - `seed.sql` unchanged since validation (sha256 `cd0a54dd…`; offline suite re-run 25/25);
    - baseline as expected: 4 demo students, 5 demo medicines, no activity, 0 real records;
    - `dev-nurse` was the only active clinic staff account and acted as the seed identity.
  - Result: 18 demo students; 18 health records (`DEMO-0001`–`0004` kept their existing values, 14 new ones filled); 12 demo medicines; 40 visits (2026-07-22 to 2026-10-09, all 10 concern categories, 2 linked to completed appointments); 15 appointments (3 pending, 4 approved, 4 completed, 2 declined, 2 cancelled); 8 incidents (all 4 types); 52 stock transactions (12 restock, 40 issuance) with issuance dates matching their visits and incidents.
  - Stock equals the ledger for every medicine.
  - Real records: 0 students, 0 medicines, 0 transactions, unchanged. No accounts were created; still 3 profiles and 3 auth users.
  - Flags shown: Cetirizine low (7 / reorder 10), Loperamide expired, Mefenamic Acid expiring 2026-11-03.
  - Read-only smoke tests on the seeded data: **29/29**. Covered:
    - Real/Demo filters on students, visits, and medicines;
    - visits paging (25 + 15);
    - health record and history shown;
    - pending queue and sidebar count (3), upcoming (4);
    - inventory flags; Paracetamol stock 16 with the ledger matching on its page;
    - all reports with demo scope (visits total 40, 10 concerns, Paracetamol 34 issued, incidents 8, appointments 15) and Real scope empty;
    - admin masking; both dashboards; the student history report;
    - the dev student sees only their own appointments.
  - Counts were unchanged after the smoke run.
  - `remove-demo.sql` was not run.

## Phase 8B: UI/UX polish and accessibility audit — 2026-10-14
Approach: a refinement of the existing system (deep-green tokens, compact shadcn layout), not a redesign. Evidence came from one batch: 34 pages for all three roles (staff, admin, student) captured at 1280 and 360px, an overflow sweep at 360/768/1024px, and an axe-core WCAG 2.0/2.1 A/AA plus best-practice scan. axe-core and playwright were installed outside the project, so no project dependency was added. All checks are read-only against the seeded demo data.

### Before
- Overflow: none at any width.
- axe: 3 issues.
  - **Colour contrast:** success text (Active and Completed badges, success alerts) 4.3–4.4:1, and the destructive button text 4.47:1. AA needs 4.5:1.
  - **Nested `<main>`:** when `notFound()` ran inside the app, the 404 page's own `<main>` sat inside the app's `<main>` (duplicate landmark).
- Manual review:
  - no skip link;
  - link focus outline used the 50%-opacity ring (weak);
  - filters on phones stacked one per row and pushed tables far down;
  - destructive actions ran on one click (deactivate account or medicine, cancel appointment, cancel request);
  - the student header's 5 actions wrapped into 3 heavy rows on phones;
  - report counts sat far from their labels on wide screens;
  - uneven field grid on the appointment detail page;
  - the loading skeleton pulsed even with reduced motion requested.

### Changes
- Tokens: `--success` 0.52→0.46 L, `--info` 0.52→0.47, `--destructive` 0.55→0.50. All status text now meets AA on its tinted background.
- Focus: links, summaries, and checkboxes get a solid 2px `--ring` outline (`:focus-visible`).
- Skip to main content link in the clinic and portal layouts; the portal `<main>` now has `id="main"`.
- The 404 page uses a `<div>` instead of a nested `<main>`.
- `ActionForm` gained an inline two-step confirmation (no modal). The confirm button receives focus, the message explains the consequence, and "Keep it" cancels. Used for deactivate account, deactivate medicine, staff cancel appointment, and student cancel request.
- Filters: two per row on phones (`w-[calc(50%-.375rem)] sm:w-*`).
- Tab padding is tighter on phones.
- Student header secondary actions use the small button size.
- Reports table width is capped (max-w-2xl, or 3xl for medication usage), so counts sit next to their labels.
- Appointment remarks span the full row.
- The skeleton respects `prefers-reduced-motion`.

### After
- axe: **0 violations on all 34 pages**. Overflow: 0 at 360, 768, and 1024px.
- Keyboard and focus checks: **16/16**. Covered:
  - skip link first in tab order, visible on focus, jumps to `#main`;
  - solid 2px focus ring on table links;
  - inline confirmation reachable by keyboard, takes focus, "Keep it" cancels without submitting;
  - mobile menu opens with Enter, Escape closes it, and focus returns to the menu button;
  - invalid fields carry `aria-invalid` and `aria-describedby`, and form errors sit in an alert region;
  - portal skip link and a single `<main>`.
- Seeded smoke tests: **29/29**. `tsc` passes; lint has 0 errors (5 warnings in `.pixel-agents/`); the build passes.
- The write-based E2E suites (Phases 3–7 and 8A) were updated for the confirm step but **not run**, because they create rows and issue demo stock, which would change the seeded demo data. Run them on a fresh database, or seed again afterwards.

### Remaining (minor)
- At 360px the student header still wraps to 3 short rows. Acceptable; an overflow menu would remove it.
- Record tabs scroll sideways on phones; the cut-off tab shows that more exist.
- Buttons are 32px tall. That meets WCAG 2.2 AA target size (24px) but not the 44px comfort guideline.
- Not tested: screen readers (NVDA/VoiceOver), 200% zoom, and Windows high-contrast mode.
- No `PRODUCT.md` or `DESIGN.md` yet; `/impeccable init` and `document` could record the design system.

## Phase 8C: Authentication finalization and final QA — 2026-10-14
### Authentication
- **Migration 0010 reviewed:**
  - compatible with registration by email, student number, and password;
  - works whether "Confirm email" is on (the profile is created when the email is confirmed) or off (created at sign-up);
  - offline PGlite suite **160/160**; sha256 `58bb25c8…`;
  - **not applied**.
- **Built behind `STUDENT_REGISTRATION=enabled` (off by default, server-only):**
  - `/register` (`registerStudent` action; Student ID sent as `user_metadata`; generic error messages; never echoes the password);
  - `/auth/confirm` (PKCE `code` and `token_hash`; same-site redirects only);
  - `/students/registrations` for clinic personnel (pending list, matching record, approval through `approve_student_link` with an inline confirmation);
  - a sidebar Registrations count;
  - the login link to registration;
  - "Pending approval" label in the user list.
- `types/database.ts` updated by hand to match 0010. Regenerate it after applying.
- `scripts/create-admin.mjs`: first administrator; hidden password prompt; refuses if an administrator exists; no credentials in code. Not run.
- `docs/AUTH_PROVISIONING.md` §4 and §7 rewritten, including the risks of running without email confirmation.

### UI and accessibility follow-ups
- At 360px, the student header's Edit and History report buttons are icon-only (labels kept for screen readers), so the header fits in 2 rows.
- Forced colors: only the current tab is underlined, and the current sidebar item has a highlight outline. Before this fix, transparent borders made every tab look selected.

### QA (production build, live project)
- **Isolated full regression: 171/171** (Phase 3 27, Phase 4 19, Phase 5 44, Phase 6 18, Phase 7 40, Phase 8A 23).
  - The suites were retargeted at isolated fixtures: demo-flagged `DEMO-9001`–`9003`, `Fx ` medicines, a fixture student account, and `E2E-` rows.
  - All fixtures were removed afterwards.
  - **Approved demo data unchanged**: the SHA-256 snapshot of `DEMO-0001`–`0018` with their health records, visits, appointments, and incidents, the 12 seeded medicines, their transactions, and clinic settings matched before and after (`0eb0126d…`).
- **Auth surfaces, zoom, and forced colors: 26/26.**
  - Registration hidden while off; confirm route rejects a missing or bad token and never redirects off-site; generic wrong-password error; signed-out redirect; sign-out.
  - 0 horizontal scroll at 200% zoom (640px) and at 320px on the main pages and the portal.
  - Forced colors keep focus outlines and button borders.
- Keyboard **16/16**, seeded smoke **29/29**, axe **0 violations on 34 pages**, 0 overflow at 360, 768, and 1024px.
- `tsc` passes; lint has 0 errors (5 warnings in `.pixel-agents/`); `next build` passes.

### Handoff documents
- `README.md` (setup, environment, migrations, demo data, accounts, structure, limitations)
- `docs/TEST_CASES.md` (all §13 criteria with expected and actual results)
- `docs/DEPLOYMENT.md` (checklist)
- `SYSTEM_SPEC.md` v2.2 §16 (implementation status)
- `PLAN.md` status table
- `.env.example` (`STUDENT_REGISTRATION`)

### Waiting for approval
1. Apply migration 0010, then regenerate types.
2. Supabase Auth settings: sign-ups on; "Confirm email" off for the demonstration (risks documented) or on with SMTP; Site URL and redirect URLs; minimum password length.
3. Set `STUDENT_REGISTRATION=enabled`, then run the live registration test (register → pending → approve → request).
4. Create the real first administrator with `scripts/create-admin.mjs`.
5. Before deployment: rotate the service-role key; remove the dev accounts; enable leaked-password protection; decide on email delivery (Q-A1).

## Public landing page — 2026-10-20

Approach: the landing page extends the existing visual system: deep-green tokens, Geist, and the compact shadcn components. Nothing new was invented. Authenticated dashboards, auth logic, the database, and Supabase settings are unchanged.

### Routing
- `/` now shows the public landing page to signed-out visitors and to signed-in accounts that are blocked (no profile, or inactive).
- Signed-in users with a valid role are still redirected to `ROLE_HOME`. The owner chose this so the login action and `/auth/confirm` (both redirect to `/`) keep working unchanged.
- `lib/supabase/proxy.ts`: `/` (exact match only) added to the public paths. Every other route still redirects signed-out users to `/login`.

### Files
- `app/page.tsx`: renders `LandingPage` instead of redirecting signed-out users to `/login`. Has its own page title.
- `features/landing/landing-page.tsx`: hero, features, how it works, about, closing CTA, footer.
- `features/landing/site-header.tsx` (client): sticky header, skip link target, and the mobile disclosure menu. The menu has `aria-expanded`/`aria-controls`, closes on Escape (focus returns to the toggle), closes on link click, and closes when the viewport reaches `lg`.
- `features/landing/hero-visual.tsx`: illustration of a student appointment request and its status track, labeled "Illustration · sample data".
- `features/landing/sections.ts`: shared anchor list.
- `app/globals.css`: smooth anchor scrolling on the landing page only, under `prefers-reduced-motion: no-preference`.

### Registration flag
- `STUDENT_REGISTRATION` is not set, so registration is off.
- Get Started goes to `/login`. Header and closing-CTA "Sign Up" are disabled buttons, with "(temporarily unavailable)" for screen readers.
- A visible notice reads "Student sign-up is temporarily unavailable". With the flag on, the same controls link to `/register`.
- The page states that administrator and clinic personnel accounts are not publicly registered.

### Content
- Feature cards name who uses each module, so no staff-only feature reads as available to students.
- No statistics, testimonials, or health-outcome claims.
- WUPCare is described as a proposed system developed for Wesleyan University-Philippines, "not an official university service".
- The footer disclaimer says WUPCare is not a replacement for professional medical care, does not diagnose or prescribe, and is not for emergencies.

### QA (production build, signed out)
- `tsc` passes. ESLint on app code: 0 issues. `npm run lint`: 0 errors (the same 5 warnings in `.pixel-agents/`). `next build` passes.
- Landing E2E (Edge via `playwright-core`, installed outside the project): **43/43**.
  - 0 horizontal overflow and no element outside the viewport at 360, 768, 1024, and 1440px.
  - axe (WCAG 2.0/2.1 A/AA + best practice): 0 violations at all four widths and with the mobile menu open.
  - Section links land below the sticky header.
  - Sign In → `/login` from the header, the mobile menu, and the closing CTA. Get Started → `/login`.
  - Sign Up is disabled while the flag is off. `/register` still returns 404.
  - Skip link comes first, and keyboard focus is visible throughout.
  - The mobile menu opens, closes on Escape, and closes on link click.
  - Reduced motion turns smooth scrolling off.
  - Signed out, `/dashboard`, `/portal`, `/students`, `/admin/users`, and `/reports` → `/login`. `/login` renders.
- Not run: signed-in role redirects (admin and clinic personnel → `/dashboard`, student → `/portal`). The dev-account passwords were not available. That code path (`getAuthState` → `ROLE_HOME`) did not change.

### Header refinement — 2026-10-20
Only `features/landing/site-header.tsx` changed. The hero, sections, footer, and closing CTA are unchanged.
- **Logo:** the logo and wordmark form one link to `/` (`aria-label="WUPCare home"`, 44px tall). On the landing page it clears any `#hash` and scrolls to the top. The header "Home" item is removed (the footer still has it).
- **Nav:** Features, How It Works, About, each 40px tall. The section under the header gets `aria-current="location"` (IntersectionObserver) and deep-green text. The sticky-header offset uses the existing `scroll-mt` classes.
- **Auth pair:** Sign In and Sign Up share one height (40px; 44px in the mobile menu), radius, and type style.
  - Sign In: white background, deep-green border and text, links to `/login`.
  - Sign Up with registration on: solid deep green, links to `/register`.
  - Sign Up with registration off (current): the same shape in a muted, dashed style with a lock. It uses `aria-disabled` (still focusable and inert), with `aria-describedby` set to "Student sign-up is temporarily unavailable." On desktop the text shows as a tooltip on hover or focus; in the mobile menu it is printed below the button.
- **Mobile:** the menu toggle is 44×44. Home is gone from the menu. Logo, links, and Sign In close the menu.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - Header suite **68/68** at 360/768/1024/1440: overflow, axe 0 violations (including the menu open), target sizes, button consistency, scroll offset, `aria-current`, tab order and focus rings, the disabled Sign Up's description and tooltip, Escape and close-on-navigate, and signed-out route guards.
  - Landing regression suite **42/42**. It had 43 checks before; the header "Home" check was removed.

### Features section redesign — 2026-10-20
Only the Features section changed (`Features()` and `FEATURES` in `features/landing/landing-page.tsx`, plus the new `features/landing/feature-visuals.tsx`). The other sections are unchanged.
- **Heading:** "WHY WUPCARE?" eyebrow, "Everything Your Campus Clinic Needs, In One Place.", and the requested description, left-aligned with the grid.
- **Cards:** six, in the requested order, 3×2 at `lg`, 2 columns at `sm`, 1 column on mobile.
  - Each card has a 14px radius, a thin border, a sage visual area (208px), then the title and description.
  - On hover the border turns green and a soft shadow appears; with reduced motion the change is instant.
- **Visuals:** six mini UIs built from Tailwind and small Lucide icons: health profile, week calendar with an approved slot, consultation checklist, stock bars with low/expiring flags, incident report, and metrics with a bar chart.
  - They are `aria-hidden` and not interactive.
  - All data is fictional (e.g. `DEMO-0007`, "Sample Student"), with a caption: "Illustrations use fictional sample data."
- **Copy:** descriptions name who uses each module; staff-only features are not presented as student features.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - Features suite **41/41** at 360/768/1024/1440: order, column count, equal row heights, heading alignment, visuals hidden and not clipped, radius, no controls, no overflow, axe 0 violations, reduced motion.
  - Header suite 68/68 and landing suite 42/42 still pass.

### How It Works section redesign — 2026-10-20
Only `HowItWorks()` and `STEPS` in `features/landing/landing-page.tsx` changed, plus the new `features/landing/step-visuals.tsx`. The unused `SectionHeading` helper was removed. The other sections are unchanged.
- **Band:** a deep-green rounded band with a faint brand-cross pattern, holding the "HOW IT WORKS" eyebrow, the heading "How WUPCare Works for Students", and the supporting text.
- **Steps:** four white step cards rise out of the band: 4 columns at `lg`, 2 at `sm`, 1 on mobile.
  - Each card has a numbered circle on its top edge (read as "Step N" by screen readers).
  - Below that: a sage visual area (216px) with a decorative mini UI, then the title and description.
  - Mini UIs: sign-up form, pending-to-verified review, date and time-slot picker, appointment status track. All are `aria-hidden` and fictional.
- **Note:** the existing "Only student accounts can be created here" note is kept below the cards.
- **QA (production build, `STUDENT_REGISTRATION=enabled` locally):** `tsc`, ESLint, and `next build` pass.
  - How It Works suite **49/49** at 360/768/1024/1440: copy and order, columns, no card or badge overlap, badges clear of the heading, equal heights, visuals not clipped, no overflow, axe 0 violations on the section and the whole page, nav scroll, route guards.
  - Features suite 41/41. The header suite is now flag-aware: 63/63 with the flag on.

### Landing copy and polish pass — 2026-10-20
Changed `features/landing/landing-page.tsx`, `features/landing/site-header.tsx`, and `features/landing/step-visuals.tsx`. No auth, flag, or database changes.
- **Labels:** "Sign In" became "Login" in the header, the mobile menu, the closing CTA, and the footer quick links.
- **Features:** eyebrow removed; new supporting text.
- **How It Works:**
  - New lead and steps (Create Student Account, Log In to WUPCare, Request an Appointment, Visit the Clinic & Track Status).
  - Step 2's visual is now a login form leading into the student portal. `VerifyStepVisual` was removed.
  - The "Only student accounts…" callout was removed. Its message now appears as the CTA helper line.
  - The landing copy simplifies the real flow: clinic approval is still required before a student can request an appointment, and the portal shows "Waiting for clinic approval".
- **About:** new copy.
  - Left: a larger first paragraph and role chips (clinic personnel, administrators, students).
  - Right: a card titled "What WUPCare helps improve" with a sage header and check rows.
- **CTA:** a larger green panel with the brand-cross pattern.
  - "Login" and "Create Student Account" are a matched pair, same height, radius, and type style.
  - A subtle helper line sits below them.
  - With the flag off, the second button stays disabled and the text says sign-up is unavailable.
- **Consistency:** shared `SECTION_TITLE` heading scale and `CrossPattern`. Section spacing is now `py-16 sm:py-24`.
- **QA (production build, flag on):** `tsc`, ESLint, and `next build` pass.
  - Polish suite **40/40** at 360/768/1024/1440: copy, CTA pair, labels, overflow, card visuals not clipped, axe 0 violations on the whole page.
  - How It Works 49/49, Features 41/41, header 63/63.

## Blue brand and official logo — 2026-10-20

The green theme is replaced by a medical-blue system taken from the official logo. Layouts, components, auth, flags, and the database are unchanged.

### Logo integration
- Sources: `public/images/wupcare-logoname.png` (2172×724) and `wupcare-logo.png` (1254×1254). Both are unmodified (MD5 checked before and after).
- Measured, read-only:
  - Transparent padding is about 8% on the sides and 18% top and bottom (full logo), and about 13% on every side (icon).
  - There are a few stray edge pixels.
  - Logo blue is about `#0088B8` (wordmark) and `#0090C8` (icon).
- `components/app/brand.tsx`:
  - `Brand` shows the full logo; `BrandMark` shows the icon. Both use `next/image` with static imports.
  - Each image sits in an `overflow-hidden` frame sized to the measured artwork box plus a small margin. This hides the padding and specks without editing the file.
  - The frame width follows the artwork's aspect ratio (`self-start` / `justify-self-start`, so flex and grid parents can't stretch it).
  - `sizes` is set so the chosen `srcset` candidate covers the rendered width at 1× and 2×.
- The full logo already contains the name and university, so the separate "WUPCare / Wesleyan University-Philippines" text was removed wherever `Brand` is used: login, register, 404, clinic sidebar and mobile bar, portal header, landing footer.
- Landing header: the full logo (44px) from `sm` up, the icon (40px) on phones. It links to `/`, with the name "WUPCare home".

### Tokens (`app/globals.css`)
- `--primary` is `#0A6F99`, a deeper shade of the logo hue: 5.6:1 with white, 4.95:1 on soft blue. The logo blue itself gives white text only about 4.0:1, and the suggested `#118FBD` about 3.7:1.
- New `--primary-hover` (`#085C80`), used by the shared `Button` default variant and the header Sign Up. New `--brand` (the logo blue, for selection and non-text accents).
- Neutrals are now blue-tinted:
  - background `#F7FBFD`, foreground `#163343` (12.7:1)
  - muted-foreground `#526B7B` (at least 4.9:1 on every surface)
  - soft blue `#E6F3F9` (secondary/accent)
  - border `#DCE7ED`, input `#B9CCD7`, ring `#1A8CBA` (3.8:1 on white)
  - sidebar `#F0F6F9` with active item `#DCEEF6`
- Elevation tokens `shadow-soft`, `shadow-panel`, `shadow-raised`, `shadow-float`, and `shadow-popover`, tinted from `--shadow-tint`. They replace every hard-coded green-tinted shadow in `features/landing/*`. Selection and scrollbar colors now come from tokens.
- Status colors are unchanged: success green, warning amber, destructive red, info blue (hue 250, distinct from the brand's hue 234). Chart 1 and 2 are brand blues; chart 3 moved from blue to teal so it doesn't clash with the brand.
- Text on the blue panels (How It Works band, CTA) was raised to `/90` so it keeps at least 4.5:1.

### QA (production build, signed out)
- `tsc`, ESLint, and `next build` pass.
- Branding suite **43/43** at 360/768 (2×) and 1024/1440 (1×):
  - header logo kind and link, no extra text
  - every logo loaded, undistorted (3:1 and 1:1), and sharp for its pixel ratio
  - blue token active, no overflow
  - axe (including color-contrast) 0 violations on `/`, `/login`, `/register`
  - mobile menu, primary hover, input focus ring
  - signed-out guards on 7 protected routes
- Regression: polish 40/40, How It Works 49/49, Features 41/41, header 63/63.
- Not visually checked: the signed-in dashboards, sidebar, and portal (no test credentials). They use the same `Brand` component and tokens, so they change only through those.

### About section redesign and CTA removal — 2026-10-20
Changed `features/landing/landing-page.tsx` and `features/landing/site-header.tsx` (removed the now-unused `SignUpAction`). Added `public/images/about-clinic-placeholder.jpg`.
- **Page order:** header, hero, Features, How It Works, About Us, footer. The closing CTA section ("Stay Connected…", Login and Create Student Account buttons, helper line) was removed. The header Login and Sign Up are unchanged.
- **About Us:**
  - A rounded photo banner: 4:3 on phones, 16:9 on tablets, 3:1 on desktop. The photo uses `object-cover` with a blur placeholder, so it is never stretched and there is no layout shift.
  - Over it: a large white uppercase "About Us" (`h2`, `clamp(3rem,10vw,6rem)`) on a navy wash (78% to 62% behind the title, so white text keeps at least 4:1). The banner background is also navy, so the title stays readable if the photo fails to load.
  - Below: "Better Care. / Smarter Clinic." (`h3`, the second line in `--primary`) beside the two description paragraphs (max 62ch). They stack on mobile.
- **Photo (placeholder):** "Empty hospital corridor with benches and doors" by Tasha Kostyuk on Unsplash (unsplash.com/photos/Pk-KuizxQv8), free under the Unsplash License. It was downloaded at 2400×1800 (369 KB JPEG) and served through `next/image`.
  - It is a generic clinic, not WUP. The banner carries a visible "Stock photo, not the WUP clinic" label, and the alt text describes the scene.
  - To swap in an approved WUP photo, replace the file and update `ABOUT_PHOTO_ALT`.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - About suite **61/61** at 360/768 (2×) and 1024/1440: section order, CTA gone, title and headline copy, blue highlight, banner ratio and radius, cover with no stretch and a sharp `srcset`, alt text, title within the navy wash, disclosure label, no heading/paragraph overlap, no overflow, CLS < 0.02, axe 0 violations.
  - Nav About scrolls and becomes current; Login → `/login`; Sign Up → `/register`; guards hold.
  - Regression: How It Works 49/49, Features 41/41, header 63/63, branding 43/43. The polish suite is retired: it tested the removed CTA and old About.

### How It Works: three steps — 2026-10-20
Changed `STEPS` and the step grid in `features/landing/landing-page.tsx`, and `features/landing/step-visuals.tsx`. Nothing else changed.
- **Steps:**
  1. Create Account or Login.
  2. Request an Appointment.
  3. Visit the Clinic & Track Status.

  The copy is as requested; the old fourth step was removed and the cards renumbered 1–3.
- **Visual:** `RegisterStepVisual` and `LoginStepVisual` were merged into `AuthStepVisual`, a decorative auth card with Sign Up / Login tabs (Login shown), email and password, and a footer showing the student portal. The scheduling and status visuals are unchanged.
- **Grid:** 3 equal columns at `lg`, capped at `max-w-5xl` and centered (cards about 304px). Two columns at `sm`, with the third card centered on its own row at the same width. One column on mobile. The blue band, the numbered circles, and the card overlap are unchanged.
- **Approval:** the real registration flow still requires clinic approval; only the landing copy simplifies it.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - The outerHTML fingerprints of header, hero, Features, About, and footer match the pre-change build: no other section changed.
  - How It Works **52/52** (3 per row with equal widths, tablet third card centered, desktop row centered, no overlap or clipping, axe 0 violations).
  - Features 41/41, About 61/61, branding 43/43, header 63/63.

### Footer redesign — 2026-10-20
The footer moved to its own component, `features/landing/site-footer.tsx`. `features/landing/landing-page.tsx` now imports it and passes `registrationOpen`; the old inline footer and two unused imports were removed. No other section changed (outerHTML fingerprints of header, hero, Features, and About match).
- **Top:**
  - Left: the official full logo (`Brand`, 48px, untouched PNG), "A smarter way to organize campus clinic services, student health records, and appointments.", and "Wesleyan University-Philippines".
  - Right: two labelled `nav` landmarks.
    - Explore: Features → `/#features`, How It Works → `/#how-it-works`, About Us → `/#about`.
    - Account: Login → `/login`, and Student Sign Up → `/register` only when the flag is on. When off, it shows as plain text with an "Unavailable" pill and `aria-disabled`, not a link.
  - Side by side from `md`; stacked below.
- **Wordmark:** "WUPCare" as styled text (`aria-hidden`, since the logo names the product), bold, primary blue, sized `22.7cqw` against an `@container`. It spans about 98% of the content width at every breakpoint with no overflow.
- **Bottom bar:** "© {year} WUPCare. Academic project." and "Wesleyan University-Philippines", plus the disclaimer "not a substitute for professional medical care". No contact details, social links, or legal pages were invented.
- **Links:** muted text, primary-blue hover (instant with reduced motion), the global 2px focus ring, and min-height 32px targets.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - Footer suite **49/49** at 360/768 (2×) and 1024/1440: navs and labels, real routes only, logo sharp and undistorted, copy, layout, wordmark 90–100% width without clipping, blue color, bottom bar, overflow, axe 0 violations, anchors scroll below the sticky header, hover, focus ring, Login/Sign Up routes.
  - Flag-off state checked on a second server started with `STUDENT_REGISTRATION=disabled` in its own environment (`.env.local` untouched): no `/register` link, "Unavailable" shown, `/register` 404.
  - Regression: How It Works 52/52, Features 41/41, About 61/61, branding 43/43, header 63/63.

### Footer refinements — 2026-10-20
Only `features/landing/site-footer.tsx` changed.
- **Column alignment:** the Explore/Account wrapper is one grid (`grid-cols-2`, two auto rows, `items-start`). Each `nav` spans both rows with `grid-rows-subgrid`, so both headings share row 1 and both lists share row 2. The headings use `leading-5`, the shared row gap is 12px, and links are spaced 4px apart. No per-column offsets. Measured: headings and first links at identical y at 360/768/1024/1440.
- **Cropped wordmark:** the wordmark sits in its own `overflow-hidden` box of `h-[0.665em]` (the box carries the `22.7cqw` font size), and the text is pulled up `-0.028em`.
  - Measured lower-edge crop: 11.5% (1440), 11.8% (1024), 12.1% (768), 13.3% (360). Top clearance 1–2px; sides untouched.
  - The footer itself stays `overflow: visible`, and the bottom bar is fully visible below the box. The gap above the wordmark went from 40px to 32px.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - Crop/alignment suite **40/40**.
  - Footer suite 49/49, including the flag-off server.
  - Header/hero/Features/About fingerprints unchanged.
  - How It Works 52/52, Features 41/41, About 61/61, branding 43/43, header 63/63.

## Login and Student Sign Up redesign — 2026-10-20

A UI-only change. The server actions (`login`, `registerStudent`), zod schemas, the `STUDENT_REGISTRATION` check, `/register` returning 404 while it is off, the blocked-account state, the "Supabase not configured" and "confirmation link expired" alerts, and every redirect are unchanged.

### Files
- `features/auth/auth-shell.tsx` (new): `AuthShell` and `AuthHeading`.
  - An ice-blue page with one rounded frame (max 1024px), split into a brand panel and the form card.
  - Brand panel: official logo (`Brand`), "Back to Home" → `/`, "Your Health, Our Priority.", the description, and "Wesleyan University-Philippines". Decorative SVG curves and circles appear on desktop only.
  - The required disclaimer (SYSTEM_SPEC §2.4) is in the brand panel on desktop and under the card on smaller screens.
  - Mobile: a compact brand strip (logo, back link, headline) above the form.
- `features/auth/password-field.tsx` (new): password input with a show/hide button (`aria-label` "Show/Hide …", `aria-pressed`, `aria-controls`). It uses the same label, error, and hint wiring as `TextField`.
- `app/(public)/login/page.tsx`, `login-form.tsx`:
  - "Welcome Back" / "Login to access your WUPCare account.", labels "Email Address" and "Password", 44px inputs.
  - Button "Login" / "Logging in…".
  - Footer: "New student? Create an account" → `/register` when the flag is on, otherwise "Student sign-up is temporarily unavailable", plus the staff-accounts note.
- `app/(public)/register/page.tsx`, `register-form.tsx`:
  - "Create Student Account" / "Register to access WUPCare student services.", with the existing pending-approval note.
  - Email Address, Student Number, Password (hint "8 to 72 characters.", matching `registerSchema`), and Confirm Password, both with toggles.
  - Button "Create Account" / "Creating account…". Footer "Already have an account? Login".
  - The success state (confirmation-email message) and the redirect to `/portal` (waiting-for-approval screen) are unchanged.

### QA (production build)
- `tsc`, ESLint, and `next build` pass.
- Auth suite **85/85** at 360/768 (2×) and 1024/1440. It created no accounts: registration was only submitted with invalid data, which zod rejects before `signUp`.
  - Layout, logo, copy, 44px inputs, email field in the first viewport at 360, disclaimer, no overflow, axe 0 violations.
  - Password toggle, tab order with visible focus, inline errors with `aria-describedby`, loading state.
  - Generic "Incorrect email or password." for a fictional non-existent address.
  - Register errors for empty fields, invalid email, short password, and mismatch; student number kept and passwords cleared.
  - No role selector. Login ↔ register links, Back to Home.
  - Flag off (separate server env): unavailable text and `/register` 404.
  - Signed-out guards on 6 protected routes.
- Landing fingerprints unchanged; branding 43/43.
- **Not run:** a successful login and the role redirects. The dev-account passwords are not available to me. That path (`login` → `/` → `ROLE_HOME`) was not changed.

### Show/hide password: reusable `PasswordInput` — 2026-10-20
Only `features/auth/password-field.tsx` changed.
- **Split:** `PasswordInput` (input plus eye button) is now its own export; `PasswordField` (label, error, hint) uses it. Login Password, Sign Up Password, and Confirm Password all use it.
- **Behaviour:**
  - Hidden by default; Lucide `Eye` / `EyeOff` swap.
  - The button is `type="button"`, 44px wide, inside the input's right edge, with `aria-label` "Show/Hide password", `aria-pressed`, and `aria-controls`. The Confirm Password button says "confirm password" so the two buttons on the sign-up form can be told apart.
  - Hover turns primary blue; keyboard focus shows the ring.
- **No layout shift:** the input has fixed right padding and the button is fixed width.
- **QA (production build):** `tsc`, ESLint, and `next build` pass.
  - Password suite **69/69** at 360 and 1440 for all three fields: hidden by default, button position and type, labels and icons both ways, `aria-pressed`, identical input and form boxes after toggling, value kept, no submit, Enter/Space toggle, Tab reaches the button, keyboard focus ring, hover color, independent toggles, error `aria-describedby` intact.
  - Auth suite 83/83.

### Browser tab and app icons — 2026-10-20
The icons use Next.js App Router file conventions; no `metadata.icons` override.
- **`app/favicon.ico`:** replaced the stock create-next-app icon with a PNG-in-ICO file at 16, 32, and 48px (7 KB).
- **`app/icon.png` (new):** 512×512 transparent PNG.
- **`app/apple-icon.png` (new):** 180×180 on a white tile with an 8px margin, because Apple touch icons render opaque.
- **How they were made:** all three are rendered from the icon-only `public/images/wupcare-logo.png` (unchanged, MD5 checked) with the same measured padding crop as `BrandMark`. The wide `wupcare-logoname.png` is not used for icons.
- **Header and pages:** unchanged. They keep the full logo through `Brand`; compact spots use `BrandMark`.
- **Verified (production build):**
  - `/`, `/login`, and `/register` all emit `<link rel="icon" href="/favicon.ico?favicon.<hash>.ico" sizes="48x48">`, `<link rel="icon" href="/icon.png?icon.<hash>.png" sizes="512x512">`, and `<link rel="apple-touch-icon" href="/apple-icon.png?apple-icon.<hash>.png" sizes="180x180">`.
  - All three return 200 with the correct content type and bytes identical to the `app/` files.
  - The `?<hash>` query is derived from file content, so a rebuild with new icons changes the URLs and busts browser caches.
  - Branding 43/43, auth 83/83, landing fingerprints unchanged. The auth suite's "keeps student number" check now waits for React's post-action form reset; it had been passing by timing.

## Administrator navigation, user management, and reports — 2026-10-20

A UI reorganization for the administrator role. No changes to Supabase schemas, migrations, RLS, report database functions, authentication, or the clinic personnel and student interfaces.

### Sidebar (`components/app/nav.ts`, `components/app/clinic-shell.tsx`)
- `navForRole` now returns sections. The administrator menu is:
  - Dashboard
  - **User Management:** Clinic Personnel, Student Accounts
  - **Clinic Reports:** Clinic Visits, Health Concerns, Medication Usage, Health Incidents, Appointments
  - My Account
  - Sign out (unchanged, at the bottom)
- Section labels are small uppercase captions; each list is labelled by its caption (`aria-labelledby`).
- Clinic personnel still get one unlabelled section, rendered with the same markup as before.
- While on a `/reports/*` page, report links carry the current `from`, `to`, and `scope`.

### User management
- **New routes:** `/admin/users/personnel` and `/admin/users/students`, each with `/[id]` and `/new`.
- **Shared components:** `UserList` and `UserDetail` (new) in `features/users/`. `CreateUserForm` takes `kind`, which limits the role choices (Clinic Personnel/Administrator, or Student with the existing record picker).
- **Clinic Personnel:** admin and clinic personnel accounts. Search by name or email; Role (All / Administrator / Clinic Personnel) and Status (All / Active / Inactive) filters; Add Account.
- **Student Accounts:** student accounts only. Search by name, email, or student number (the linked record's number via `account_student_numbers`, or the requested number for pending accounts); Status filter; Add Student Account. Columns are Name, Email, Student number, Status. No health data.
- **Detail pages:** the existing account page (same server actions), plus a back link. A mismatched kind redirects to the right list, so the sidebar highlight is always correct.
- **Old URLs:** `/admin/users`, `/admin/users/[id]`, and `/admin/users/new` now redirect to the matching new page. This keeps `createUser`'s redirect and the dashboard's `?role=` links working.
- **`features/users/actions.ts`:** only the revalidation changed, `revalidatePath("/admin/users", "layout")` instead of the page-only call, so the nested list and detail pages refresh after Save or Deactivate. Validation, permissions, and the actions themselves are unchanged.

### Reports
- **Shared code:** report loading moved to `features/reports/report-data.ts` and the table to `features/reports/report-table.tsx`. They are used by both report pages and contain the same queries and the same `<5` display as before.
- **`/reports`:** unchanged for clinic personnel (tabs, Group by, Apply). Administrators are redirected to `/reports/<report>` with their filters kept, so the dashboard's `?report=` links still work.
- **`/reports/[report]` (new, admin only):**
  - A page heading and description, the privacy note, Print / Save as PDF, and the table.
  - The filters are `AutoReportFilters` (new client component), with no Apply button.
    - Changing a date or Records updates `?from=&to=&scope=` through `router.replace` in a transition. The page shows "Updating…" and dims the table while loading.
    - Date changes are debounced (350 ms). A partial year (below 1900) counts as incomplete.
    - With a missing date, or To before From, nothing is sent and an inline error is shown with `aria-invalid`.
  - The database still applies the whole-month range and the suppression of counts below 5.

### QA (production build)
- `tsc`, ESLint (0 errors), and `next build` pass.
- **Signed-in suite: 86/86.** Sessions came from one-time magic-link tokens (Admin API `generateLink`) redeemed through the app's own `/auth/confirm` route, approved by the owner. No passwords changed, nothing submitted, and every session was signed out at the end.
  - **Admin:**
    - `/` redirects to `/dashboard`. The sidebar sections, items, and Sign out are correct, with no clinical items.
    - All 9 sidebar routes return 200 with the correct item highlighted. axe reports 0 violations on the lists and a report page.
    - Personnel search, role, status, and the combined filters work. Students search by student number and by email works. Empty states show.
    - Detail pages (nurse, student, own account) show the right controls, and the kind redirects work. The new-account forms offer the right roles.
    - All legacy redirects work.
    - Reports: no Apply button; the scope change auto-applies; a date typed with the keyboard applies once complete, with at most 2 report fetches; a reversed range shows an error and does not navigate; filters are kept between reports; the whole-month label shows.
    - Admin is redirected away from `/students`, `/students/:id`, `/reports/student/:id`, `/visits`, `/medications`, `/incidents`, `/appointments`, and `/students/registrations`.
    - With an admin JWT, RLS returns 0 rows from `health_records`, `clinic_visits`, `students`, `health_incidents`, `appointments`, and `medication_transactions`.
    - Mobile navigation works, with no overflow at 360px.
  - **Nurse:** the sidebar is unchanged; `/reports` still has its tabs, Apply, and Group by; the nurse is blocked from `/reports/:report` and `/admin/users/*`.
  - **Student:** `/` redirects to `/portal`; blocked from the admin and report routes.
- **Data unchanged:** all 11 baseline table hashes (students, health records, visits, appointments, incidents, medicines, transactions, settings, categories, profiles, auth users) match the earlier snapshot, and no account is banned.
- **Regression:** auth 83/83, branding 43/43, landing fingerprints unchanged.
- **Unchanged behaviour noted:** `notFound()` pages return HTTP 200 with the "Page not found" UI once streaming has started (as before), and `/reports/<unknown>` shows that page.

## Administrator refinement — 2026-10-20

No schema, migration, RLS, report function, or authentication changes. The clinic personnel and student interfaces are unchanged. Two small shared exceptions: the password form now has show/hide toggles and the hint "8 to 72 characters." (the existing rule), and `PageHeader` titles wrap long words.

### Sidebar
- "My Account" was removed from the admin nav.
- **Profile card:** above Sign out, a link to `/account` with initials, display name, role, and a chevron. It has hover, focus, and `aria-current` states and is the same in the mobile sheet. Clinic personnel keep their nav "Account" item and plain name block.

### Account (`/account`, administrators)
- Display name form: new `updateDisplayName` action in `features/account/actions.ts`, with `DisplayNameForm`.
  - Whitespace is collapsed and trimmed. Length must be 2–120, and control characters and `< > { }` are rejected.
  - It runs `requireRole("admin")` and updates only the caller's own row, with the caller's session.
  - This works under the existing RLS (`profiles_update`: admin only; `guard_profile_update` blocks role and active changes), so no database change was needed. Clinic personnel have no self-update policy, so they get no name form.
  - `revalidatePath("/", "layout")` refreshes the sidebar.
- Email and role are read-only.
- Password change uses the existing `changePassword` action with `PasswordField` toggles.

### User management
- **Clinic Personnel:** `role = clinic_staff` only. The role filter was removed. Administrator accounts are no longer listed; their detail pages still open at `/admin/users/personnel/<id>`.
- **Student Accounts:** students only, as before.
- **Filters:** `AutoListFilters` (new). Search updates the URL after 300 ms; Status applies at once; `?page` is dropped. A loading line shows, the table dims, and empty states remain. There is no Apply button.
- Row links carry `?return=`, so the detail page's back link restores the search and status.
- **Actions column:** `RowActions` (new), a three-dot Radix `DropdownMenu` (`components/ui/dropdown-menu.tsx`, new; no new dependency) with a confirm `AlertDialog` (`components/ui/alert-dialog.tsx`, new).
  - Personnel menu: View / Edit Account, Change Role to Administrator, Deactivate/Activate. Students: View / Edit Account, Deactivate/Activate.
  - It uses the existing `setUserActive` and `updateUser` actions; the role change uses `updateUser`, which already refuses student and self changes. The admin's own row has no menu.
  - Results are announced in a live region. Focus returns to the row's menu button when the dialog closes.

### Width
- `app/(clinic)/layout.tsx`: `<main>` and the footer are full width for administrators (`max-w-none`); clinic personnel keep `max-w-6xl`.
- `ReportTable`: a `fullWidth` option used by `/reports/[report]` (the label column takes the remaining width, numbers right-aligned without wrapping). Clinic personnel `/reports` keeps its widths.
- Admin dashboard: the Active users grid spans the width. Stats link straight to `/reports/<report>` and to the two lists; the Administrator stat has no link because administrators are no longer listed.

### QA (production build)
- `tsc`, ESLint (0 errors), and `next build` pass.
- **Refinement suite: 88/90** (signed in with one-time magic-link sessions). The 2 failures are only because dev-admin's display name is wrong (see the incident below).
  - Sidebar items and the profile card (keyboard to `/account`, `aria-current`, focus ring).
  - Account: field, email read-only, password toggles, validation errors (short, blank, markup, 121 characters), password validation.
  - Personnel: `clinic_staff` only (checked against the database), no role filter or Apply. The keyboard-operable menu has the right items; the deactivate and role-change dialogs open, and Cancel/Escape close them with focus back on the menu button. View/Edit works.
  - Filters: search auto-applies with a single fetch, Back keeps the filters, Status applies at once, empty state, clearing the filters.
  - Students: student-only list, menu items, search by number, axe 0 violations.
  - All 5 reports and both lists at 1440/1024/768/360: the table spans the content width and aligns with the header and filters, no overflow. Empty state centered across both columns; wide label column with right-aligned numbers.
  - Report filters auto-apply and are kept between reports. Print hides the sidebar, filters, and button and shows the print header; PDF renders.
  - Admin is blocked from clinical pages. Nurse and student are blocked from the admin pages. The nurse sidebar and `/account` are unchanged, and the nurse `<main>` keeps `max-w-6xl`.
  - The suite's own before/after check of `profiles` passed (no writes).
- Regression: auth 83/83, branding 43/43, landing fingerprints unchanged.
- **Database:** students, health records, visits, appointments, incidents, medicines, transactions, and auth users all match the baseline; dev-admin is still an active admin; no account is banned.

### Incident: dev-admin display name changed by a test (unresolved)
- **What happened:** a validation test meant to send a 121-character name typed it into an input with `maxLength=120`. The browser kept 120 characters, which is valid, so the save succeeded on two runs. dev-admin's `profiles.full_name` is now 120 `x` characters, and `updated_at` / `updated_by` show the edit (2026-10-20 05:41 UTC, by dev-admin).
- **Original values:** `full_name = "Dev Administrator"`, `updated_at = created_at`, `updated_by = null`. Verified: these reproduce the morning baseline hash.
- **Restore attempts:** a trigger-bypassing restore and a plain update via the Supabase MCP were both refused by the permission policy, so the name is not yet restored. The test now sets the value directly and aborts if the value is altered.
- **No other effect:** role, active status, email, password, other accounts, and all clinic data are unaffected.


## 2026-10-20 stabilization

Local code, tests and documentation only. Existing uncommitted UI/auth/report changes were preserved. No git staging, commits, pushes, deployment, schema/migration/policy changes, or live database mutations.

### Display names

Confirmed the incorrect /s+/g expression and malformed control-character regex in the existing account action. Moved validation into features/account/schema.ts: controls/invisible characters and markup are rejected before normalization, whitespace collapses and trims, normalized length is 2-120. Filipino names, punctuation and lowercase s are preserved. The authenticated administrator still updates only their own full_name through their session and RLS.

lib/auth/display-name.ts supplies missing/blank-name fallbacks: Administrator, Nurse, Student. The authentication DAL resolves this once for dashboards, sidebars and account pages; account-list name cells also reuse it. Nonblank custom names are preserved. The known active administrator 51d64f89-3b99-47bf-b262-480cbe8152ba still has exactly 120 x characters (confirmed read-only). No automatic corruption heuristic was added. The guarded proposal in docs/SECURITY_REVIEW.md restores Dev Administrator using a normal audited update; explicit approval is still required.

### Pagination and complete aggregates

- Reused existing Supabase range queries for Students, Visits, Appointments and Incidents. Changed shared page size from 25 to 10; appended unique ID ordering and handled both PostgREST range errors and empty out-of-range pages.
- Added ten-row range queries/exact counts to Clinic Personnel, Student Accounts, Medicine Inventory, per-medicine Transaction History, and own Student Appointment History. Account detail return links keep the page. Pending student appointment count is independent of the displayed history page; failures keep request creation disabled.
- Shared footer shows Showing X-Y of Z records, Page N of M, Previous and Next. Empty lists show 0-0 with disabled controls. Page links preserve URL filters. Enhanced GET filter forms use next/form for client navigation and omit page to reset filters; existing auto filters drop page too.
- Medicine expiry/active/scope/search filters run before ranges. The low-stock view preserves stock_quantity <= reorder_level via bounded server scans of stock metadata, keeping only ten requested IDs before fetching full rows. ID ordering is stable. This avoids a new view/function but has linear metadata-read cost. No service-role access was introduced.
- Reports keep complete authorized aggregate groups on the server and render ten groups for screen, with off-page groups included for print/PDF. Full totals and suppression are independent of the visible page. Existing student-history print reports stay unchanged. lib/collect-rows.ts traverses API caps for aggregate groups, account-number lookup, and full ledger metadata; failed report batches do not display partial totals. The existing ledger-versus-stock warning uses the full ledger, not a page sum.

### Read-only security and database status

Used only configured supabase-wupcare MCP. Reviewed Security Advisor, live function definitions/ACLs, authorization helpers and composite foreign keys. All 13 reported public definer functions have fixed empty search paths, qualified application references, no anon/PUBLIC execution, and active-role checks. Their authenticated execution is intentional for the approved RPC interfaces. No exposed authorization defect identified in this review scope; no remediation migration proposed. One separate Auth warning remains: leaked-password protection disabled. Detailed per-function findings and review limits: docs/SECURITY_REVIEW.md.

Migration 0010 is already applied, version 20261020032859. Pending-registration schema and approval function verified. No new registration or email-delivery test was run, and current Auth settings were not changed or certified. Registration, security and deployment readiness are not claimed.

Before/after hashes match for all nine checked tables: profiles (3), auth.users (3), students (18), health_records (18), clinic_visits (40), appointments (15), medicines (12), medication_transactions (52), health_incidents (8). These snapshots bracketed the implementation/verification work and show existing accounts and approved demo records unchanged. They are read-only evidence, not an audit of unrelated concurrent activity outside the snapshot interval.

### Reproducible verification

- npm test: 89/89 pass. Node built-in runner plus the existing TypeScript compiler, no new dependencies. tests/register.cjs does not load .env.local, clears Supabase environment variables, blocks fetch, and rejects unmocked server/admin clients. Fictional in-memory query fixtures only; no scratchpad credentials.
- Tests cover Filipino names, lowercase s, Unicode spaces and controls, length boundaries, all three fallback roles, saving only the caller's normalized name, 0/1/10/11/25+ records, ties and complete page traversal, URL/filter retention and out-of-range redirects, multi-page combined search/filters, low-stock batches, role guards and account validation/self-protection, pending requests outside a page, 1,201 aggregate rows/API caps, full report totals/print markup, and full ledger sums.
- npm run typecheck: pass.
- npm run lint: zero errors; five pre-existing unused-variable warnings in .pixel-agents/dashboard/app.js.
- npm run build: pass, including the final next/form and low-stock changes.
- git diff --check: pass.
- New visual responsive/browser/PDF QA was not run: browser inventory returned no connected surfaces; in-app browser creation returned unavailable. Markup tests verify wrapping classes, disabled navigation, off-page print rows and full totals, but cannot certify rendered widths or actual PDF layout. Live JWT/RLS tests were not rerun; DAL/query tests use mocks, and database authorization was reviewed from definitions. Historical browser/PGlite/live results above are not represented as new runs.

### Files changed by this task

- Display names: features/account/actions.ts, features/account/schema.ts (new), lib/auth/display-name.ts (new), lib/auth/dal.ts.
- Pagination: lib/pagination.ts (new), components/app/list-controls.tsx, app/(clinic)/students/page.tsx, visits/page.tsx, appointments/page.tsx, incidents/page.tsx, medications/page.tsx, medications/[id]/page.tsx, app/(portal)/portal/page.tsx, features/users/user-list.tsx.
- Aggregate/metadata completeness: lib/collect-rows.ts (new), features/medications/low-stock-page.ts (new), ledger-total.ts (new), features/reports/report-data.ts, report-table.tsx, auto-report-filters.tsx, app/(clinic)/reports/page.tsx, reports/[report]/page.tsx.
- Test infrastructure: package.json, eslint.config.mjs; tests/register.cjs, query-client.cjs, names.test.cjs, pagination.test.cjs, auth.test.cjs, accounts.test.cjs, lists.test.cjs, reports.test.cjs (all new). Package lock/dependencies unchanged.
- Documentation: README.md, PLAN.md, SYSTEM_SPEC.md, docs/DEVLOG.md, TEST_CASES.md, DEPLOYMENT.md, AUTH_PROVISIONING.md; SECURITY_REVIEW.md (new).

Outstanding: approval for the single administrator-name correction; connected-browser responsive/keyboard/print QA; authorized live RLS/registration/email verification; owner security/deployment checklist. No permission escalation was rejected during this task; database writes were deliberately not attempted.


## Administrator monthly report simplification - 2026-10-20

Implemented the requested local Month, Year and Records dropdowns on all five administrator reports, using the existing medical-blue components and equal filter widths. Defaults use the current Asia/Manila month/year; each change immediately replaces the URL and resets pagination. Selected dates always span exactly one full calendar month, with leap-year handling. Legacy date-range links select their valid starting month; new month/year parameters take precedence. Sidebar report links keep the chosen month/year/scope. Full-width reports, ten-row pages, full totals and complete print output remain. Nurse date-range/daily controls and Student interfaces are unchanged.

Read-only live inspection used only supabase-wupcare. All five report RPCs call private.mask_count(bigint,boolean); only these five source references were found. The live helper returns null for admin counts 1-4. Its immutable invoker status, empty search path and owner-only EXECUTE were confirmed from the catalog. A direct read-only execution probe returned permission denied; no privileges were changed to bypass that restriction.

Prepared supabase/migrations/0011_exact_report_counts.sql, NOT APPLIED. The only function-body change is replacing the small-count CASE with SELECT p_count. Signature, invoker security, search path, ownership and ACL are retained. Existing public report RPCs, report_range/require_role authorization, monthly admin constraints, aggregate-only projections, and clinical RLS are untouched. Staff results already use exact counts and do not change. The existing renderer accepts exact numeric counts after application and still handles masked nulls safely until then. No reconstruction of null counts, direct clinical-table reads in report loading, or service-role bypass.

Exact DDL, before/after diff, rollback SQL and approval-dependent verification are documented in docs/ADMIN_REPORTS.md. The old blanket suppression message on admin report pages now states monthly/aggregate-only access. The live database continues suppression until 0011 is approved and applied; exact live small-count totals are not claimed as verified.

Verification: npm test 109/109 pass (20 new report tests); npm run typecheck passes; npm run lint zero errors and five existing .pixel-agents warnings. Final npm run build passes after the React ref lifecycle correction. Tests cover calendar boundaries/leap years, current-month defaults, invalid/legacy URLs, immediate and rapid dropdown updates, all scopes and five monthly RPC contracts, exact numeric responses, full-width/print markup, print invocation, sidebar retention, Nurse regression and actual DAL page restrictions. Fixtures are fictional and network blocked. No new dependencies. Browser inventory returned no connected surfaces: responsive screenshots and actual PDF rendering remain unverified. Proposed migration execution and live post-migration monthly totals/RLS tests await approval and an authorized environment.

Files changed in this follow-up: features/reports/admin-month.ts (new), auto-report-filters.tsx, report-data.ts; app/(clinic)/reports/[report]/page.tsx; components/app/clinic-shell.tsx and nav.ts (admin report-link query keys/comment only); tests/admin-reports.test.cjs (new); supabase/migrations/0011_exact_report_counts.sql (new proposal); docs/ADMIN_REPORTS.md (new), DEVLOG.md, TEST_CASES.md, SECURITY_REVIEW.md, DEPLOYMENT.md, README.md and SYSTEM_SPEC.md. No existing migrations were edited. No database records or RLS changed, no deployment or git staging/commit/push.


## Sensitive-action confirmation standardization - 2026-10-20

Reviewed existing account-menu Radix dialogs and inline ActionForm confirmations. Reused the existing Radix primitives and menu flow, extracting shared confirmation rendering and an async UI runner. The runner blocks rapid duplicate events, shows pending controls, keeps returned/connection errors visible without dismissing, closes only on successful results, and rethrows framework redirects. Cancel does not dispatch or reset data. Existing success feedback and server revalidation are retained. Focus starts on Keep/Cancel, returns to the trigger, or falls back to main if a promoted row disappears. Escape closes only while idle. The compact existing white surface now scrolls within the viewport; mobile buttons stack.

Protected: account deactivate/reactivate and role changes from menus/details; temporary password replacement; changed Inactive/Graduated student status; appointment decline/reschedule/cancellation; medicine deactivation and stock adjustment; own pending appointment cancellation; existing student-link approval. Role prompts show current/new roles. Ordinary edits do not prompt. Existing role/self/student/ownership/status/retention restrictions stay on the server. No server action, authentication, RLS, schema, migration, record or account was changed. No Supabase write tests, dependencies, deployment, git staging, commits or pushes. Previous unapplied report migration was not touched.

Verification: npm test 125/125 pass (16 new tests); npm run typecheck passes. ESLint and final production build results are recorded below. New tests use fictional data and isolated hook/event callbacks, not production accounts. Tests cover cancellation, duplicate submission, pending controls, persistent errors and retry, success feedback/refresh, conditional role/status prompts, real server role guards before database access, focus/Escape callbacks and mobile layout class contracts. Browser inventory returned no connected surfaces. Actual Tab/Shift+Tab trapping, browser focus across menus/portals, screen readers and visual/mobile QA remain unverified.

Changed files and before/after action inventory: docs/CONFIRMATIONS.md. New shared components: confirmation.ts, confirmation-dialog.tsx, use-action-runner.ts; integrated through ActionForm, account menus/details, student form, staff appointment/medicine/registration pages and portal cancellation. AlertDialog styling only adds viewport-safe scrolling. No native window.confirm or window.alert.

Final confirmation checks: production build passed after the final focus fallback change. ESLint zero errors (five pre-existing .pixel-agents warnings), TypeScript passed, and the full 125-test suite plus focused confirmation reruns passed. git diff --check passed.


## Development import error recovery - 2026-10-20

Reported: features/users/user-detail.tsx could not resolve @/components/app/action-form in the running development server. Inspection confirmed components/app/action-form.tsx exists, exports the named ActionForm, and resolves correctly through the existing @/* tsconfig mapping. The live Next MCP endpoint confirmed the server uses this exact workspace. The development log preserved the missing-module diagnostic during the previous delete/recreate edit of ActionForm (and an earlier equivalent replacement of AutoReportFilters); current source files are valid. Evidence supports a transient missing-file/watch-state error from file replacement, not an incorrect import/export. The current error was not reproduced with the restored source.

Smallest recovery: refresh action-form.tsx last-write metadata without changing any bytes (SHA-256 unchanged), then explicitly compile the affected routes through the running Next 16 compile_route MCP tool. No application code, confirmation implementation, server action, authentication, Supabase or RLS was changed. Avoid delete/recreate edits to live imported files; use an in-place patch.

Live dev verification: personnel list/detail and student list/detail all compile with issues: []; get_compilation_issues also reports issues: [] for the entire route graph, covering recently modified imports. get_errors reports empty configErrors/sessionErrors. Anonymous HTTP requests to the personnel list/detail and student detail return 307 to /login without a missing-module page; authentication remains enforced. No existing session was changed or privileged test login created. Signed-in account/detail and confirmation behavior were checked through the existing isolated tests, not through a live browser.

Checks: npm run typecheck passes; npm test 125/125 pass, including confirmation cancel/duplicate/pending/error/success/focus callbacks and account UI/authorization fixtures; ESLint zero errors and five existing .pixel-agents warnings. Production build result is recorded below. No new dependencies, git staging/commit/push or deployment. Source files unchanged; only action-form.tsx watcher metadata and this log were updated during this recovery.

Final recovery verification: npm run build passed. After the production build, the running dev server still reports no compilation issues or current errors.

## System-wide confirmation audit and logout confirmation — 2026-10-20

### Audit result
All three roles were re-audited against `docs/CONFIRMATIONS.md`. The only missing safeguard was **logout**: the clinic sidebar (admin and clinic personnel, desktop aside and mobile sheet) and the student portal header submitted `logout` immediately. One copy gap was also found: the admin list-menu **Reactivate Account** prompt did not name the account.

### Completed
- New `components/app/logout-button.tsx` reuses the shared `ConfirmationDialog` and `useActionRunner`. Title "Log out of WUPCare?", description "You'll need to log in again to access your account.", Cancel / Log Out (blue, non-destructive), "Logging out…" pending label.
- New `confirmedLogout()` server action in `features/auth/actions.ts`. It performs the same Supabase `signOut()`, but returns an error instead of redirecting when sign-out fails, so the dialog stays open with feedback. The original `logout` is unchanged and still used by the blocked-account notice on `/login`. That page has no session worth protecting, so it keeps a direct sign-out.
- The redirect to `/login` happens only after successful sign-out. The Next.js redirect is rethrown, not swallowed. After it starts, the dialog stays locked so it cannot submit again.
- `Confirmation` gained an optional `pendingLabel`. The default stays "Working…".
- `features/users/row-actions.tsx`: the reactivate prompt now names the affected account.
- No schema, migration, RLS, authorization rule, or record was changed.

### Verification
- `npm test`: 131/131 pass. This includes 6 new tests in `tests/logout.test.cjs`: the dialog opens without signing out, Cancel makes no call, a double confirm runs sign-out only once and keeps the dialog pending, the redirect propagates, failure and network errors stay open and allow retry, `confirmedLogout` returns an error on failure and redirects on success, and the shell/portal source contract covers all three roles on desktop and mobile.
- `tsc --noEmit`: pass. ESLint: 0 errors (5 existing warnings in `.pixel-agents/dashboard/app.js`). `next build`: pass.
- Not tested in a browser (no browser session was used). Manual QA: the nested dialog over the mobile navigation sheet, real focus return, and Escape behavior.

## Clinic personnel portal simplification — 2026-10-20

Details and pending proposals: `docs/NURSE_PORTAL.md`.

### Completed (UI only; no database, RLS, Auth, or record changes)
- Grouped clinic personnel sidebar (Student Management, Clinic Operations, Reports & Settings). The Registrations and Account items are removed. The administrator's profile card (linking to `/account`) is now shared by clinic personnel, above the confirmed Sign out.
- Fixed `/s+/` regexes in `clinic-shell.tsx` (wrong initials, invalid section ids).
- Dashboard: same counters and queries, with icons, panel links, `EmptyState` empty states, and an overflow note. A pending-registrations notice links to `/students/registrations` while manual verification is still required.
- `FilterBar` became `AutoFilterBar` (`components/app/auto-filter-bar.tsx`). There is no Apply button: search is debounced 300 ms, selects apply immediately, and dates apply once valid. Filters stay in the URL, the page resets to 1, unchanged filters make no request, and results dim with an "Updating…" status while loading. It is used by the Students, Visits, Appointments, Medications, Incidents, and Reports lists.
- Clinic personnel pages use the full main width. Visit, incident, student, and health-record forms are capped at `max-w-4xl`.
- `/account` uses the administrator's layout for clinic personnel. Name, email, and role are read-only. The password form is unchanged.

### Verification
- `npm test`: 139/139 pass. New `tests/nurse-portal.test.cjs` (8 tests) covers: nav structure (admin and student unchanged), the profile card placed before Sign out, the regex fix, the width cap removed, the account name form still admin-only, the "Nurse" fallback, filter query and timing helpers, the 300 ms debounce with a single request, selects cancelling a pending search, incomplete dates waiting, unchanged filters skipping, and no Apply buttons. The harness gained a no-op `useEffect`.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- Not browser-tested: real typing, date-picker events, mobile sheet, and visual layout remain manual QA.

### Blockers (need approval; drafts in `docs/NURSE_PORTAL.md`)
1. Removing manual registration approval requires changing `handle_new_auth_user()`. The proposal auto-links only when the confirmed email matches the clinic's `students.email` for that number. Otherwise the account falls back to the existing queue.
2. Editable display names for clinic personnel require a scoped `update_own_display_name()` function, because RLS `profiles_update` is admin-only.

## Search, date picker, filter, and layout consistency — 2026-10-20

### Completed (UI and query construction only; no schema, RLS, Auth, or record changes)
- **Combined student search:** the separate College filter is removed. Search covers student number, first/middle/last name, college, and program (`STUDENT_SEARCH_COLUMNS`, `ilikeEveryWord` in `lib/forms.ts`). It is server-side, case-insensitive, and partial. Each word must match some column (one PostgREST `or()` per word, ANDed with Year/Status/Records), up to 5 words. Punctuation is matched literally and wildcards are stripped. Pagination (10, exact count, `id` tiebreak) is unchanged. The new-visit, new-incident, and new-appointment student picker uses the same search and no longer has a Search button.
- **Shared date/time control:** `components/app/date-input.tsx` (`DateInput`). It keeps the browser's native date, datetime-local, and time pickers, the same calendar as the appointment form. It adds a consistent icon per type, h-8 height, the existing input focus ring, click-anywhere to open (`showPicker`), and a Clear button for optional fields only. `TextField` routes date/time types through it; `FilterDate` uses it with Clear. Types, min/max, step, required, clinic-hours limits, and appointment validation are unchanged. Values stay as plain local strings, so no timezone conversion was added. Admin Month and Year selects are unchanged.
- **One automatic filter bar:** the admin `AutoListFilters` now wraps the shared `FilterBar`/`AutoFilterBar`, so its duplicate debounce logic is removed. No ordinary list filter has an Apply or Search button.
- **Layout:**
  - `ReportTable` always fills the width with narrow count columns; the `max-w-2xl`/`3xl` caps and the `fullWidth` prop are removed. Printing still outputs every row.
  - Clinic Hours uses the account page's two-column section, with larger day toggles.
  - Student portal container goes from `max-w-3xl` to `max-w-5xl` with `lg:px-8`, matching the staff shell.
- **Fix found in browser:** at 360px the native date input's intrinsic width overflowed its filter cell. `DateInput`'s wrapper now has `min-w-0`.

### Verification
- `npm test`: 147/147 pass. New `tests/search-dates.test.cjs` (8 tests): word filters; name, college, program, number, and apostrophe searches; combined filters with page 2 ranges; the old `?college` param ignored; the picker using the same search; DateInput icons and Clear rules; TextField/FilterDate routing with min/max kept; full-width reports with print rows kept. `lists.test.cjs` was updated for the removed College filter.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- Browser (local dev, existing clinic personnel session, read-only):
  - Typing 4 characters made 1 URL update after the debounce, focus stayed in the input, and "nursing" matched by college and program.
  - Date Clear removed `from` from the URL and returned focus.
  - No page-level horizontal overflow at 360, 768, and 1024px on dashboard, lists, forms, reports, clinic hours, and account.
  - No React warnings or hydration errors in the console.

### Remaining
- Native pickers display dates in the browser/OS locale format; that display cannot be styled. Values are unaffected.
- Admin and student pages were not viewed in a browser (no session for those roles); only build, tests, and code review cover them.
- Firefox and Safari pickers were not tested. Native popups are positioned by the browser.

## Student portal redesign — 2026-10-20

### Completed (UI only; no schema, RLS, Auth, linking, or scheduling-rule changes)
- **Shell:** the student portal now renders the shared `ClinicShell`: desktop sidebar, mobile drawer, skip link, profile card, and the confirmed Sign out.
  - `navForRole("student")`: Dashboard (`/portal`, exact match), My Appointments (`/portal/appointments`), Request Appointment (`/portal/request`). No staff modules.
  - `accountHrefForRole()` sends the profile card to `/portal/account` for students and `/account` for staff.
- **Dashboard (`/portal`):**
  - "Hello, {first name}!" with three summary cards (Pending, Upcoming, Completed). The counts are HEAD queries on the student's own appointments.
  - Next upcoming appointment, or an empty state that links to Request Appointment (or to the pending request).
  - The Request button stays disabled while a request is pending (existing rule).
- **My Appointments (`/portal/appointments`):**
  - Tabs: All, Pending, Upcoming (approved, from the start of today in Manila), Completed, and Cancelled / Declined.
  - 10 per page on the server with exact counts and `id` tiebreak ordering. An out-of-range page redirects and keeps the tab.
  - Cards show requested date and time, clinic schedule, reason, status, clinic remarks, and the reschedule note. Pending cards keep the existing confirmed Cancel Request.
- **Shared code:** `features/appointments/student-portal.ts` (tabs, linked-student lookup, upcoming boundary) and `components/student-appointment-card.tsx`.
- **Defense in depth:** every student appointment query also filters `student_id = linked student`. RLS remains the enforcing rule.
- **Account (`/portal/account`):** staff-style layout with read-only display name, email, Student ID as entered at registration (when present), record link status, and the existing password form with Show/Hide. There is no editing of names or records.
- **Request page:** only the heading capitalization changed; the form, validation, and redirects are unchanged.

### Verification
- `npm test`: 156/156 pass.
  - New `tests/student-portal.test.cjs` (9 tests): navigation, account link, and shell; dashboard counts that ignore another student's rows; next appointment; the one-pending rule; the empty state; unlinked accounts running no appointment queries; every tab's filter and order with student scoping; pagination over 23 rows and the out-of-range redirect; Cancel Request on pending cards only, with the shared confirmation; role checks before database access; account page fields.
  - Updated: `lists.test.cjs` (the pending-availability check moved to the dashboard), `logout.test.cjs` and `nurse-portal.test.cjs` (the student nav and account link are no longer hard-coded).
- `tsc --noEmit` pass (after `next typegen` for the new route). ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- Read-only browser checks (local dev):
  - Signed out, `/portal`, `/portal/appointments`, and `/portal/account` return 307 to `/login`.
  - With the existing student session: dashboard counts render; the tabs and appointment card render; no horizontal overflow at 360 and 768px; the mobile menu button is present; no console warnings or errors.
  - No requests were sent, cancelled, or changed.

### Remaining
- The verified student number is not shown to students: they cannot read `students` under RLS, so only the number typed at registration appears.
- Student display names stay read-only (same RLS limit as clinic personnel; see `docs/NURSE_PORTAL.md`).
- Not browser-tested: the mobile drawer's focus behaviour (it is the same Radix Sheet as the staff portals).

## Mobile-first responsive refinement — 2026-10-20

### Audit (before editing)
Measured in the browser (student session, 320–1440px frames) and from code for the staff and public pages.
- **Student dashboard:** the three metric cards stacked in one column on phones (3 × 80px). The 360px dashboard was 885px tall, over one screen.
- **Spacing:** 24px top padding plus the 56px header before the title. The filter bar's empty "Updating…" status line took a 32px row on phones. Empty states stacked the icon above the text.
- **Touch targets:** buttons, inputs, and selects were 32px tall, under the ~44px touch guideline.
- **Mobile Sign out:** the confirmation opened on top of the still-open navigation drawer.
- **Login / sign-up (code only):** on phones the brand panel padding pushed the form down.
- **Already fine (not changed):** no page-level overflow (the date filter fix came earlier); confirmation dialogs fit the viewport (`max-h-[calc(100dvh-2rem)]`, stacked buttons); tables scroll inside `table-container`; filters already go two per row with full-width search; appointment cards are single-column on phones; staff dashboards already used two columns on phones.

### Changes (UI only)
- **Touch sizes:** `pointer-coarse:` variants on Button (default/sm/lg/icon/icon-sm), Input, NativeSelect, and the date Clear button. Mouse and desktop sizes are unchanged.
- **Dashboards:** metric grids use container queries.
  - Clinic personnel: 2, then 3 (`@md`), then 6 (`@4xl`) columns.
  - Admin month: 2, then 3, then 5.
  - Admin users: 2, then 3.
  - Student: 3 columns at every width, with short labels ("Pending", "Upcoming", "Completed") plus a screen-reader suffix. The icon shows once the card is wider than 7.5rem.
  - All cards have tighter phone padding and a text-xl value.
- **Shell:**
  - Mobile Sign out closes the drawer first, then the shell renders the confirmation alone (`LogoutButton` `onRequest` / `dialogOnly` modes); focus returns to the menu button. The desktop sidebar is unchanged.
  - Header side padding is tighter.
- **Spacing:**
  - Main content `py-4 sm:py-6`; footer `pb-4 sm:pb-6`, `pt-3 sm:pt-4`.
  - PageHeader `pb-4 sm:pb-5`, h1 `text-lg sm:text-xl`; dashboard section gaps `gap-6 sm:gap-8`.
  - The idle filter status is `empty:sr-only` (it stays an accessible live region).
  - EmptyState keeps the icon beside the text at every width.
  - Student appointment cards use `p-3 sm:p-4`.
- **Auth shell (phones):** smaller outer padding and radius, shorter brand panel, and the form starts higher. Desktop is unchanged.

### Verification
- `npm test`: 162/162 pass. New `tests/responsive.test.cjs` (4 tests) covers: the mobile Sign out handoff (trigger defers, dialog-only renders, Cancel closes, focus ref); container grids and the 3-column student cards; pointer-coarse sizes; compact spacing; dialog viewport limits; date `min-w-0`.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- Browser (student session only):
  - At 320, 360, 375, 390, 425, 768, 1024, and 1440px: no page-level overflow and no clipped text on `/portal`, `/portal/appointments`, `/portal/request`, and `/portal/account`.
  - The dashboard cards sit in one row at every width (91×71px at 320px); the 360px dashboard now fits in 740px.
  - At 375px: the drawer opens with student-only items and the profile card. Sign out closes the drawer and opens the dialog alone (324px wide, focus on Cancel). Cancel keeps the session and returns focus to the menu button. Escape closes the drawer with focus restored; navigating closes the drawer and highlights the current page.
  - No console warnings on the top-level page.

### Limitations
- Admin, clinic personnel, and the public login/sign-up pages were **not** browser-checked at these widths (no session for those roles; signed-in users are redirected away from `/login`). They are covered by code review, class-contract tests, and the earlier 360/768/1024 nurse overflow check.
- `pointer-coarse` sizes were not seen on a real touch device (desktop Chrome reports a fine pointer).
- Console capture covered the top-level page, not the measurement iframes.
- Secondary table columns stay hidden on narrow screens as before; the full record is on each detail page.

## Compact sidebar header and shared account menu — 2026-10-20

### Completed (UI only; no auth, role, data, or logo-asset changes)
- **Sidebar header:** `h-16 px-4` with a 40px logo is now `h-14 px-5` with a 36px logo (`Brand className="h-9"`, same asset and aspect-ratio frame). The logo aligns with the nav icons. The mobile top bar logo is also `h-9`.
- **New `components/app/account-menu.tsx` (`AccountMenu`):** one profile trigger (initials avatar, display name, role, `ChevronsUpDown`) opens a Radix dropdown upward (`side="top"`, `collisionPadding={8}`, trigger width) with only **My Account** and **Sign Out**.
  - My Account goes to `accountHrefForRole()`: `/account` for staff, `/portal/account` for students. Choosing it also closes the mobile drawer.
  - Sign Out does not sign out. It asks the shell to show the existing confirmation (`LogoutButton dialogOnly`, rendered once at shell level for desktop and mobile), then skips the menu's focus return so focus stays in the dialog.
  - Confirmation focus returns to the profile trigger on desktop and the menu button on mobile; the mobile drawer closes first.
- **Removed:** the separate profile link and Sign out button from the sidebar footer, `LogoutButton`'s now-unused `onRequest` mode, and the shell's private `initials()` (moved to `account-menu.tsx`).
- `DropdownMenuItem`: `pointer-coarse:py-2.5` for touch.
- Navigation items and permissions are unchanged for all roles.

### Verification
- `npm test`: 165/165 pass.
  - New `tests/account-menu.test.cjs` (3 tests): the same trigger and menu for all three roles (label, initials, chevron, My Account href, exactly two items); the menu opens upward with collision padding; Sign Out hands off without signing out; focus handling; My Account closes the drawer; header and footer contracts.
  - Updated: `logout.test.cjs`, `responsive.test.cjs`, `nurse-portal.test.cjs`, `student-portal.test.cjs` (footer structure).
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- **Browser, student session only (keyboard-driven, read-only):**
  - Desktop: header 56px with a 138×36 logo frame; one trigger and no separate Sign out button; the menu opens upward inside the viewport with two items and focus on the first; Escape closes it with focus back on the trigger.
  - Desktop Sign Out: the menu closes and the dialog opens with focus on Cancel; Cancel keeps the session and returns focus to the trigger. My Account goes to `/portal/account`.
  - Mobile frames at 320, 360, 375, 390, 425, and 768 (767 CSS px at 80% zoom, so the mobile layout): the menu opens upward above the drawer (top-most hit test) and inside the viewport. Sign Out closes the drawer, and the dialog is top-most and inside the viewport with focus on Cancel. Cancel keeps the session and returns focus to the menu button.
  - 1440 desktop: the menu stays inside the viewport and there is no overflow.

### Not verified in a browser
- Admin and clinic personnel sidebars (no session; same `ClinicShell`/`AccountMenu` code, covered by tests).
- Logout success (not run, to keep the live session; covered by `logout.test.cjs`).
- Pointer and touch opening (keyboard was used, since Radix opens on pointerdown).
- Real touch-device sizes.

## Collapsible desktop sidebar — 2026-10-20

### Completed (shared shell only; no auth, role, data, or logo-asset changes)
- **Preference** (`components/app/sidebar-preference.ts`):
  - Stored as `localStorage["wupcare.sidebar"]` = `collapsed` or `expanded`; the default is expanded.
  - A tiny inline script in the root `<head>` (`SIDEBAR_BOOT_SCRIPT`) sets `html[data-sidebar="collapsed"]` before first paint. Storage errors are ignored.
  - Collapsed styling is pure CSS through a new `rail-collapsed:` variant (globals.css), scoped to `[data-desktop-sidebar]`, so server and client markup match and there is no flash. The mobile drawer is never affected.
  - React reads the attribute with `useSyncExternalStore` (server snapshot: expanded) only for the toggle's label and state and the tooltips. `<html>` has `suppressHydrationWarning` for the attribute the boot script adds.
- **Desktop aside:**
  - 240px expanded, 64px collapsed. The width transition is 200ms and off under reduced motion; main content fills the freed space.
  - The toggle is a round button on the top-right edge (`aria-controls`, `aria-expanded`, "Collapse sidebar" / "Expand sidebar"), desktop only.
- **Collapsed rail:**
  - The original icon-only logo (`BrandMark`, `wupcare-logo.png`, unchanged frame) replaces the wordmark.
  - Icons are centered. Labels and section headings are `sr-only`, so they keep their accessible names. Sections are separated by a border.
  - The active highlight is unchanged. The pending-appointment count becomes a dot whose text stays readable to screen readers.
  - Radix tooltips (new `components/ui/tooltip.tsx`) show the item name on the right on hover or focus, only while collapsed.
- **Account menu:** avatar-only trigger when collapsed (the aria-label keeps the full name and role). The menu, My Account, and Sign Out (shared confirmation) are unchanged and stay inside the viewport.
- **One implementation** for Administrator, Clinic Personnel, and Student (`ClinicShell`/`SidebarContents`); navigation and permissions are untouched.

### Verification
- `npm test`: 171/171 pass.
  - New `tests/sidebar.test.cjs` (6 tests): the real boot script run in a VM (default expanded, saved collapsed, exact value only, blocked storage); toggle save and restore; server snapshot and no import-time storage access; the variant scoped to the desktop aside; the toggle's ARIA; mobile drawer exclusions; collapsed rail contracts.
  - `admin-reports.test.cjs` now also checks that the server-rendered shell is expanded with no tooltips.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- **Browser, clinic personnel session** (the Chrome session had become a nurse account; read-only):
  - Collapse goes from 240 to 64px and main content grows 176px; the icon logo is 32×32; icons are centered; accessible names stay intact; the active item is highlighted. Tooltips appear on keyboard focus and on mouse hover (right side).
  - Persistence: after a reload the aside is 64px at the first observable layout, before hydration. The server HTML has no state, and the boot script is in `<head>`. Client navigation to another route keeps it collapsed with the correct active item.
  - Collapsed account menu: My Account and Sign Out stay inside the viewport. Sign Out shows the confirmation with focus on Cancel; Cancel returns focus to the avatar.
  - With collapsed saved, the mobile frames at 320, 360, 390, and 425px show the normal drawer (full labels, headings, profile name), no toggle, and the drawer closes after navigating.
  - No overflow collapsed at 800, 1024, and 1440px, or expanded at 800px. (A 768px frame at the browser's 80% zoom is 767 CSS px, which is the mobile layout.)
  - Expanding restores 240px and saves "expanded". No console warnings or hydration errors were captured. The preference was left at "expanded".

### Not verified in a browser
- Administrator and student sessions (same shared component; covered by tests and server rendering).
- Logout success (not run, to keep the live session; covered by `logout.test.cjs`).
- Real touch devices.

## Sidebar visual refinements — 2026-10-20

### Completed (shared `ClinicShell` only; the collapsible sidebar above is unchanged)
- **Rounded right corners:** `rounded-r-xl` (12px top-right and bottom-right; left corners stay square) on the desktop aside and the mobile drawer. There is no `overflow-hidden`: dropdowns, tooltips, and dialogs are portaled, and the collapse toggle straddles the edge, so nothing is clipped.
- **Logo position:**
  - Root cause: `Brand` has a built-in `self-start`, which pinned the logo to the top of its row (measured 0px above, 28px below). The shell now passes `self-center`, which `cn` merges over it. This applies to the sidebar and the mobile top bar; landing and auth pages are untouched.
  - The brand row is 64px (`h-16`), giving about 14px above and below the 36px wordmark. The collapsed icon logo has 16px each side. The logo assets are unchanged.
- **Toggle** moved to `top-5`, vertically centered on the brand row. It is clear of the wordmark and of the collapsed icon logo (3px gap).

### Verification
- `npm test`: 172/172 pass. New refinement test in `sidebar.test.cjs`: right-only radius with no clipping; matching drawer radius; 64px centered brand row; `self-center` on both shell logos; toggle position; dropdown, tooltip, and dialog portals. Header assertions in `account-menu.test.cjs` updated.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- **Browser, clinic personnel session only** (read-only):
  - Computed radius is 0 / 11.2 / 11.2 / 0px, which is 12px scaled by the browser's 80% zoom, with overflow visible.
  - Expanded: logo 14px above and below; toggle center equals logo center (32px).
  - Collapsed: icon 16px above and below, no overlap with the toggle.
  - In the collapsed rail the tooltip and account menu are portaled outside the aside, and the menu stays inside the viewport and wider than the rail.
  - Mobile at 375px: the drawer is rounded on the right, flush left and full height, with full labels and no overflow.
  - The preference was left at "expanded".

### Not visually tested
- Administrator and Student sessions (same shared component; covered by tests).

## Nurse appointment workflow, booking autocomplete, and search — 2026-10-20

### Reused (no new business logic)
- **Detail page:** the existing `/appointments/[id]` already supported approve with an editable confirmed time (defaulting to the preferred time), decline with a required reason, and complete, reschedule, and cancel, each with the shared confirmations. Preferred time (`preferred_date`/`preferred_time`) and confirmed time (`scheduled_at`) are stored separately; students already see the confirmed time (`StudentAppointmentCard`).
- **Server actions and search:** `updateAppointmentStatus`, `bookAppointment`, `searchStudents` (combined search), and `getStudent`.
- **Shared UI:** `ActionForm`, `ConfirmationDialog`, `TextField`/`DateInput`, `StudentStatusBadge`/`DemoBadge`, and `scheduleChanged`.
- **List searches:** they already filter automatically (`AutoFilterBar`, 300 ms, URL params, page reset) for admin and nurse. The student portal has no search (its lists are tabbed and small).

### Changes
- **`/appointments` rows:** one stretched link per row (`tr.relative`; the link's `::after` covers the row). It is one tab stop, Enter opens the row, there is a visible inset focus ring, and tapping anywhere opens the existing detail page. The link's name includes the student and status. There are no other controls in the row, and clicking never changes status.
- **Detail page:**
  - The labels "Preferred schedule" and "Confirmed schedule" (shown as "Not confirmed yet" while pending) replace "Requested for" and "Schedule".
  - There is a note when the confirmed time differs from the preferred one.
  - The approve field is labelled "Confirmed schedule" with a hint that it starts at the preferred time.
- **Bug fixed — duplicate field ids on the detail page:** Approve and Decline (pending), and Reschedule and Cancel (approved), each rendered `id="staff_remarks"`, so labels and error descriptions could target the wrong form. `TextField`/`TextAreaField` now accept an optional `id` (it defaults to the name, so all other forms are unchanged). The detail page uses unique ids.
- **Student picker (new visit, incident, and appointment):** new `StudentCombobox` (ARIA combobox and listbox).
  - It waits 300 ms after typing and shows up to 8 suggestions (name, student number, college, and Demo or non-active status badges).
  - Arrow keys move, Enter or click/tap selects, Escape closes; it never selects automatically. It shows "No students found", a loading state, and an error state. Older responses are ignored and old results are cleared as soon as the text changes.
  - Choosing a student opens the existing page with `?student=<id>` (extra params are kept). The server loads that record by ID before showing the form, which submits that `student_id`.
  - New server action `suggestStudents` (clinic staff only) reuses `searchStudents`. The old Search-button and URL search in the picker was removed.

### Audit notes
- **Dates:** confirmed times are sent with an explicit `+08:00` (`fromManilaInput`), so there is no off-by-one day.
- **Transitions:** status changes and the reschedule rules stay enforced by the database; duplicate submits are blocked by `ActionForm`; server actions check the role before any database access.
- **Not changed:** staff approval, rescheduling, and booking are not limited to clinic hours, and nothing blocks booking for inactive or graduated students. That is the existing rule (only student requests are hour-limited). The autocomplete now shows non-active status badges; adding a block would be a business-rule change for approval.

### Verification
- `npm test`: 180/180 pass.
  - New `tests/appointments-workflow.test.cjs` (8 tests): row stretched link (one link per row, href, focus ring, no status actions); pending and approved detail (labels, actions, confirmations, unique ids, preferred default, different-time note); approve stores `+08:00` and does not touch the preferred fields; reschedule needs a remark; invalid date-time rejected before the database; `suggestStudents` role check before the database and its fields; combobox debounce, a single request, stale responses ignored, keyboard selection passing the ID, no auto-pick on Enter, Escape, empty state, mouse/touch; picker href and server ID load.
  - `search-dates.test.cjs` updated for the picker; the harness gained `useId`.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- **Browser, clinic personnel session (read-only: nothing approved, declined, booked, or cancelled):**
  - Rows: tapping the status cell opens the detail page, the link is the only control in the row, and the focus ring is visible. The detail page shows the new labels, Approve and Decline, and unique ids.
  - Autocomplete: 4 fast keystrokes made 1 request; 8 suggestions inside the viewport, scrolling within the popup; Enter with nothing highlighted did nothing; Escape closed; "No students found" appears; arrow and Enter selection opened the form with a hidden `student_id`, which was not submitted.
  - Widths 320, 360, 390, 425, 800, and 1440: no page overflow; the popup stays inside the viewport. On phones the appointment table scrolls inside its container and every visible cell opens the row.
  - No console warnings captured.
- 768px was not tested at the md breakpoint because of the 80% browser zoom (800 was used). Admin and student roles were not affected and not browser-tested.

## Nurse appointment management: categories, lifecycle feedback — 2026-10-20

The goal was to make it clear where an appointment goes after each action. Nothing changed in the database, migrations, RLS, authentication, or scheduling rules.

### Lifecycle (existing statuses only)
| Status | Category (page) |
|---|---|
| pending | Pending Requests (`/appointments/pending`) |
| approved (including past, not completed) | Scheduled Appointments (`/appointments/scheduled`) |
| completed, declined, cancelled | Appointment History (`/appointments/history`) |
| any | All Appointments (`/appointments`) |

The mapping lives in one place: `features/appointments/categories.ts`.

### Changes
- **Sidebar:** the Nurse sidebar has a new collapsible "Appointment Management" group: All Appointments, Pending Requests (with the pending count), Scheduled Appointments, and Appointment History. It replaces the single "Appointments" item under Clinic Operations.
  - The group label is a toggle button (`aria-expanded`/`aria-controls`) and is expanded by default.
  - On the collapsed desktop rail the toggle is hidden and the four icons are always shown, with tooltips.
  - The mobile drawer uses the same component.
  - An appointment opened from a list highlights that list (from `?back`).
  - Admin and student navigation are unchanged.
- **One shared list:** `features/appointments/components/appointment-list.tsx` renders all four category pages, replacing the old `?view=` tabs.
  - Same table, row links, automatic `FilterBar`, date filter, records scope, and 10-per-page server pagination.
  - Search now matches every word over student number and name parts (`ilikeEveryWord`).
  - Scheduled has a When filter (All scheduled, Today, Upcoming, Overdue). Overdue rows show an "Overdue" badge, and past approved appointments are never hidden.
  - History has an Outcome filter (Completed, Declined, Cancelled).
  - Category tabs keep search, date, and records, and reset the page and category-only filters.
- **Old links:** `/appointments?view=…` redirects to the matching category; for example, `today` goes to `/appointments/scheduled?when=today`. Dashboard links were updated.
- **Detail page:**
  - "Back to <list>" returns to the exact list, with its filters and page. `?back` is validated to the four list paths only.
  - "Listed in <category>" and an overdue notice were added.
  - "Remarks to student" was renamed "Clinic remarks".
  - Action panels remount after a change (keyed by `updated_at`), so old field values are cleared.
- **Action feedback (bug fixed):**
  - Before: after Approve, Decline, Cancel, or Complete, the success message was lost because the form that showed it disappeared when the status changed.
  - Now: `updateAppointmentStatus` (and `bookAppointment`) redirects to the detail page with `?done=<action>` and the validated `back`. The page shows a status banner, for example "Appointment approved. It is now in Scheduled Appointments", with a link.
  - The banner is shown only while the record's current category matches the outcome.
  - Errors, including a transition the database rejects, still show in the form without redirecting.
  - Duplicate submits are still blocked by `ActionForm`. The id must be a UUID before any database work.

### Verification
- `npm test`: 186/186 pass.
  - New `tests/appointment-categories.test.cjs` (6 tests):
    - Category queries, including past approved appointments as overdue, and the When, Outcome, and Today filters.
    - Every-word search, page ranges, automatic filters, tabs, and row back links.
    - Redirects from old `?view=` links.
    - The full lifecycle mapping. Pending → Approved → Scheduled, Approved → Completed/Cancelled → History, and Pending → Declined → History.
    - Redirects carrying `done` and `back`. Unsafe `back` values are dropped. Database-rejected transitions show an error. The role check runs before database access.
    - Detail banner, Back link, stale outcome hidden, remarks, and overdue actions.
    - Sidebar group structure.
  - Updated: `appointments-workflow`, `lists`, and `nurse-portal`. The student portal tests (status and confirmed schedule) pass unchanged.
- `tsc --noEmit` pass. ESLint: 0 errors (5 existing `.pixel-agents` warnings). `next build` pass.
- **Browser, clinic personnel session (read-only: nothing approved, declined, completed, booked, or cancelled):**
  - The group collapses and expands. On the icon rail the toggle is hidden and the 4 icons show.
  - The Scheduled list shows past approved appointments with Overdue badges, and the Overdue filter applied automatically.
  - A row opened the detail page with Back to the filtered list.
  - The `?done=reschedule` banner rendered (opened by URL, not by submitting), and the sidebar highlighted Scheduled.
  - `?view=today` redirected.
  - No page overflow at 320, 360, 390, 425, 800, or 1440px on all four lists and the detail page. No console errors were captured.
- Not verified in the browser: real submissions (to avoid changing records) and the admin and student roles.

### Follow-up: shorter sidebar labels — 2026-10-20
- The sidebar group is now "Appointments", with the items All Appointments, Pending, Scheduled, and History. Routes, filters, the pending count, and permissions are unchanged.
- Page titles, Back links, and the outcome banner keep the full names (for example, "Pending Requests"), so they make sense outside the sidebar.
- The group label is a single line (`truncate whitespace-nowrap`), and its text lines up with the other section labels. The item list stays labelled by the group (`aria-labelledby`), so screen readers hear "Pending" inside "Appointments".
- Verification: `tsc` pass; ESLint 0 errors; `npm test` 186/186. Browser check (clinic personnel only): the label fits on one line (16px high), the pending count still shows ("Pending, 1 waiting"), the current item is highlighted, and there is no overflow.

## Final QA: audit, security review, regression fixes — 2026-10-20

Scope: a code audit of every route, layout, server action, and validation schema; a read-only Supabase audit; browser testing with the clinic personnel session; and automated checks. No migrations, RLS, Auth settings, or live records were changed. Nothing was approved, declined, cancelled, booked, issued, or created during browser testing.

### Bugs found and fixed
| # | Severity | Defect and root cause | Fix | Regression test |
|---|---|---|---|---|
| 1 | Medium (security) | **Open redirect after email confirmation.** `/auth/confirm` accepted `?next=` when it started with `/` and not `//`. Browsers treat `/\evil.example` as `//evil.example`, so the user could be sent to another site after confirming. | New `lib/safe-redirect.ts` `sameOriginPath()` resolves `next` against the request origin and keeps it only if the origin is the same. | `qa-regressions`: backslash, slash-backslash, `//`, absolute, and empty values |
| 2 | Medium | **Impossible dates and times reached the database.** `localDateTime` (visits, incidents, approve/reschedule) and the `preferred_time` regex (student request, staff booking) checked only the shape. `2026-02-30T10:00` or `25:99` produced a generic "Could not save" from Postgres instead of a field message. The clinic-hours times and student `birth_date` had the same gap. | `lib/forms.ts`: `isClockTime`/`clockTime`; `localDateTime` checks a real calendar date and clock time. The student birth date uses `z.iso.date()`. | `qa-regressions`: invalid values are rejected before any database call |
| 3 | Medium | **Duplicate medicine possible by editing.** `createMedicine` blocked a second medicine with the same name and expiry, but `updateMedicine` did not. | A shared `findDuplicate()` check (case-insensitive name, same expiry, same real/demo kind, excluding itself) now runs on edit too. | `qa-regressions`: renaming into a duplicate is rejected; keeping its own name or matching a demo name is allowed |
| 4 | Low (accessibility) | **Duplicate field ids.** The medicine page (Issue, Restock, Adjust) rendered `id="quantity"` and `id="notes"` more than once, so labels and error descriptions could point at the Issue form. The Registrations page repeated `id="student_number"` once per pending account. | Unique ids (`issue-*`, `restock-*`, `adjust-*`, and a per-account `link-<profile id>`). | `qa-regressions` source check. Browser: no duplicate ids on the live medicine page |
| 5 | Low | **Inconsistent wording.** The account menu said "Sign Out" while its confirmation said "Log out of WUPCare?" with a "Log Out" button. | Standardized on "Log Out" (menu item, `LogoutButton` default, blocked-account notice). | `account-menu.test.cjs` updated |
| 6 | Low (tooling) | 5 ESLint warnings came from the untracked `.pixel-agents/` folder, which is not application code. | `eslint.config.mjs` ignores local agent-tooling folders. | `npm run lint`: 0 problems |

### Verified (not changed)
- **Authorization:**
  - All 43 role pages call `requireRole`. Every exported server action checks the role before any database call, except `login`, `registerStudent`, and the logout actions, which are public by design.
  - Signed-out requests to every protected route return 307 to `/login`.
  - The nurse session is redirected away from `/admin/users/*`, `/reports/<report>`, and `/portal/*`. A nurse response to an admin page streams only the shell and a `NEXT_REDIRECT`, with no admin data.
  - The service-role client is `server-only` and used only by admin user actions.
- **Database (project `wupcare`, ref `rlpppneoxsbebathqzfw`, matching `.env.local`; read-only):**
  - RLS is on for every public table; anon has no table grants and no function EXECUTE.
  - Every SECURITY DEFINER function sets `search_path`.
  - Policies match the permission matrix. The appointment trigger enforces transitions and allows students to cancel only their own pending request, with no other column changes.
  - The database enforces: `stock_quantity >= 0`, the ledger shape check, one pending request per student, unique student numbers, and a decline remark.
  - Migrations 0001–0010 are applied; 0011 is not (as documented).
  - Advisor: the same 13 intentional definer warnings, plus leaked-password protection disabled.
- **Dashboard:** all six nurse counters equal the totals of the lists they link to.
- **Interaction (nurse, browser):**
  - Cancel Appointment dialog: initial focus is on "Keep Appointment". Keep and Escape both close it, send no request, and return focus to the trigger.
  - Reschedule with an empty remark shows the server error, and the reschedule count is unchanged.
  - Account menu shows My Account and Log Out. The logout dialog's Cancel keeps the session and returns focus.
  - Sidebar collapse persists across reloads (64px rail with tooltips); the user's preference was restored afterwards.
  - Mobile drawer at 375px: it opens, shows all items with the pending count, a real Escape closes it with focus returned, and it closes after navigation.
  - An empty "Add student" submit shows field errors linked through `aria-describedby`.
- **Responsive:** 29 nurse pages × 8 widths (320, 360, 375, 390, 425, 768, 1024, 1440) = 232 loads, with no page-level horizontal overflow, no broken images, no unexpected redirects, and no Next.js dev-overlay issues (1024px pass). Public `/`, `/login`, and `/register` were rendered from signed-out HTML at 320–1440 with no overflow.

### Not verified
- Administrator and student browser sessions: their passwords are not available to the tester. Those roles are covered by unit tests and route guards only.
- Live write workflows (approve, complete, decline, cancel, issue medicine, restock, create records) and the student → nurse → student lifecycle against the real database: not run, to avoid changing live data. They are covered by mocked tests.
- Live registration, email delivery, password change, and session expiry.
- Landing-page scripted behavior (smooth scroll, active section) in a signed-out browser.

### Open decisions (not changed)
- Staff can approve, reschedule, or book an appointment at a time that has already passed. The database and spec allow it; blocking it would be a new business rule.
- Leaked-password protection is disabled (Auth setting). Rotation of the previously exposed development service-role key is unverified.
- Migration 0011 (exact admin report counts) is still unapplied.

### Verification
`npx tsc --noEmit` pass · `npm run lint` 0 errors, 0 warnings · `npm test` **192/192** (0 skipped) · `next build` pass.

## 2026-10-20 — Self-service account names and stable filter loading

### Scope and implementation

- Reused the Administrator `DisplayNameForm`, shared 2–120-character zod schema, form alerts, pending submit button, authenticated DAL, and root-layout revalidation. Clinic personnel and Student Account Settings now use the same form while preserving the responsive section/two-column layout and read-only account identifiers.
- The form validates locally with the same schema used by the server. Existing normalization trims/collapses spaces without stripping accented letters, apostrophes, hyphens or non-Latin names. Blank/short/long input, control/format characters, line/paragraph separators, and markup delimiters are rejected. A synchronous submission guard plus pending state prevents duplicate submissions; success, validation, database and unexpected errors have feedback.
- The server allows active admin/clinic_staff/student sessions. Administrator saves retain the existing session/RLS update, pinned to the authenticated profile ID. Other roles call `update_own_display_name` with only the name. Submitted target IDs, role, email and student-link fields are ignored. No Auth metadata, medical/student names, roles, credentials, status, or records were modified.
- `revalidatePath("/", "layout")` refreshes the layout's profile name/account menu and dashboard greetings. Tests exercise this refresh contract with fictional in-memory clients; they do not claim live browser cache verification.
- Audited loading indicators across shared list and report filters. `AutoFilterBar` (scheduled appointments, clinic lists, account lists and student appointment history) and Administrator `AutoReportFilters` now always reserve a full-width, fixed-height status row. Loading cannot change the control row's available width or overlap a control. The polite, atomic live region remains mounted. Existing debounce, immediate selects/dates, URL replacement, selected filters, and page-reset/pagination behavior are unchanged; no Apply button.

### Security review and approval boundary

- Read-only inspection of the connected database confirmed `profiles_update` remains Administrator-only, with the existing `guard_profile_update` trigger and role helpers. There is no installed `update_own_display_name` function. No policies, Auth settings, data or migrations were changed.
- Prepared **unapplied** `docs/sql/update-own-display-name.sql`, deliberately outside the migrations directory. It proposes a SECURITY DEFINER function with an empty search path, active-role guard, database input validation, an `auth.uid()`-only target, and only `profiles.full_name` in its UPDATE. Existing audit/guard triggers remain active. EXECUTE is revoked from PUBLIC/anon and granted only to authenticated. It adds no direct profile-update privileges or RLS policy changes. Rollback is documented in the draft.
- **Explicit approval is required before installing this function.** Nurse/Student saves currently fail safely with a database-update-pending message; Administrator saves keep working. The added RPC type describes this proposed function, not an already installed database capability. SQL execution and live database authorization tests remain pending approval.

### Verification

- `npm test`: **202/202 passed**, 0 skipped. Added focused coverage for all three role save paths, unauthorized/tampered changes, validation before database access, client validation, duplicate submissions, error/retry behavior, name refresh, stable loading markup, and retained automatic filtering. Existing Unicode/name and search/debounce/pagination tests pass. All writes use isolated fictional mocks; automated tests forbid network/database access.
- `npx tsc --noEmit`: passed. `npm run lint`: passed, no errors/warnings. `npm run build`: passed (Next.js 16.4.0). Used Windows `npm.cmd`/`npx.cmd` because PowerShell blocks the npm script shim.
- Browser verification: **no Administrator, Nurse or Student session tested**. The browser inventory was empty; both Edge and in-app browser creation returned “Browser is not available.” Therefore visual layout/loading behavior at **320, 360, 390, 425, 768 and 1440px is unverified**. Responsive classes and stable status structure are covered by automated tests, not rendered viewport measurements.
- Scoped whitespace checks passed. The wider pre-existing working tree has unrelated changes, left intact. No deployment, staging, commit, push, record edits, migration application or secret disclosure.

### Files changed in this task

- `app/(clinic)/account/page.tsx`, `app/(portal)/portal/account/page.tsx`
- `features/account/actions.ts`, `features/account/display-name-form.tsx`
- `components/app/auto-filter-bar.tsx`, `features/reports/auto-report-filters.tsx`
- `types/database.ts`
- `tests/accounts.test.cjs`, `tests/nurse-portal.test.cjs`, `tests/student-portal.test.cjs`, `tests/responsive.test.cjs`
- New `tests/display-name-form.test.cjs`, `tests/display-name-refresh.test.cjs`
- New `docs/sql/update-own-display-name.sql`; this `docs/DEVLOG.md` entry.

## Student self-registration - local implementation - 2026-10-20

Continues `docs/STUDENT_REGISTRATION_PLAN.md`. Nothing applied to the live database or Auth settings; no accounts created; no commit, push or deploy.

- Shared `features/registration/schema.ts` (client + server): first/last/optional middle name, email, canonical Student ID allowlist, 8-72 character password and confirmation.
- `registerStudent` rejects signed-in callers, preflights `registration_student_id_available` (fails closed when the RPC is missing), sends only the `new_student_v1` payload, maps Auth errors without echoing passwords, recovers from a post-commit session failure by password sign-in, re-checks the Student ID after a masked trigger error, and redirects to `/portal` only when the profile is linked. `approveRegistration` is unchanged.
- Registration form adds name fields and client validation; page copy no longer promises clinic approval.
- SQL candidate fixes: ASCII Student ID allowlist, broader invisible-character name checks, unknown-marker rejection, lock timeout.
- Verification: `npm test` 226/226, `tsc`, lint and build passed; SQL-only embedded Postgres check 18/18. Real-Auth harness not run (local `auth.exe` execution not permitted). No browser check of the form.
