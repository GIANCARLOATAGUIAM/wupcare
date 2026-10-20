# Clinic personnel portal simplification — 2026-10-20

Status: UI refinements are implemented. **Two database changes need approval before they are applied** (sections 3 and 4). No Supabase schema, function, trigger, RLS policy, Auth setting, or record was changed.

## 1. Implemented (UI only)

| Area | Change |
|---|---|
| Sidebar | Grouped as Dashboard · Student Management (Students) · Clinic Operations (Clinic Visits, Appointments, Medications, Health Incidents) · Reports & Settings (Clinic Reports, Clinic Hours). Registrations and Account items removed. |
| Profile card | The administrator's clickable card (initials, display name, role, chevron, links to `/account`) is now shared by clinic personnel, directly above Sign out. Sign out keeps the shared confirmation dialog on desktop and in the mobile sheet. |
| Shell bug fix | `initials()` and the nav section ids used `/s+/` (the letter "s") instead of whitespace. Initials were wrong for names containing "s", and section `aria-labelledby` ids contained spaces. |
| Registrations | Because approval is still required (section 3), the dashboard shows a notice linking to `/students/registrations` when accounts are waiting. The page, its RPC, and its authorization are unchanged. |
| Dashboard | Same six counters and the same queries, now with icons and focus rings. List panels have "view all" links, truncation, and `EmptyState` empty states. An overflow note appears when more than 8 medicines need attention. |
| Filters | `FilterBar` (used only by clinic personnel lists: Students, Visits, Appointments, Medications, Incidents, Reports) no longer has an Apply button. Text search waits 300 ms; selects apply immediately; date inputs apply only when complete and valid, or when cleared. The URL keeps the filters and `?page` is dropped. Unchanged filters make no request. An "Updating…" status shows, and tables dim while the new results load. Server-side pagination (10 per page) is unchanged. |
| Width | Clinic personnel pages use the full main width, as administrator pages do. Data-entry forms (visit, incident, student, health record) are capped at `max-w-4xl`. Forms that were already narrow keep their caps. |
| Account | `/account` uses the administrator's two-column layout for clinic personnel. Display name (fallback "Nurse"), email, and role are read-only for clinic personnel, and the password form is unchanged (with Show/Hide). |

## 2. Confirmation dialogs (verified, unchanged)

Logout, student archiving (status change to Inactive or Graduated), appointment decline, reschedule, and cancel, medicine deactivation, stock adjustment, and registration approval all use the shared `ConfirmationDialog`. No dialogs were added or duplicated. Server checks and RLS are unchanged.

## 3. Pending approval: removing manual registration approval

### Current flow (migration 0010)

1. **Account creation.** `registerStudent` calls Supabase `signUp`. The Student ID is stored in `user_metadata.student_number`, which the user controls and which is never trusted.
2. **Profile creation.** Once `email_confirmed_at` is set, `handle_new_auth_user()` creates a `student` profile with `student_id = null` and `requested_student_number`.
3. **Portal access.** The student can sign in, but `current_student_id()` returns null. They see "Waiting for clinic approval" and cannot read or request appointments. Student accounts never read health records in any case.
4. **Record link.** Clinic staff call `approve_student_link()`. It requires `clinic_staff` and an active, real, unlinked student record, and it sets `student_id`.

Removing step 4 means changing step 2. That is a trigger change, which needs approval.

### Why Student ID alone is unsafe

Student numbers are printed on IDs, class lists, and forms. Linking on the number alone would let anyone who knows it see that student's appointments and act as them in the portal.

### Proposed mechanism: confirmed email must match the clinic record

Link automatically **only** when all of the following hold:

- The Supabase email is confirmed. This proves the person controls the inbox.
- The confirmed email equals (case-insensitive, trimmed) the `students.email` the clinic already recorded for that student number.
- The record is active, not demo, and not linked to another account. Existing `profiles.student_id` uniqueness still applies.

In every other case the account is created, the student can sign in, and they see the waiting state. Those accounts stay in the existing manual verification queue. The registration response is identical whether or not a link happened, so it reveals nothing about which records exist.

Requirements and limits:

