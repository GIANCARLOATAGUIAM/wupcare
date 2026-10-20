-- WUPCare 0012: immediate student self-registration (new_student_v1).
-- Owner-approved 2026-10-20 for the wupcare project (rlpppneoxsbebathqzfw),
-- applied alone (0011 is NOT applied). Confirm email setting unchanged here.
-- Spec: docs/STUDENT_REGISTRATION_PLAN.md.
-- No existing account/record updates, backfill, or RLS policy changes.
--   * Legacy (0010) pending-account payloads are rejected for Auth users
--     created at or after this migration; pre-existing accounts are kept.
--
-- Review changes since the first draft (2026-10-20):
--   * Student IDs use an ASCII allowlist (A-Z, 0-9, ". / _ -"), checked after
--     upper(btrim()). This closes the invisible/format-character gap (for
--     example U+0600) for every Unicode category, and makes upper() locale-
--     independent for accepted IDs. Mirrors features/registration/schema.ts.
--   * Names reject control, format, separator, private-use, noncharacter,
--     variation-selector and filler characters, and names made only of
--     blank characters. The app applies a stricter letter allowlist.
--   * A present but unknown wupcare_registration marker is rejected; it no
--     longer falls through to the legacy pending-account branch.
--   * The v1 payload is validated as soon as the Auth row is inserted, so an
--     invalid direct signup fails even while Confirm email is on. Records
--     are still created only once email_confirmed_at is set.
--   * lock_timeout keeps the unique-index build from queueing behind long
--     transactions; retry in a maintenance window if it times out.
--
-- Atomicity boundary: everything below runs inside the Supabase Auth signup
-- (or confirmation) database transaction. A failure rolls back the Auth
-- user, identity, student, health record and profile together. The login
-- session is issued by Auth AFTER that transaction commits, so a session
-- failure leaves a complete account that recovers through password login.
--
-- Transaction: like the other migrations there is no explicit BEGIN/COMMIT.
-- Supabase migration tooling and the SQL editor run the whole file as one
-- transaction, so the precondition below aborts everything with no partial
-- DDL. Do not run it statement by statement.
set local lock_timeout = '5s';

-- Cutoff for the legacy pending-account payload (see the trigger below).
-- Single row, written once here; no grants, RLS on, not exposed by the API.
create table private.registration_policy (
  id                    boolean primary key default true check (id),
  legacy_signup_cutoff  timestamptz not null
);
alter table private.registration_policy enable row level security;
revoke all on table private.registration_policy from public, anon, authenticated;
insert into private.registration_policy (legacy_signup_cutoff) values (now());

-- Precondition: abort rather than rewriting existing case/space variants.
do $$
begin
  if exists (
    select 1 from public.students
    group by upper(btrim(student_number)) having count(*) > 1
  ) then
    raise exception 'Student ID normalization conflicts require separate review.';
  end if;
end;
$$;

-- The original exact-match unique constraint remains in place.
create unique index students_student_number_canonical_key
  on public.students (upper(btrim(student_number)));

