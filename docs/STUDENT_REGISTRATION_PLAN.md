# Student registration: proposal awaiting approval

Status: **draft only; no application rollout, database writes, or Auth setting changes**.

## Confirmed current behavior

- `registerStudent` calls Supabase `signUp`; the current form collects email, Student ID, password and confirmation, but not names. Server zod validation exists; equivalent client validation needs adding.
- The live `handle_new_auth_user` trigger provisions self-registration as an unlinked Student profile after email confirmation. Administrator provisioning uses trusted `app_metadata` and is separate.
- `students.first_name` and `last_name` are required. The existing student-insert trigger creates one empty health record. `students.student_number` is unique by exact comparison; `profiles.student_id` is unique.
- Read-only inspection found **zero** Student ID collision groups under `upper(btrim(student_number))`. This must be rechecked when applying the draft; no IDs or medical details were returned.
- Nurse Students reads shared `students`; Admin Student Accounts reads Student profiles and its restricted number RPC. A new active, non-demo student plus linked Student profile will appear on their next list fetch, subject to selected filters/pagination. No list rewrite or real-time subscription is needed.
- RLS permits students to access only appointments matching their active profile's linked student UUID. Student/health/visit/incident clinical tables remain Nurse-only. The proposed workflow does not grant student clinical-table SELECT or INSERT.
- The preceding read-only public Auth settings check confirmed email/password signup and the registration feature enabled, with **Confirm email on**. No setting has been changed.

## Proposed application changes after plan approval

1. Preserve the registration shell/style, adding required first/last name and optional middle name fields. These are self-reported identity fields, not proof of enrollment. Keep existing email/Student ID/password/confirmation controls and pending/error feedback.
2. Extract a shared client/server schema. Validate names, controls, lengths, email, password confirmation and the existing 8–72 password limit. Canonicalize Student ID using the agreed trimmed/case-insensitive convention. Redact both passwords from returned values and errors.
3. Reject attempts to register through this action while already signed in. The ordinary server client calls a narrow Student ID availability RPC; it never receives existing record IDs or medical information. Check duplicate email through Auth, not an enumerable user list.
4. Call ordinary `auth.signUp` with first/middle/last name, Student ID, and the `new_student_v1` payload marker. Never submit trusted role metadata or a target student UUID. No public service-role account-creation endpoint is introduced.
5. The private Auth trigger creates a **new** student row, the existing empty health record, and the linked Student profile inside the Auth database transaction. The authenticated identity comes from the Auth-created `NEW.id`, not a client target ID. A duplicate/conflicting row causes the whole Auth transaction to fail. No multi-request application insert/delete compensation is used.
6. Preflight conflict feedback is user-friendly but not authoritative. The unique indexes resolve concurrent registrations. On a generic Auth database error, check availability again so a lost race can still produce a clear Student ID conflict. An existing ID is rejected; no existing row is adopted, modified or exposed.
7. Require a returned session and complete linked Student profile before presenting immediate success. After the approved Auth setting is off, redirect to `/portal`; normal clinic hours and one-pending-request rules still apply to immediate appointment requests. Remove obsolete approval/confirmation copy for the new flow only when configured and supported. Preserve accurate handling for legacy pending accounts.
8. Update registration types, tests, specification, provisioning docs, test catalog and DEVLOG. Nurse/Admin account creation stays unchanged.

## Unapplied migration

Forward draft: `docs/sql/student-self-registration.draft.sql` (outside automatic migrations).

- Adds a unique expression index on `upper(btrim(students.student_number))`; aborts if existing data conflicts. It never rewrites Student IDs.
- Adds `registration_student_id_available(text)`, a SECURITY DEFINER boolean-only lookup with an empty search path. EXECUTE is granted to anon only; no table access is granted. This intentionally discloses whether a submitted ID exists, which is necessary for the requested explicit conflict feedback. It must be included in abuse/rate-limit review.
- Replaces only the provisioning function body, preserving the trusted Administrator branch and a legacy payload branch. The existing Auth trigger remains attached. Already provisioned accounts are left untouched.
- The new branch hardcodes Student role, active/non-demo student defaults, a generated student UUID, and the new Auth user's identity. A student row is inserted before its linked profile; `created_by` is initially null to avoid the circular FK, then stamped with the new profile ID in the same transaction. Existing guard/audit triggers remain active.
- No RLS policy, table grant, Auth setting, existing clinical record, legacy pending profile, Nurse/Admin provisioning path or password is changed by the SQL.
- Atomicity must be proven in isolated Postgres and Auth integration tests, including Auth's rollback on trigger failure. The draft has **not** been executed against any database.

## Approvals and rollout sequence

