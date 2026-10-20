const { test, mock: nodeMock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
const { harness, find } = require("./confirmation-harness.cjs");

// Fictional records only; every database boundary is an in-memory mock.
let client, denied = false;
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", { requireRole: async (...roles) => { if (denied || !roles.includes("clinic_staff")) throw new Error("denied"); return { id: "fictional-nurse", fullName: "Nurse", role: "clinic_staff" }; } });
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const all = (tree, predicate, out = []) => {
  if (!tree || typeof tree !== "object") return out;
  if (Array.isArray(tree)) { for (const n of tree) all(n, predicate, out); return out; }
  if (predicate(tree)) out.push(tree);
  for (const key of ["children", "actions", "description"]) all(tree.props?.[key], predicate, out);
  return out;
};
// Route pages render the shared async AppointmentList; run it as well.
const renderList = async (route, sp = {}) => {
  const el = await fresh(`../app/(clinic)/${route}/page.tsx`).default({ searchParams: Promise.resolve(sp) });
  return el.type(el.props);
};
const student = { id: "fictional-student", student_number: "FICTION-1", first_name: "Ana", middle_name: null, last_name: "Reyes", is_demo: true, status: "active", college: "Fictional College", program: "BS Nursing" };
const appointment = (status, extra = {}) => ({
  id: "00000000-0000-4000-8000-0000000000a1", student_id: student.id, status, reason: "Recurring headache", preferred_date: "2099-01-15", preferred_time: "09:00:00",
  scheduled_at: null, staff_remarks: null, reschedule_count: 0, created_at: "2026-10-01T00:00:00Z", students: student, requester: { full_name: "Ana Reyes", role: "student" }, handler: null, ...extra,
});

test("appointment rows: the whole row opens the existing detail page through one stretched link", async () => {
  client = queryClient({ appointments: Array.from({ length: 3 }, (_, i) => ({ ...appointment("pending"), id: `fictional-${i}`, preferred_date: `2099-01-1${i}` })) });
  const tree = await renderList("appointments");
  const rows = all(tree, (n) => n.type?.name === "TableRow" && n.key?.startsWith("fictional-"));
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.match(row.props.className, /\brelative\b/);
    const links = all(row, (n) => n.props?.href);
    assert.equal(links.length, 1); // no nested interactive controls
    assert.equal(links[0].props.href, `/appointments/${row.key}?back=%2Fappointments`); // detail links back to this list
    assert.match(links[0].props.className, /after:absolute after:inset-0/); // covers the row: tap anywhere
    assert.match(links[0].props.className, /focus-visible:after:ring-2/); // visible keyboard focus on the row
  }
  // Clicking only navigates; the list page has no status-changing action.
  assert.doesNotMatch(read("features/appointments/components/appointment-list.tsx"), /updateAppointmentStatus|ActionForm/);
});

test("pending detail: student, preferred vs confirmed schedule, approve/decline with unique field ids", async () => {
  client = queryClient({ appointments: [appointment("pending")], clinic_visits: [] });
  const tree = await fresh("../app/(clinic)/appointments/[id]/page.tsx").default({ params: Promise.resolve({ id: appointment("pending").id }) });
  const labels = all(tree, (n) => n.type?.name === "DetailItem").map((d) => d.props.label);
  assert.ok(labels.includes("Preferred schedule") && labels.includes("Confirmed schedule") && labels.includes("Reason"));
  const forms = all(tree, (n) => n.type?.name === "ActionForm");
  assert.deepEqual(forms.map((f) => f.props.submitLabel), ["Approve", "Decline"]);
  assert.equal(forms[1].props.confirm.destructive, true); // decline keeps its confirmation
  const fields = all(tree, (n) => n.type?.name === "TextField" || n.type?.name === "TextAreaField");
  const ids = fields.map((f) => f.props.id ?? f.props.name);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
  const approveSchedule = fields.find((f) => f.props.id === "approve-scheduled_at");
  assert.equal(approveSchedule.props.defaultValue, "2099-01-15T09:00"); // preferred schedule, editable
  assert.equal(approveSchedule.props.type, "datetime-local");
});

