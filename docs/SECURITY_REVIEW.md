# Read-only security review — 2026-10-20

Follow-up: the owner requested exact administrator aggregate counts. `0011_exact_report_counts.sql` is prepared for review, **not applied**. It changes only the count helper; role guards, monthly limits, aggregate-only projections and RLS stay intact. This review describes the live pre-0011 definitions. See [ADMIN_REPORTS.md](ADMIN_REPORTS.md) for the exact change, rollout/rollback, and test scope.

Reviewed only the configured **supabase-wupcare** MCP connection: Security Advisor, migration history, function definitions and ACLs from `pg_proc`, helper definitions, and same-student foreign keys. No migrations, policies, grants, account changes, or write-based tests were executed.

Advisor: **13** `authenticated_security_definer_function_executable` warnings, plus **1** `auth_leaked_password_protection` warning. No ERROR finding in the returned advisor result. This is a scoped code/catalog review, not a penetration test or deployment approval.

## Common execution and namespace findings

All 13 public functions below are owned by `postgres`. Their explicit EXECUTE grants are `postgres`, `authenticated`, and `service_role`; **PUBLIC and anon cannot execute any of them**. Each has `SET search_path = ''`. Application tables, types, and helpers are schema-qualified (`public`, `private`, `auth`). Unqualified calls such as `count`, `jsonb_*`, `btrim`, and `date_trunc` are PostgreSQL built-ins resolved through `pg_catalog`; there is no dynamic SQL or caller-controlled object name in these definitions.

`private.require_role()` reads `private.current_user_role()`, which resolves the verified `auth.uid()` against an active `public.profiles` row. It does not trust user metadata. An absent, inactive, or disallowed role raises SQLSTATE `42501`. A service-role EXECUTE grant alone supplies no user identity and does not satisfy that check.

| Function | Purpose and authorization | Classification / recommended action |
|---|---|---|
| `account_student_numbers()` | Admin-only mapping of profile ID to linked student number. No clinical fields. | Intentional. Retain admin check and narrow projection. |
| `students_without_account()` | Admin-only picker: active unlinked student ID, number, full name. | Intentional. This identity disclosure is the approved account-linking seam. |
| `approve_student_link(uuid,uuid)` | Clinic staff only. Locks pending active student profile and target active real student; rejects existing link/demo target/duplicate link. Copies the student's name and links the record. | Intentional. Identity verification remains a staff responsibility. |
| `adjust_medication(uuid,integer,text)` | Clinic staff only. Requires nonzero quantity and reason; locks medicine, rejects negative resulting stock, writes ledger with caller ID. | Intentional atomic inventory operation. |
| `restock_medication(uuid,integer,text)` | Clinic staff only. Requires positive quantity, updates existing medicine and writes ledger with caller ID in the same transaction. | Intentional atomic inventory operation. |
| `issue_medication(uuid,uuid,integer,uuid,uuid,text)` | Clinic staff only. Delegates to private issuance helper; no direct client stock write. | Intentional. Helper locks stock, validates quantity, expiry, active status, demo/real separation, and sufficient stock. |
| `create_visit_with_medications(jsonb,jsonb)` | Clinic staff only. Uses explicit insert fields and caller as attendant; verifies active concern category and completed same-student appointment; issues medicine atomically. | Intentional. JSON does not select role, stock, or creator. |
| `create_incident_with_medications(jsonb,jsonb)` | Clinic staff only. Explicit insert fields and caller as recorder; private issuance helper. | Intentional. Composite visit/student and ledger/student foreign keys enforce matching student links. |
| `report_visits(date,date,text,text)` | Shared report range helper requires admin or clinic staff. Admin is restricted to whole months and monthly grouping; small counts masked. | Intentional aggregate access across otherwise protected clinical rows. |
| `report_concerns(date,date,text)` | Same shared report authorization, whole-month admin range, scope validation, and count masking. Returns concern groups only. | Intentional. Preserve privacy transformations. |
| `report_incidents(date,date,text)` | Same report checks. Incident type and masked counts only. | Intentional. Preserve privacy transformations. |
| `report_appointments(date,date,text)` | Same report checks. Status and masked counts only. | Intentional. Preserve privacy transformations. |
| `report_medication_usage(date,date,text)` | Same report checks. Medicine inventory fields and masked issuance quantities; no student identifiers. | Intentional per approved aggregate-report interface. |

Supporting checks: `private.issue_items` is an invoker helper, not a public definer RPC; `private.report_range` validates scope/dates and authorizes both reporting roles. `private.mask_count` returns null for admin counts 1–4. Composite foreign keys on incidents and medication transactions enforce same-student links. Private definer role helpers also have an empty search path and deny anon/PUBLIC execution. Trigger-only definers deny authenticated execution.

No exposed definer authorization defect was identified in this scope. Keep the warnings documented; changing these functions to invoker mode or blindly revoking authenticated execution would break approved workflows. Future changes should preserve role checks, qualified references, fixed search paths, and explicit grants, with isolated role tests. No remediation migration is proposed from these 13 findings.

## Remaining security and readiness items

- **Leaked-password protection is disabled**, confirmed by the advisor. The owner should review enabling the supported Auth feature before real use. No Auth configuration was changed.
- Registration migration `0010_student_self_registration` is applied (version `20261020032859`). The live pending-registration column and approval function exist. This does **not** establish working email delivery, confirmation settings, or production registration readiness; these were not verified through a live registration in this run.
- Prior deployment documentation records an exposed development service-role key and deferred rotation. Rotation status was not reverified here; it remains an owner checklist item.

Advisor references: [SECURITY DEFINER execution warning](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Administrator name correction — proposed only

Read-only verification found the active administrator `51d64f89-3b99-47bf-b262-480cbe8152ba` still has exactly 120 lowercase `x` characters. This is stored data and remains visible as such; no heuristic treats long/custom names as missing. The earlier incident log records the original name as `Dev Administrator`.

After explicit owner approval, use a normal update guarded by account ID, role, active status, and the exact known erroneous value, in a transaction. Require exactly one returned row before committing; otherwise roll back and investigate. Keep audit triggers enabled. Only `full_name` is intentionally set; normal audit timestamps/actor fields may change. Do not forge the original audit values or touch Auth, email, password, role, active status, or demo records.

**Reviewable SQL proposal — not executed, not a migration:**

```sql
begin;
update public.profiles
set full_name = 'Dev Administrator'
where id = '51d64f89-3b99-47bf-b262-480cbe8152ba'
  and role = 'admin'
  and is_active = true
  and full_name = repeat('x', 120)
returning id, full_name, role, is_active, updated_at, updated_by;
-- After checking exactly one returned row, COMMIT; otherwise ROLLBACK.
```

The approved action must also choose the execution identity explicitly: an administrator session records that administrator in audit fields; a privileged SQL connection may have no `auth.uid()`. Neither approach should disable auditing.

## Re-check — final QA, 2026-10-20

Same read-only scope and project (`rlpppneoxsbebathqzfw`). The Security Advisor still reports the same 13 intentional definer warnings plus leaked-password protection disabled. RLS is enabled on every public table. anon has no table grants or function EXECUTE. Every SECURITY DEFINER function has a fixed `search_path`.

One application-level defect was fixed in code: an open redirect in `/auth/confirm` through a `next` value beginning with a slash and a backslash. Rotation of the previously exposed development service-role key is still **unverified**.
