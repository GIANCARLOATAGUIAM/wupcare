-- WUPCare 0013: final client revisions (2026-10-21). PROPOSED ONLY.
-- Requires explicit owner approval before it is applied to the wupcare
-- project (rlpppneoxsbebathqzfw). Apply 0011 (exact report counts) first or
-- together; this file does not depend on it.
--
-- No records are inserted, deleted or rewritten. No table schema changes.
-- Existing medicine rows, the stock ledger, appointments and student records
-- stay as they are.
--
--   1. Appointment summary (dashboards): current counts per status for the
--      Administrator and Nurse dashboards. Counts only; no student identity.
--   2. Student academic profile: Department/College and Year Level.
--      * Students read/update ONLY these two fields of their OWN linked
--        record, through two SECURITY DEFINER functions. Table RLS is
--        unchanged: students still have no SELECT/UPDATE on public.students.
--      * New self-registrations (new_student_v1) store both fields when the
--        payload carries them. Payloads without them (sign-ups made before
--        this release and not yet confirmed) are still accepted; those
--        students complete the fields after their first sign-in.
--      * A student's own appointment request is rejected while either field
--        is missing (appointment trigger). Staff bookings are unaffected.
--   3. Medicine inventory: managed by Administrators.
--      * Administrators: read medicines, add/edit/deactivate (RLS), restock
--        and adjust (functions), and read stock history without student
--        identity (function).
--      * Clinic personnel: read medicines and the full ledger, and issue
--        medicine (unchanged functions). They can no longer insert/update
--        medicines, restock, or adjust.
--
-- Like the other migrations: no explicit BEGIN/COMMIT; the migration tool
-- runs the file as one transaction.
set local lock_timeout = '5s';

