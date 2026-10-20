# WUPCare — Authentication and Account Provisioning

Companion to `SYSTEM_SPEC.md` §8.8 and §10, and to `supabase/migrations/0003_helpers.sql`.
Status updated 2026-10-20: implementation and development accounts exist; migration 0010 is applied (verified live). Current email/confirmation delivery and a complete live registration flow were not reverified by the stabilization task. Instructions below describe provisioning operations, which require authorization before live writes.

## 1. Principles

- Supabase Auth, email and password. Student self-registration is gated by `STUDENT_REGISTRATION`; no public staff/admin sign-up.
- `public.profiles` is the only source of a user's role and active status. `user_metadata` is never trusted, because users can edit it.
- The service-role key is used only in `lib/supabase/admin.ts` (`server-only`). Each use happens after `requireRole("admin")`.
- An inactive profile gets `null` from `private.current_user_role()`, so RLS denies it everything right away, even while its JWT is still valid.

## 2. Creating an account (Phase 7 server action)

1. Call `requireRole("admin")`, then validate with zod: role, full name, email, temporary password (8+ characters), and `student_id` for a student account.
2. Call `createAdminClient().auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { wupcare_role, full_name, student_id } })`.
3. The `on_auth_user_created` trigger creates the `profiles` row **in the same transaction**. Supabase Auth inserts the user and then writes `app_metadata` in a separate UPDATE, so the trigger fires on both (migration 0009). It only creates a missing profile and never changes an existing one. If the role is invalid, a student has no `student_id`, or the student is already linked, the database rejects the write. `createUser` then fails with "Database error creating new user", and no orphaned auth user is left behind (verified live on 2026-10-14).

`app_metadata` can be set only with the service-role key, so users cannot give themselves a role. A user created without `wupcare_role` (for example in the dashboard) gets no profile, and the app blocks them.

## 3. Managing accounts

| Action | How |
|---|---|
| Change role, activate or deactivate, relink student | Update `profiles` with the **admin's own session**. RLS allows admin only. The `guard_profile_update` trigger blocks changes to the admin's own role or active status (FR-USR-4). |
| Block login of a deactivated user (FR-AUTH-6) | After the profile update, call `auth.admin.updateUserById(id, { ban_duration: "876000h" })`. To reactivate, use `ban_duration: "none"`. |
| Set a temporary password | `auth.admin.updateUserById(id, { password })` |
| Delete a user | Not supported. Deactivate instead. Foreign keys (`attended_by`, `recorded_by`, and others) block deleting anyone with history. |

Service-role writes carry no JWT, so the self-protection trigger does not apply to them. Use the admin session for profile updates. If the service role ever updates `profiles`, the server action must check FR-USR-4 itself.

## 4. First administrator (one-time; needs approval)

Recommended: `scripts/create-admin.mjs` (from the project root, with `.env.local` filled in):

```bash
node scripts/create-admin.mjs --email admin@your-school.edu --name "Full Name"
```

- The password is typed at a hidden prompt (or passed as `ADMIN_PASSWORD`). It must be at least 12 characters. It is never printed, stored, or written into the code.
- The script refuses to run when an administrator already exists.
- It uses the same path as the app (`createUser` with `app_metadata`). The database creates the profile, and the script confirms the result.

Alternative (Supabase Dashboard): Authentication → Users → Add user (tick Auto Confirm User), then in the SQL editor:

```sql
insert into public.profiles (id, full_name, email, role)
select id, 'Full Name Here', email, 'admin'
from auth.users
where email = 'admin-email-here';
```

Sign in and confirm the admin lands on `/dashboard`. Every later account is created from Users in the app.

## 5. Supabase Auth settings to change later (needs approval, not done yet)

- "Allow new users to sign up": keep enabled for student self-registration, with "Confirm email" on (§7).
- Minimum password length: 8.
- Site URL and redirect URLs: `http://localhost:3000` now, the Vercel domain later.
- Enable leaked-password protection if the plan supports it.

## 6. Demo accounts (Phase 8)

