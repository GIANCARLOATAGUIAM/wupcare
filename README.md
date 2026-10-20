# WUPCare

**WUPCare: A Web-Based Student Health Records and Clinic Management System at Wesleyan University-Philippines.**

WUPCare is a records and clinic management tool for the university clinic. It manages student profiles and health records, clinic visits, appointments, medication inventory, health incidents, reports, and user accounts, with role-based access for Administrators, Clinic Personnel, and Students.

> WUPCare does not diagnose, prescribe, or replace professional medical judgment or emergency services.
> Use fictional demo data only until the university authorizes real records (Data Privacy Act of 2012, RA 10173).

| Document | Purpose |
|---|---|
| [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) | Requirements, roles, data model, security design |
| [`PLAN.md`](PLAN.md) | Development phases |
| [`docs/AUTH_PROVISIONING.md`](docs/AUTH_PROVISIONING.md) | Accounts, first administrator, student registration |
| [`docs/TEST_CASES.md`](docs/TEST_CASES.md) | Test cases with expected and actual results |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deployment checklist |
| [`docs/DEVLOG.md`](docs/DEVLOG.md) | Development log and verification results |

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, Supabase (Postgres, Auth, Row Level Security), zod.

## Roles

| Role | Can do | Account created by |
|---|---|---|
| Administrator | Manage user accounts; view aggregate reports (whole months, counts below 5 hidden). No access to individual health records. | The first one with `scripts/create-admin.mjs`; later ones by an administrator |
| Clinic Personnel | Students, health records, visits, appointments, medicines, incidents, reports, clinic hours, approval of student registrations | An administrator |
| Student | Request appointments and see their own appointments only | Self-registration (when enabled) or an administrator |

Authorization is enforced three times: in the UI, in every server page and action (`requireRole`), and in the database (RLS and checked functions). The database is the real security boundary.

## Local setup

Requirements: Node.js 20.9+ and access to the Supabase project.

```bash
npm ci
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

`.env.local`:

| Variable | Where it is used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server | Publishable key only |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (`lib/supabase/admin.ts`) | Never prefix with `NEXT_PUBLIC_`. Used only after `requireRole("admin")` |
| `STUDENT_REGISTRATION` | server only | `enabled` turns on `/register`. Schema 0010 is applied; verify target Auth sign-up, confirmation, and email settings before enabling |

Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm test`. On PowerShell with script execution disabled, use `npm.cmd` in place of `npm`.

## Database

Migrations are in `supabase/migrations/` and are applied in order:

| File | Contents | Status on the project |
|---|---|---|
| `0001_enums.sql` – `0008_reference_data.sql` | Tables, constraints, role helpers, inventory functions, appointment rules, RLS, reports, reference data | Applied |
| `0009_fix_auth_provisioning.sql` | Profile trigger also runs on `app_metadata` updates | Applied |
| `0010_student_self_registration.sql` | Pending student profiles after sign-up, `approve_student_link()` | Applied (verified 2026-10-20, version `20261020032859`) |

After schema changes, regenerate `types/database.ts` from the live schema.

### Demo data

`supabase/seed.sql` adds fictional demo data only: 18 students (`DEMO-0001` to `DEMO-0018`), 12 medicines, about 40 visits, 15 appointments, and 8 incidents. It is idempotent and never changes real records. It needs one active clinic personnel account. `supabase/remove-demo.sql` deletes demo rows only and keeps demo students linked to accounts. Run both in the Supabase SQL editor.

Demo records show a DEMO badge. Lists default to all records; reports default to real records only.

## Accounts

- **First administrator:** `node scripts/create-admin.mjs --email <email> --name "<full name>"`. The password is entered at a hidden prompt (or `ADMIN_PASSWORD`). The script refuses to run if an administrator exists. See `docs/AUTH_PROVISIONING.md` §4.
- **Clinic personnel and later administrators:** Users → New user.
- **Students:** `/register` when self-registration is enabled; clinic personnel approve each account under Registrations after checking the student's identity.

