# WUPCare — Development Plan

Version 2.2 · 2026-10-14 · Companion to `SYSTEM_SPEC.md` v2.2. Requirement IDs (FR-*, NFR-*, Q-*) refer to that document.

Approach: Agile iterations, one phase per module group *(Paper §3.A)*. Each phase follows **build → test → review → fix**. Each phase ends at a **checkpoint**: the developer stops and the client reviews before the next phase starts.

---

## Ground rules (every phase)

- **No git state changes** (add, commit, push, branch, config) until explicitly authorized.
- **No migrations, seeding, or deployment** without explicit approval. SQL is written as files in `supabase/migrations/` first, shown for review, and then applied to the existing Supabase project.
- Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (`AGENTS.md`). Key points:
  - `proxy.ts` replaces `middleware.ts`.
  - `cookies()`, `params`, and `searchParams` are async.
  - Cache Components is disabled, so the previous caching model applies.
- Before writing SQL or RLS, load the Supabase and Postgres best-practices skills.
- Use the Impeccable skill for design tokens (Phase 1) and the polish and audit pass (Phase 8). Use the Grill Me skill at checkpoints to settle open questions.
- Every server action follows the same order:
  1. `requireRole()`
  2. zod validation
  3. Supabase call
  4. `revalidatePath`
  5. Return `{ ok, error, fieldErrors }`.
- Keep `docs/DEVLOG.md` updated: iteration dates, finished features, tests *(Paper §3.D)*.
- Keep it simple. Anything marked [OPT] in the spec is built only after the baseline is done and the client approves it.

### Dependencies to add (minimal)

| Package | Purpose | Phase |
|---|---|---|
| `@supabase/supabase-js`, `@supabase/ssr` | Database, Auth, cookie sessions | 1 |
| shadcn/ui (`npx shadcn@latest init`). It adds `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`. | UI components | 1 |
| `sonner` (via shadcn) | Toast messages | 1 |
| `zod` | Shared validation | 1 |
| `server-only` | Keep server modules off the client | 1 |
| `react-day-picker`, `date-fns` (via shadcn calendar) | Date picker | 3 |
| `supabase` CLI (npx) | Migration files and type generation | 2 |

Not added: react-hook-form, an ORM, state libraries, chart libraries (charts are [OPT]), test frameworks beyond Phase 8's optional item.

### Folder structure

```
app/
  (public)/login/
  (clinic)/  dashboard/ students/ visits/ appointments/ medications/ incidents/ reports/ settings/ admin/users/ account/
  (portal)/  portal/
components/
  ui/        shadcn components
  app/       sidebar, page-header, data-table, demo-badge, status-badge, scope-filter, empty-state
features/
  students/ health-records/ visits/ appointments/ medications/ incidents/ reports/ users/ settings/
    actions.ts  queries.ts  schema.ts  components/
lib/
  supabase/  server.ts  client.ts  admin.ts (server-only)
  auth/      dal.ts
  utils.ts   format.ts (Asia/Manila dates)
types/database.ts       generated
supabase/migrations/  supabase/tests/  supabase/seed.sql  supabase/remove-demo.sql
scripts/seed-users.ts
proxy.ts
docs/DEVLOG.md  docs/TEST_CASES.md
```

---

## Phase 1: Project setup and authentication

**Goal:** a styled app shell. Users log in with email and password, are routed by role, and log out.

**Depends on:** access to the existing Supabase project (URL, publishable key, service-role key).

### Tasks
1. Edit `next.config.ts`: remove `cacheComponents` and `partialPrefetching` together. Keep `experimental.agentFeedback` and the turbopack CSS rule. Run `npm run dev` and `npm run build` to confirm the config is valid.
2. Initialize shadcn/ui for Tailwind v4. Add: button, input, label, textarea, select, table, dialog, sheet, tabs, badge, card, dropdown-menu, sonner, separator, skeleton, alert, popover.
3. Design tokens with Impeccable:
   - neutral base and one clinical accent color
   - fixed status colors (spec 6.3)
   - 14px data text, Geist font (already loaded)
   - light theme only
