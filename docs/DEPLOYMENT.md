# WUPCare — Deployment Checklist

Deploy only with explicit authorization. The checklist tracks remaining verification, not a claim of readiness. Migration 0010 and development accounts already exist; current Auth/email and deployment settings were not reverified in stabilization.

## 1. Before deploying

- [ ] **Rotate the Supabase service-role key.** The current key was exposed during development. Create a new secret key (`sb_secret_…`) or rotate the JWT secret, then disable the legacy keys.
- [x] Migration `0010_student_self_registration.sql` is applied on the configured project (version `20261020032859`, verified 2026-10-20). Verify schema/type agreement separately for any new deployment target.
- [ ] Re-run the Supabase security advisor. The 2026-10-20 read-only review found 13 intentional guarded SECURITY DEFINER warnings plus disabled leaked-password protection. See `SECURITY_REVIEW.md`.
- [ ] Decide on email delivery for student confirmation (spec Q-A1): an institutional SMTP server, or "Confirm email" off with clinic approval as the access gate. The built-in service delivers only to the project's team members.
- [ ] Remove development accounts (`dev-admin@`, `dev-nurse@`, `dev-student@wupcare.test`) and delete their local credentials file.
- [ ] Decide whether the demo data stays for the defense or is removed (`supabase/remove-demo.sql`). No real student data before institutional authorization.
- [ ] Confirm backups: Supabase plan backups, or a documented manual export (spec Q-T3).

## 2. Supabase Auth settings (Dashboard → Authentication)

- [ ] Site URL: the production domain (for example `https://wupcare.example.edu`).
- [ ] Redirect URLs: `https://<domain>/auth/confirm` (and `http://localhost:3000/auth/confirm` for development).
- [ ] Email sign-ups: on only if student self-registration is used; otherwise off.
- [ ] "Confirm email": on for production. If it is turned off for a demonstration, see `docs/AUTH_PROVISIONING.md` §7 for the risks.
- [ ] Minimum password length: 8 or more.
- [ ] Leaked-password protection: on if the plan supports it.
- [ ] Optional: CAPTCHA on sign-up.

## 3. Vercel project

- [ ] Import the repository; framework preset: Next.js. Build command `next build`.
- [ ] Environment variables (Production and Preview):

| Variable | Value | Exposed to the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | new secret key | **no** (never prefix `NEXT_PUBLIC_`) |
| `STUDENT_REGISTRATION` | `enabled` only after 0010 and the Auth settings above | no |

- [ ] Region close to the Supabase project (ap-south-1).

## 4. After deploying

- [ ] Create the first administrator: `node scripts/create-admin.mjs --email <email> --name "<name>"` (run locally against the production project). Then create clinic personnel in Users.
- [ ] Smoke test each role: sign in, home page, sign out. Signed-out access to `/dashboard` redirects to `/login`.
- [ ] Clinic personnel: add a student, record a visit with medication, approve an appointment, run a report and print it.
- [ ] Administrator: Month/Year/Records filters query one Manila month and print complete aggregates; no student medical records. Small counts remain "<5" until proposed migration 0011 is explicitly approved/applied, then verify exact counts 1–4. See `ADMIN_REPORTS.md`.
- [ ] If registration is enabled: register a test student, approve the link, request an appointment, then deactivate the test account.
- [ ] Check the Supabase logs for errors.

## Stabilization verification

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` locally. Automated tests use fictional isolated data and cannot reach live accounts through the provided clients. Browser/responsive and live RLS smoke checks remain separate; no connected browser was available for the stabilization run. Confirm ten-row paging, combined filters, all three roles, complete report print/PDF, and real Auth/email configuration in an authorized environment before sign-off.

The development administrator's known stored-name repair is still pending explicit approval (guarded proposal in `SECURITY_REVIEW.md`). This does not justify changing other custom names or resetting audit history. No database mutation or deployment was performed by this task.

## Student self-registration (migration 0012) - Vercel checklist

Status 2026-10-20: 0012 is applied to the wupcare project (`rlpppneoxsbebathqzfw`). 0011 is **not** applied. Confirm email is still **on**. Nothing is deployed.

**Environment variables (Vercel → Settings → Environment Variables, Production and Preview separately)**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://rlpppneoxsbebathqzfw.supabase.co`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key (browser-safe)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = secret key, server-only. Never prefix `NEXT_PUBLIC_`; mark it Sensitive; do not give it to Preview unless needed. It is only used by Administrator account creation, never by registration.
- [ ] `STUDENT_REGISTRATION`: leave **unset** for the first deploy. Set to `enabled` only at step 4 below, then redeploy.
- [ ] `.env.local` is not committed (check `.gitignore`); rotate any key that was ever shared.

**Supabase Auth URL configuration (Dashboard → Authentication → URL Configuration)**
- [ ] Site URL = production domain, e.g. `https://<project>.vercel.app` or the custom domain.
- [ ] Redirect URLs: `https://<domain>/auth/confirm`, plus `http://localhost:3000/auth/confirm` for development. Do not use wildcards on the production domain; avoid allowing every `*.vercel.app` preview.

**Order**
1. Deploy with registration unset. Smoke-test login for Administrator, Nurse and an existing Student.
2. Confirm email stays on until separately approved.
3. With approval: Authentication → Sign In / Providers → Email → turn off "Confirm email". Recommended at the same time: turn on leaked-password protection and keep the signup rate limits.
4. Set `STUDENT_REGISTRATION=enabled` and redeploy.

**Post-deployment smoke tests (disposable fictional student; agreed cleanup)**
- [ ] `/register` shows first/last/middle name, email, Student ID, password fields; empty submit shows field errors and sends no request.
- [ ] Valid registration lands on `/portal` signed in, with no "pending approval" or "check your email" message.
- [ ] Student requests an appointment (inside clinic hours; one pending request at a time).
- [ ] Nurse → Students lists the new student; Admin → Student Accounts lists the account with its Student ID.
- [ ] Re-registering the same Student ID (any case/spacing) is rejected with the "already registered" message; the same email is rejected.
- [ ] The new student cannot open clinical pages or other students' appointments.
- [ ] Remove the disposable account through the agreed admin process; existing records are untouched.
