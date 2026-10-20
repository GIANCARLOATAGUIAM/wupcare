const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { mock, fresh } = require("./register.cjs");

// Official College → Program → Year Level catalog (migration 0014). Fictional
// data only; no live client.
let client, role = "clinic_staff";
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", {
  requireRole: async (...roles) => {
    if (!roles.includes(role)) throw new Error(`denied:${role}`);
    return { id: "fictional-me", fullName: "Fictional User", role };
  },
});
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const catalog = () => fresh("../features/academics/catalog.ts");

const EXPECTED = {
  "College of Arts and Sciences (CAS)": ["Bachelor of Arts in Communication (BA Communication)", "Bachelor of Arts in Political Science (BA Political Science)", "Bachelor of Science in Psychology (BS Psychology)", "Bachelor of Science in Social Work (BS Social Work)"],
  "College of Allied Medical Sciences (CAMS)": ["Bachelor of Science in Medical Technology (BSMT)", "Bachelor of Science in Pharmacy (BS Pharmacy)", "Bachelor of Science in Physical Therapy (BSPT)", "Bachelor of Science in Radiologic Technology (BSRT)", "Bachelor of Science in Respiratory Therapy (BSRT)"],
  "College of Business and Accountancy (CBA)": ["Bachelor of Science in Accountancy (BSA)", "Bachelor of Science in Business Administration (BSBA)", "Bachelor of Science in Management Accounting (BSMA)", "Bachelor of Science in Real Estate Management (BSREM)", "Bachelor of Science in Accounting Information Management (BSAIM)"],
  "College of Criminal Justice Education (CCJE)": ["Bachelor of Science in Criminology (BS Crim)"],
  "College of Engineering and Computer Technology (CECT)": ["Bachelor of Science in Information Technology (BSIT)", "Bachelor of Science in Computer Engineering (BSCpE)", "Bachelor of Science in Electronics and Communications Engineering (BSECE)"],
  "College of Hospitality and Tourism Management (CHTM)": ["Bachelor of Science in Tourism Management (BSTM)", "Bachelor of Science in Hospitality Management (BSHM)", "Bachelor of Science in Nutrition and Dietetics (BSND)"],
  "College of Education (COED)": ["Bachelor of Elementary Education (BEEd)", "Bachelor of Secondary Education (BSEd)"],
  "College of Nursing (CON)": ["Bachelor of Science in Nursing (BSN)"],
};

test("catalog: exactly the 8 official colleges and 24 programs, names and abbreviations verbatim", () => {
  const { COLLEGES, PROGRAMS, collegeLabel, programLabel, programsForCollege } = catalog();
  const actual = Object.fromEntries(COLLEGES.map((c) => [collegeLabel(c), programsForCollege(c.id).map(programLabel)]));
  assert.deepEqual(actual, EXPECTED);
  assert.equal(COLLEGES.length, 8);
  assert.equal(PROGRAMS.length, 24);
  assert.equal(new Set(PROGRAMS.map((p) => p.id)).size, 24);
  assert.equal(new Set(COLLEGES.map((c) => c.id)).size, 8);
  assert.ok(PROGRAMS.every((p) => /^[a-z][a-z0-9-]+$/.test(p.id) && p.id.startsWith(`${p.collegeId}-`)));
});

test("catalog: BSRT names two programs with different stable IDs", () => {
  const { PROGRAMS, programById } = catalog();
  const bsrt = PROGRAMS.filter((p) => p.abbreviation === "BSRT");
  assert.deepEqual(bsrt.map((p) => p.id), ["cams-bs-radiologic-technology", "cams-bs-respiratory-therapy"]);
  assert.equal(programById("cams-bs-respiratory-therapy").name, "Bachelor of Science in Respiratory Therapy");
});

