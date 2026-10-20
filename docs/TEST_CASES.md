# WUPCare — Test Cases

Test cases for the acceptance criteria in `SYSTEM_SPEC.md` §13 *(Paper §3.E)*. Each row lists the case, the expected result, the actual result, and Pass / Fail / Pending.

Historical full run (external scratchpads, not shipped as repository tests): 2026-10-14 against the Supabase project "Research", using a production build (`next build` + `next start`).

## How the tests were run

| Suite | What it covers | Data used | Result |
|---|---|---|---|
| Database (offline, PGlite) | Migrations 0001–0010: RLS, functions, triggers, privilege escalation, registration | In-memory Postgres | 160/160 |
| Seed scripts (offline, PGlite) | `seed.sql` and `remove-demo.sql`: idempotency, real data unchanged | In-memory Postgres | 25/25 |
| Live JWT tests (Phase 2) | Real Auth users, PostgREST, RLS per role, inventory, appointments, reports, deactivation, routing | Temporary accounts, removed afterwards | 107/107 |
| Browser regression (isolated) | Phases 3–8A: all modules end to end in Microsoft Edge | Isolated fixtures (`DEMO-9001`–`9003`, `Fx ` medicines, `E2E-` rows), removed afterwards. Approved demo data verified unchanged by hash | 171/171 |
| Seeded smoke (read-only) | Filters, paging, reports and dashboards against the demo data | Approved demo data, read only | 29/29 |
| Accessibility | axe-core WCAG 2.1 A/AA on 34 pages; keyboard; 200% zoom; 320px reflow; forced colors | Read only | 0 violations; 16/16; 26/26 |

Automated tests drive the browser with `playwright-core`, installed outside the project, and are not part of the repository. Use the table below as the record for manual re-testing.

## Results

