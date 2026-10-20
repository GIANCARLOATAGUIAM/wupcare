# Official College and Program catalog (2026-10-21)

Status: application changes are local and uncommitted. Migration **0014 is prepared, not applied.** No live record was changed.

## Catalog

8 colleges and 24 programs, names and abbreviations exactly as supplied by the client. Source of truth in the app: `features/academics/catalog.ts`. Migration 0014 seeds the same rows (a test compares them row for row). IDs are stable slugs such as `cams-bs-respiratory-therapy`; abbreviations are display text only (BSRT is used by two programs).

## Where it is used

One component, `features/academics/academic-fields.tsx` (College / Department → Program / Course → Year Level). Program lists only the selected college's programs and is cleared whenever the college changes.

| Screen | Required | Notes |
|---|---|---|
| Student registration | all three | client + server validation; the 0014 trigger validates again |
| Complete Your Profile | all three | shown to linked students until all three are set |
| My Account → Academic details | all three | prefilled; legacy free text shown as a hint |
| Nurse Add / Edit Student | optional | a program needs its college; legacy text shown as a hint |
| Nurse student list, detail, clinic history report, student picker | display | official names/codes; legacy text flagged "not from the official list" |

Administrators have no access to student records; no admin screen shows college or program.

## Database (migration 0014)

- `public.colleges`, `public.programs`: read-only for `anon` and `authenticated` (registration runs signed out); no write grants.
- `students.college_id`, `students.program_id`: nullable. A composite foreign key `(program_id, college_id) → programs(id, college_id)` makes the database reject a program from another college; a check rejects a program without a college.
- The existing `college` / `program` text columns are kept. A trigger fills them with the official names when IDs are written (so search and existing screens keep working) and clears them when staff remove a selection. Rows whose IDs are not written keep their text exactly.
- `my_academic_profile()` returns IDs plus legacy text; `update_my_academic_profile(p_college_id, p_program_id, p_year_level)` replaces the 0013 text version and changes only those three fields of the caller's own record.
- Appointment requests by students require `college_id`, `program_id` and `year_level`.
- Registration (`new_student_v1`) stores the IDs; the 0013 free-text payload is still accepted so pages loaded before the release keep working.
- No existing row is updated or deleted; no program is assigned to anyone.

Rollback: `docs/sql/0014_academic_catalog.rollback.sql` restores the exact 0013 definitions and removes the catalog. Students keep their names in the text columns; only the IDs are lost.

## Existing data (read-only inspection, 2026-10-21)

| Records | Value | After 0014 |
|---|---|---|
| 1 real student | `College of Engineering and Computer Technology`, no program, Year 3 | exact college match; program must be chosen |
| 1 real student | nothing | must complete |
| 18 demo students | `Demo College of …` / `BS Demo …` | no catalog match; flagged as legacy |

After 0014 every student account must choose a catalog program before requesting an appointment (all three accounts, including the demo account).

`docs/sql/0014_map_legacy_academics.sql` (optional, separate approval) previews and, if approved, links exact college name/code matches and unambiguous program matches. It never guesses; ambiguous values (for example "BSRT") and unmatched demo values are left for manual review.

## Validation

- Isolated PostgreSQL (PGlite 0.5.8) with the live-equivalent schema (0001–0010, 0012, 0011, seed, 0013): 80/80 checks — one-transaction apply, no existing row changed in any table, catalog contents, read-only catalog for every role, DB-enforced program-in-college, self-service limited to own record and three fields, nurse create/edit, admin denied, registration with IDs/legacy/no fields, 0012 duplicate rule, legacy mapping script, rollback to the exact 0013 definitions/policies/grants, re-apply.
- App: 255/255 tests, TypeScript, ESLint, production build.
- Browser (local build, existing Student session, nothing submitted): dependent dropdown filters and resets correctly; no overflow at 320/390/768/1440 on My Account, Complete Your Profile and registration.

## Deployment order

1. Approve and apply 0014.
2. Deploy this application release immediately after. The previous release reads `college` text and calls the removed `update_my_academic_profile(text, smallint)`, so profile saves fail on the old release once 0014 is applied; the current release selects `college_id`/`program_id`, which fail before 0014.
3. Optionally approve the legacy mapping script.

Seed: `supabase/seed.sql` now records starting stock as an active administrator (restocking is Administrator-only since 0013) and returns to clinic staff for visits, appointments and issuance. It needs both accounts on a fresh development database. Never run it against production.

Release and rollback runbook: `RELEASE_0014.md`.
