-- WUPCare demo seed. FICTIONAL DATA ONLY (SYSTEM_SPEC §11).
--
-- Every row is demo data: students use DEMO- numbers with is_demo = true, and
-- medicines have is_demo = true. Visits, appointments, incidents, and
-- transactions belong to demo students or demo medicines. Real records are
-- never read or changed.
--
-- Idempotent and non-destructive:
--   * Students: inserted only if the DEMO- number does not exist yet.
--   * Health records: filled only while all their fields are still empty.
--   * Medicines: inserted only if no demo medicine has the same name.
--   * Activity (visits, appointments, incidents): created only when no demo
--     student has any activity yet. To rebuild it, run remove-demo.sql first.
--
-- Stock changes go through the inventory functions, so stock always equals
-- the ledger. Clinical activity runs as an existing active clinic staff
-- account (preferably nurse@wupcare.test); starting stock is recorded by an
-- active administrator (restocking is Administrator-only since 0013). The
-- seed stops if either account is missing.
--
-- Run as a single transaction, for example in the Supabase SQL editor.

begin;

-- Act as clinic staff for this transaction only (auth.uid() reads this).
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (select p.id from public.profiles p
     where p.role = 'clinic_staff' and p.is_active
     order by (p.email = 'nurse@wupcare.test') desc, p.created_at
     limit 1),
    'role', 'authenticated'
  )::text,
  true
);

do $$
begin
  if (select private.current_user_role()) is distinct from 'clinic_staff' then
    raise exception 'The demo seed needs an active clinic staff account. Create one first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Students (18)
-- ---------------------------------------------------------------------------
insert into public.students
  (student_number, first_name, middle_name, last_name, sex, birth_date, college, program, year_level,
   email, contact_number, guardian_name, guardian_relationship, guardian_contact, is_demo)
