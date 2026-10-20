const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
const { find } = require("./confirmation-harness.cjs");

// Client revisions 2026-10-21. Fictional in-memory data only; no live client.
let client, role = "clinic_staff";
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", {
  requireRole: async (...roles) => {
    if (!roles.includes(role)) throw new Error(`denied:${role}`);
    return { id: "fictional-me", fullName: "Fictional User", email: "user@example.test", role };
  },
  getAuthState: async () => ({ status: "ok", user: { id: "fictional-me", role } }),
});
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const all = (tree, predicate, out = []) => {
  if (!tree || typeof tree !== "object") return out;
  if (Array.isArray(tree)) { for (const n of tree) all(n, predicate, out); return out; }
  if (predicate(tree)) out.push(tree);
  all(tree.props?.children, predicate, out);
  for (const key of ["actions", "action", "description"]) all(tree.props?.[key], predicate, out);
  return out;
};
const text = (tree) => { const seen = new WeakSet(); return JSON.stringify(tree, (k, v) => { if (typeof v === "object" && v !== null) { if (seen.has(v)) return undefined; seen.add(v); } return v; }); };
const stats = (tree) => Object.fromEntries(all(tree, (n) => n.type?.name === "Stat").map((n) => [n.props.label, n.props.value]));
const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const MED = "00000000-0000-4000-8000-0000000000aa";

// Renders the role-specific dashboard section (an async server component).
async function dashboard(r) {
  role = r;
  const tree = await fresh("../app/(clinic)/dashboard/page.tsx").default();
  const section = all(tree, (n) => typeof n.type === "function" && /Dashboard$/.test(n.type.name))[0];
  return section.type();
}

// ------------------------------------------------------------------ Phase 1

test("reports: no small-count suppression marker anywhere in report or dashboard code", () => {
  for (const file of ["features/reports/report-table.tsx", "features/reports/report-data.ts", "app/(clinic)/dashboard/page.tsx", "app/(clinic)/reports/[report]/page.tsx"]) {
    assert.doesNotMatch(read(file), /"<5"|&lt;5|counts below 5/, file);
  }
  const sql = read("supabase/migrations/0011_exact_report_counts.sql");
  assert.match(sql, /create or replace function private\.mask_count\(p_count bigint, p_is_admin boolean\)[\s\S]*select p_count;/);
});

// ------------------------------------------------------------------ Phase 2

test("nurse dashboard: appointment counts use the same status filters as the lists they open", async () => {
  const appts = [
    ...["pending", "pending", "approved", "approved", "approved", "completed", "declined", "cancelled"].map((status, i) => ({ id: `a${i}`, status, scheduled_at: null })),
  ];
  client = queryClient({ appointments: appts, clinic_visits: [{ id: "v1", visit_at: "2000-01-01T00:00:00Z" }], health_incidents: [], medicines: [], profiles: [] });
  const s = stats(await dashboard("clinic_staff"));
  assert.equal(s["Pending requests"], 2);
  assert.equal(s["Scheduled (approved)"], 3);
  assert.equal(s["Completed"], 1);
  assert.equal(s["Total appointments"], 8);
  assert.equal(s["Clinic visits today"], 0); // visits are separate records; this one is not today
  const tree = await dashboard("clinic_staff");
  const hrefs = Object.fromEntries(all(tree, (n) => n.type?.name === "Stat").map((n) => [n.props.label, n.props.href]));
  assert.equal(hrefs["Pending requests"], "/appointments/pending");
  assert.equal(hrefs["Scheduled (approved)"], "/appointments/scheduled");
  assert.equal(hrefs["Completed"], "/appointments/history?status=completed");
  assert.equal(hrefs["Total appointments"], "/appointments");
});

