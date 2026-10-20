-- WUPCare 0014: official College and Program catalog. PROPOSED ONLY.
-- Requires explicit owner approval before it is applied to the wupcare
-- project (rlpppneoxsbebathqzfw). Requires 0013. Rollback:
-- docs/sql/0014_academic_catalog.rollback.sql.
--
-- What it does:
--   1. public.colleges (8) and public.programs (24): read-only catalog,
--      stable text IDs. Abbreviations are not unique (two programs are
--      "BSRT"), so IDs are the only identifiers stored.
--   2. students.college_id / program_id: nullable references to the catalog.
--      A composite foreign key makes the database reject a program that
--      does not belong to the student's college.
--   3. The existing free-text college/program columns are kept. When a
--      catalog ID is set they are filled with the official name (so search,
--      lists and reports keep working); legacy text on records without IDs
--      is never changed or deleted by this migration.
--   4. Student self-service (my_academic_profile / update_my_academic_profile)
--      and registration use the catalog IDs; an appointment request needs
--      college_id, program_id and year_level.
--
-- No existing row is updated or deleted. No program is assigned to anyone.
-- Like the other migrations: no explicit BEGIN/COMMIT.
set local lock_timeout = '5s';

-- ===========================================================================
-- 1. Catalog
-- ===========================================================================
create table public.colleges (
  id          text primary key check (id ~ '^[a-z][a-z0-9-]{1,39}$'),
  code        text not null unique check (char_length(code) between 2 and 10),
  name        text not null unique check (char_length(name) between 3 and 120),
  sort_order  smallint not null unique
);

create table public.programs (
  id            text primary key check (id ~ '^[a-z][a-z0-9-]{1,79}$'),
  college_id    text not null references public.colleges (id),
  name          text not null check (char_length(name) between 3 and 160),
  abbreviation  text not null check (char_length(abbreviation) between 2 and 40),
  sort_order    smallint not null,
  constraint programs_college_name_key unique (college_id, name),
  constraint programs_college_sort_key unique (college_id, sort_order),
  -- Target of the students composite foreign key.
  constraint programs_id_college_key unique (id, college_id)
);

insert into public.colleges (id, code, name, sort_order) values
  ('cas',  'CAS',  'College of Arts and Sciences', 1),
  ('cams', 'CAMS', 'College of Allied Medical Sciences', 2),
  ('cba',  'CBA',  'College of Business and Accountancy', 3),
  ('ccje', 'CCJE', 'College of Criminal Justice Education', 4),
  ('cect', 'CECT', 'College of Engineering and Computer Technology', 5),
  ('chtm', 'CHTM', 'College of Hospitality and Tourism Management', 6),
  ('coed', 'COED', 'College of Education', 7),
  ('con',  'CON',  'College of Nursing', 8);

insert into public.programs (id, college_id, name, abbreviation, sort_order) values
  ('cas-ba-communication', 'cas', 'Bachelor of Arts in Communication', 'BA Communication', 1),
  ('cas-ba-political-science', 'cas', 'Bachelor of Arts in Political Science', 'BA Political Science', 2),
  ('cas-bs-psychology', 'cas', 'Bachelor of Science in Psychology', 'BS Psychology', 3),
  ('cas-bs-social-work', 'cas', 'Bachelor of Science in Social Work', 'BS Social Work', 4),
  ('cams-bs-medical-technology', 'cams', 'Bachelor of Science in Medical Technology', 'BSMT', 1),
  ('cams-bs-pharmacy', 'cams', 'Bachelor of Science in Pharmacy', 'BS Pharmacy', 2),
  ('cams-bs-physical-therapy', 'cams', 'Bachelor of Science in Physical Therapy', 'BSPT', 3),
  ('cams-bs-radiologic-technology', 'cams', 'Bachelor of Science in Radiologic Technology', 'BSRT', 4),
  ('cams-bs-respiratory-therapy', 'cams', 'Bachelor of Science in Respiratory Therapy', 'BSRT', 5),
  ('cba-bs-accountancy', 'cba', 'Bachelor of Science in Accountancy', 'BSA', 1),
  ('cba-bs-business-administration', 'cba', 'Bachelor of Science in Business Administration', 'BSBA', 2),
  ('cba-bs-management-accounting', 'cba', 'Bachelor of Science in Management Accounting', 'BSMA', 3),
  ('cba-bs-real-estate-management', 'cba', 'Bachelor of Science in Real Estate Management', 'BSREM', 4),
  ('cba-bs-accounting-information-management', 'cba', 'Bachelor of Science in Accounting Information Management', 'BSAIM', 5),
  ('ccje-bs-criminology', 'ccje', 'Bachelor of Science in Criminology', 'BS Crim', 1),
  ('cect-bs-information-technology', 'cect', 'Bachelor of Science in Information Technology', 'BSIT', 1),
  ('cect-bs-computer-engineering', 'cect', 'Bachelor of Science in Computer Engineering', 'BSCpE', 2),
  ('cect-bs-electronics-communications-engineering', 'cect', 'Bachelor of Science in Electronics and Communications Engineering', 'BSECE', 3),
  ('chtm-bs-tourism-management', 'chtm', 'Bachelor of Science in Tourism Management', 'BSTM', 1),
  ('chtm-bs-hospitality-management', 'chtm', 'Bachelor of Science in Hospitality Management', 'BSHM', 2),
  ('chtm-bs-nutrition-dietetics', 'chtm', 'Bachelor of Science in Nutrition and Dietetics', 'BSND', 3),
  ('coed-beed', 'coed', 'Bachelor of Elementary Education', 'BEEd', 1),
  ('coed-bsed', 'coed', 'Bachelor of Secondary Education', 'BSEd', 2),
  ('con-bs-nursing', 'con', 'Bachelor of Science in Nursing', 'BSN', 1);