values
  ('DEMO-0001', 'Andrea',  'Lim',      'Reyes',      'female', '2005-03-14', 'Demo College of Sciences',     'BS Demo Biology',        2, 'demo-0001@example.edu', null,          null,              null,       null,          true),
  ('DEMO-0002', 'Bryan',   null,       'Castillo',   'male',   '2004-08-02', 'Demo College of Engineering',  'BS Demo Engineering',    3, 'demo-0002@example.edu', null,          null,              null,       null,          true),
  ('DEMO-0003', 'Carmela', 'Uy',       'Domingo',    'female', '2006-01-21', 'Demo College of Business',     'BS Demo Accountancy',    1, 'demo-0003@example.edu', null,          null,              null,       null,          true),
  ('DEMO-0004', 'Daniel',  null,       'Fernandez',  'male',   '2003-11-09', 'Demo College of Sciences',     'BS Demo Chemistry',      4, 'demo-0004@example.edu', null,          null,              null,       null,          true),
  ('DEMO-0005', 'Elaine',  'Santos',   'Garcia',     'female', '2005-06-30', 'Demo College of Nursing',      'BS Demo Nursing',        2, 'demo-0005@example.edu', '09170000005', 'Demo Parent E',   'Mother',   '09180000005', true),
  ('DEMO-0006', 'Felix',   'Ramos',    'Hernandez',  'male',   '2004-02-17', 'Demo College of Engineering',  'BS Demo Civil Works',    3, 'demo-0006@example.edu', '09170000006', 'Demo Parent F',   'Father',   '09180000006', true),
  ('DEMO-0007', 'Grace',   null,       'Ignacio',    'female', '2006-09-05', 'Demo College of Education',    'BS Demo Education',      1, 'demo-0007@example.edu', '09170000007', 'Demo Parent G',   'Mother',   '09180000007', true),
  ('DEMO-0008', 'Henry',   'Cruz',     'Javier',     'male',   '2002-12-12', 'Demo College of Business',     'BS Demo Management',     4, 'demo-0008@example.edu', '09170000008', 'Demo Guardian H', 'Aunt',     '09180000008', true),
  ('DEMO-0009', 'Isabel',  'Dela',     'Lopez',      'female', '2005-04-26', 'Demo College of Arts',         'AB Demo Communication',  2, 'demo-0009@example.edu', '09170000009', 'Demo Parent I',   'Father',   '09180000009', true),
  ('DEMO-0010', 'Joshua',  null,       'Mendoza',    'male',   '2004-07-19', 'Demo College of Sciences',     'BS Demo Computing',      3, 'demo-0010@example.edu', '09170000010', 'Demo Parent J',   'Mother',   '09180000010', true),
  ('DEMO-0011', 'Katrina', 'Bautista', 'Navarro',    'female', '2006-03-03', 'Demo College of Nursing',      'BS Demo Nursing',        1, 'demo-0011@example.edu', '09170000011', 'Demo Parent K',   'Mother',   '09180000011', true),
  ('DEMO-0012', 'Leo',     'Villa',    'Ortega',     'male',   '2003-05-28', 'Demo College of Engineering',  'BS Demo Engineering',    4, 'demo-0012@example.edu', '09170000012', 'Demo Parent L',   'Father',   '09180000012', true),
  ('DEMO-0013', 'Maria',   'Tan',      'Pascual',    'female', '2005-10-14', 'Demo College of Education',    'BS Demo Education',      2, 'demo-0013@example.edu', '09170000013', 'Demo Parent M',   'Mother',   '09180000013', true),
  ('DEMO-0014', 'Nathan',  null,       'Quinto',     'male',   '2004-01-08', 'Demo College of Arts',         'AB Demo History',        3, 'demo-0014@example.edu', '09170000014', 'Demo Guardian N', 'Uncle',    '09180000014', true),
  ('DEMO-0015', 'Olivia',  'Go',       'Rivera',     'female', '2006-08-22', 'Demo College of Business',     'BS Demo Accountancy',    1, 'demo-0015@example.edu', '09170000015', 'Demo Parent O',   'Mother',   '09180000015', true),
  ('DEMO-0016', 'Paolo',   'Diaz',     'Salazar',    'male',   '2003-09-30', 'Demo College of Sciences',     'BS Demo Biology',        4, 'demo-0016@example.edu', '09170000016', 'Demo Parent P',   'Father',   '09180000016', true),
  ('DEMO-0017', 'Queenie', null,       'Torres',     'female', '2005-02-11', 'Demo College of Nursing',      'BS Demo Nursing',        2, 'demo-0017@example.edu', '09170000017', 'Demo Parent Q',   'Mother',   '09180000017', true),
  ('DEMO-0018', 'Rafael',  'Sy',       'Velasco',    'male',   '2004-11-25', 'Demo College of Engineering',  'BS Demo Civil Works',    3, 'demo-0018@example.edu', '09170000018', 'Demo Parent R',   'Father',   '09180000018', true)
on conflict (student_number) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Health records (generic, fictional). Only records that are still empty.
-- ---------------------------------------------------------------------------
update public.health_records h
set allergies = v.allergies,
    existing_conditions = v.conditions,
    medical_history = v.history,
    immunizations = 'Complete childhood series (demo)',
    emergency_contact_name = 'Demo Guardian',
    emergency_contact_relationship = 'Parent',
    emergency_contact_number = '09170000000'
