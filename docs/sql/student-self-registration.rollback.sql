-- ROLLBACK for supabase/migrations/0012_student_self_registration_v1.sql.
-- NOT APPLIED. Requires explicit owner approval. Run as one transaction.
--
-- Order: first set STUDENT_REGISTRATION off (or revert the app) so no client
-- calls the availability RPC or sends the v1 payload, then run this file.
--
-- Effects:
--   * Restores the exact 0010 private.handle_new_auth_user() body. Future
--     signups go back to the 0010 behavior, which RE-OPENS the legacy
--     pending-account path. Keep Confirm email ON (or re-enable it, with
--     separate approval) before running this.
--   * Drops the availability RPC and the legacy-cutoff policy table.
--   * Keeps the canonical Student ID unique index as a safety constraint
--     (dropping it is optional and needs separate approval; line below).
--   * Deletes, unlinks or edits NO account, profile, student, health record,
--     appointment or audit row. Accounts registered under 0012 stay linked
--     and usable under the unchanged RLS.
set local lock_timeout = '5s';

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app   jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role  public.user_role;
begin
  if v_app ? 'wupcare_role' then
    v_role := (v_app ->> 'wupcare_role')::public.user_role;
    if v_role = 'student' and nullif(v_app ->> 'student_id', '') is null then
      raise exception 'A student account created by an administrator must be linked to a student record.';
    end if;

    insert into public.profiles (id, full_name, email, role, student_id)
    values (
      new.id,
      coalesce(nullif(btrim(v_app ->> 'full_name'), ''), new.email),
      coalesce(new.email, ''),
      v_role,
      nullif(v_app ->> 'student_id', '')::uuid
    )
    on conflict (id) do nothing;

  elsif new.email_confirmed_at is not null and v_user ? 'student_number' then
    insert into public.profiles (id, full_name, email, role, requested_student_number)
    values (
      new.id,
      left(coalesce(new.email, 'Student'), 120),
      coalesce(new.email, ''),
      'student',
      left(nullif(btrim(v_user ->> 'student_number'), ''), 40)
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop function public.registration_student_id_available(text);
drop table private.registration_policy;
-- Optional, separate approval: drop index public.students_student_number_canonical_key;