test("catalog: database seed in migration 0014 matches the app catalog row for row", () => {
  const { COLLEGES, PROGRAMS } = catalog();
  const sql = read("supabase/migrations/0014_academic_catalog.sql");
  const colleges = [...sql.matchAll(/\('([a-z]+)',\s+'([A-Z]+)',\s+'([^']+)', (\d+)\)/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);
  const programs = [...sql.matchAll(/\('([a-z0-9-]+)', '([a-z]+)', '([^']+)', '([^']+)', (\d+)\)/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}`);
  assert.deepEqual(colleges, COLLEGES.map((c) => `${c.id}|${c.code}|${c.name}`));
  assert.deepEqual(programs, PROGRAMS.map((p) => `${p.id}|${p.collegeId}|${p.name}|${p.abbreviation}`));
});

test("picker: lists only the selected college's programs; changing college clears program", () => {
  const { initialSelection, selectCollege, selectProgram } = fresh("../features/academics/academic-fields.tsx");
  let s = initialSelection("cect", "cect-bs-information-technology");
  assert.deepEqual(s, { college: "cect", program: "cect-bs-information-technology" });
  s = selectCollege(s, "con");
  assert.deepEqual(s, { college: "con", program: "" });
  assert.deepEqual(selectProgram(s, "cect-bs-information-technology"), { college: "con", program: "" }); // other college's program refused
  assert.deepEqual(selectProgram(s, "con-bs-nursing"), { college: "con", program: "con-bs-nursing" });
  assert.deepEqual(initialSelection("cas", "con-bs-nursing"), { college: "cas", program: "" }); // mismatched saved value not preselected
  assert.deepEqual(initialSelection(null, "con-bs-nursing"), { college: "", program: "" });
  const source = read("features/academics/academic-fields.tsx");
  assert.match(source, /setSelection\(\(prev\) => selectCollege\(prev, value\)\)/);
  assert.match(source, /setSelection\(\(prev\) => selectProgram\(prev, value\)\)/);
});

test("picker markup: accessible labels, required markers, filtered options, disabled program until a college", () => {
  const { AcademicFields } = fresh("../features/academics/academic-fields.tsx");
  const empty = renderToStaticMarkup(React.createElement(AcademicFields, { defaults: {}, required: true }));
  assert.match(empty, /<label[^>]*for="college_id"[^>]*>College \/ Department/);
  assert.match(empty, /<label[^>]*for="program_id"[^>]*>Program \/ Course/);
  assert.match(empty, /<label[^>]*for="year_level"[^>]*>Year Level/);
  assert.match(empty, /<select[^>]*name="program_id"[^>]*disabled=""/);
  assert.match(empty, /Choose a college first/);
  assert.equal((empty.match(/<option value="[a-z]+-[a-z0-9-]+">/g) ?? []).length, 0); // no programs yet

  const cams = renderToStaticMarkup(React.createElement(AcademicFields, { defaults: { college_id: "cams", program_id: "cams-bs-pharmacy", year_level: 2 }, required: true, errors: { program_id: "Choose your program." } }));
  const programOptions = [...cams.matchAll(/<option value="(cams-[a-z-]+|c[a-z]+-[a-z0-9-]+|coed-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(programOptions, ["cams-bs-medical-technology", "cams-bs-pharmacy", "cams-bs-physical-therapy", "cams-bs-radiologic-technology", "cams-bs-respiratory-therapy"]);
  assert.match(cams, /aria-invalid="true"[^>]*aria-describedby="program_id-error"|aria-describedby="program_id-error"[^>]*aria-invalid="true"/);
  assert.match(cams, /Choose your program\./);

  const legacy = renderToStaticMarkup(React.createElement(AcademicFields, { defaults: {}, legacy: { college: "Old College Name", program: null } }));
  assert.match(legacy, /Previously entered: Old College Name\. Choose the matching college\./);
  assert.match(legacy, /Not specified/); // optional for staff
});

test("validation: all three required for students; program must belong to college", () => {
  const { academicSchema, isAcademicComplete } = fresh("../features/account/academic-schema.ts");
  const ok = { college_id: "ccje", program_id: "ccje-bs-criminology", year_level: "4" };
  assert.ok(academicSchema.safeParse(ok).success);
  for (const [bad, field] of [[{ ...ok, college_id: "" }, "college_id"], [{ ...ok, program_id: "" }, "program_id"], [{ ...ok, year_level: "" }, "year_level"], [{ ...ok, program_id: "con-bs-nursing" }, "program_id"], [{ ...ok, college_id: "xyz" }, "college_id"], [{ ...ok, year_level: "7" }, "year_level"]]) {
    const r = academicSchema.safeParse(bad);
    assert.equal(r.success, false, JSON.stringify(bad));
    assert.ok(r.error.issues.some((i) => i.path[0] === field), field);
  }
  assert.equal(isAcademicComplete({ college_id: "con", program_id: "con-bs-nursing", year_level: 1 }), true);
  assert.equal(isAcademicComplete({ college_id: "con", program_id: null, year_level: 1 }), false);
  assert.equal(isAcademicComplete({ college_id: "cas", program_id: "con-bs-nursing", year_level: 1 }), false);
  assert.equal(isAcademicComplete({ college_id: null, program_id: null, year_level: 3, college: "Legacy text" }), false); // legacy text alone is not complete
});

test("registration: form uses the shared picker; schema requires a matching program", () => {
  const { registrationSchema, REGISTRATION_FIELDS } = fresh("../features/registration/schema.ts");
  const base = { first_name: "Ana", middle_name: "", last_name: "Reyes", email: "ana@example.test", student_number: "WUP-9", password: "Fictional-Pass-11", confirm_password: "Fictional-Pass-11" };
  assert.ok(registrationSchema.safeParse({ ...base, college_id: "cams", program_id: "cams-bs-respiratory-therapy", year_level: "1" }).success);
  const mismatch = registrationSchema.safeParse({ ...base, college_id: "cas", program_id: "cams-bs-respiratory-therapy", year_level: "1" });
  assert.equal(mismatch.success, false);
  assert.ok(mismatch.error.issues.some((i) => i.path[0] === "program_id"));
  assert.deepEqual(REGISTRATION_FIELDS.slice(5, 8), ["college_id", "program_id", "year_level"]);
  const formSource = read("app/(public)/register/register-form.tsx");
  assert.match(formSource, /<AcademicFields[\s\S]*required/);
  assert.doesNotMatch(formSource, /name="college"/);
});

test("nurse forms: optional catalog picker; mismatched or orphan program rejected; legacy text never written", async () => {
  const { studentSchema } = fresh("../features/students/schema.ts");
  const base = { student_number: "FICT-1", first_name: "Ana", last_name: "Reyes", status: "active" };
  const none = studentSchema.parse(base);
  assert.equal(none.college_id, null);
  assert.equal(none.program_id, null);
  assert.ok(!("college" in none) && !("program" in none));
  assert.equal(studentSchema.parse({ ...base, college_id: "con", program_id: "con-bs-nursing" }).program_id, "con-bs-nursing");
  assert.equal(studentSchema.parse({ ...base, college_id: "con" }).program_id, null); // college only is allowed for staff
  for (const bad of [{ college_id: "cas", program_id: "con-bs-nursing" }, { program_id: "con-bs-nursing" }, { college_id: "nope" }, { college_id: "con", program_id: "nope" }]) {
    assert.equal(studentSchema.safeParse({ ...base, ...bad }).success, false, JSON.stringify(bad));
  }

  const inserts = [], updates = [];
  client = { from: () => ({
    insert: (row) => { inserts.push(row); return { select: () => ({ single: async () => ({ data: { id: "new-id" }, error: null }) }) }; },
    update: (row) => { updates.push(row); return { eq: () => ({ select: async () => ({ data: [{ id: "x" }], error: null }) }) }; },
  }) };
  const { createStudent, updateStudent } = fresh("../features/students/actions.ts");
  role = "clinic_staff";
  await assert.rejects(createStudent({}, form({ ...base, college_id: "cect", program_id: "cect-bs-computer-engineering", year_level: "2", college: "Injected" })), /REDIRECT:\/students\/new-id/);
  assert.equal(inserts[0].college_id, "cect");
  assert.equal(inserts[0].program_id, "cect-bs-computer-engineering");
  assert.ok(!("college" in inserts[0]) && !("program" in inserts[0]));
  await assert.rejects(updateStudent("x", {}, form({ ...base, college_id: "", program_id: "" })), /REDIRECT:\/students\/x/);
  assert.equal(updates[0].college_id, null);
  const mismatch = await updateStudent("x", {}, form({ ...base, college_id: "cas", program_id: "con-bs-nursing" }));
  assert.match(mismatch.fieldErrors.program_id, /selected college/);
  assert.equal(updates.length, 1);
  for (const r of ["admin", "student"]) { role = r; await assert.rejects(createStudent({}, form(base)), /denied/); }
  role = "clinic_staff";

  const formSource = read("features/students/components/student-form.tsx");
  assert.match(formSource, /<AcademicFields/);
  assert.doesNotMatch(formSource, /name="college"|name="program"/);
});

test("displays: official names for catalog records; legacy text shown and flagged, never replaced", () => {
  const { academicParts } = catalog();
  assert.deepEqual(academicParts({ college_id: "cect", program_id: "cect-bs-information-technology", college: "x", program: "y", year_level: 3 }), { parts: ["College of Engineering and Computer Technology", "Bachelor of Science in Information Technology"], year: "Year 3", legacy: false });
  assert.deepEqual(academicParts({ college_id: "cams", program_id: "cams-bs-respiratory-therapy" }, true).parts, ["CAMS", "BSRT"]);
  assert.deepEqual(academicParts({ college: "Demo College of Arts", program: "AB Demo History", year_level: 2 }), { parts: ["Demo College of Arts", "AB Demo History"], year: "Year 2", legacy: true });
  assert.equal(academicParts({}).legacy, false);
  const { AcademicLine } = fresh("../features/academics/academic-line.tsx");
  assert.match(renderToStaticMarkup(React.createElement(AcademicLine, { student: { college: "Old", year_level: 1 } })), /Old · Year 1.*not from the official list/);
  for (const file of ["app/(clinic)/students/[id]/page.tsx", "app/(clinic)/reports/student/[id]/page.tsx"]) assert.match(read(file), /<AcademicLine student=\{student\} \/>/, file);
  assert.match(read("app/(clinic)/students/page.tsx"), /college_id, program_id/);
});

test("migration 0014: read-only catalog, DB-enforced program-in-college, own-record self-service, no data changes", () => {
  const sql = read("supabase/migrations/0014_academic_catalog.sql");
  assert.match(sql, /PROPOSED ONLY/);
  assert.match(sql, /foreign key \(program_id, college_id\) references public\.programs \(id, college_id\)/);
  assert.match(sql, /check \(program_id is null or college_id is not null\)/);
  assert.match(sql, /constraint programs_id_college_key unique \(id, college_id\)/);
  assert.match(sql, /grant select on table public\.colleges, public\.programs to anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*on (table )?public\.(colleges|programs)/i);
  assert.match(sql, /using \(true\)/);
  // Top-level statements never update or delete rows (function bodies excluded).
  const topLevel = sql.replace(/as \$\$[\s\S]*?\$\$;/g, "");
  assert.doesNotMatch(topLevel, /^\s*(update|delete)\s/im);
  const fn = sql.slice(sql.indexOf("create function public.update_my_academic_profile"), sql.indexOf("revoke all on function public.my_academic_profile"));
  assert.match(fn, /require_role\('student'\)/);
  assert.match(fn, /where id = v_student_id/);
  assert.doesNotMatch(fn, /student_number|first_name|last_name|is_demo/);
  const complete = sql.slice(sql.indexOf("create or replace function private.student_academic_complete"));
  assert.match(complete.slice(0, complete.indexOf("$$;", complete.indexOf("as $$") + 5)), /s\.college_id is not null\s+and s\.program_id is not null\s+and s\.year_level is not null/);
  assert.match(sql, /v_college, v_college_id, v_program_id, v_year, 'active', false, null/);
  const rollback = read("docs/sql/0014_academic_catalog.rollback.sql");
  assert.match(rollback, /drop table public\.colleges;/);
  assert.match(rollback, /create function public\.update_my_academic_profile\(p_college text, p_year_level smallint\)/);
  assert.match(read("docs/sql/0014_map_legacy_academics.sql"), /OPTIONAL, separate approval required/);
});