from (values
  ('DEMO-0001', 'Seasonal allergic rhinitis', null, null),
  ('DEMO-0002', null, 'Mild asthma (controlled)', null),
  ('DEMO-0003', 'Penicillin (rash)', null, null),
  ('DEMO-0004', null, null, null),
  ('DEMO-0005', null, null, 'Appendectomy (demo), fully recovered'),
  ('DEMO-0006', 'Shellfish (hives)', null, null),
  ('DEMO-0007', null, 'Migraine (occasional)', null),
  ('DEMO-0008', null, null, null),
  ('DEMO-0009', 'Dust mites', 'Allergic rhinitis', null),
  ('DEMO-0010', null, null, 'Fractured left wrist (demo), healed'),
  ('DEMO-0011', null, 'Dysmenorrhea', null),
  ('DEMO-0012', null, null, null),
  ('DEMO-0013', 'Ibuprofen (stomach upset)', null, null),
  ('DEMO-0014', null, 'Mild scoliosis', null),
  ('DEMO-0015', null, null, null),
  ('DEMO-0016', null, 'Eczema', null),
  ('DEMO-0017', 'Peanuts (mild)', null, null),
  ('DEMO-0018', null, null, null)
) as v(num, allergies, conditions, history)
join public.students s on s.student_number = v.num and s.is_demo
where h.student_id = s.id
  and h.allergies is null and h.existing_conditions is null and h.medical_history is null
  and h.immunizations is null and h.health_notes is null and h.emergency_contact_name is null;

-- ---------------------------------------------------------------------------
-- 3. Medicines (12) with starting stock recorded as restock transactions.
--    One low-stock item, one expiring soon, one expired (SYSTEM_SPEC §11).
--    Since migration 0013 the inventory is managed by Administrators, so this
--    block acts as an active administrator and then returns to clinic staff.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_id uuid;
  v_staff uuid := (select auth.uid());
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',
      (select p.id from public.profiles p where p.role = 'admin' and p.is_active order by p.created_at limit 1),
      'role', 'authenticated'
    )::text,
    true
  );
  if (select private.current_user_role()) is distinct from 'admin' then
    raise exception 'The demo seed needs an active administrator account to record starting stock. Create one first.';
  end if;

  for r in
    select * from (values
      ('Paracetamol 500mg',              'tablet',   50, 10,  365),
      ('Cetirizine 10mg',                'tablet',    8, 10,  200),
      ('Mefenamic Acid 500mg',           'capsule',  30, 10,   20),
      ('Oral Rehydration Salts',         'sachet',   20,  5,  300),
      ('Loperamide 2mg',                 'capsule',  12,  5,  -10),
      ('Carbocisteine 500mg',            'capsule',  40, 10,  240),
      ('Aluminum + Magnesium Hydroxide', 'tablet',   30, 10,  280),
      ('Adhesive Bandage',               'piece',   100, 20,  700),
      ('Ibuprofen 200mg',                'tablet',   40, 10,  330),
      ('Loratadine 10mg',                'tablet',   25,  8,  260),
      ('Antiseptic Solution 60ml',       'bottle',    6,  2,  400),
      ('Hyoscine Butylbromide 10mg',     'tablet',   20,  5,  210)
    ) as t(name, unit, qty, reorder, expires_in)
  loop
    if not exists (select 1 from public.medicines m where m.is_demo and m.name = r.name) then
      insert into public.medicines (name, unit, stock_quantity, reorder_level, expiration_date, is_demo)
      values (r.name, r.unit, 0, r.reorder, current_date + r.expires_in, true)
      returning id into v_id;
      perform public.restock_medication(v_id, r.qty, 'Demo starting stock');
    end if;
  end loop;

  -- Starting stock arrived before the demo activity.
  update public.medication_transactions t
  set created_at = now() - interval '100 days'
  where t.created_at = now() and t.type = 'restock' and t.notes = 'Demo starting stock';

  -- Back to clinic staff for the clinical activity below.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Activity: ~40 visits, 15 appointments, 8 incidents over the last 3 months.
