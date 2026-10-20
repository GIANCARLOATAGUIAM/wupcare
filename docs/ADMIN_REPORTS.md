# Administrator monthly report simplification — 2026-10-20

Local UI implemented. **Migration 0011 is proposed, not applied.** No demo/real records, RLS, Auth settings or deployed site were changed.

## UI and query behavior

All five administrator report pages use Month, Year, and Records dropdowns. Defaults are the current **Asia/Manila** month/year and Real only. Each dropdown updates the URL immediately through `router.replace`, without an Apply button. Changing a selection resets pagination. URLs use `month=02&year=2024&scope=demo`; sidebar navigation keeps these selections. A legacy `from`/`to` bookmark selects the calendar month containing its valid `from` date; explicit month/year take precedence. Invalid month/year values fall back to the current Manila values. Years 1900–2100 are selectable.

The server derives the first and last calendar date of that single month, including leap years. It sends those dates and the existing scope to the same `report_*` RPCs, with monthly grouping for visits. The existing database functions interpret timestamps using Asia/Manila. No clinical-table reads or service-role bypass were added to report loading. Appointments retain their existing grouping by preferred date; medication usage retains the existing current-stock column.

Full-width tables, ten-row pagination, complete report totals, print-only off-page rows, and Print / Save as PDF are retained. Nurse date-range/daily grouping and Student interfaces are unchanged. Real only, Demo only and All remain available; neither demo records nor `is_demo` fields are removed or automatically deleted.

## Database inspection and exact change for approval

Read-only inspection through **supabase-wupcare only** confirmed:

- `public.report_visits`, `report_concerns`, `report_medication_usage`, `report_incidents` and `report_appointments` all call `private.mask_count(bigint, boolean)`. A source-reference catalog query found these five callers only.
- `private.mask_count` is an immutable SQL **invoker** helper with `search_path = ''` and owner-only EXECUTE. The helper is not a public RPC. A direct read-only execution probe returned permission denied; no privilege changes were attempted.
- Reports remain SECURITY DEFINER functions with explicit role checks through `private.report_range` → `private.require_role` → active `profiles` role. `report_range` enforces whole-month admin bounds; visits reject daily grouping for administrators. Existing aggregate-only projections and grants remain in place.

Suppression cannot be removed reliably in React: the database returns null for admin counts 1–4. Null is not zero and cannot reveal the original count. A migration is required.

Proposed file: [`0011_exact_report_counts.sql`](../supabase/migrations/0011_exact_report_counts.sql).

Exact function-body change:

```diff
- select case when p_is_admin and p_count between 1 and 4 then null else p_count end;
+ select p_count;
```

Complete proposed DDL:

```sql
create or replace function private.mask_count(p_count bigint, p_is_admin boolean)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_count;
$$;
```

The existing signature is retained for compatibility with all five RPCs. `CREATE OR REPLACE` preserves ownership and grants. Explicit invoker security, immutability and empty search path match the existing function. No policies, report authorizations, table schemas or records change. Staff already receive exact counts; their results stay the same.

After approval/application, numeric counts 1–4 automatically render as numbers in the existing table. Its conditional `<5`/partial-total handling remains solely for compatibility with the current database and for a safe rollback. It does not guess or replace nulls. The old blanket suppression message was replaced with accurate monthly/aggregate-only copy. **Until 0011 is applied, the live database still suppresses small admin counts.**

## Rollout and rollback — not executed

1. Owner reviews and explicitly approves 0011. Apply it through the authorized migration workflow only after approval.
2. In an authorized test environment, verify counts 0, 1, 2, 3, 4 and 5 for both reporting roles, all scopes, Manila month boundaries, and full print totals. Confirm student/inactive/anonymous access stays denied. Retain an isolated fixture baseline; do not write test cases into approved demo/real data.
3. Recheck function owner, ACL, empty search path and invoker status, and rerun Security Advisor. The report function signatures are unchanged, so public generated types need no changes.

If rollback is required, use a separately authorized migration restoring the old body and the same signature/attributes:

```sql
create or replace function private.mask_count(p_count bigint, p_is_admin boolean)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_is_admin and p_count between 1 and 4 then null else p_count end;
$$;
```

The local UI supports either database version; Nurse results are identical under both. Neither the forward nor rollback SQL was executed.

## Verification scope

Repository-owned tests cover current-month defaults, leap years and month ends, invalid URL values, legacy links, automatic selection updates and rapid changes, Records scopes, all five monthly RPC contracts, exact numeric responses, Nurse date-range regression, complete totals/print markup, print invocation, full-width/responsive markup, sidebar retention, and actual DAL administrator page guards. Fixtures are fictional, clients mocked, and network fetch blocked.

These are application/RPC-contract tests, not execution of the proposed SQL or new live monthly-total/RLS tests. The private helper's live definition was inspected read-only; exact live admin counts await the approved migration. No connected browser was available for responsive screenshots or actual PDF rendering. Do not interpret markup checks as a visual QA pass.