test("nurse dashboard: approving, cancelling and completing move counts between metrics", async () => {
  const base = [{ id: "x", status: "pending", scheduled_at: null }];
  const counts = async (status) => {
    client = queryClient({ appointments: [{ ...base[0], status }], clinic_visits: [], health_incidents: [], medicines: [], profiles: [] });
    const s = stats(await dashboard("clinic_staff"));
    return [s["Pending requests"], s["Scheduled (approved)"], s["Completed"], s["Total appointments"]];
  };
  assert.deepEqual(await counts("pending"), [1, 0, 0, 1]);
  assert.deepEqual(await counts("approved"), [0, 1, 0, 1]);
  assert.deepEqual(await counts("completed"), [0, 0, 1, 1]);
  assert.deepEqual(await counts("cancelled"), [0, 0, 0, 1]);
  assert.deepEqual(await counts("declined"), [0, 0, 0, 1]);
});

test("admin dashboard: exact current appointment totals from appointment_summary (real records)", async () => {
  client = queryClient({
    appointment_summary: [{ total: 9, pending: 1, scheduled: 2, today: 1, completed: 4, declined: 1, cancelled: 1 }],
    report_visits: [{ period: "2026-10-01", visit_count: 3 }],
    report_incidents: [{ incident_type: "injury", incident_count: 1 }, { incident_type: "other", incident_count: 2 }],
    medicines: [{ id: "m1", stock_quantity: 0, reorder_level: 5, expiration_date: "2999-01-01", is_active: true, is_demo: false }],
    profiles: [{ role: "admin", is_active: true }],
  });
  const tree = await dashboard("admin");
  const s = stats(tree);
  assert.deepEqual(
    [s["Pending requests"], s["Scheduled (approved)"], s["Appointments today"], s["Completed"], s["Total appointments"]],
    ["1", "2", "1", "4", "9"]
  );
  assert.equal(s["Clinic visits"], "3");
  assert.equal(s["Health incidents"], "3");
  assert.equal(s["Low stock"], "1");
  const summary = client.calls.find((c) => c.table === "appointment_summary");
  assert.ok(summary);
  assert.doesNotMatch(text(tree), /&lt;5|"<5"/);
});

test("admin dashboard: a missing count is shown as unavailable, never guessed", async () => {
  client = queryClient({ report_visits: [], report_incidents: [{ incident_type: "other", incident_count: null }], medicines: [], profiles: [] });
  client.rpc = function (name) {
    if (name === "appointment_summary") return Promise.resolve({ data: null, error: { code: "PGRST202" } });
    return this.from(name);
  };
  const tree = await dashboard("admin");
  const s = stats(tree);
  assert.equal(s["Pending requests"], "—");
  assert.equal(s["Health incidents"], "—");
  assert.equal(s["Clinic visits"], "0");
  assert.match(text(tree), /database update 0013/);
});