-- ===========================================================================
-- 1. Appointment summary
-- ===========================================================================
-- Definitions (same rules as the Nurse appointment lists):
--   total      every appointment in scope
--   pending    status pending                          (/appointments/pending)
--   scheduled  status approved, including overdue      (/appointments/scheduled)
--   today      approved and scheduled today, Manila     (?when=today)
--   completed  status completed                         (history, completed)
--   declined / cancelled                                (history filters)
create function public.appointment_summary(p_scope text default 'all')
returns table (
  total      bigint,
  pending    bigint,
  scheduled  bigint,
  today      bigint,
  completed  bigint,
  declined   bigint,
  cancelled  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  perform private.require_role('admin', 'clinic_staff');
  if p_scope is null or p_scope not in ('real', 'demo', 'all') then
    raise exception 'Scope must be real, demo, or all.' using errcode = '22023';
  end if;
  v_today := private.manila_today();

  return query
  select
    count(*),
    count(*) filter (where a.status = 'pending'),
    count(*) filter (where a.status = 'approved'),
    count(*) filter (
      where a.status = 'approved'
        and a.scheduled_at >= private.manila_day_start(v_today)
        and a.scheduled_at <  private.manila_day_start(v_today + 1)
    ),
    count(*) filter (where a.status = 'completed'),
    count(*) filter (where a.status = 'declined'),
    count(*) filter (where a.status = 'cancelled')
  from public.appointments a
  join public.students s on s.id = a.student_id
  where private.in_scope(s.is_demo, p_scope);
end;
$$;

revoke all on function public.appointment_summary(text) from public, anon;
grant execute on function public.appointment_summary(text) to authenticated;

-- ===========================================================================
-- 2. Student academic profile
-- ===========================================================================
-- Normalizes and validates a Department/College name: single spaces, 2-120
-- characters, no invisible/format characters or markup delimiters. The
-- official list is not confirmed yet (SYSTEM_SPEC Q-D1), so it stays text.
create function private.clean_college(p_college text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_college is null
     or p_college ~ '[[:cntrl:]<>{}]'
     or p_college ~ U&'[\007F-\009F\00AD\034F\0600-\0605\061C\06DD\070F\0890-\0891\08E2\115F-\1160\17B4-\17B5\180B-\180F\200B-\200F\2028-\202E\2060-\206F\2800\3164\E000-\F8FF\FDD0-\FDEF\FE00-\FE0F\FEFF\FFA0\FFF0-\FFFF]' then
    raise exception 'Enter a valid department or college.' using errcode = '22023';
  end if;
  v := btrim(regexp_replace(translate(p_college,
    U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000',
    repeat(' ', 16)), ' +', ' ', 'g'));
  if char_length(v) not between 2 and 120 or v !~ '[[:alpha:]]' then
    raise exception 'Enter a valid department or college.' using errcode = '22023';
  end if;
  return v;
end;
$$;

revoke all on function private.clean_college(text) from public, anon, authenticated;

-- The signed-in student's own academic fields. No other student data.
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

-- Updates ONLY college and year_level of the caller's own linked record.
-- Student ID, names, status, demo flag and health data are not touched.
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

-- Self-registration: the 0012 function, plus optional college/year_level in
-- the new_student_v1 payload (validated when present). Everything else is
-- unchanged from 0012.
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

-- Student appointment requests need both academic fields (server-side guard
-- for the app check). SECURITY DEFINER because students cannot read
-- public.students; it returns only true/false for the given record.
create function private.student_academic_complete(p_student_id uuid)
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

revoke all on function private.student_academic_complete(uuid) from public, anon;
grant execute on function private.student_academic_complete(uuid) to authenticated;

-- The 0005 trigger function with the check above added to the student
-- INSERT branch. Every other rule is unchanged.
create or replace function private.enforce_appointment_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role      public.user_role := private.current_user_role();
  v_settings  public.clinic_settings;
  v_today     date := private.manila_today();
begin
  if v_role is null then
    if (select auth.uid()) is not null then
      raise exception 'Not allowed.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- ------------------------------------------------------------- INSERT
  if tg_op = 'INSERT' then
    new.reschedule_count := 0;

    if v_role = 'student' then
      select * into v_settings from public.clinic_settings where id = 1;
      if not found then
        raise exception 'Clinic hours are not configured.';
      end if;

      if new.preferred_date < v_today
         or new.preferred_date > v_today + v_settings.max_days_ahead then
        raise exception 'Choose a date from today up to % days ahead.', v_settings.max_days_ahead
          using errcode = '22023';
      end if;
      if not (extract(isodow from new.preferred_date)::smallint = any (v_settings.open_days)) then
        raise exception 'The clinic is closed on that day.' using errcode = '22023';
      end if;
      if new.preferred_time < v_settings.open_time
         or new.preferred_time >= v_settings.close_time then
        raise exception 'Choose a time between % and %.',
          to_char(v_settings.open_time, 'HH24:MI'), to_char(v_settings.close_time, 'HH24:MI')
          using errcode = '22023';
      end if;
      -- 0013: Department/College and Year Level are required first.
      if not private.student_academic_complete(new.student_id) then
        raise exception 'Complete your Department/College and Year Level before requesting an appointment.'
          using errcode = '22023';
      end if;
    elsif v_role = 'clinic_staff' then
      if new.status not in ('pending', 'approved') then
        raise exception 'A new appointment must be pending or approved.' using errcode = '22023';
      end if;
      if new.status = 'approved' then
        new.handled_by := (select auth.uid());
      end if;
    end if;

    return new;
  end if;

  -- ------------------------------------------------------------- UPDATE
  if v_role = 'student' then
    if old.status <> 'pending' or new.status <> 'cancelled'
       or (to_jsonb(new) - 'status' - 'updated_at' - 'updated_by')
          <> (to_jsonb(old) - 'status' - 'updated_at' - 'updated_by') then
      raise exception 'You can only cancel your own pending request.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_role = 'clinic_staff' then
    if new.status is distinct from old.status
       and not (
         (old.status = 'pending'  and new.status in ('approved', 'declined', 'cancelled'))
      or (old.status = 'approved' and new.status in ('cancelled', 'completed'))
       ) then
      raise exception 'An appointment cannot go from % to %.', old.status, new.status
        using errcode = '22023';
    end if;

    if old.status in ('declined', 'cancelled', 'completed')
       and new.scheduled_at is distinct from old.scheduled_at then
      raise exception 'A % appointment cannot be rescheduled.', old.status using errcode = '22023';
    end if;

    if old.status = 'approved' and new.status = 'approved'
       and new.scheduled_at is distinct from old.scheduled_at then
      new.reschedule_count := old.reschedule_count + 1;
    else
      new.reschedule_count := old.reschedule_count;
    end if;

    if new.status is distinct from old.status
       or new.scheduled_at is distinct from old.scheduled_at then
      new.handled_by := (select auth.uid());
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_appointment_rules() from public, anon, authenticated;

-- ===========================================================================
-- 3. Medicine inventory: Administrators manage, clinic personnel issue
-- ===========================================================================
drop policy medicines_select on public.medicines;
drop policy medicines_insert on public.medicines;
drop policy medicines_update on public.medicines;

create policy medicines_select on public.medicines
  for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'clinic_staff'));