--    Skipped when demo activity already exists.
-- ---------------------------------------------------------------------------
do $$
declare
  v_staff uuid := (select auth.uid());
  v_cat   jsonb := (select jsonb_object_agg(name, id) from public.health_concern_categories);
  v_med   jsonb := (select jsonb_object_agg(name, id) from public.medicines where is_demo);
  v_stu   jsonb := (select jsonb_object_agg(student_number, id) from public.students where is_demo);
  v_visit_id uuid;
  v_appt_id uuid;
  v_at timestamptz;
  v_day date;
  i int;
  r record;
  -- category, reason, symptoms, assessment, treatment, medicine, quantity
  v_cases text[][] := array[
    ['Headache', 'Headache since morning', 'Frontal headache, no fever', 'Tension-type headache', 'Rest in clinic, hydration', 'Paracetamol 500mg', '2'],
    ['Fever', 'Feeling feverish', 'Temperature 38.1 °C, body aches', 'Fever, likely viral', 'Oral fluids, rest, advised to go home', 'Paracetamol 500mg', '2'],
    ['Cough / Colds', 'Cough and runny nose', 'Productive cough for 3 days', 'Upper respiratory infection', 'Hydration, rest', 'Carbocisteine 500mg', '3'],
    ['Stomach Ache / Gastrointestinal', 'Stomach pain after lunch', 'Epigastric discomfort, no vomiting', 'Hyperacidity', 'Small meals, avoid spicy food', 'Aluminum + Magnesium Hydroxide', '2'],
    ['Dysmenorrhea', 'Menstrual cramps', 'Lower abdominal cramps', 'Primary dysmenorrhea', 'Warm compress, rest', 'Mefenamic Acid 500mg', '1'],
    ['Dizziness', 'Felt dizzy during class', 'Light-headed, skipped breakfast', 'Dizziness, likely from skipped meal', 'Snack and water, observed for 30 minutes', '', '0'],
    ['Wound / Minor Injury', 'Small cut on finger', 'Superficial cut, minimal bleeding', 'Minor laceration', 'Wound cleaned and dressed', 'Adhesive Bandage', '2'],
    ['Allergy / Skin', 'Itchy rashes on arms', 'Raised itchy rashes', 'Allergic skin reaction', 'Cold compress, avoid trigger', 'Loratadine 10mg', '1'],
    ['Toothache', 'Toothache', 'Pain on lower left molar', 'Dental pain', 'Advised dental consultation', 'Paracetamol 500mg', '2'],
    ['Other', 'Requested blood pressure check', 'No complaints', 'Normal reading (demo)', 'No treatment needed', '', '0']
  ];
  -- Weighted so common concerns appear more often.
  v_pattern int[] := array[1,2,3,1,4,2,3,5,6,1,7,2,3,8,9,1,4,10,2,3];
  c text[];
  v_items jsonb;
