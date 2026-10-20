-- ROLLBACK for supabase/migrations/0013_client_revisions.sql.
-- Requires explicit owner approval. Run as one transaction (Supabase SQL
-- editor or migration tool). Restores the exact pre-0013 definitions from
-- 0004, 0005, 0006 and 0012, then drops the functions 0013 added.
-- Data is not changed: college/year_level values that students saved
-- through 0013 stay on their student records.
-- After rollback the application must also be rolled back to the pre-0013
-- release (it calls the dropped functions).
set local lock_timeout = '5s';

-- 1. Dashboard summary and student academic functions.
drop function public.appointment_summary(text);
drop function public.update_my_academic_profile(text, smallint);
drop function public.my_academic_profile();
drop function public.medicine_stock_history(uuid, integer, integer);

-- 2. Self-registration trigger function: 0012 definition.
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

drop function private.clean_college(text);

-- 3. Appointment rules trigger function: 0005 definition.
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
drop function private.student_academic_complete(uuid);

-- 4. Medicine policies: 0006 definitions.
drop policy medicines_select on public.medicines;
drop policy medicines_insert on public.medicines;
drop policy medicines_update on public.medicines;

create policy medicines_select on public.medicines
  for select to authenticated
  using ((select private.current_user_role()) = 'clinic_staff');

create policy medicines_insert on public.medicines
  for insert to authenticated
  with check ((select private.current_user_role()) = 'clinic_staff');

create policy medicines_update on public.medicines
  for update to authenticated
  using ((select private.current_user_role()) = 'clinic_staff')
  with check ((select private.current_user_role()) = 'clinic_staff');

-- 5. Restock / adjust: 0004 definitions (clinic personnel).
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
  perform private.require_role('clinic_staff');

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
  perform private.require_role('clinic_staff');

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
