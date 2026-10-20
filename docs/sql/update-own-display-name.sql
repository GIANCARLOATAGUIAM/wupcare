-- DRAFT ONLY. Requires explicit approval. Not an applied migration.
-- Run as the database owner, in a transaction, only after approval.
begin;

create function public.update_own_display_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform private.require_role('admin', 'clinic_staff', 'student');

  -- Reject controls BEFORE normalizing spaces. PostgreSQL text cannot hold NUL.
  -- Also reject line/paragraph separators, common invisible format controls,
  -- and markup delimiters, independently of the application's zod validation.
  if p_full_name is null
     or p_full_name ~ '[[:cntrl:]<>{}]'
     or p_full_name ~ U&'[\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\2028-\202E\2060-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]' then
    raise exception 'Enter a valid display name without control characters.' using errcode = '22023';
  end if;

  -- Same space normalization as the shared form; preserve letters/punctuation.
  v_name := btrim(regexp_replace(translate(p_full_name,
    U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000',
    repeat(' ', 16)), ' +', ' ', 'g'));
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Enter 2 to 120 characters.' using errcode = '22023';
  end if;

  -- No target-ID parameter; the caller can only affect their own active row.
  -- Existing audit stamps and guard_profile_update remain in force.
  update public.profiles set full_name = v_name
  where id = (select auth.uid()) and is_active
    and role in ('admin', 'clinic_staff', 'student');
  if not found then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_own_display_name(text) from public, anon, authenticated;
grant execute on function public.update_own_display_name(text) to authenticated;
commit;

-- Rollback (after approval): drop function public.update_own_display_name(text);
-- Does not restore names already saved. No policies/table grants are changed.
