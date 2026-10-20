-- ROLLBACK for supabase/migrations/0014_academic_catalog.sql.
-- Requires explicit owner approval. Run as one transaction. Restores the
-- exact 0013 definitions, then removes the catalog.
--
-- Data: students keep their college/program names (the free-text columns,
-- which 0014 filled from the catalog); only the catalog IDs are removed.
-- Redeploy the pre-0014 application release together with this rollback.
set local lock_timeout = '5s';

-- 1. Registration trigger function: 0013 definition.
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
  v_college text;
  v_year smallint;
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

    -- 0013: Department/College and Year Level. Required by the app for new
    -- registrations; optional here so sign-ups made before this release can
    -- still be confirmed (they complete the fields after signing in).
    if v_user ? 'college' or v_user ? 'year_level' then
      if jsonb_typeof(v_user -> 'college') is distinct from 'string'
         or jsonb_typeof(v_user -> 'year_level') is distinct from 'string'
         or (v_user ->> 'year_level') !~ '^[1-6]$' then
        raise exception 'Enter a valid department or college and year level.' using errcode = '22023';
      end if;
      v_college := private.clean_college(v_user ->> 'college');
      v_year := (v_user ->> 'year_level')::smallint;
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
        college, year_level, status, is_demo, created_by
      ) values (
        v_number, v_first, v_middle, v_last, new.email,
        v_college, v_year, 'active', false, null
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

-- 2. Appointment-request check: 0013 definition.
create or replace function private.student_academic_complete(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and nullif(btrim(s.college), '') is not null
      and s.year_level is not null
  );
$$;

-- 3. Student self-service: 0013 definitions.
drop function public.update_my_academic_profile(text, text, smallint);
drop function public.my_academic_profile();

create function public.my_academic_profile()
returns table (college text, year_level smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('student');
  return query
  select s.college, s.year_level
  from public.students s
  where s.id = private.current_student_id();
end;
$$;

create function public.update_my_academic_profile(p_college text, p_year_level smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_college text;
begin
  perform private.require_role('student');
  v_student_id := private.current_student_id();
  if v_student_id is null then
    raise exception 'Your account is not linked to a student record.' using errcode = '42501';
  end if;

  v_college := private.clean_college(p_college);
  if p_year_level is null or p_year_level not between 1 and 6 then
    raise exception 'Choose a year level from 1 to 6.' using errcode = '22023';
  end if;

  update public.students
  set college = v_college, year_level = p_year_level
  where id = v_student_id;
end;
$$;

revoke all on function public.my_academic_profile() from public, anon;
revoke all on function public.update_my_academic_profile(text, smallint) from public, anon;
grant execute on function public.my_academic_profile() to authenticated;
grant execute on function public.update_my_academic_profile(text, smallint) to authenticated;

-- 4. Label sync trigger.
drop trigger sync_student_academic_labels on public.students;
drop function private.sync_student_academic_labels();

-- 5. Student catalog columns (indexes, constraints and column grants go with them).
alter table public.students
  drop constraint students_program_needs_college,
  drop constraint students_program_in_college_fkey,
  drop column program_id,
  drop column college_id;

-- 6. Catalog.
drop table public.programs;
drop table public.colleges;