## Project structure

```
app/(public)/      login, register
app/(clinic)/      administrator and clinic personnel pages
app/(portal)/      student portal
app/auth/confirm/  email confirmation callback
features/<module>/ server actions, queries, schemas, components
components/        shared UI (components/ui = shadcn)
lib/               Supabase clients, auth (DAL), formatting, form helpers
supabase/          migrations, seed.sql, remove-demo.sql
scripts/           create-admin.mjs
proxy.ts           session refresh and sign-in redirect
```

## Known limitations

See `docs/DEVLOG.md` (Phase 8C) and `docs/DEPLOYMENT.md`. In short:
- Migration 0010 is applied and the registration schema exists. Live registration/email delivery and production Auth settings were not reverified in the stabilization run; registration readiness is not implied by schema availability.
- The built-in Supabase email service delivers only to the project's team members and has a low hourly limit; real students need an institutional SMTP server or "Confirm email" turned off (with clinic approval as the gate).
- Starting stock for a new medicine is saved in two steps; if the second fails, the medicine page asks staff to finish the restock.
- No CSV export, charts, calendar view, or audit log (optional items in the spec).
- Staff can approve, reschedule, or book at a time that has already passed (not restricted by the spec; a decision is pending).
- Final QA (2026-10-20) browser-tested the clinic personnel role only; administrator and student journeys and live write workflows are covered by mocked tests, not live runs. See the "Final QA" entry in `docs/DEVLOG.md`.

## Stabilization (2026-10-20)

Administrator reports now use auto-updating Month, Year and Records dropdowns for one complete Asia/Manila calendar month. Full-width tables and complete print/PDF output are retained. Exact small aggregate counts require the **proposed, unapplied** migration `0011_exact_report_counts.sql`; the live database still returns suppressed values until approval/application. Nurse and Student interfaces are unchanged. See [the exact SQL change and verification limits](docs/ADMIN_REPORTS.md).

Record lists use ten rows per page, stable unique ordering, filter-preserving URL links, Previous/Next, page counts, and "Showing X-Y of Z records". Search/filter changes start at page one. Out-of-range pages return to page one with filters retained. This covers both administrator account lists, clinic students/visits/appointments/inventory/incidents, per-medicine transaction history, and student appointment history. Reads use the current session and RLS. The low-stock filter scans only stock metadata on the server to compare two columns, then fetches ten full medicine rows; this costs more reads as inventory grows.

Report aggregates are computed by the existing database RPCs. The server retrieves all authorized aggregate groups in bounded requests; ten groups are visible on screen, and print/PDF includes every group and full totals. Clinical student-history print reports remain complete and unpaginated. Account student-number lookup and ledger totals also collect complete authorized metadata, independently of displayed rows.

Display names normalize repeated spaces, trim edges, reject controls/markup and enforce 2-120 characters on save. Missing, empty or whitespace-only profile names display Administrator / Nurse / Student by role through `lib/auth/display-name.ts`. Custom names remain custom. The known 120-character administrator name remains stored pending approval; see the guarded correction proposal in [the security review](docs/SECURITY_REVIEW.md).

`npm test` runs repository-owned Node tests using the existing TypeScript compiler and fictional in-memory Supabase boundaries. Tests do not load `.env.local`, clear Supabase environment settings, block network fetch, and block unmocked server/admin clients. No credentials or live writes are used. The tests cover names, pagination, search/filters, access guards, account validation, aggregate completeness, print markup, and ledger totals; they do not substitute for live RLS or browser testing. Historical scratchpad suites recorded in the development log are not shipped as reproducible tests.

Read-only security review: 13 intentional checked SECURITY DEFINER warnings and one disabled leaked-password-protection warning. See [scope and per-function findings](docs/SECURITY_REVIEW.md). No schema, policy, grant, or data changes were made. No deployment readiness is claimed.