- **Supabase Auth "Confirm email" must stay ON.** With auto-confirm, `email_confirmed_at` is set without proof of inbox ownership, and this mechanism becomes Student-ID-plus-guessable-email. Deployment must check this setting.
- **Missing or stale clinic emails.** Records with no email, or an outdated one, still fall back to manual verification. Fully removing the queue would leave those students with no path to a link. Recommendation: keep the queue as the fallback.
- **Approved demo data.** Demo records are never linked.
- **Staff-entered emails.** The record email is entered by clinic staff, who are already trusted to link accounts.

### Draft migration (not applied, not in `supabase/migrations/`)

```sql
-- 0012_registration_autolink.sql (DRAFT, needs approval)
-- Replaces only the self-registered branch of handle_new_auth_user().
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_app     jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role    public.user_role;
  v_number  text;
  v_student public.students;
begin
  if v_app ? 'wupcare_role' then
    -- unchanged from 0010
    v_role := (v_app ->> 'wupcare_role')::public.user_role;
    if v_role = 'student' and nullif(v_app ->> 'student_id', '') is null then
      raise exception 'A student account created by an administrator must be linked to a student record.';
    end if;
    insert into public.profiles (id, full_name, email, role, student_id)
    values (new.id, coalesce(nullif(btrim(v_app ->> 'full_name'), ''), new.email), coalesce(new.email, ''),
            v_role, nullif(v_app ->> 'student_id', '')::uuid)
    on conflict (id) do nothing;

  elsif new.email_confirmed_at is not null and v_user ? 'student_number' then
    v_number := left(nullif(btrim(v_user ->> 'student_number'), ''), 40);

    -- Only a confirmed email that matches the clinic's own record links.
    select s.* into v_student
    from public.students s
    where s.student_number = v_number
      and s.status = 'active'
      and not s.is_demo
      and nullif(btrim(s.email), '') is not null
      and lower(btrim(s.email)) = lower(btrim(new.email))
      and not exists (select 1 from public.profiles p where p.student_id = s.id)
    for update of s;

    begin
      insert into public.profiles (id, full_name, email, role, requested_student_number, student_id)
      values (
        new.id,
        case when v_student.id is null then left(coalesce(new.email, 'Student'), 120)
             else left(concat_ws(' ', v_student.first_name, nullif(v_student.middle_name, ''), v_student.last_name), 120) end,
        coalesce(new.email, ''), 'student', v_number, v_student.id)
      on conflict (id) do nothing;
    exception when unique_violation then
      -- Lost a race for the same record: create the account unlinked (manual queue).
      insert into public.profiles (id, full_name, email, role, requested_student_number)
      values (new.id, left(coalesce(new.email, 'Student'), 120), coalesce(new.email, ''), 'student', v_number)
      on conflict (id) do nothing;
    end;
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
```

The trigger, `approve_student_link()`, `guard_profile_update()`, and the RLS policies are unchanged. After approval, app follow-ups: registration and portal copy ("linked automatically when your email matches the clinic record; otherwise the clinic will verify"), tests with an isolated mock, and SYSTEM_SPEC §8.10.

## 4. Pending approval: clinic personnel display name

RLS `profiles_update` allows only administrators to update profiles, so clinic personnel cannot save a display name. The existing `updateDisplayName` is admin-only on purpose. Using the service-role key would bypass RLS, so it was not done.

Proposed: a narrowly scoped function. Only `full_name` changes. `guard_profile_update()` still blocks role, access, and link changes.

```sql
-- DRAFT, needs approval
create function public.update_own_display_name(p_full_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'clinic_staff');
  if char_length(btrim(p_full_name)) not between 2 and 120 then
    raise exception 'Enter 2 to 120 characters.' using errcode = '22023';
  end if;
  update public.profiles set full_name = btrim(p_full_name)
  where id = (select auth.uid()) and is_active;
end;
$$;
revoke all on function public.update_own_display_name(text) from public, anon;
grant execute on function public.update_own_display_name(text) to authenticated;
```

After approval, `updateDisplayName` would accept `clinic_staff` and call this RPC, keeping the zod validation. `/account` would then show the existing `DisplayNameForm` for clinic personnel, and `revalidatePath("/", "layout")` refreshes the sidebar name.