4. Replace the boilerplate home page and metadata. Add the disclaimer footer (spec 2.4).
5. Add `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). The developer fills `.env.local` (gitignored).
6. Supabase clients: `lib/supabase/server.ts`, `client.ts`, and `admin.ts` (`server-only`).
7. `proxy.ts`: refresh the session and redirect signed-out users to `/login`. Exclude static files in the matcher.
8. `lib/auth/dal.ts`: `getCurrentUser()` (uses `auth.getUser()`) and `requireRole()`.
9. `/login` with a server action and a generic error message. Add a logout action.
10. Layouts:
    - `(clinic)`: sidebar that becomes a Sheet on mobile, with the role-based menu from spec 6.2
    - `(portal)`: minimal top bar
11. `/` redirects by role.
12. Supabase dashboard settings (developer, with approval): keep email sign-ups enabled for student self-registration with "Confirm email" on, and set the Site URL and redirect URLs (including `/auth/confirm`). No custom SMTP in development (spec Q-A1).

### Checkpoint
- `npm run build` and `npm run lint` are clean.
- Manual login and logout work with a temporary test user. A signed-out visit to `/dashboard` redirects to `/login`.
- The shell looks right at 360px and 1280px.

### Done when
FR-AUTH-1 to FR-AUTH-4 and FR-AUTH-8 work. The client approves the look of the shell. Full role routing is completed in Phase 2, when profiles exist.

---

## Phase 2: Database schema and RLS

**Goal:** all 10 tables, functions, triggers, and RLS policies as reviewed migration files, applied to the existing project, with generated types.

**Depends on:** Phase 1. The researchers confirm the ERD deviations (spec 14.1, Q-ERD).

### Tasks
1. Load the Supabase and Postgres best-practices skills. List the existing tables in the project so nothing is overwritten.
2. Write the migration files:
   - `0001_enums.sql`: user_role, student_status, appointment_status, incident_type, med_txn_type
   - `0002_tables.sql`: the 10 tables, with constraints, foreign keys, and indexes (spec 9.3)
   - `0003_helpers.sql`: `current_user_role()`, `current_student_id()`, the `updated_at`/`updated_by` trigger, and the auto-create health record trigger
   - `0004_inventory.sql`: `issue_medication`, `restock_medication`, `adjust_medication`, `create_visit_with_medications`
   - `0005_appointments.sql`: the request validation trigger (clinic hours) and the student cancel-only trigger
   - `0006_rls.sql`: enable RLS on all tables and add the policies (spec 10.3). Admins get no SELECT on clinical tables.
   - `0007_reports.sql`: the `report_*` aggregate functions and `students_without_account()`
   - `0008_reference_data.sql`: the 10 health concern categories and the default `clinic_settings` row
   - `0009_fix_auth_provisioning.sql`: the profile trigger also runs on `app_metadata` updates (live finding; applied)
   - `0010_student_self_registration.sql`: pending student profiles after email confirmation, the `requested_student_number` column, and `approve_student_link()` (spec §8.10)
3. **Stop for review.** Show the SQL to the client.
4. After approval, apply the migrations to the existing project. Then run the Supabase security and performance advisors and fix any warnings.
5. Generate `types/database.ts`.
6. Connect `profiles` to `requireRole()`. Create the first administrator through a documented one-time step.
7. RLS test scripts in `supabase/tests/`. Each script acts as one role and checks what it may and may not do.

### Checkpoint
The RLS tests pass:
- A student reads only their own appointments and nothing from the clinical tables.
- An admin reads nothing from the clinical tables, but the `report_*` functions return counts.
- A student cannot insert a request outside clinic hours, and can only cancel their own pending request.
- `issue_medication` with too much quantity fails, and stock does not change.
- An inactive user is denied everything.

The advisors show no critical warnings.

### Done when
The schema matches spec 9. Types are generated. Role routing works end to end for all 3 roles.

---

## Phase 3: Student and health record management

**Goal:** FR-STU and FR-HR.

**Depends on:** Phase 2. Q-S2, Q-D1, and Q-D2 can use their defaults.

### Tasks
1. Shared components:
   - Shared list controls: server-side pagination, 10 rows, filters in the URL as `?q=&page=&scope=`
   - `DemoBadge`, `ScopeFilter`, `PageHeader`, `EmptyState`, `StatusBadge`
2. `/students`: search by number or name; filters for college, year, status, and scope; DEMO badge.
3. `/students/new` and `/students/[id]/edit`: zod schema. A duplicate student number (Postgres error `23505`) becomes a field error.
4. `/students/[id]`:
   - header with name, number, DEMO badge, and allergy and condition alerts
   - tabs: Health Record, Visits, Appointments, Incidents, Medications (later tabs fill in as their phases finish)
5. `/students/[id]/health/edit`: shows who last updated the record and when.
6. Archive action (status `inactive` or `graduated`) with a confirmation dialog.
7. Student self-registration (spec §8.10):
   - `/register`: email, Student ID, and password; `signUp` with `user_metadata.student_number` and `emailRedirectTo` set to `/auth/confirm`
   - `/auth/confirm`: route handler that calls `verifyOtp` with `token_hash`
   - add `/register` and `/auth/confirm` to the proxy's public paths
   - `/portal` shows "Waiting for clinic approval" while the account has no student link
8. `/students/registrations` (clinic staff): pending accounts with email and entered Student ID; approve the link to a student record through `approve_student_link()`. Pending count in the sidebar.

### Checkpoint
STU, HR, and REG acceptance criteria pass. Use clearly fake test rows and remove them afterwards. Test registration emails only with addresses on the Supabase organization's team (spec Q-A1).

### Done when
Clinic personnel can fully manage student profiles and health records. The admin account cannot reach these pages.

---

## Phase 4: Clinic visits and consultations

**Goal:** FR-VIS, including medication issued during a visit.

**Depends on:** Phase 3 and the inventory functions from Phase 2. Add a few medicines by hand for testing, or build medicine add (Phase 5, task 8) first.

### Tasks
1. `/visits/new?student=&appointment=`:
   - student search picker and allergy alert
   - fields for DFD 3.1 to 3.4, plus the concern category select
   - repeatable medication rows that show available stock
   - save through `create_visit_with_medications`
2. `/visits`: log with date range, student search, and scope filter.
3. `/visits/[id]`: detail and edit. Issued medicines are read-only here; corrections go through an inventory adjustment. Show who edited and when.
4. Student page Visits tab: newest first.
5. Dashboard counter: visits today.

### Checkpoint
- VIS acceptance criteria pass.
- A failed issuance saves no visit and changes no stock.
- For each medicine, the stock equals the sum of its transactions.

### Done when
Workflow 8.2 works end to end in 3 clicks or fewer from the dashboard.

---

## Phase 5: Appointments and medication inventory

**Goal:** FR-APT, FR-MED, the student portal, and clinic hours settings.

**Depends on:** Phase 4. Q-F5 can use its default hours.

### Tasks: clinic hours
1. `/settings/clinic-hours`: open days, opening time, closing time, and maximum days ahead. Clinic personnel can edit.

### Tasks: appointments
2. `/portal`: the student's appointments with status, schedule, and staff remarks. Cancel button for pending requests.
3. `/portal/request`: date picker limited to open days and the allowed range; time limited to opening hours; reason.
4. `/appointments`:
   - status tabs, with Pending first
   - date filter and a today list
   - row actions: Approve (set schedule), Decline (remark required), Reschedule (new schedule and remark), Cancel, Complete
   - Complete offers "Record visit", which opens the visit form with the student selected
5. `/appointments/new`: clinic personnel book an appointment for a student.
6. Student page Appointments tab. Pending count in the sidebar. Dashboard counters.

### Tasks: medication inventory
7. `/medications`: stock, unit, expiry, and flags (Low, Expiring within 30 days, Expired), plus scope filter.
8. `/medications/new` and edit. The starting stock is saved as a restock transaction.
9. `/medications/[id]`: transaction history, plus Restock, Adjust (reason required), and Issue (choose a student) dialogs.
10. Deactivate a medicine. Student page Medications tab. Dashboard counters for low stock and expiring medicines.

### Checkpoint
- APT and MED acceptance criteria pass.
- Test with 2 student accounts: neither can see the other's appointments.
- Changing clinic hours changes what the request form accepts, and the database rejects requests outside the hours.

### Done when
Workflows 8.3, 8.4, 8.5, and 8.9 work end to end.

---

## Phase 6: Health incidents

**Goal:** FR-INC.

**Depends on:** Phase 5, to reuse the medication rows component.

### Tasks
1. `/incidents/new`:
   - student picker, type, date and time, location, description, action taken
   - optional link to a visit
   - optional medication rows
2. `/incidents`: log with type, date, and scope filters.
3. `/incidents/[id]`: detail and edit, with who and when.
4. Student page Incidents tab. Dashboard counter: incidents this month.

### Checkpoint
INC acceptance criteria pass. Medication given for an incident updates stock and shows the incident link in the medicine's history.

### Done when
Workflow 8.6 works end to end. All student page tabs show data.

---

## Phase 7: Reports and administration

**Goal:** FR-RPT and FR-USR.

**Depends on:** Phases 3–6. Q-F7 can use its default layout.

### Tasks: reports
1. `/reports` for administrators and clinic personnel:
   - choose a report, date range, and scope (default Real)
   - 5 aggregate reports from the `report_*` functions: visits per period, common health concerns, medication usage plus stock, incidents per type, appointments per status
2. `/reports/student/[id]` for clinic personnel only: printable student clinic history.
3. Print stylesheet:
   - hide the sidebar and filters
   - header shows report name, date range, scope, printed by, and printed at
   - covers "display or export" (DFD 7.4) through print or save as PDF
4. Final dashboards:
   - clinic personnel: operational counters
   - administrator: aggregate counters only (visits and incidents this month, appointments by status, active users by role)

### Tasks: user management
5. `/admin/users`: list with name, email, role, linked student number, and active status. Search and role filter.
6. Create user dialog: role, name, email, temporary password. For a student account, a picker from `students_without_account()`.
7. Change role, deactivate or reactivate (blocked for the admin's own account), and set a new temporary password.
8. `/account` and `/portal/account`: change own password.

### Checkpoint
- RPT and USR acceptance criteria pass.
- Report totals match manual SQL counts for one date range.
- A newly created student account logs in and sees only its own appointments.
- The admin account sees no names or clinical details anywhere.

### Done when
All 9 modules work. Workflows 8.7 and 8.8 work.

---

## Phase 8: Demo data, testing, polish, and deployment preparation

**Goal:** a tested, demo-ready, documented build. Deployment happens only with explicit authorization.

**Depends on:** Phases 1–7.

### Tasks: demo data (run only after approval)
1. `supabase/seed.sql`, idempotent, demo rows only:
   - 18 fictional college students (`DEMO-0001` to `DEMO-0018`) with health records
   - about 12 medicines, including low-stock and expired examples
   - about 40 visits over 3 months, across all categories, with issuances made through the inventory functions
   - about 15 appointments in every status
   - about 8 incidents of all types
2. `scripts/seed-users.ts`: creates `admin@wupcare.test`, `nurse@wupcare.test`, and `student@wupcare.test` (linked to `DEMO-0001`).
3. `supabase/remove-demo.sql`: deletes demo rows only. The admin button for this is [OPT].
4. Check DEMO badges, scope filters, and that reports default to Real.

### Tasks: testing *(Paper §3.E)*
5. `docs/TEST_CASES.md`: one row per acceptance criterion in spec 13, with Expected, Actual, and Pass/Fail columns.
6. Run every test case with the 3 demo accounts and record the results.
7. Re-run the RLS tests and the Supabase advisors.
8. **[OPT]** Playwright smoke tests: login, a visit with medication, and an appointment from request to approval.
9. Draft an ISO/IEC 25010 evaluation questionnaire template for the researchers. It covers functional suitability, usability, reliability, performance efficiency, and security. No results are invented.

### Tasks: UI polish
10. Impeccable audit and polish:
    - spacing, type, and density consistency
    - empty, loading, and error states
    - focus states and contrast
    - checks at 360px and 768px
11. Lighthouse accessibility score of 90 or higher on the main pages.

### Tasks: deployment preparation (no deployment)
12. `README.md`: setup, environment variables, migration and seed steps, demo accounts, backup method (Q-T3), privacy notes.
13. A clean `npm run build`. Vercel environment variable checklist. Supabase Auth URL checklist for the production domain.
14. Final review against spec 13. Update `docs/DEVLOG.md`. List the manuscript updates from spec 14.3 for the researchers.

### Checkpoint
- All test cases pass, or known issues are documented.
- A full run from a clean state works: migrations, seed, each role, every workflow.

### Done when
The client signs off on the demo and the deployment checklist is ready. Deploy to Vercel only after explicit authorization.

---

## Status (updated 2026-10-20)

| Phase | Status |
|---|---|
| 1 Setup and authentication | Done |
| 2 Schema and RLS | Done. Migrations 0001-0010 applied; 0010 verified live on 2026-10-20 |
| 3 Students and health records | Done |
| 4 Clinic visits | Done |
| 5 Appointments, inventory, clinic hours | Done |
| 6 Health incidents | Done |
| 7 Reports and administration | Done |
| 8A Stability and demo data | Done. Demo seed applied |
| 8B UI polish and accessibility | Done |
| 8C Authentication finalization and QA | Local implementation exists; 0010 and development accounts are present. Auth delivery/settings and a complete live registration flow remain unverified in the current stabilization run |

Phase 8 was split into 8A (stability and demo data), 8B (UI and accessibility), and 8C (authentication and QA). Student registration UI (Phase 3, tasks 7–8) was finished in 8C behind `STUDENT_REGISTRATION`.

## Phase order

```
P1 Setup/Auth ─> P2 Schema/RLS ─> P3 Students/HR ─> P4 Visits ─> P5 Appointments + Inventory + Clinic hours ─> P6 Incidents ─> P7 Reports/Users ─> P8 Demo/Test/Polish
```

## Rough effort (one developer)

| Phase | Estimate |
|---|---|
| 1 | 1 day |
| 2 | 1.5–2 days |
| 3 | 1.5 days |
| 4 | 1.5 days |
| 5 | 2–2.5 days |
| 6 | 0.5–1 day |
| 7 | 1.5–2 days |
| 8 | 2–3 days |
| **Total** | **about 11–14 working days** |

## Risks

| Risk | Mitigation |
|---|---|
| The existing Supabase project already has tables or settings | List existing tables before Phase 2. Never overwrite without review. |
| RLS mistakes expose health data | RLS test scripts per role, plus advisors in Phase 2 and Phase 8 |
| Admin needs some student identity to link accounts | A restricted function returns only number and name for students without an account |
| Inventory race conditions | Row-locking database functions. No stock math in the browser. |
| The paper's diagrams disagree with the build | Spec 14.3 lists the manuscript updates. The researchers confirm before Phase 2. |
| Scope creep | Everything beyond the paper is [OPT] and needs client approval |
| Real data entered before authorization | Demo-only until the client confirms institutional approval. The README states this. |

## Stabilization follow-up - 2026-10-20

Local display-name fix and role fallbacks, ten-row server pagination, repository-owned isolated automated tests, and documentation cleanup implemented. Existing range queries were reused. Aggregate report totals and full print/PDF output are independent of the on-screen page. The low-stock view scans stock metadata on the server because no schema/RPC change was authorized.

Read-only security review is recorded in `docs/SECURITY_REVIEW.md`: 13 intentional guarded definer functions and disabled leaked-password protection. Migration 0010 is applied; this does not verify Auth/email or production registration readiness. Deployment remains unapproved. The known administrator name correction requires explicit approval and has not been executed. New visual browser QA requires a connected browser; isolated markup tests cover footer/print states but cannot certify responsive rendering.