-- Minimal conflict preflight: existence only, never names, record IDs or health
-- data. The unique index, not this preflight, provides concurrency protection.
-- Public availability checks allow Student ID enumeration; approval required.
create function public.registration_student_id_available(p_student_number text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_number text := upper(btrim(p_student_number));
begin
  if v_number is null or v_number !~ '^[A-Z0-9][A-Z0-9./_-]{0,39}$'
     or v_number like 'DEMO-%' then
    raise exception 'Enter a valid Student ID.' using errcode = '22023';
  end if;
  return not exists (
    select 1 from public.students
    where upper(btrim(student_number)) = v_number
  );
end;
$$;
revoke all on function public.registration_student_id_available(text)
  from public, anon, authenticated;
grant execute on function public.registration_student_id_available(text) to anon;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role;
  v_student_id uuid;
  v_number text;
  v_first text;
  v_middle text;
  v_last text;
  v_constraint text;
  -- Characters that are invisible, reorder text, or are not real letters:
  -- C0/C1 controls, every Unicode Cf (format) character, line/paragraph
  -- separators, private use, noncharacters, specials, variation selectors,
  -- the combining grapheme joiner, Hangul/Khmer/Mongolian fillers and the
  -- Braille blank.
  v_invisible constant text := U&'[\0001-\001F\007F-\009F\00AD\034F\0600-\0605\061C\06DD\070F\0890-\0891\08E2\115F-\1160\17B4-\17B5\180B-\180F\200B-\200F\2028-\202E\2060-\206F\2800\3164\E000-\F8FF\FDD0-\FDEF\FE00-\FE0F\FEFF\FFA0\FFF0-\FFFF\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF\+0F0000-\+10FFFF<>{}]';
  -- Whitespace that btrim() does not remove; a name of only these is blank.
  v_blank constant text := U&'^[ \00A0\1680\2000-\200A\202F\205F\3000]*$';
begin
  -- Idempotent repeated trigger events; never relink or rewrite an account.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- Preserve trusted Administrator provisioning. Never inspect user_metadata
  -- for role, student_id, active status, audit identity, or is_demo values.
  if v_app ? 'wupcare_role' then
    v_role := (v_app ->> 'wupcare_role')::public.user_role;
    if v_role = 'student' and nullif(v_app ->> 'student_id', '') is null then
      raise exception 'A student account created by an administrator must be linked to a student record.';
    end if;
    insert into public.profiles (id, full_name, email, role, student_id)
    values (
      new.id,
      coalesce(nullif(btrim(v_app ->> 'full_name'), ''), new.email),
      coalesce(new.email, ''), v_role,
      nullif(v_app ->> 'student_id', '')::uuid
    ) on conflict (id) do nothing;

  elsif v_user ? 'wupcare_registration' then
    -- The marker selects a payload version, NOT verified identity or privileges.
    -- Any marker other than new_student_v1 (including non-string values) is
    -- rejected instead of reaching the legacy pending-account branch.
    if v_user -> 'wupcare_registration' is distinct from '"new_student_v1"'::jsonb then
      raise exception 'Unsupported registration version.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_user -> 'student_number') is distinct from 'string'
       or jsonb_typeof(v_user -> 'first_name') is distinct from 'string'
       or jsonb_typeof(v_user -> 'last_name') is distinct from 'string'
       or (v_user ? 'middle_name' and jsonb_typeof(v_user -> 'middle_name') is distinct from 'string') then
      raise exception 'Enter valid student identity fields.' using errcode = '22023';
    end if;

    v_number := upper(btrim(v_user ->> 'student_number'));
    v_first := btrim(v_user ->> 'first_name');
    v_middle := nullif(btrim(v_user ->> 'middle_name'), '');
    v_last := btrim(v_user ->> 'last_name');
    if v_number !~ '^[A-Z0-9][A-Z0-9./_-]{0,39}$' or v_number like 'DEMO-%'
       or char_length(v_first) not between 1 and 80
       or char_length(v_last) not between 1 and 80
       or coalesce(char_length(v_middle), 0) > 80
       or v_first ~ v_blank or v_last ~ v_blank or coalesce(v_middle ~ v_blank, false)
       or concat_ws('', v_first, v_middle, v_last) ~ v_invisible
       or new.email is null or char_length(new.email) > 254 then
      raise exception 'Enter valid student identity fields.' using errcode = '22023';
    end if;

    -- With Confirm email on, the row exists but nothing is created until the
    -- address is confirmed (the trigger fires again on email_confirmed_at).
    if new.email_confirmed_at is null then
      return new;
    end if;

    -- Insert only a NEW student. There is deliberately no SELECT-and-adopt,
    -- ON CONFLICT UPDATE, or lookup returning an existing student's UUID.
    -- created_by starts NULL because its FK target profile does not exist yet.
    begin
      insert into public.students (
        student_number, first_name, middle_name, last_name, email,
        status, is_demo, created_by
      ) values (
        v_number, v_first, v_middle, v_last, new.email, 'active', false, null
      ) returning id into v_student_id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('students_student_number_key', 'students_student_number_canonical_key') then
        raise exception 'This Student ID already exists. Contact the clinic for assistance.'
          using errcode = '23505';
      end if;
      raise;
    end;

    -- Existing create_health_record trigger creates an EMPTY record in the
    -- same transaction. Any failure here rolls that insert back too.
    insert into public.profiles (
      id, full_name, email, role, student_id, requested_student_number
    ) values (
      new.id, left(concat_ws(' ', v_first, v_middle, v_last), 120),
      new.email, 'student', v_student_id, v_number
    );
    update public.students set created_by = new.id where id = v_student_id;

  elsif v_user ? 'student_number' then
    -- Legacy pending-account payload (0010). Owner decision 2026-10-20: closed
    -- to every Auth user created at or after this migration, so no new signup
    -- can enter the clinic approval/linking path. Auth users created before
    -- the cutoff keep the 0010 behavior (pending profile once confirmed).
    -- Existing profiles return early above and are never changed. A missing
    -- policy row closes the path (fail closed).
    if new.created_at is null or new.created_at >= coalesce(
         (select p.legacy_signup_cutoff from private.registration_policy p), '-infinity'::timestamptz) then
      raise exception 'This registration method is no longer available.' using errcode = '22023';
    end if;
    if new.email_confirmed_at is not null then
      insert into public.profiles (id, full_name, email, role, requested_student_number)
      values (
        new.id, left(coalesce(new.email, 'Student'), 120),
        coalesce(new.email, ''), 'student',
        left(nullif(btrim(v_user ->> 'student_number'), ''), 40)
      ) on conflict (id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

-- Keep the existing auth.users trigger attachment and all RLS/table grants.
-- approve_student_link() is unchanged; with the legacy path closed, only
-- pre-cutoff pending accounts can still reach it.
-- Rollback: docs/sql/student-self-registration.rollback.sql (approval required).
