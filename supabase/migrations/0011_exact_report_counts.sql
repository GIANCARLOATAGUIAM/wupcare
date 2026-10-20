-- PROPOSED ONLY. Requires explicit owner approval before applying.
-- All five public.report_* RPCs call this helper. Keep its signature so their
-- role guards, SECURITY DEFINER boundaries, monthly rules, date interpretation,
-- aggregate-only projections, RLS and EXECUTE privileges remain unchanged.
-- Clinic staff already receive exact counts; their results are unchanged.
-- CREATE OR REPLACE preserves the existing owner and ACL (owner-only EXECUTE).

create or replace function private.mask_count(p_count bigint, p_is_admin boolean)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_count;
$$;