test("sidebar pending badge is re-read after navigation (layouts do not re-render)", async () => {
  const { pendingAppointmentCount } = fresh("../features/appointments/live-counts.ts");
  client = queryClient({ appointments: [{ id: "1", status: "pending" }, { id: "2", status: "approved" }, { id: "3", status: "pending" }] });
  role = "clinic_staff";
  assert.equal(await pendingAppointmentCount(), 2);
  for (const r of ["admin", "student"]) {
    role = r;
    client = queryClient({ appointments: [{ id: "1", status: "pending" }] });
    assert.equal(await pendingAppointmentCount(), null);
    assert.equal(client.calls.length, 0, r);
  }
  const shell = read("components/app/clinic-shell.tsx");
  assert.match(shell, /pendingAppointmentCount\(\)/);
  assert.match(shell, /\[role, pathname\]/);
  assert.match(shell, /router\.refresh\(\)[\s\S]*addEventListener\("visibilitychange"/);
});

// ------------------------------------------------------------------ Phase 3

test("academic schema: Department/College and Year Level are required and controlled", () => {
  const { academicSchema } = fresh("../features/account/academic-schema.ts");
  assert.deepEqual(academicSchema.parse({ college: "  College   of Nursing ", year_level: "3" }), { college: "College of Nursing", year_level: "3" });
  for (const bad of [{}, { college: "", year_level: "1" }, { college: "X", year_level: "1" }, { college: "12", year_level: "1" }, { college: "<b>x</b>", year_level: "1" },
    { college: "College​", year_level: "1" }, { college: "C".repeat(121), year_level: "1" }, { college: "Nursing", year_level: "" }, { college: "Nursing", year_level: "7" }, { college: "Nursing", year_level: "0" }]) {
    assert.equal(academicSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  const { registrationSchema } = fresh("../features/registration/schema.ts");
  const base = { first_name: "Ana", middle_name: "", last_name: "Reyes", email: "ana@example.test", student_number: "WUP-1", password: "Fictional-Pass-11", confirm_password: "Fictional-Pass-11" };
  assert.equal(registrationSchema.safeParse(base).success, false); // new registrations must include both
  assert.equal(registrationSchema.safeParse({ ...base, college: "College of Nursing", year_level: "1" }).success, true);
});

test("academic save: student only, sends only the two fields, never a record ID or Student ID", async () => {
  const { saveAcademicProfile } = fresh("../features/account/academic-actions.ts");
  const calls = [];
  client = { rpc: async (name, args) => { calls.push([name, args]); return { error: null }; } };
  role = "student";
  const ok = await saveAcademicProfile({}, form({ college: " College of Nursing ", year_level: "2", student_id: "fictional-other", student_number: "X-1", flow: "settings" }));
  assert.equal(ok.ok, true);
  assert.deepEqual(calls, [["update_my_academic_profile", { p_college: "College of Nursing", p_year_level: 2 }]]);

  calls.length = 0;
  await assert.rejects(saveAcademicProfile({}, form({ college: "Nursing", year_level: "2", flow: "complete", next: "/portal/request" })), /REDIRECT:\/portal\/request$/);
  await assert.rejects(saveAcademicProfile({}, form({ college: "Nursing", year_level: "2", flow: "complete", next: "https://evil.example" })), /REDIRECT:\/portal$/);
  const invalid = await saveAcademicProfile({}, form({ college: "", year_level: "9" }));
  assert.ok(invalid.fieldErrors.college && invalid.fieldErrors.year_level);
  assert.equal(calls.length, 2);

  for (const r of ["admin", "clinic_staff"]) {
    role = r;
    await assert.rejects(saveAcademicProfile({}, form({ college: "Nursing", year_level: "2" })), /denied/);
  }
});

test("incomplete students are sent to Complete Your Profile and cannot request appointments", async () => {
  role = "student";
  const setup = (academic) => (client = queryClient({ profiles: [{ id: "fictional-me", student_id: "student-mine" }], appointments: [], my_academic_profile: academic, clinic_settings: [] }));
  for (const [file, next] of [["../app/(portal)/portal/page.tsx", "%2Fportal"], ["../app/(portal)/portal/appointments/page.tsx", "%2Fportal%2Fappointments"], ["../app/(portal)/portal/request/page.tsx", "%2Fportal%2Frequest"]]) {
    setup([{ college: null, year_level: 2 }]);
    await assert.rejects(fresh(file).default({ searchParams: Promise.resolve({}) }), new RegExp(`REDIRECT:/portal/complete-profile\\?next=${next}$`), file);
  }
  setup([{ college: "Nursing", year_level: null }]);
  const { requestAppointment } = fresh("../features/appointments/actions.ts");
  const state = await requestAppointment({}, form({ preferred_date: "2099-01-05", preferred_time: "09:00", reason: "Checkup" }));
  assert.match(state.error, /Department\/College and Year Level/);
  assert.equal(client.calls.some((c) => c.table === "appointments"), false);

  // Complete profile page: complete -> continue; incomplete -> form.
  setup([{ college: "Nursing", year_level: 3 }]);
  await assert.rejects(fresh("../app/(portal)/portal/complete-profile/page.tsx").default({ searchParams: Promise.resolve({ next: "/portal/appointments" }) }), /REDIRECT:\/portal\/appointments$/);
  setup([{ college: null, year_level: null }]);
  const tree = await fresh("../app/(portal)/portal/complete-profile/page.tsx").default({ searchParams: Promise.resolve({ next: "//evil.example" }) });
  const formNode = find(tree, (n) => n.type?.name === "AcademicProfileForm");
  assert.equal(formNode.props.flow, "complete");
  assert.equal(formNode.props.next, "/portal");
});

test("academic gate fails open only when the profile cannot be read (before 0013)", async () => {
  role = "student";
  const { requireCompleteProfile } = fresh("../features/account/academic.ts");
  const err = { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) };
  assert.equal(await requireCompleteProfile(err, "/portal"), null);
});

test("migration 0013: academic fields are self-service only through guarded functions", () => {
  const sql = read("supabase/migrations/0013_client_revisions.sql");
  assert.match(sql, /PROPOSED ONLY/);
  const update = sql.slice(sql.indexOf("create function public.update_my_academic_profile"), sql.indexOf("revoke all on function public.my_academic_profile"));
  assert.match(update, /require_role\('student'\)/);
  assert.match(update, /private\.current_student_id\(\)/);
  assert.match(update, /set college = v_college, year_level = p_year_level\s+where id = v_student_id/);
  assert.doesNotMatch(update, /student_number|first_name|last_name|is_demo|status\s*=/);
  assert.doesNotMatch(sql, /policy students_|on public\.students\s+for update/); // students table RLS unchanged
  assert.match(sql, /student_academic_complete\(new\.student_id\)/);
  assert.match(sql, /v_college, v_year, 'active', false, null/);
  assert.doesNotMatch(sql, /\bdelete from\b|\btruncate\b|\bdrop table\b/i);
});

// ------------------------------------------------------------------ Phase 4

test("medicine management actions are Administrator-only; issuance is clinic personnel only", async () => {
  const actions = fresh("../features/medications/actions.ts");
  const calls = [];
  client = { rpc: async (name, args) => { calls.push([name, args]); return { data: 5, error: null }; }, from: () => { throw new Error("no table access expected"); } };
  role = "clinic_staff";
  await assert.rejects(actions.createMedicine({}, form({ name: "X", unit: "tab", reorder_level: "1", expiration_date: "2099-01-01", starting_stock: "1" })), /denied:clinic_staff/);
  await assert.rejects(actions.updateMedicine(MED, {}, form({})), /denied:clinic_staff/);
  await assert.rejects(actions.setMedicineActive(MED, false), /denied:clinic_staff/);
  await assert.rejects(actions.restockMedicine(MED, {}, form({ quantity: "5" })), /denied:clinic_staff/);
  await assert.rejects(actions.adjustMedicine(MED, {}, form({ quantity: "-1", reason: "Count" })), /denied:clinic_staff/);
  assert.equal(calls.length, 0);

  role = "admin";
  assert.equal((await actions.restockMedicine(MED, {}, form({ quantity: "5" }))).ok, true);
  assert.equal((await actions.adjustMedicine(MED, {}, form({ quantity: "-1", reason: "Count" }))).ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ["restock_medication", "adjust_medication"]);
  await assert.rejects(actions.issueMedicine(MED, {}, form({ student_number: "S-1", quantity: "1" })), /denied:admin/);
});

test("nurse medicine page: read-only stock with Issue only; full ledger", async () => {
  role = "clinic_staff";
  client = queryClient({
    medicines: [{ id: MED, name: "Fictional Tablet", unit: "tab", stock_quantity: 4, reorder_level: 1, expiration_date: "2999-01-01", is_active: true, is_demo: false }],
    medication_transactions: [{ id: "t1", medicine_id: MED, type: "restock", quantity: 4, created_at: "2026-10-01T00:00:00Z" }],
  });
  const tree = await fresh("../app/(clinic)/medications/[id]/page.tsx").default({ params: Promise.resolve({ id: MED }), searchParams: Promise.resolve({}) });
  const forms = all(tree, (n) => n.type?.name === "ActionForm").map((n) => n.props.submitLabel);
  assert.deepEqual(forms, ["Issue"]);
  assert.equal(all(tree, (n) => n.props?.href === `/medications/${MED}/edit`).length, 0);
  assert.ok(client.calls.some((c) => c.table === "medication_transactions"));
  assert.equal(client.calls.some((c) => c.table === "medicine_stock_history"), false);

  const list = await fresh("../app/(clinic)/medications/page.tsx").default({ searchParams: Promise.resolve({}) });
  assert.equal(all(list, (n) => n.props?.href === "/medications/new").length, 0);
});

test("admin medicine page: manage controls, stock history without student identity", async () => {
  role = "admin";
  client = queryClient({
    medicines: [{ id: MED, name: "Fictional Tablet", unit: "tab", stock_quantity: 3, reorder_level: 1, expiration_date: "2999-01-01", is_active: true, is_demo: false }],
    medicine_stock_history: [
      { id: "t2", type: "issuance", quantity: -1, notes: null, performed_by: "Nurse", created_at: "2026-10-02T00:00:00Z", total_count: 2, ledger_total: 3 },
      { id: "t1", type: "restock", quantity: 4, notes: "Delivery", performed_by: "Admin", created_at: "2026-10-01T00:00:00Z", total_count: 2, ledger_total: 3 },
    ],
  });
  const tree = await fresh("../app/(clinic)/medications/[id]/page.tsx").default({ params: Promise.resolve({ id: MED }), searchParams: Promise.resolve({}) });
  const forms = all(tree, (n) => n.type?.name === "ActionForm").map((n) => n.props.submitLabel);
  assert.deepEqual(forms, ["Add stock", "Save adjustment", "Deactivate medicine"]);
  assert.equal(all(tree, (n) => n.props?.href === `/medications/${MED}/edit`).length, 1);
  assert.equal(client.calls.some((c) => c.table === "medication_transactions"), false); // no direct ledger read
  const body = text(tree);
  assert.match(body, /Issued to a student/);
  assert.doesNotMatch(body, /\/students\/|\/visits\/|\/incidents\//);
  assert.doesNotMatch(body, /does not match stock/); // ledger total 3 = stock 3

  const list = await fresh("../app/(clinic)/medications/page.tsx").default({ searchParams: Promise.resolve({}) });
  assert.equal(all(list, (n) => n.props?.href === "/medications/new").length, 1);
});

test("admin navigation has Medicine Inventory; new/edit pages reject clinic personnel", async () => {
  const { navForRole } = fresh("../components/app/nav.ts");
  assert.ok(navForRole("admin").flatMap((s) => s.items).some((i) => i.label === "Medicine Inventory" && i.href === "/medications"));
  assert.ok(navForRole("clinic_staff").flatMap((s) => s.items).some((i) => i.href === "/medications"));
  role = "clinic_staff";
  await assert.rejects(fresh("../app/(clinic)/medications/new/page.tsx").default(), /denied:clinic_staff/);
  await assert.rejects(fresh("../app/(clinic)/medications/[id]/edit/page.tsx").default({ params: Promise.resolve({ id: MED }) }), /denied:clinic_staff/);
});

test("migration 0013: inventory permissions move to Administrators; issuance and ledger unchanged", () => {
  const sql = read("supabase/migrations/0013_client_revisions.sql");
  assert.match(sql, /create policy medicines_select[\s\S]*?in \('admin', 'clinic_staff'\)/);
  assert.match(sql, /create policy medicines_insert[\s\S]*?with check \(\(select private\.current_user_role\(\)\) = 'admin'\)/);
  assert.match(sql, /create policy medicines_update[\s\S]*?using \(\(select private\.current_user_role\(\)\) = 'admin'\)\s+with check \(\(select private\.current_user_role\(\)\) = 'admin'\)/);
  for (const fn of ["restock_medication", "adjust_medication"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${fn}(`));
    assert.match(body.slice(0, body.indexOf("$$;")), /perform private\.require_role\('admin'\);/, fn);
  }
  assert.doesNotMatch(sql, /function public\.issue_medication|function private\.issue_items|medication_transactions_select/);
  const history = sql.slice(sql.indexOf("create function public.medicine_stock_history"));
  assert.match(history, /require_role\('admin'\)/);
  assert.match(history, /case when t\.type = 'issuance' then null else t\.notes end/);
  assert.doesNotMatch(history.slice(0, history.indexOf("$$;", history.indexOf("as $$") + 5)), /student_id|clinic_visit_id|incident_id/);
  assert.match(read("supabase/migrations/0004_inventory.sql"), /for update;[\s\S]*Not enough stock/); // issuance locks before the stock check
});

// ------------------------------------------------------------------ Phase 5

test("nurse booking saves the chosen student record and says whether a portal account will show it", async () => {
  role = "clinic_staff";
  const STU = "00000000-0000-4000-8000-0000000000bb";
  const student = { id: STU, student_number: "FICT-1", first_name: "Ana", last_name: "Reyes", middle_name: null, is_demo: false, status: "active" };
  for (const [profiles, expected] of [
    [[{ id: "acct", role: "student", student_id: STU, is_active: true }], /appear in their My Appointments under Upcoming/],
    [[], /no portal account/],
    [[{ id: "acct", role: "student", student_id: STU, is_active: false }], /inactive/],
  ]) {
    client = queryClient({ students: [student], health_records: [], profiles });
    const tree = await fresh("../app/(clinic)/appointments/new/page.tsx").default({ searchParams: Promise.resolve({ student: STU }) });
    assert.match(text(tree), expected);
  }

  const inserts = [];
  client = { from: () => ({ insert: (row) => { inserts.push(row); return { select: () => ({ single: async () => ({ data: { id: "new-appt" }, error: null }) }) }; } }) };
  const { bookAppointment } = fresh("../features/appointments/actions.ts");
  await assert.rejects(bookAppointment({}, form({ student_id: STU, preferred_date: "2099-01-05", preferred_time: "09:00", reason: "Follow-up" })), /REDIRECT:\/appointments\/new-appt\?done=book$/);
  assert.equal(inserts[0].student_id, STU); // canonical students.id, the same key the portal reads through profiles.student_id
  assert.equal(inserts[0].status, "approved");
});

test("student portal shows a staff-booked appointment under Upcoming; another student's never", async () => {
  role = "student";
  const FUTURE = "2099-01-15T01:00:00.000Z";
  const row = (id, student_id, extra = {}) => ({ id, student_id, status: "approved", scheduled_at: FUTURE, preferred_date: "2099-01-15", preferred_time: "09:00", reason: "Booked by clinic", staff_remarks: null, reschedule_count: 0, created_at: "2026-10-20T00:00:00Z", requested_by: "fictional-nurse", ...extra });
  client = queryClient({
    profiles: [{ id: "fictional-me", student_id: "student-a" }],
    my_academic_profile: [{ college: "Nursing", year_level: 1 }],
    appointments: [row("mine", "student-a"), row("theirs", "student-b")],
  });
  const tree = await fresh("../app/(portal)/portal/appointments/page.tsx").default({ searchParams: Promise.resolve({ status: "upcoming" }) });
  const cards = all(tree, (n) => n.type?.name === "StudentAppointmentCard").map((n) => n.props.appointment.id);
  assert.deepEqual(cards, ["mine"]);
  const q = client.calls.find((c) => c.table === "appointments");
  assert.ok(q.filters.some((f) => f[0] === "eq" && f[1] === "student_id" && f[2] === "student-a"));

  // Rescheduled by the nurse: the portal reads the stored schedule; no cached copy.
  client = queryClient({
    profiles: [{ id: "fictional-me", student_id: "student-a" }],
    my_academic_profile: [{ college: "Nursing", year_level: 1 }],
    appointments: [row("mine", "student-a", { scheduled_at: "2099-01-16T02:00:00.000Z", reschedule_count: 1 })],
  });
  const after = await fresh("../app/(portal)/portal/appointments/page.tsx").default({ searchParams: Promise.resolve({}) });
  const card = all(after, (n) => n.type?.name === "StudentAppointmentCard")[0];
  assert.equal(card.props.appointment.reschedule_count, 1);
  assert.equal(card.props.appointment.scheduled_at, "2099-01-16T02:00:00.000Z");
});