test("approved detail: complete, reschedule, and cancel keep confirmations and unique ids", async () => {
  client = queryClient({ appointments: [appointment("approved", { scheduled_at: "2099-01-16T02:30:00.000Z" })], clinic_visits: [] });
  const tree = await fresh("../app/(clinic)/appointments/[id]/page.tsx").default({ params: Promise.resolve({ id: appointment("pending").id }) });
  const forms = all(tree, (n) => n.type?.name === "ActionForm");
  assert.deepEqual(forms.map((f) => f.props.submitLabel), ["Mark completed", "Reschedule", "Cancel appointment"]);
  assert.ok(forms[1].props.confirm && forms[2].props.confirm.destructive);
  const ids = all(tree, (n) => n.type?.name === "TextField" || n.type?.name === "TextAreaField").map((f) => f.props.id ?? f.props.name);
  assert.equal(new Set(ids).size, ids.length);
  const changed = all(tree, (n) => n.type === "span" && n.props?.children === "Different from the preferred schedule");
  assert.equal(changed.length, 1); // 10:30 Manila confirmed vs 09:00 preferred
});

test("approving at a different time stores the confirmed time in Manila and keeps the preferred one", async () => {
  const updates = [];
  client = { from: () => ({ update(row) { updates.push(row); return { eq: () => ({ select: async () => ({ data: [{ id: "a" }], error: null }) }) }; } }) };
  const { updateAppointmentStatus } = fresh("../features/appointments/actions.ts");
  const fd = new FormData();
  fd.set("scheduled_at", "2099-01-16T10:30");
  const id = appointment("pending").id;
  await assert.rejects(updateAppointmentStatus(id, "approve", {}, fd), /REDIRECT:\/appointments\/00000000-0000-4000-8000-0000000000a1\?done=approve$/);
  assert.deepEqual(updates[0], { status: "approved", scheduled_at: "2099-01-16T10:30:00+08:00" }); // explicit offset: no off-by-one day
  assert.ok(!("preferred_date" in updates[0]) && !("preferred_time" in updates[0]));
  // Reschedule still needs a remark; invalid date-times are rejected before the database.
  const noRemark = new FormData(); noRemark.set("scheduled_at", "2099-01-17T08:00");
  assert.ok((await updateAppointmentStatus(id, "reschedule", {}, noRemark)).fieldErrors.staff_remarks);
  const bad = new FormData(); bad.set("scheduled_at", "2099-13-45");
  assert.ok((await updateAppointmentStatus(id, "approve", {}, bad)).fieldErrors.scheduled_at);
  assert.equal(updates.length, 1);
});

test("student suggestions: clinic staff only, checked before any database access, ID + display fields", async () => {
  denied = true;
  client = queryClient({ students: [student] });
  const { suggestStudents } = fresh("../features/students/actions.ts");
  await assert.rejects(suggestStudents("ana"), /denied/);
  assert.equal(client.calls.length, 0);
  denied = false;
  const rows = [student, { ...student, id: "fictional-2", student_number: "FICTION-2", first_name: "Ben", last_name: "Cruz", status: "inactive" }];
  client = queryClient({ students: rows });
  const found = await suggestStudents("ana reyes");
  const { studentName } = require("../lib/format.ts");
  assert.deepEqual(found, [{ id: "fictional-student", student_number: "FICTION-1", name: studentName(student), status: "active", is_demo: true, college: "Fictional College" }]);
  const call = client.calls.find((c) => c.table === "students");
  assert.equal(call.filters.filter(([kind]) => kind === "or").length, 2); // one per word
  assert.equal((await suggestStudents("   ")).length, 0);
});

function combobox(search) {
  let selected = [];
  const h = harness("../features/students/components/student-combobox.tsx", "StudentCombobox", { onSelect: (s) => selected.push(s), search });
  const input = () => find(h.render(), (n) => n.props?.role === "combobox");
  const type = (value) => input().props.onChange({ target: { value } });
  const key = (k) => { let prevented = false; input().props.onKeyDown({ key: k, preventDefault: () => { prevented = true; } }); return prevented; };
  const options = () => all(h.render(), (n) => n.props?.role === "option");
  return { h, input, type, key, options, selected: () => selected };
}
const settle = () => new Promise((r) => setImmediate(r));

