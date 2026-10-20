# Final client revisions (2026-10-21)

Status: code changes are local and uncommitted. Migrations **0011** and **0013** have been **prepared but not applied**. Nothing is deployed. The configured project is `wupcare` (`rlpppneoxsbebathqzfw`); applied migrations are 0001–0010 and 0012.

## Client-approved requirements

| # | Requirement | Where |
|---|---|---|
| 1 | Administrators see exact report counts, including 0–4. No "<5" anywhere. | 0011, report table, admin dashboard |
| 2 | Admin and Nurse dashboard counts match the underlying records and update after changes. | Dashboard, sidebar badge, 0013 `appointment_summary` |
| 3 | Every student has a Department/College and Year Level. Required at registration. Existing students complete them after signing in. | Registration, `/portal/complete-profile`, My Account, 0013 |
| 4 | Administrators manage the medicine inventory. Nurses view stock and issue medicine only. | `/medications`, actions, 0013 RLS and functions |
| 5 | Appointments a nurse books for a student appear in that student's My Appointments. | Booking page, investigation below |

## 1. Exact report counts

- `private.mask_count` returned null for administrator counts 1–4. Migration 0011 (unchanged and reviewed) makes it return the count. The signature, owner, grants and all five `report_*` role checks stay the same.
- UI: the report table, the print view and the admin dashboard no longer show "<5" or "N+" totals. If the database still returns a null (0011 not applied), the cell shows "—" and the page says that the exact-count update is not installed. Nulls are never guessed.
- There is no CSV/file export; print/PDF uses the same table.

## 2. Dashboard counts

Root causes found:

1. **Admin dashboard.** It used `report_appointments`, which counts by the *requested date's month*, real records only, with counts 1–4 hidden. A new request for next month, or any change while a status had fewer than 5 items, did not visibly change the dashboard.
2. **Sidebar "Pending" badge.** It is computed in the shared `(clinic)` layout. Next.js layouts do not re-render on client navigation, so the badge stayed at its first-load value until a full reload. The dashboard page itself is dynamic (no client cache for dynamic pages in Next 16), so it was already re-fetched on navigation.
3. **Open tabs.** A tab left open does not update by itself after changes made by another account.

Fixes:

- Admin dashboard: current totals from `appointment_summary('real')` (0013): Pending, Scheduled (approved), Today, Completed, Total. Also this month's visits and incidents (exact), inventory alerts, and active users.
- Nurse dashboard: the "Today" row now shows clinic visits today, appointments today, low stock, expiring and incidents. A new "Appointments" row shows Pending, Scheduled (approved), Completed and Total. Each card uses the same filter as the list it opens.
- The sidebar re-reads the pending count after each navigation (`features/appointments/live-counts.ts`).
- Returning to a tab hidden for 30 s or more refreshes the current page and layout (`router.refresh()`).

Metric definitions (all statuses unchanged):

| Metric | Definition | Matches |
|---|---|---|
| Total appointments | all appointments | `/appointments` |
| Pending requests | status `pending` | `/appointments/pending` |
| Scheduled (approved) | status `approved`, including overdue | `/appointments/scheduled` |
| Appointments today | `approved`, scheduled today (Asia/Manila) | `/appointments/scheduled?when=today` |
| Completed | status `completed` | `/appointments/history?status=completed` |
| Clinic visits today | `clinic_visits.visit_at` today (separate records) | `/visits?from=today&to=today` |

