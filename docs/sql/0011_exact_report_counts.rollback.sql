-- ROLLBACK for supabase/migrations/0011_exact_report_counts.sql.
-- Requires explicit owner approval. Restores the 0007 small-count rule for
-- administrators (counts 1-4 returned as null). Same signature and
-- attributes; CREATE OR REPLACE keeps owner and EXECUTE privileges.
create or replace function private.mask_count(p_count bigint, p_is_admin boolean)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_is_admin and p_count between 1 and 4 then null else p_count end;
$$;