-- Read-only for everyone who uses the app (registration runs signed out).
-- No write grants: the catalog changes only through migrations.
alter table public.colleges enable row level security;
alter table public.programs enable row level security;
revoke all on table public.colleges, public.programs from public, anon, authenticated;
grant select on table public.colleges, public.programs to anon, authenticated;
create policy colleges_select on public.colleges for select to anon, authenticated using (true);
create policy programs_select on public.programs for select to anon, authenticated using (true);

-- ===========================================================================
-- 2. Student catalog references
-- ===========================================================================
alter table public.students
  add column college_id text references public.colleges (id),
  add column program_id text,
  -- The program must be one of the college's programs.
  add constraint students_program_in_college_fkey
    foreign key (program_id, college_id) references public.programs (id, college_id),
  -- A program needs its college (MATCH SIMPLE skips the key when one is null).
  add constraint students_program_needs_college check (program_id is null or college_id is not null);

create index students_college_id_idx on public.students (college_id);
create index students_program_id_idx on public.students (program_id);

-- Clinic personnel set them through the existing students RLS policies.
grant insert (college_id, program_id) on public.students to authenticated;
grant update (college_id, program_id) on public.students to authenticated;

-- Keeps the free-text columns equal to the official names whenever a catalog
-- ID is written, and clears them when staff remove a catalog selection.
-- Rows whose IDs are not touched keep their text exactly as it is.
create function private.sync_student_academic_labels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.college_id is not null then
    new.college := (select c.name from public.colleges c where c.id = new.college_id);
  elsif tg_op = 'UPDATE' and old.college_id is not null then
    new.college := null;
  end if;
  if new.program_id is not null then
    new.program := (select p.name from public.programs p where p.id = new.program_id);
  elsif tg_op = 'UPDATE' and old.program_id is not null then
    new.program := null;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_student_academic_labels() from public, anon, authenticated;

create trigger sync_student_academic_labels
  before insert or update of college_id, program_id on public.students
  for each row execute function private.sync_student_academic_labels();

-- ===========================================================================
-- 3. Student self-service (own record only)
-- ===========================================================================
-- New return shape: catalog IDs, plus the legacy text for display hints.
drop function public.my_academic_profile();
create function public.my_academic_profile()
returns table (college_id text, program_id text, year_level smallint, college text, program text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('student');
  return query
  select s.college_id, s.program_id, s.year_level, s.college, s.program
  from public.students s
  where s.id = private.current_student_id();
end;
$$;

-- Replaces the 0013 free-text version. Updates ONLY college_id, program_id
-- and year_level of the caller's own linked record (labels follow by trigger).
drop function public.update_my_academic_profile(text, smallint);
create function public.update_my_academic_profile(p_college_id text, p_program_id text, p_year_level smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  perform private.require_role('student');
  v_student_id := private.current_student_id();
  if v_student_id is null then
    raise exception 'Your account is not linked to a student record.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.programs p where p.id = p_program_id and p.college_id = p_college_id
  ) then
    raise exception 'Choose a program from the selected college.' using errcode = '22023';
  end if;
  if p_year_level is null or p_year_level not between 1 and 6 then
    raise exception 'Choose a year level from 1 to 6.' using errcode = '22023';
  end if;

  update public.students
  set college_id = p_college_id, program_id = p_program_id, year_level = p_year_level
  where id = v_student_id;
end;
$$;

revoke all on function public.my_academic_profile() from public, anon;
revoke all on function public.update_my_academic_profile(text, text, smallint) from public, anon;
grant execute on function public.my_academic_profile() to authenticated;
grant execute on function public.update_my_academic_profile(text, text, smallint) to authenticated;

-- Appointment requests (0013 trigger) now need the catalog program too.
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
      and s.college_id is not null
      and s.program_id is not null
      and s.year_level is not null
  );
$$;

-- ===========================================================================
-- 4. Registration: catalog IDs in the new_student_v1 payload
-- ===========================================================================
-- The 0013 function with the catalog branch added; everything else unchanged.
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
  v_college_id text;
  v_program_id text;
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

    -- 0014: catalog College and Program (IDs) with Year Level. All three are
    -- required together; the program must belong to the college.
    if v_user ? 'college_id' or v_user ? 'program_id' then
      if jsonb_typeof(v_user -> 'college_id') is distinct from 'string'
         or jsonb_typeof(v_user -> 'program_id') is distinct from 'string'
         or jsonb_typeof(v_user -> 'year_level') is distinct from 'string'
         or (v_user ->> 'year_level') !~ '^[1-6]$'
         or not exists (
           select 1 from public.programs p
           where p.id = v_user ->> 'program_id' and p.college_id = v_user ->> 'college_id'
         ) then
        raise exception 'Choose a valid college, program and year level.' using errcode = '22023';
      end if;
      v_college_id := v_user ->> 'college_id';
      v_program_id := v_user ->> 'program_id';
      v_year := (v_user ->> 'year_level')::smallint;

    -- 0013 free-text payload, still accepted from pages loaded before this
    -- release. The student completes the catalog fields after signing in.
    elsif v_user ? 'college' or v_user ? 'year_level' then
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
        college, college_id, program_id, year_level, status, is_demo, created_by
      ) values (
        v_number, v_first, v_middle, v_last, new.email,
        v_college, v_college_id, v_program_id, v_year, 'active', false, null
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