1. Approve this plan and local implementation/tests, including first/last name fields and trimmed/case-insensitive Student ID conflicts.
2. Separately approve applying the reviewed migration. Copy the draft into a numbered migration only after review; recheck the target function/schema and collisions. Coordinate a maintenance window because creating the unique index takes a table lock. SQL installs in a transaction.
3. Prepare and test the application before any live switch. Keep the version marker for mixed clients; new code must fail safely if its RPC is missing. Do not remove the legacy branch or automatically migrate legacy accounts as part of this task.
4. Explicitly approve **disabling Supabase Confirm email project-wide**. It affects all email/password self-signups, not only this UI; anyone could register an email they do not own. It enables account/email squatting and fictitious student records, and does not prove enrollment. Typed IDs must never be used to claim existing records. Nurse/Admin `createUser(email_confirm: true)` remains unchanged. Recovery still uses email; existing unconfirmed users require a separately reviewed handling policy.
5. Any live account/email test needs separate authorization and isolated disposable fixtures. No deployment is authorized. Do not mark the feature complete based solely on passing offline tests.

## Rollback and preservation

- Pause new signup through the existing feature flag during a coordinated rollback (requires operational approval). Restore the exact pre-change provisioning function from `0010_student_self_registration.sql`; restore the legacy app. Re-enable Confirm email only with setting-change approval.
- Drop `registration_student_id_available(text)` after reverting application callers. The new canonical index can remain as a safety constraint; dropping it is optional and requires separate approval.
- Do **not** delete or unlink any successfully registered users, students, health records, appointments, or audit history. A function rollback affects future signups only. Existing linked new accounts remain usable under unchanged RLS.
- No backfill/cleanup is part of either the forward draft or rollback. Legacy pending accounts retain their original workflow until separately resolved.

## Required verification after implementation

- Isolated SQL/Auth: one new Auth user + one Student profile + one new student + one empty health record; failures leave no partial rows. Repeated trigger events do not create extra records or relink. Preserve existing rows and Nurse/Admin provisioning.
- Duplicates: email, exact ID, case/space variants, and simultaneous claims; reject without exposing existing clinical information. Generic Auth trigger errors map to safe conflict feedback.
- Hostile metadata cannot select role, record ID, is_demo, status, created_by or another user's identity. Existing/pending users are not silently adopted.
- UI: client/server invalid input, password confirmation, loading/duplicate submission behavior, returned-session handling, portal access and request-appointment availability at mobile and desktop widths.
- RLS: own appointments only; other students' appointments and all clinical tables denied. Nurse shared lists and Admin Student Accounts contain the new row on refresh, while role boundaries remain intact.
- Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Baseline results are not proof that the unapplied migration or proposed Auth flow works.

## Baseline checks at the proposal stage

2026-10-20: `npm test` **212/212 passed**, `npx tsc --noEmit` passed,
`npm run lint` passed, and `npm run build` passed. No application behavior was
changed. The SQL draft has not been executed, and no new signup, email, account,
appointment, or live RLS write test was performed. Only these proposal documents
were added; no migration, settings change, deployment, staging, commit or push.

## Review and local implementation - 2026-10-20 (continued)

Status: **application code implemented locally behind `STUDENT_REGISTRATION`; SQL is a final candidate, NOT applied; Confirm email still ON.**

### Validation fixes in the SQL candidate

- **Invisible Unicode in Student IDs.** The blocklist missed format characters such as U+0600. Student IDs now use an ASCII allowlist after `upper(btrim())`: `^[A-Z0-9][A-Z0-9./_-]{0,39}$`, plus the existing `DEMO-` rejection. This covers every Unicode category and makes `upper()` locale-independent for accepted IDs. The availability RPC uses the same rule. Existing student numbers are not checked against it; recheck at apply time how many existing IDs fall outside it (count only) so the rule does not lock out real formats.
- **Names.** The SQL blocklist now covers C0/C1 controls, all Unicode Cf characters, line/paragraph separators, private use, noncharacters, specials, variation selectors, the combining grapheme joiner and Hangul/Khmer/Mongolian/Braille fillers, and rejects names made only of non-ASCII blank characters. The app applies a stricter letter allowlist (`\p{L}\p{M}` with spaces, periods, commas, apostrophes, hyphens) and NFC-normalizes.
- **Unknown version marker.** Any present `wupcare_registration` other than the JSON string `new_student_v1` (including `null`, numbers, objects) is rejected. It can no longer reach the legacy pending-account branch.
- The v1 payload is validated on the Auth INSERT, even while Confirm email is on; records are still created only once `email_confirmed_at` is set.
- `set local lock_timeout = '5s'` so the unique-index build aborts instead of queueing behind long transactions.

### Atomicity and the session limitation

