# Release: academic catalog + Approved Appointments dashboard

One release, one migration. Code and database depend on each other, so they go live back to back. Nothing here has been run yet.

## Contents

- Migration `supabase/migrations/0014_academic_catalog.sql`
  - 384 lines, 19,510 bytes, ASCII, LF line endings
  - SHA-256 `ff475e22e43ad91254a2ee1148cc914001b4d47a283f960acd47cf140787b168`
  - MD5 `2b49ba0ae40535f7495f45c279383d60`
- Application: College → Program → Year Level (see `ACADEMIC_CATALOG.md`); Student Dashboard "Approved Appointments" (every `approved` appointment of the signed-in student, earliest first, overdue ones labelled); seed fix (starting stock recorded by an administrator).
- Rollback: `docs/sql/0014_academic_catalog.rollback.sql`.

## Why order matters

| State | Effect |
|---|---|
| Old code + 0014 applied | Saving a profile fails (old function removed); student appointment requests are refused until a catalog program is chosen. Everything else works. |
| New code + no 0014 | Student list and student pages fail (`college_id` missing); every student is sent to Complete Your Profile and cannot save. |

So: apply 0014 first, then switch production to the new release as quickly as possible. The first state is the smaller risk.

## Before the window

1. Commit all 34 release files (list: `git status`, excluding `.agents/ .codex/ .gemini/ .pixel-agents/ skills-lock.json`). A clean export of HEAD plus exactly these files passes TypeScript, 257 tests and ESLint.
2. Push to a **non-production branch**. Vercel builds a Preview deployment. This only proves the build; Preview uses the same live database (no 0014 yet), so its student pages will show errors. Do not test student flows there.
3. Build the production deployment without assigning the domain, so switching is instant:
   - Vercel CLI: `vercel deploy --prod --skip-domain` (from the release commit), or
   - Dashboard: temporarily turn off automatic production domain assignment, then merge to the production branch; the new production deployment builds but is not live.
4. Pick a quiet time. Optionally tell students that profile saving is briefly unavailable.
5. Optional backup: `supabase db dump` (schema + data) as before; the project is on the Free plan with no managed backups.

## The window (target: under 2 minutes)

1. Re-check: migration history ends with 0013; `public.colleges` does not exist; the file checksum matches above.
2. Apply `0014_academic_catalog.sql` (migration tool, or the SQL Editor with the exact file). It is one transaction with `lock_timeout = 5s`; on any error nothing is applied — stop and keep the current release.
3. Immediately promote the prepared deployment: `vercel promote <deployment-url>` or Dashboard → Deployments → Promote to Production.
4. If 0014 went through the SQL Editor, add the history row (history only, no SQL re-run):
   `insert into supabase_migrations.schema_migrations (version, name) values ('<UTC timestamp>', '0014_academic_catalog');`

## Verification (read-only)

- 8 colleges, 24 programs; `students.college_id/program_id` exist and are null for existing rows; existing row counts unchanged.
- Security Advisor: expect one new intended finding for `update_my_academic_profile(text, text, smallint)` (signed-in SECURITY DEFINER), replacing the 0013 one; catalog tables have RLS with read-only policies.
- Browser: Student → Complete Your Profile shows the three dropdowns; Dashboard shows Approved Appointments; Nurse → Edit Student shows the picker and legacy values flagged; Admin unaffected.

## Rollback

- Release problem, database fine: Vercel Instant Rollback to the previous deployment **and** run the 0014 rollback, in that order, back to back (the old release does not fully work with 0014).
- Migration problem during apply: nothing was applied (single transaction); do not promote.
- Full rollback: `docs/sql/0014_academic_catalog.rollback.sql` (restores the exact 0013 functions, removes the catalog; names chosen by students stay in the text columns), then Vercel Instant Rollback, then delete the 0014 history row if one was added.

## Not part of the window

`docs/sql/0014_map_legacy_academics.sql` (optional legacy linking) needs its own approval and can run any time after 0014.