Nurse counts include demo records (same as the lists' default). Admin counts are real records only (same as the admin reports).

## 3. Department/College and Year Level

- College is checked text, 2–120 characters, letters required, with no invisible characters or markup. The official list is still open (SYSTEM_SPEC Q-D1), so no list was invented. Year Level reuses the existing 1–6 list.
- **Registration:** both fields are required (shared zod schema on the client and the server). They are sent in the `new_student_v1` payload. With 0013 the trigger validates them and stores them on the new student record. Sign-ups made before 0013 without them are still accepted; those students complete the fields later.
- **Existing students:** linked students missing either field are redirected from Dashboard, My Appointments and Request to **Complete Your Profile** (`/portal/complete-profile`). After saving, they go to the page they were opening (portal paths only).
- **Requests are blocked** while incomplete in three places: the request page, the `requestAppointment` action, and (with 0013) the appointment trigger.
- **My Account** has an "Academic details" section to review and update both fields.
- **Security:** students still have no SELECT/UPDATE on `public.students`. They read and write only these two fields of their own record through `my_academic_profile()` and `update_my_academic_profile()`. These are SECURITY DEFINER functions that check `require_role('student')` and use `current_student_id()`. No record ID, Student ID or role is accepted from the browser. Admin and Nurse onboarding is unchanged.
- Until 0013 is applied, the profile cannot be read, so the gate does not block (it fails open). Apply 0013 before deploying this code.

## 4. Medicine inventory

| | Administrator | Nurse |
|---|---|---|
| View inventory, stock, alerts, expiry | yes | yes |
| Add / edit / deactivate | yes | no |
| Restock / adjust | yes | no |
| Issue to a student (medicine page, visit, incident) | no | yes |
| History | stock history, no student identity | full ledger with student, visit, incident |

- **UI:** the admin sidebar has a new "Inventory → Medicine Inventory" item. `/medications` and `/medications/[id]` are role-aware. `/medications/new` and `/medications/[id]/edit` are admin-only. Nurse pages show stock plus the Issue panel only.
- **Server:**
  - `createMedicine`, `updateMedicine`, `setMedicineActive`, `restockMedicine` and `adjustMedicine` require `admin`.
  - `issueMedicine` still requires `clinic_staff`.
- **Database (0013):**
  - `medicines` SELECT is open to admin and clinic_staff; INSERT and UPDATE are admin only.
  - `restock_medication` and `adjust_medication` require `admin`.
  - The new `medicine_stock_history()` is admin only. It returns no student, visit or incident identifiers, and no notes for issuance rows.
  - `issue_medication`, `issue_items`, the visit/incident save functions, the ledger and the `medication_transactions` SELECT policy are unchanged. They still use a row lock before the stock check, `stock_quantity >= 0`, and one ledger row per item. The issuance form also guards against double submit in the client.
- No medicine record or ledger row is changed.

## 5. Nurse-booked appointments

Investigation (read-only):

- `bookAppointment` inserts `student_id` = the chosen `students.id`, status `approved`. The portal reads appointments by `profiles.student_id`, and RLS `appointments_select` uses `current_student_id()`. These are the same key.
- Live data: 16 staff-booked appointments exist. The 2 for students with portal accounts are stored on those students' linked records. A rolled-back, read-only RLS simulation as the linked student returned both. No duplicate student records (by Student ID or name) exist for any account, and no API errors were logged.
- The defect could not be reproduced with the current code and data. The 14 other staff bookings belong to demo student records that have **no portal account**. A booking made for a record that is not the one linked to the student's account is invisible to that student by design. The other likely cause was an open portal tab that was never refreshed (see 2).

Changes:

- The booking page now states whether the selected record has a portal account and whether it is active, so the nurse can confirm the right record before booking.
- The "booked" confirmation says that a linked account shows the appointment under Upcoming.
- Pages refresh when you return to an open tab (see 2).
- No change to queries, RLS or statuses. Students still see only their own rows.

## Approval required (Supabase)

1. Review and apply `supabase/migrations/0011_exact_report_counts.sql`.
2. Review and apply `supabase/migrations/0013_client_revisions.sql`. It runs as one transaction with `lock_timeout = 5s`. It contains no data changes and no table schema changes.
3. Regenerate types if desired. `types/database.ts` already declares the new functions by hand.
4. Re-run the Security Advisor. Expect new intentional SECURITY DEFINER notices for `appointment_summary`, `my_academic_profile`, `update_my_academic_profile` and `medicine_stock_history`.

Rollback for 0013 (separate approval) would restore:

- the 0006 `medicines_*` policies;
- the 0004 `restock_medication` and `adjust_medication` bodies (with `require_role('clinic_staff')`);
- the 0012 `handle_new_auth_user`;
- the 0005 `enforce_appointment_rules`;

and drop the five new functions.

## Isolated migration validation (2026-10-21)

Environment: PGlite 0.5.8 (PostgreSQL 18.3, in-process WASM; live is 17.11) with Supabase stand-ins (`anon`/`authenticated`/`service_role` roles, `auth.users`, `auth.uid()` from `request.jwt.claims`, default EXECUTE on new public functions). Baseline = 0001–0010 + 0012 in live order, then `supabase/seed.sql` plus fictional real-scope fixtures. The baseline's 28 function bodies (md5 of `pg_get_functiondef`), their anon/authenticated EXECUTE rights and all 21 RLS policies were compared with the live project read-only: **identical**.

Results: 113/113 checks (order 0011 → 0013, including rollback and re-apply) and 105/105 (order 0013 → 0011). Covered: execution in one transaction; zero changed/inserted/deleted rows in every table; table/column grants unchanged; only the intended 5 functions replaced (attributes and grants preserved) and 6 added (definer + `search_path=''`, no anon EXECUTE); only `medicines_*` policies changed; exact admin counts 1–5 equal to direct counts, Nurse report output identical before/after, student/anon denied; admin inventory add/edit/deactivate/restock/adjust, no direct stock writes, no issuance, no raw ledger; Nurse view + issue only; issuance decrements once with a full ledger row, over-issue and inactive items roll back the whole visit, stock = ledger for every medicine; student academic read/update limited to own record and two columns, invalid input rejected, request blocked until complete; staff booking, student cancel and nurse transitions unchanged; registration stores/validates the new fields and every 0012 safeguard still holds; both rollback scripts restore the exact pre-migration definitions, grants and policies without data changes.

Not covered: concurrent sessions (single-connection engine). Issuance concurrency relies on the unchanged 0004 `SELECT … FOR UPDATE` path.

Rollback scripts: `docs/sql/0013_client_revisions.rollback.sql`, `docs/sql/0011_exact_report_counts.rollback.sql`.

## Verification

- Automated: `npm test` (245 tests, including `tests/client-revisions.test.cjs`), `tsc`, `eslint`, `next build`. Fixtures are fictional, clients are mocked and the network is blocked.
- Browser (local production build, existing Nurse session, read-only):
  - dashboard counts matched a direct database count: 21 total / 2 pending / 8 approved / 6 completed / 4 today;
  - no horizontal overflow at 320, 390, 768 and 1440 px on the dashboard, `/medications`, a medicine page and `/appointments/pending`;
  - the Nurse medicine page shows only "Issue" (no Edit link), and `/medications/new` does not render the form for a Nurse.
- Not browser-verified: Administrator and Student screens, registration, Complete Your Profile, and admin inventory. These need 0013 applied and the corresponding test accounts. No accounts, appointments or records were created.