create policy medicines_insert on public.medicines
  for insert to authenticated
  with check ((select private.current_user_role()) = 'admin');

create policy medicines_update on public.medicines
  for update to authenticated
  using ((select private.current_user_role()) = 'admin')
  with check ((select private.current_user_role()) = 'admin');

-- medication_transactions SELECT stays clinic personnel only (issuances name
-- students). Administrators read stock history through the function below.

-- Same bodies as 0004; only the role check changes.
create or replace function public.restock_medication(
  p_medicine_id  uuid,
  p_quantity     integer,
  p_notes        text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  perform private.require_role('admin');

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Restock quantity must be 1 or more.' using errcode = '22023';
  end if;

  update public.medicines
  set stock_quantity = stock_quantity + p_quantity
  where id = p_medicine_id
  returning stock_quantity into v_stock;

  if not found then
    raise exception 'Medicine not found.' using errcode = 'P0002';
  end if;

  insert into public.medication_transactions (medicine_id, type, quantity, notes, performed_by)
  values (p_medicine_id, 'restock', p_quantity, nullif(btrim(p_notes), ''), (select auth.uid()));

  return v_stock;
end;
$$;

create or replace function public.adjust_medication(
  p_medicine_id  uuid,
  p_quantity     integer,
  p_reason       text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_med public.medicines%rowtype;
begin
  perform private.require_role('admin');

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Adjustment quantity cannot be zero.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required for a stock adjustment.' using errcode = '22023';
  end if;

  select * into v_med
  from public.medicines m
  where m.id = p_medicine_id
  for update;

  if not found then
    raise exception 'Medicine not found.' using errcode = 'P0002';
  end if;
  if v_med.stock_quantity + p_quantity < 0 then
    raise exception 'Adjustment would make stock negative: % % available.',
      v_med.stock_quantity, v_med.unit;
  end if;

  update public.medicines
  set stock_quantity = stock_quantity + p_quantity
  where id = p_medicine_id;

  insert into public.medication_transactions (medicine_id, type, quantity, notes, performed_by)
  values (p_medicine_id, 'adjustment', p_quantity, btrim(p_reason), (select auth.uid()));

  return v_med.stock_quantity + p_quantity;
end;
$$;

-- Stock history for Administrators: every ledger row of one medicine with
-- date, type, signed change, staff name, and the running total. Issuances
-- show no student, visit, incident or notes (clinical information).
create function public.medicine_stock_history(
  p_medicine_id  uuid,
  p_limit        integer default 10,
  p_offset       integer default 0
)
returns table (
  id            uuid,
  type          public.med_txn_type,
  quantity      integer,
  notes         text,
  performed_by  text,
  created_at    timestamptz,
  total_count   bigint,
  ledger_total  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('admin');
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid page.' using errcode = '22023';
  end if;

  return query
  select
    t.id,
    t.type,
    t.quantity,
    case when t.type = 'issuance' then null else t.notes end,
    p.full_name,
    t.created_at,
    count(*) over (),
    sum(t.quantity) over ()
  from public.medication_transactions t
  left join public.profiles p on p.id = t.performed_by
  where t.medicine_id = p_medicine_id
  order by t.created_at desc, t.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.medicine_stock_history(uuid, integer, integer) from public, anon;
grant execute on function public.medicine_stock_history(uuid, integer, integer) to authenticated;

-- issue_medication, create_visit_with_medications and
-- create_incident_with_medications are unchanged: clinic personnel only,
-- row lock before the stock check, one ledger row per issued item.
