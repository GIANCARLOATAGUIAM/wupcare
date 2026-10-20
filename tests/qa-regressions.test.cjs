// Regression tests for defects found in the final QA pass (docs/DEVLOG.md,
// "Final QA"). Fictional data and in-memory clients only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");

let client;
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-nurse", fullName: "Nurse", role: "clinic_staff" }) });

test("auth callback: ?next stays on this site, including backslash and encoded tricks", () => {
  const { sameOriginPath } = require("../lib/safe-redirect.ts");
  const origin = "http://localhost:3000";
  assert.equal(sameOriginPath("/portal", origin), "/portal");
  assert.equal(sameOriginPath("/portal/appointments?status=pending#x", origin), "/portal/appointments?status=pending#x");
  // Browsers read "/\host" as "//host": the old prefix check let these through.
  for (const bad of ["/\\evil.example", "/\\/evil.example", "//evil.example", "https://evil.example", "evil.example", "", null, undefined]) {
    assert.equal(sameOriginPath(bad, origin), "/", String(bad));
  }
  assert.match(require("node:fs").readFileSync(require("node:path").join(__dirname, "../app/auth/confirm/route.ts"), "utf8"), /sameOriginPath\(url\.searchParams\.get\("next"\), url\.origin\)/);
});

test("date-time and time fields reject impossible values with a field message, before the database", () => {
  const { localDateTime, clockTime, isClockTime } = require("../lib/forms.ts");
  const dt = localDateTime("date and time");
  for (const ok of ["2026-10-20T08:00", "2024-02-29T23:59", "2026-12-31T00:00"]) assert.ok(dt.safeParse(ok).success, ok);
  for (const bad of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-10-20T24:00", "2026-10-20T10:60", "2026-10-20 10:00", "2026-10-20T10:00:00", ""]) {
    assert.equal(dt.safeParse(bad).success, false, bad);
  }
  assert.equal(dt.safeParse("2026-02-30T10:00").error.issues[0].message, "Enter a valid date and time.");
  assert.ok(clockTime().safeParse("17:45").success);
  for (const bad of ["25:00", "12:99", "9:00", "09:00:00"]) assert.equal(isClockTime(bad), false, bad);
});

test("appointment request, staff booking, and clinic hours use the real clock-time check", async () => {
  // Student request: shape-valid but impossible time never reaches the database.
  mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-student", fullName: "Student", role: "student" }) });
  client = queryClient({});
  const { requestAppointment, bookAppointment } = fresh("../features/appointments/actions.ts");
  const fd = new FormData();
  fd.set("preferred_date", "2099-01-15"); fd.set("preferred_time", "25:99"); fd.set("reason", "Headache");
  const state = await requestAppointment({}, fd);
  assert.ok(state.fieldErrors.preferred_time);
  assert.equal(client.calls.length, 0);
  mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-nurse", fullName: "Nurse", role: "clinic_staff" }) });
  const book = new FormData();
  book.set("student_id", "00000000-0000-4000-8000-000000000001"); book.set("preferred_date", "2099-02-30"); book.set("preferred_time", "10:75"); book.set("reason", "Check-up");
  const booked = await fresh("../features/appointments/actions.ts").bookAppointment({}, book);
  assert.ok(booked.fieldErrors.preferred_date && booked.fieldErrors.preferred_time);
  assert.equal(typeof bookAppointment, "function");

  const { updateClinicHours } = fresh("../features/settings/actions.ts");
  const hours = new FormData();
  hours.append("open_days", "1"); hours.set("open_time", "08:00"); hours.set("close_time", "29:00"); hours.set("max_days_ahead", "30");
  const saved = await updateClinicHours({}, hours);
  assert.ok(saved.fieldErrors.close_time);
  assert.equal(client.calls.length, 0);
});

test("student birth date must be a real past date", () => {
  const { studentSchema } = require("../features/students/schema.ts");
  const base = { student_number: "FICTION-1", first_name: "Ana", last_name: "Reyes", status: "active" };
  assert.ok(studentSchema.safeParse({ ...base, birth_date: "2004-02-29" }).success);
  for (const bad of ["2001-02-30", "2001-13-01", "2999-01-01"]) assert.equal(studentSchema.safeParse({ ...base, birth_date: bad }).success, false, bad);
});

test("editing a medicine cannot create a duplicate of another (same name, any case, same expiry, same kind)", async () => {
  const id = "00000000-0000-4000-8000-0000000000m1";
  const rows = [
    { id, name: "Ibuprofen 200mg", expiration_date: "2027-01-01", is_demo: false },
    { id: "fictional-other", name: "Paracetamol 500mg", expiration_date: "2027-06-30", is_demo: false },
    { id: "fictional-demo", name: "Cetirizine 10mg", expiration_date: "2027-06-30", is_demo: true },
  ];
  const updates = [];
  const tables = queryClient({ medicines: rows });
  client = { from(table) { const q = tables.from(table); q.update = (row) => { updates.push(row); return { eq: () => ({ select: async () => ({ data: [{ id }], error: null }) }) }; }; return q; } };
  const { updateMedicine } = fresh("../features/medications/actions.ts");
  const form = (name, expiration_date) => { const fd = new FormData(); fd.set("name", name); fd.set("unit", "tablet"); fd.set("reorder_level", "10"); fd.set("expiration_date", expiration_date); return fd; };
  const dup = await updateMedicine(id, {}, form("PARACETAMOL 500MG", "2027-06-30"));
  assert.ok(dup.fieldErrors.name);
  assert.equal(updates.length, 0);
  // Its own unchanged name, or a demo medicine's name, is not a duplicate.
  await assert.rejects(updateMedicine(id, {}, form("Ibuprofen 200mg", "2027-01-01")), /REDIRECT:\/medications\//);
  await assert.rejects(updateMedicine(id, {}, form("Cetirizine 10mg", "2027-06-30")), /REDIRECT:\/medications\//);
  assert.equal(updates.length, 2);
});

test("pages with several forms give every field its own id (labels and errors point at the right form)", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const med = src("app/(clinic)/medications/[id]/page.tsx");
  const fields = [...med.matchAll(/<(TextField|TextAreaField)\b([^>]*?)\/>/gs)].map((m) => m[2]);
  assert.equal(fields.length, 7);
  const ids = fields.map((f) => /\bid="([^"]+)"/.exec(f)?.[1]);
  assert.ok(ids.every(Boolean), "every field has an explicit id");
  assert.equal(new Set(ids).size, ids.length, ids.join(","));
  // One approve form per pending registration: ids include the profile id.
  assert.match(src("app/(clinic)/students/registrations/page.tsx"), /<TextField id=\{`link-\$\{p\.id\}`\} name="student_number"/);
});