| ID | Case | Expected | Actual | Result |
|---|---|---|---|---|
| **AUTH-1** | Each account type signs in with email and password | Lands on its home page: admin and clinic personnel → `/dashboard`, student → `/portal` | As expected for all three roles | Pass |
| AUTH-2 | Wrong password | Generic "Incorrect email or password", stays on `/login` | As expected | Pass |
| AUTH-3 | Sign out | Session ends; protected pages redirect to `/login` | As expected | Pass |
| AUTH-4 | Open an internal URL while signed out | Redirect to `/login` | As expected (`/dashboard`, `/students`, `/students/registrations`, …) | Pass |
| AUTH-5 | Deactivated account | Open session loses access at once; sign-in is refused | Data access blocked immediately; sign-in refused ("User is banned") | Pass |
| AUTH-6 | Change own password | Wrong current password and mismatched confirmation rejected; new password works | As expected | Pass |
| **ROLE-1** | Student opens clinic pages | Redirected to `/portal` | As expected | Pass |
| ROLE-2 | Student session queries clinical tables directly | 0 rows from students, health records, visits, incidents; only own appointments | As expected (live JWT test) | Pass |
| ROLE-3 | Administrator navigation and direct queries | Dashboard, Reports, Users, Account only; 0 rows from clinical tables | As expected | Pass |
| ROLE-4 | Administrator opens `/reports/student/[id]` or any student page | Redirected to `/dashboard` | As expected | Pass |
| ROLE-5 | Anonymous API access | Every table and function returns "permission denied" | As expected | Pass |
| **STU-1** | Add a student | Saved; empty health record created | As expected | Pass |
| STU-2 | Duplicate student number | Field error "already registered" | As expected | Pass |
| STU-3 | `DEMO-` number on a new record | Field error (reserved for demo data) | As expected | Pass |
| STU-4 | Search by name or number; Real/Demo filter; DEMO badges | Matching rows only; filters apply; badges shown | As expected, including names with apostrophes and dots | Pass |
| STU-5 | Student page sections | Profile, health record, visits, appointments, incidents, medications | As expected | Pass |
| HR-1 | Edit health record | Saved; "Last updated by" shows the editor and time | As expected | Pass |
| **VIS-1** | Visit with all fields, concern, and medication | Saved; stock reduced; transactions shown on the visit and medicine | As expected (stock 50 → 48) | Pass |
| VIS-2 | Visit that issues more than the stock | Error; no visit and no stock change | As expected | Pass |
| VIS-3 | Visit history and no delete | Visits listed newest first; no delete action | As expected | Pass |
| VIS-4 | Two simultaneous issuances exceeding stock | Exactly one succeeds; stock never negative; ledger matches | As expected | Pass |
| **APT-1** | Student request → staff approval | Pending in staff queue; approved with schedule; student sees "Approved" | As expected | Pass |
| APT-2 | Decline, reschedule, cancel, complete | Decline and reschedule need a remark; student sees status and remarks; reschedule counted; complete offers "Record visit" | As expected | Pass |
| APT-3 | Request outside clinic hours | Rejected by the form limits and by the database | As expected (time, closed day, past date, too far ahead) | Pass |
| APT-4 | Change clinic hours | Request form and database follow the new hours | As expected | Pass |
| APT-5 | Student cancels a request | Own pending request only (with confirmation); one pending request at a time | As expected | Pass |
| **MED-1** | Add, restock, adjust | Logged as transactions; starting stock is a restock; adjustment needs a reason; stock never negative | As expected | Pass |
| MED-2 | Duplicate medicine (same name and expiry) | Blocked with "use Restock instead" | As expected | Pass |
| MED-3 | Flags and expired medicine | Low, Expiring (30 days), Expired shown; expired medicine cannot be issued | As expected | Pass |
| MED-4 | Demo/real separation | Demo medicine cannot be issued to a real student, and the reverse | As expected | Pass |
| **INC-1** | Record incidents of each type, with medication and visit link | Saved; shown in the log, student history, visit page, and medicine history | As expected | Pass |
| **RPT-1** | Five aggregate reports with date range and scope, both roles, print | Render for both roles; print layout hides the app shell | As expected | Pass |
| RPT-2 | Administrator report privacy | Whole months only; exact counts including 0–4 (client revision 2026-10-21, migration 0011); no names | Automated (mocked) | Pending 0011 |
| RPT-3 | Student clinic history report | Prints for clinic personnel; blocked for administrators | As expected | Pass |
| RPT-4 | Totals match SQL counts | Report totals equal database counts for the same range | Visits 40, incidents 8, appointments 15, Paracetamol issued 34 match SQL | Pass |
| RPT-5 | Dashboard counters | Match the data | Pending 3, low stock, expiring, and expired items match | Pass |
| **REG-1** | Student self-registers (email, student number, password) | `student` profile, pending; portal shows "Waiting for clinic approval" | Database logic passes offline (PGlite). 0010 is now applied (verified 2026-10-20); a complete live registration flow and current Auth/email settings were not reverified | Pending approval |
| REG-2 | Pending account access | No appointments, students, or health records; cannot request even with a guessed id | Passes offline | Pending approval |
| REG-3 | Staff approve the link | Pending list; approval links the record; student can request appointments for it only | Passes offline; UI built behind `STUDENT_REGISTRATION` | Pending approval |
| REG-4 | Registration cannot grant staff or admin | Role from sign-up data ignored; always `student` | Passes offline and live (a role in `user_metadata` was ignored) | Pass (live part pending) |
| **USR-1** | Administrator manages accounts | Creates clinic personnel and student accounts, changes role, deactivates (with confirmation) and reactivates, sets a temporary password | As expected | Pass |
| USR-2 | Self-protection | Administrator cannot demote or deactivate their own account | As expected | Pass |
| USR-3 | Clinic personnel open `/admin/users` | Redirected to `/dashboard` | As expected | Pass |
| **NFR-1** | Layout at 320, 360, 768, 1024, 1280px and 200% zoom | No horizontal page scroll | 0 overflow on all 34 audited pages | Pass |
| NFR-2 | Build, lint, types | All pass | `next build` passes; lint 0 errors; `tsc` clean | Pass |
| NFR-3 | Supabase security advisor | No critical findings | Historical result. Current read-only review: no ERROR, 13 intentional definer warnings and 1 leaked-password warning; see SECURITY_REVIEW.md | Pass |
| NFR-4 | Accessibility | WCAG 2.1 AA checks pass; keyboard-only use works | axe 0 violations; skip link, focus rings, labels, error linking, mobile menu, inline confirmations verified | Pass |
| NFR-5 | Test case document complete | This document | Complete | Pass |

## Not covered

