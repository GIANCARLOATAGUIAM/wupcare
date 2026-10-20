-- OPTIONAL, separate approval required. Run only after 0014.
-- Links existing free-text college values to the official catalog when the
-- match is exact (case and spacing ignored) on the full college name or its
-- code. Programs are linked only on an exact program name or abbreviation
-- match within that college and only when the abbreviation is unambiguous
-- there. Nothing is guessed: everything else is left as it is and listed by
-- the preview below for manual review in Edit Student.
--
-- Effect of linking: college_id/program_id are set; the 0014 trigger rewrites
-- college/program to the official names (same meaning; exact text may change
-- in letter case or spacing). No other column changes.

-- Preview (read-only): proposed links and unmatched values.
with legacy as (
  select s.id, s.is_demo, s.college, s.program,
         lower(regexp_replace(btrim(s.college), '\s+', ' ', 'g')) as c_norm,
         lower(regexp_replace(btrim(s.program), '\s+', ' ', 'g')) as p_norm
  from public.students s
  where s.college_id is null and (s.college is not null or s.program is not null)
)
select l.is_demo, l.college, l.program,
       c.id as proposed_college_id,
       p.id as proposed_program_id,
       case when c.id is null then 'unmatched college: review manually'
            when l.program is not null and p.id is null then 'college only; program needs review'
            else 'safe match' end as status,
       count(*) as students
from legacy l
left join public.colleges c on l.c_norm in (lower(c.name), lower(c.code))
left join public.programs p on p.college_id = c.id
  and (l.p_norm = lower(p.name)
       or (l.p_norm = lower(p.abbreviation)
           and (select count(*) from public.programs q where q.college_id = c.id and lower(q.abbreviation) = l.p_norm) = 1))
group by 1, 2, 3, 4, 5, 6
order by 6, 2, 3;

-- Apply (writes; run only with approval):
-- begin;
-- update public.students s
-- set college_id = c.id
-- from public.colleges c
-- where s.college_id is null
--   and lower(regexp_replace(btrim(s.college), '\s+', ' ', 'g')) in (lower(c.name), lower(c.code));
-- update public.students s
-- set program_id = p.id
-- from public.programs p
-- where s.college_id = p.college_id and s.program_id is null
--   and (lower(regexp_replace(btrim(s.program), '\s+', ' ', 'g')) = lower(p.name)
--        or (lower(regexp_replace(btrim(s.program), '\s+', ' ', 'g')) = lower(p.abbreviation)
--            and (select count(*) from public.programs q where q.college_id = p.college_id and lower(q.abbreviation) = lower(p.abbreviation)) = 1));
-- commit;