There is no checked-in `scripts/seed-users.ts`. The existing development accounts were provisioned previously; do not rerun account creation or alter them without approval. A future isolated provisioning script could create `admin@wupcare.test`, `nurse@wupcare.test`, and `student@wupcare.test` (linked to `DEMO-0001`) through the same `createUser` + `app_metadata` path. The seed's inventory calls must run with a staff JWT (`request.jwt.claims`), because the inventory functions record `performed_by = auth.uid()` and check the caller's role.

## 7. Student self-registration

Decided 2026-10-14: Supabase Auth only, with no third-party email service. Spec §8.10, FR-AUTH-8/9.

| Account | How it is created |
|---|---|
| Initial administrator | Once, by the project owner (§4). |
| Clinic personnel | By an administrator (§2), with `app_metadata.wupcare_role = "clinic_staff"`. |
| Student | Self-registration at `/register`: email, student number, password. |

### Implementation status

| Part | Status |
|---|---|
| Migration `0010_student_self_registration.sql` | Applied: live migration version `20261020032859`, verified 2026-10-20. Historical offline results are separate from current reproducible tests. |
| `/register` page and `registerStudent` action | Built. Hidden (404) unless `STUDENT_REGISTRATION=enabled` |
| `/auth/confirm` route | Built. Handles both the PKCE `code` link and `token_hash` links; redirects only to same-site paths |
| `/students/registrations` (clinic personnel) | Built. Behind the same flag; approval uses `approve_student_link()` with an inline confirmation |
| Portal "Waiting for clinic approval" | Built |

Turn the feature on in this order:
1. Verify 0010 is already present on the target (confirmed on the current configured project; do not reapply).
2. Confirm the target schema matches the checked-in registration types.
3. Change the Auth settings below.
4. Set `STUDENT_REGISTRATION=enabled`.
5. Test with a team-member email address.

### How it stays safe

- A profile is created only when `user_metadata.student_number` is present and the email is confirmed. With "Confirm email" off, Supabase marks the email confirmed at sign-up, so the profile is created then. The role is always `student`. A role sent in sign-up data is ignored (tested live and offline).
- The new account has no student link. It sees no appointments, students, or health records, and cannot request an appointment.
- Clinic personnel approve only after checking identity (for example a school ID). `approve_student_link()` accepts only a pending, active student account and an active, real student record with no account yet.
- Admin-created accounts are unaffected.

### Development configuration without email confirmation (needs approval)

For the mini-thesis demonstration, "Confirm email" can be turned off, because the built-in email service sends only to the Supabase organization's team members. **It must not be turned off silently.** Risks:

- **Unverified ownership:** anyone can register with an email address they do not own. That account gets no access until clinic personnel approve it, so the identity check at approval is the only gate. Staff must verify the student in person.
- **Squatting:** someone can register an email address before the real owner. The owner then cannot register and must ask the administrator to deactivate the squatter account.
- **Spam accounts:** unconfirmed sign-ups cost nothing. Rate limits apply; CAPTCHA is optional.
- **Password reset** still sends email, which reaches team members only.

Turn "Confirm email" back on (with SMTP) before real use.

### Auth settings needed (approval required; not changed)

- Allow new users to sign up: **on**.
- Confirm email: **off** for the demonstration (see the risks above), **on** for production.
- Site URL and redirect URLs: include `http://localhost:3000/auth/confirm` and, later, the production `/auth/confirm`.
- Minimum password length: 8.
- Optional: CAPTCHA; leaked-password protection if the plan supports it.

## Display-name and security follow-up (2026-10-20)

Blank profile names resolve to Administrator / Nurse / Student by role. Nonblank custom names, including the known erroneous 120-character administrator name, are preserved on read. Saving an administrator display name validates controls, whitespace and 2-120 character length; authorization still uses the administrator's own session. The guarded repair proposal is in `SECURITY_REVIEW.md` and awaits approval. No Auth settings, passwords, accounts, or names were changed by stabilization.

The read-only review found 13 intentional guarded definer warnings and disabled leaked-password protection. Review the owner deployment checklist before real use; schema availability alone does not establish registration or deployment readiness.