- Screen readers (NVDA, VoiceOver) were not tested with real assistive technology.
- Session expiry, and a server action called directly by a role that should not use it. The latter is covered by `requireRole` in every action and by RLS, which was verified live.
- The error page (no safe way to force a server error).

## Repository-owned stabilization tests - 2026-10-20

Follow-up administrator report suite: `tests/admin-reports.test.cjs` adds 20 tests (109 total passing). Covers Month/Year defaults and leap years, invalid/legacy URL values, automatic selection updates, all Records scopes and five RPC parameter contracts, print invocation/markup, full-width responsive markup, sidebar selection retention, Nurse regression and actual administrator DAL page guards. The proposed SQL was not executed; exact live small counts await approval/application of 0011. See `ADMIN_REPORTS.md` for the distinction between mocked application tests, live catalog inspection, and pending browser/SQL verification.

Run `npm ci` then `npm test` (PowerShell may need `npm.cmd test`). No additional test dependency is required: Node's built-in test runner uses `tests/register.cjs` and the existing TypeScript compiler. No `.env.local`, scratchpad passwords, real identities, approved demo rows, or live mutation tests are used. The harness clears Supabase environment settings, blocks network fetch, and fails unmocked server/admin-client access. Fixtures use fictional IDs and `example.test`.

| Coverage | Evidence |
|---|---|
| Display-name validation | Ordinary/Filipino names, lowercase s, Unicode spaces, trim, 2/120 boundaries, controls/invisible characters, markup rejection |
| Fallbacks | Missing/blank names for all roles; valid custom and 120-character names retained |
| Pagination | 0, 1, 10, 11, 25+ records; unique ties; exact-count/range query construction; invalid/out-of-range pages; URL filter retention |
| Search and filters | Multi-page student name/college/year/status/demo filters; literal quoted punctuation; account search/status; low-stock metadata batches |
| Access protection | Actual DAL guard redirects for all role combinations, signed-out/inactive/missing/invalid profiles; list guard before reads; account guards before mutation |
| Account validation | Email/password/role/student-link requirements, password mismatch/reuse, self-deactivation/password protections; invalid names rejected without client access |
| Reports and ledger | 1,201 aggregate groups despite API caps; failed batch rejects partial totals; page-two full totals/suppression/print markup; complete ledger sum |
| Student pending request | Request disabled even when pending appointment is outside the current history page |

These tests verify application behavior with mocked Supabase boundaries, not live RLS enforcement or actual browser interactions. Historical PGlite/live/browser counts above are retained as historical evidence, not rerun claims. New browser responsive/keyboard/print visual QA is pending because no browser surface was connected; server-rendered markup verifies pagination wrapping, disabled states and print-row inclusion. No deployment readiness is claimed.


## Sensitive-action confirmation follow-up - 2026-10-20

Run npm test: 125/125 pass, including 16 new isolated confirmation tests. The new hook/event harness verifies no action on Cancel, one dispatch on rapid Confirm, pending controls, errors staying open, retry/success feedback, conditional role/status confirmations, redirect propagation, account refresh, focus/Escape callbacks, mobile class contracts, unauthorized server guards and self-account UI restrictions. Existing role/account tests remain passing. No browser was connected: actual Tab trapping, full menu/portal focus behavior, screen-reader and mobile visual QA remain unverified. No live writes or new dependencies. File/action inventory and limits: CONFIRMATIONS.md.

## Final QA pass - 2026-10-20

`npm test`: 192/192 pass, including the new `tests/qa-regressions.test.cjs` (6 tests):
- the auth-callback redirect stays on this site
- impossible date-times and clock times are rejected before the database (student request, staff booking, clinic hours, visits/incidents/appointments)
- student birth dates must be real dates
- editing a medicine cannot create a duplicate
- forms that share a page have unique field ids

Browser testing used the clinic personnel session only; administrator and student sessions were not available. No live writes were made. See the "Final QA" entry in `DEVLOG.md` for coverage and limits.

Client revisions 2026-10-21: `tests/client-revisions.test.cjs` adds 18 tests (245 total passing): exact report counts, dashboard metric definitions and transitions, sidebar live count, academic profile schema/action/gate, admin-only inventory actions and pages, nurse read-only medicine page, migration 0013 static checks, nurse booking linkage and portal visibility. See `CLIENT_REVISIONS.md`.