begin
  if exists (select 1 from public.clinic_visits x join public.students s on s.id = x.student_id where s.is_demo)
     or exists (select 1 from public.appointments x join public.students s on s.id = x.student_id where s.is_demo)
     or exists (select 1 from public.health_incidents x join public.students s on s.id = x.student_id where s.is_demo) then
    raise notice 'Demo activity already exists. Skipped. Run remove-demo.sql first to rebuild it.';
    return;
  end if;

  -- Visits: 38 walk-in visits spread over about 85 days, clinic hours only.
  for i in 1..38 loop
    c := v_cases[v_pattern[1 + (i - 1) % 20]:v_pattern[1 + (i - 1) % 20]][1:7];
    v_day := current_date - (2 + (i * 9) % 85);
    while extract(isodow from v_day) > 5 loop v_day := v_day - 1; end loop;
    v_at := (v_day + time '08:15' + make_interval(mins => (i * 37) % 450)) at time zone 'Asia/Manila';
    v_items := case when c[1][6] = '' then '[]'::jsonb
                    else jsonb_build_array(jsonb_build_object('medicine_id', v_med ->> c[1][6], 'quantity', c[1][7]::int)) end;

    v_visit_id := public.create_visit_with_medications(
      jsonb_build_object(
        'student_id', v_stu ->> ('DEMO-' || lpad((1 + (i * 7) % 18)::text, 4, '0')),
        'visit_at', v_at,
        'reason', c[1][2],
        'symptoms', c[1][3],
        'concern_category_id', v_cat ->> c[1][1],
        'assessment', c[1][4],
        'treatment', c[1][5],
        'follow_up_instructions', case when i % 4 = 0 then 'Return to the clinic if symptoms persist after 2 days.' end
      ),
      v_items
    );
    update public.medication_transactions set created_at = v_at where clinic_visit_id = v_visit_id;
  end loop;

  -- Appointments run without the staff identity, so past and finished ones
  -- can be recorded with their final status. Table constraints still apply.
  perform set_config('request.jwt.claims', '', true);

  for r in
    select * from (values
      -- student, status, days from today (negative = past), time, reason, remark
      ('DEMO-0003', 'pending',   3, '09:00', 'Follow-up on rashes', null),
      ('DEMO-0007', 'pending',   4, '10:30', 'Recurring headaches', null),
      ('DEMO-0013', 'pending',   6, '14:00', 'Medical certificate request', null),
      ('DEMO-0002', 'approved',  2, '09:30', 'Asthma check-up', 'Please bring your inhaler.'),
      ('DEMO-0009', 'approved',  5, '11:00', 'Allergy consultation', null),
      ('DEMO-0014', 'approved',  7, '13:30', 'Back pain consultation', null),
      ('DEMO-0018', 'approved', 10, '15:00', 'Annual physical exam (demo)', null),
      ('DEMO-0001', 'completed', -12, '10:00', 'Follow-up on allergic rhinitis', null),
      ('DEMO-0005', 'completed', -25, '09:00', 'Blood pressure monitoring', null),
      ('DEMO-0011', 'completed', -40, '13:00', 'Dysmenorrhea consultation', null),
      ('DEMO-0016', 'completed', -55, '14:30', 'Skin check (eczema)', null),
      ('DEMO-0006', 'declined',  -8, '16:45', 'Late afternoon check-up', 'The clinic closes at 5:00 PM. Please choose an earlier time.'),
      ('DEMO-0010', 'declined', -20, '08:00', 'Wrist pain', 'Please see the orthopedic referral clinic for this concern.'),
      ('DEMO-0012', 'cancelled', -15, '10:00', 'Vaccination question', 'Cancelled at the student''s request.'),
      ('DEMO-0015', 'cancelled',  -3, '11:30', 'Stomach ache', null)
    ) as t(num, status, days, at_time, reason, remark)
  loop
    v_day := current_date + r.days;
    while extract(isodow from v_day) > 5 loop v_day := v_day + case when r.days >= 0 then 1 else -1 end; end loop;
    v_at := (v_day + r.at_time::time) at time zone 'Asia/Manila';

    insert into public.appointments
      (student_id, requested_by, reason, preferred_date, preferred_time, scheduled_at, status, staff_remarks, handled_by, created_at)
    values (
      (v_stu ->> r.num)::uuid, v_staff, r.reason, v_day, r.at_time::time,
      case when r.status in ('approved', 'completed') then v_at end,
      r.status::public.appointment_status, r.remark,
      case when r.status <> 'pending' then v_staff end,
      least(v_at - interval '3 days', now() - interval '1 day')
    )
    returning id into v_appt_id;

    -- Two completed appointments get their follow-up visit (DFD 4 -> 3).
    if r.status = 'completed' and r.num in ('DEMO-0001', 'DEMO-0011') then
      perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      c := v_cases[case when r.num = 'DEMO-0001' then 8 else 5 end:case when r.num = 'DEMO-0001' then 8 else 5 end][1:7];
      v_visit_id := public.create_visit_with_medications(
        jsonb_build_object(
          'student_id', v_stu ->> r.num, 'visit_at', v_at, 'reason', r.reason, 'symptoms', c[1][3],
          'concern_category_id', v_cat ->> c[1][1], 'assessment', c[1][4], 'treatment', c[1][5],
          'appointment_id', v_appt_id
        ),
        jsonb_build_array(jsonb_build_object('medicine_id', v_med ->> c[1][6], 'quantity', c[1][7]::int))
      );
      update public.medication_transactions set created_at = v_at where clinic_visit_id = v_visit_id;
      perform set_config('request.jwt.claims', '', true);
    end if;
  end loop;

  -- Incidents (8), recorded as clinic staff.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  for r in
    select * from (values
      ('DEMO-0004', 'injury',   -6,  '15:10', 'Gymnasium',        'Twisted right ankle during basketball practice.', 'Cold compress and elevation; advised rest.', 'Adhesive Bandage', 0),
      ('DEMO-0008', 'accident', -18, '11:40', 'Hallway, 2nd floor','Slipped on a wet floor; bruised left knee.',       'Cleaned abrasion, applied dressing.',        'Adhesive Bandage', 2),
      ('DEMO-0012', 'illness',  -27, '09:20', 'Room 301',          'Vomited once in class; complained of nausea.',      'Observed in clinic; oral rehydration given.', 'Oral Rehydration Salts', 1),
      ('DEMO-0017', 'other',    -33, '13:05', 'Canteen',           'Mild allergic reaction after a snack (suspected peanuts).', 'Antihistamine given; observed for 1 hour.', 'Cetirizine 10mg', 1),
      ('DEMO-0010', 'injury',   -44, '16:00', 'Laboratory',        'Small burn on the hand from a hot plate.',           'Cooled with running water, dressed.',        'Antiseptic Solution 60ml', 0),
      ('DEMO-0002', 'illness',  -52, '10:15', 'Library',           'Shortness of breath after climbing stairs.',         'Rested; used own inhaler; parent informed.', '', 0),
      ('DEMO-0015', 'accident', -63, '14:45', 'Parking area',      'Minor bicycle fall; scraped elbow.',                 'Wound cleaned and dressed.',                 'Adhesive Bandage', 3),
      ('DEMO-0006', 'injury',   -75, '08:50', 'Football field',    'Collided with another player; bruised shin.',        'Cold compress; cleared to return to class.', '', 0)
    ) as t(num, type, days, at_time, location, description, action, medicine, qty)
  loop
    v_day := current_date + r.days;
    while extract(isodow from v_day) > 5 loop v_day := v_day - 1; end loop;
    v_at := (v_day + r.at_time::time) at time zone 'Asia/Manila';
    v_appt_id := public.create_incident_with_medications(
      jsonb_build_object(
        'student_id', v_stu ->> r.num, 'occurred_at', v_at, 'type', r.type, 'location', r.location,
        'description', r.description, 'action_taken', r.action
      ),
      case when r.medicine = '' or r.qty = 0 then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('medicine_id', v_med ->> r.medicine, 'quantity', r.qty)) end
    );
    update public.health_incidents set created_at = v_at where id = v_appt_id;
    update public.medication_transactions set created_at = v_at where incident_id = v_appt_id;
  end loop;

  update public.clinic_visits v set created_at = v.visit_at
  from public.students s where s.id = v.student_id and s.is_demo and v.created_at = now();
end $$;

commit;

-- Summary
select
  (select count(*) from public.students where is_demo)::int as demo_students,
  (select count(*) from public.medicines where is_demo)::int as demo_medicines,
  (select count(*) from public.clinic_visits v join public.students s on s.id = v.student_id where s.is_demo)::int as demo_visits,
  (select count(*) from public.appointments a join public.students s on s.id = a.student_id where s.is_demo)::int as demo_appointments,
  (select count(*) from public.health_incidents i join public.students s on s.id = i.student_id where s.is_demo)::int as demo_incidents,
  (select bool_and(m.stock_quantity = (select coalesce(sum(t.quantity), 0) from public.medication_transactions t where t.medicine_id = m.id))
   from public.medicines m) as stock_matches_ledger;