The trigger's student, health-record and profile inserts run inside the Supabase Auth transaction that creates (or confirms) the user. Any failure rolls back the Auth user, identity and every application row. **The login session is not part of that transaction**: Auth commits the user first, then issues the session separately. If session issuance fails, a complete, linked account exists and the user sees an error. `registerStudent` handles this by attempting a password sign-in after a generic signUp error and redirecting to `/portal` when the linked account is found. If that sign-in also fails, the availability re-check may report the Student ID as taken by the user's own new record; the message tells them to contact the clinic.

### Local verification

- SQL-only check on local embedded PostgreSQL 17 with a stub `auth.users` table (no Auth binary, no network): **18/18 passed** - collision abort with no partial DDL, RLS policies unchanged, linked creation with empty health record, deferred creation until confirmation, duplicate exact/case/space IDs, the Unicode/allowlist cases, unknown markers, hostile metadata, injected failures at health/profile/audit stages rolling back the `auth.users` row, repeated trigger events, Administrator and legacy provisioning, and anon-only boolean RPC.
- `tests/isolated/student-registration.cjs` (Codex's real-Auth harness) was extended with the new edge cases but **not run**: executing the locally built `auth.exe` was not permitted in this session. Its results file still lists no results. The real-Auth checks (session issuance after commit, real race between two signups, no SMTP use) remain unverified.

## Final preparation - 2026-10-20

Owner decision: the legacy pending-account path is **closed for all new registrations**; existing accounts and records are preserved.

- Reviewed SQL moved to `supabase/migrations/0012_student_self_registration_v1.sql` (header: PROPOSED ONLY, NOT APPLIED). The docs/sql draft is now an empty pointer. Rollback: `docs/sql/student-self-registration.rollback.sql` (restores the exact 0010 trigger body; drops the RPC and cutoff table; keeps the index; changes no rows; re-opens the legacy path, so run it only with Confirm email on).
- `private.registration_policy` stores a single cutoff (`now()` at apply time; no grants, RLS on). A legacy `student_number` payload from any Auth user created at or after it is rejected, confirmed or not. A missing row also rejects. Existing profiles return early and are untouched. Pre-cutoff Auth users keep 0010 behavior.
- Approval route (`approve_student_link`, unchanged): staff-only (`require_role('clinic_staff')`); requires an active, unlinked Student profile and an active, non-demo student record with no account. Students and anon get 42501; a student cannot self-link (guard trigger/RLS); a v1 account is already linked and is "not waiting for approval". After 0012 no new profile can become pending, so only accounts pending before the cutoff can be approved. It still depends on staff verifying identity for those.
- Local SQL check (embedded PostgreSQL 17, stub `auth.users`): **24/24 passed**, including legacy cutoff, fail-closed missing policy row, private cutoff table, approval-route abuse attempts and rollback.
- Live read-only preflight (aggregates/catalog only): 18 students, 0 canonical collision groups, 0 real IDs outside the allowlist, live trigger function md5 equals the 0010 body, trigger definition as in 0010, new object names free, 1 pre-existing pending profile, 0 legacy Auth users without a profile, 0 Auth users without a profile, 21 public policies, student triggers `create_health_record,stamp_updated`. Live migrations end at 0010; **0011 is not applied**.

## Applied - 2026-10-20

- Real-Auth isolated harness (PostgreSQL 17.6 + locally built Supabase Auth v2.197.0, loopback only, fictional data): **23/23 passed**. Harness fix: `create or replace function auth.uid()` (Auth's own migrations already define it). Results: `tests/isolated/student-registration-results.json`.
- Owner-approved: applied **only** `0012_student_self_registration_v1` to `rlpppneoxsbebathqzfw` via the Supabase migration tool. 0011 not applied.
- Backup: no CLI/`pg_dump` was available and platform backup status cannot be read with the available tools. Pre-apply record: the exact replaced function body (md5 `04115a22…`, identical to 0010 and the rollback file), trigger definition, and md5 hashes of every clinical/account table, policies and grants. 0012 changes no existing rows.
- Post-apply: all table, `auth.users`, policy and grant hashes unchanged; new index valid; RPC SECURITY DEFINER with empty search_path, anon-only EXECUTE; trigger function not executable by anon/authenticated; cutoff row present, RLS on, unreadable by clients; 1 pre-existing pending profile preserved.
- Advisors: new INFO `rls_enabled_no_policy` on `private.registration_policy` (intended deny-all) and WARN anon SECURITY DEFINER for `registration_student_id_available` (approved boolean-only check). Leaked-password protection is off (Auth setting, unchanged).
- Confirm email remains ON. `.env.local` already had `STUDENT_REGISTRATION=enabled` for the running local dev server; not changed.