test("combobox: 300 ms debounce, one request for fast typing, stale responses ignored", async () => {
  nodeMock.timers.enable({ apis: ["setTimeout"] });
  const calls = [], pending = [];
  const c = combobox((q) => { calls.push(q); return new Promise((resolve) => pending.push({ q, resolve })); });
  try {
    c.type("a"); c.type("an"); c.type("ana");
    nodeMock.timers.tick(299);
    assert.deepEqual(calls, []);
    nodeMock.timers.tick(1);
    assert.deepEqual(calls, ["ana"]);
    c.type("ana r"); nodeMock.timers.tick(300);
    assert.deepEqual(calls, ["ana", "ana r"]);
    pending[1].resolve([{ ...student, name: "Reyes, Ana" }]); await settle();
    pending[0].resolve([{ ...student, id: "stale", name: "Old" }]); await settle(); // older text answers last
    assert.deepEqual(c.options().map((o) => o.key), ["fictional-student"]);
  } finally { c.h.restore(); nodeMock.timers.reset(); }
});

test("combobox: keyboard selection passes the record ID; Enter never auto-picks; Escape closes; empty state", async () => {
  nodeMock.timers.enable({ apis: ["setTimeout"] });
  const two = [{ ...student, name: "Reyes, Ana" }, { ...student, id: "fictional-2", student_number: "FICTION-2", name: "Cruz, Ben" }];
  let answer = two;
  const c = combobox(async () => answer);
  try {
    c.type("a"); nodeMock.timers.tick(300); await settle();
    assert.equal(c.input().props["aria-expanded"], true);
    assert.equal(c.key("Enter"), true); // prevented, and nothing chosen
    assert.deepEqual(c.selected(), []);
    c.key("ArrowDown"); c.key("ArrowDown");
    assert.equal(c.input().props["aria-activedescendant"], "fictional-id-list-1");
    assert.equal(c.options()[1].props["aria-selected"], true);
    c.key("Enter");
    assert.deepEqual(c.selected().map((s) => s.id), ["fictional-2"]); // the ID, not the typed text
    assert.equal(c.input().props.value, "Cruz, Ben (FICTION-2)");
    // Typing again clears the old suggestions immediately.
    c.type("zz");
    assert.equal(c.options().length, 0);
    answer = [];
    nodeMock.timers.tick(300); await settle();
    assert.match(JSON.stringify(all(c.h.render(), (n) => n.type === "p").map((p) => p.props.children)), /No students found/);
    c.key("Escape");
    assert.equal(c.input().props["aria-expanded"], false);
    // Mouse/touch: mousedown keeps focus, click selects.
    answer = two; c.type("b"); nodeMock.timers.tick(300); await settle();
    let kept = false; c.options()[0].props.onMouseDown({ preventDefault: () => { kept = true; } });
    c.options()[0].props.onClick();
    assert.equal(kept, true);
    assert.equal(c.selected().at(-1).id, "fictional-student");
  } finally { c.h.restore(); nodeMock.timers.reset(); }
});

test("picker: selection opens the form for that student ID, keeping extra params; no duplicate search logic", () => {
  const { studentPickerHref } = fresh("../features/students/components/student-combobox.tsx");
  assert.equal(studentPickerHref("/visits/new", { appointment: "fictional-appt", empty: undefined }, "fictional-student"), "/visits/new?appointment=fictional-appt&student=fictional-student");
  const picker = read("features/students/components/student-picker.tsx");
  assert.match(picker, /<StudentPickerField path=\{path\} keep=\{keep\}/);
  assert.doesNotMatch(picker, /searchStudents|method="get"|type="submit"/);
  // The booking page loads the chosen record by ID on the server before showing the form.
  assert.match(read("app/(clinic)/appointments/new/page.tsx"), /getStudent\(studentId\)[\s\S]*hidden=\{\{ student_id: student\.id \}\}/);
});
