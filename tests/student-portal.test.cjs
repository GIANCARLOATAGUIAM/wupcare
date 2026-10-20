const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
const { find } = require("./confirmation-harness.cjs");

// Fictional student accounts and appointments only; no live client.
let client, denied = false;
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", { requireRole: async (...roles) => {
  if (denied || !roles.includes("student")) throw new Error("denied");
  return { id: "fictional-me", fullName: "Ana Reyes", email: "ana@example.test", role: "student" };
} });
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const all = (tree, predicate, out = []) => {
  if (!tree || typeof tree !== "object") return out;
  if (Array.isArray(tree)) { for (const n of tree) all(n, predicate, out); return out; }
  if (predicate(tree)) out.push(tree);
  all(tree.props?.children, predicate, out);
  for (const key of ["actions", "action", "header"]) all(tree.props?.[key], predicate, out);
  return out;
};

const FUTURE = "2099-01-15T01:00:00.000Z", PAST = "2020-01-15T01:00:00.000Z";
const STUDENT_COLUMNS = "id, preferred_date, preferred_time, scheduled_at, status, reason, staff_remarks, reschedule_count, created_at";
const appt = (i, status, extra = {}) => ({
  id: `fictional-${String(i).padStart(3, "0")}`, student_id: "student-mine", status, reason: `Reason ${i}`,
  preferred_date: "2099-01-15", preferred_time: "09:00", scheduled_at: null, staff_remarks: null, reschedule_count: 0,
  created_at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, updated_at: "2026-10-01T00:00:00Z", ...extra,
});
const mine = [
  appt(1, "pending"),
  appt(2, "approved", { scheduled_at: FUTURE, staff_remarks: "Bring your ID." }),
  appt(3, "approved", { scheduled_at: "2098-01-15T01:00:00.000Z" }),
  appt(4, "approved", { scheduled_at: PAST }), // not upcoming any more
  appt(5, "completed", { scheduled_at: PAST }),
  appt(6, "cancelled"),
  appt(7, "declined"),
];
// Another student's rows: must never be counted or listed.
const others = [appt(50, "pending", { student_id: "student-other" }), appt(51, "completed", { student_id: "student-other" }), appt(52, "approved", { student_id: "student-other", scheduled_at: "2097-01-01T00:00:00Z" })];
const setup = (rows = [...mine, ...others], studentId = "student-mine") =>
  (client = queryClient({
    profiles: [{ id: "fictional-me", student_id: studentId, requested_student_number: "FICTION-1" }],
    appointments: rows,
    my_academic_profile: academic,
  }));
// Own academic fields as returned by my_academic_profile (0013). Complete by default.
let academic = [{ college_id: "con", program_id: "con-bs-nursing", year_level: 1, college: "College of Nursing", program: "Bachelor of Science in Nursing" }];

test("student navigation: Dashboard, My Appointments, Request Appointment; account via profile card", () => {
  const { navForRole, accountHrefForRole } = fresh("../components/app/nav.ts");
  const items = navForRole("student").flatMap((s) => s.items);
  assert.deepEqual(items.map((i) => [i.label, i.href]), [["Dashboard", "/portal"], ["My Appointments", "/portal/appointments"], ["Request Appointment", "/portal/request"]]);
  assert.equal(items[0].exact, true); // Dashboard is not highlighted on sub-pages
  assert.ok(items.every((i) => i.href.startsWith("/portal")));
  assert.equal(accountHrefForRole("student"), "/portal/account");
  assert.equal(accountHrefForRole("clinic_staff"), "/account");
  const layout = read("app/(portal)/layout.tsx");
  assert.match(layout, /requireRole\("student"\)/);
  assert.match(layout, /<ClinicShell/); // same shell: desktop sidebar, mobile drawer, confirmed Sign out
  assert.match(read("components/app/clinic-shell.tsx"), /<AccountMenu/);
});

test("dashboard counts only this student's pending, upcoming, and completed appointments", async () => {
  setup();
  const tree = await fresh("../app/(portal)/portal/page.tsx").default();
  const cards = Object.fromEntries(all(tree, (n) => n.type?.name === "SummaryCard").map((c) => [c.props.label, c.props.value]));
  assert.deepEqual(cards, { Pending: 1, Upcoming: 2, Completed: 1 });
  // Approved Appointments: every approved row of this student, earliest first,
  // including the overdue one; never another student's 2097 row.
  const approved = all(tree, (n) => n.type?.name === "StudentAppointmentCard").map((c) => [c.props.appointment.id, c.props.overdue]);
  assert.deepEqual(approved, [["fictional-004", true], ["fictional-003", false], ["fictional-002", false]]);
  const appointmentCalls = client.calls.filter((c) => c.table === "appointments");
  assert.ok(appointmentCalls.length >= 4);
  assert.ok(appointmentCalls.every((c) => c.filters.some(([kind, key, value]) => kind === "eq" && key === "student_id" && value === "student-mine")));
  assert.equal(all(tree, (n) => n.props?.title === "You already have a pending request")[0]?.props.disabled, true); // one pending rule
  assert.match(JSON.stringify(find(tree, (n) => n.type?.name === "PageHeader").props.title), /Hello, Ana!/);
});

test("dashboard with no upcoming appointment shows a Request Appointment empty state", async () => {
  setup([appt(5, "completed", { scheduled_at: PAST })]);
  const tree = await fresh("../app/(portal)/portal/page.tsx").default();
  const empty = find(tree, (n) => n.type?.name === "EmptyState");
  assert.equal(empty.props.title, "No approved appointments");
  assert.equal(find(empty.props.action, (n) => n.props?.href === "/portal/request")?.props.href, "/portal/request");
});

test("unlinked accounts see the verification notice and no appointment queries run", async () => {
  for (const file of ["../app/(portal)/portal/page.tsx", "../app/(portal)/portal/appointments/page.tsx"]) {
    setup(mine, null);
    const tree = await fresh(file).default({ searchParams: Promise.resolve({}) });
    assert.ok(find(tree, (n) => n.type?.name === "WaitingForVerification"), file);
    assert.equal(client.calls.filter((c) => c.table === "appointments").length, 0, file);
  }
});

test("status tabs filter, order stably, and stay scoped to the student", async () => {
  const page = fresh("../app/(portal)/portal/appointments/page.tsx").default;
  const expected = {
    all: ["fictional-007", "fictional-006", "fictional-005", "fictional-004", "fictional-003", "fictional-002", "fictional-001"],
    pending: ["fictional-001"],
    upcoming: ["fictional-003", "fictional-002"],
    completed: ["fictional-005"],
    closed: ["fictional-006", "fictional-007"],
  };
  for (const [status, ids] of Object.entries(expected)) {
    setup();
    const tree = await page({ searchParams: Promise.resolve(status === "all" ? {} : { status }) });
    const call = client.calls.find((c) => c.table === "appointments");
    assert.deepEqual(call.result.map((r) => r.id), ids, status);
    assert.ok(call.orders.some(([key]) => key === "id"), status);
    assert.ok(call.filters.some(([kind, key, value]) => kind === "eq" && key === "student_id" && value === "student-mine"), status);
    assert.equal(find(tree, (n) => n.props?.label === "Appointment status").props.active, status);
  }
  setup();
  await page({ searchParams: Promise.resolve({ status: "nonsense" }) });
  assert.equal(client.calls.find((c) => c.table === "appointments").result.length, 7); // unknown tab: All
});

test("My Appointments keeps 10-per-page server pagination and safe out-of-range handling", async () => {
  const page = fresh("../app/(portal)/portal/appointments/page.tsx").default;
  const many = Array.from({ length: 23 }, (_, i) => appt(100 + i, "completed", { scheduled_at: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
  const seen = [];
  for (const n of [1, 2, 3]) {
    setup([...many, ...others]);
    await page({ searchParams: Promise.resolve({ status: "completed", page: String(n) }) });
    const call = client.calls.find((c) => c.table === "appointments");
    assert.deepEqual(call.range, [(n - 1) * 10, n * 10 - 1]);
    assert.equal(call.count, "exact");
    seen.push(...call.result.map((r) => r.id));
  }
  assert.equal(new Set(seen).size, 23);
  setup([...many]);
  await assert.rejects(page({ searchParams: Promise.resolve({ status: "completed", page: "9" }) }), /REDIRECT:\/portal\/appointments\?status=completed/);
});

test("only pending cards offer Cancel Request, behind the shared confirmation", () => {
  const { StudentAppointmentCard, CANCEL_REQUEST_CONFIRMATION } = fresh("../features/appointments/components/student-appointment-card.tsx");
  const form = (status) => find(StudentAppointmentCard({ appointment: appt(1, status, { scheduled_at: status === "approved" ? FUTURE : null }) }), (n) => n.type?.name === "ActionForm");
  const cancel = form("pending");
  assert.deepEqual(cancel.props.confirm, CANCEL_REQUEST_CONFIRMATION);
  assert.equal(cancel.props.confirm.destructive, true);
  assert.equal(cancel.props.confirm.cancelLabel, "Keep Request");
  for (const status of ["approved", "completed", "cancelled", "declined"]) assert.equal(form(status), null, status);
  const approved = StudentAppointmentCard({ appointment: appt(2, "approved", { scheduled_at: FUTURE, staff_remarks: "Bring your ID." }) });
  assert.match(JSON.stringify(approved), /Clinic remarks: .*Bring your ID\./);
});

test("portal pages check the student role before any database access", async () => {
  for (const file of ["../app/(portal)/portal/page.tsx", "../app/(portal)/portal/appointments/page.tsx", "../app/(portal)/portal/account/page.tsx"]) {
    denied = true;
    setup();
    await assert.rejects(fresh(file).default({ searchParams: Promise.resolve({}) }), /denied/, file);
    assert.equal(client.calls.length, 0, file);
    denied = false;
  }
});

test("student account shows profile details and password change, with no editing of records", async () => {
  setup();
  const tree = await fresh("../app/(portal)/portal/account/page.tsx").default();
  const labels = all(tree, (n) => n.type?.name === "DetailItem").map((d) => d.props.label);
  assert.deepEqual(labels, ["Email", "Student ID (as registered)", "Record status"]);
  assert.ok(find(tree, (n) => n.type?.name === "PasswordForm"));
  assert.ok(find(tree, (n) => n.type?.name === "DisplayNameForm"));
  assert.equal(find(tree, (n) => n.type === "form"), null); // no record editing form
  assert.deepEqual(client.calls.map((c) => c.table), ["profiles", "my_academic_profile"]);
  assert.ok(find(tree, (n) => n.type?.name === "AcademicProfileForm"));
});

test("cards: reason is the title, status at the right, no repeated date heading", () => {
  const { StudentAppointmentCard } = fresh("../features/appointments/components/student-appointment-card.tsx");
  const card = StudentAppointmentCard({ appointment: appt(1, "pending", { reason: "Recurring headache" }) });
  const [heading, badges] = card.props.children[0].props.children;
  assert.equal(heading.type, "h3");
  assert.equal(heading.props.children, "Recurring headache");
  assert.equal(badges.props.children[0].type.name, "AppointmentStatusBadge");
  assert.equal(badges.props.children[1], null); // no Overdue label unless asked
  const text = JSON.stringify(card);
  assert.match(text, /Preferred schedule/);
  assert.doesNotMatch(text, /Clinic schedule|You requested/);
  assert.match(text, /Requested on /);
});

test("cards: confirmed schedule is prominent; the preferred one appears only when it differs", () => {
  const { StudentAppointmentCard, scheduleChanged } = fresh("../features/appointments/components/student-appointment-card.tsx");
  // 2099-01-15 09:00 Manila = 01:00 UTC; the fixture prefers 2099-01-15 09:00.
  const same = appt(2, "approved", { scheduled_at: "2099-01-15T01:00:00.000Z" });
  const moved = appt(3, "completed", { scheduled_at: "2099-01-16T02:30:00.000Z", staff_remarks: "Moved to the next morning." });
  assert.equal(scheduleChanged(same), false);
  assert.equal(scheduleChanged(moved), true);
  const sameText = JSON.stringify(StudentAppointmentCard({ appointment: same }));
  assert.match(sameText, /Clinic schedule/);
  assert.doesNotMatch(sameText, /You requested|Preferred schedule/);
  const movedCard = StudentAppointmentCard({ appointment: moved });
  const labels = all(movedCard, (n) => n.type === "dt").map((n) => n.props.children);
  assert.deepEqual(labels, ["Clinic schedule", "You requested"]);
  const prominent = all(movedCard, (n) => n.type === "dd")[0];
  assert.match(prominent.props.className, /font-semibold/);
  assert.match(JSON.stringify(movedCard), /Clinic remarks: .*Moved to the next morning\./);
  // Cancelled/declined never show a clinic schedule.
  const declined = JSON.stringify(StudentAppointmentCard({ appointment: appt(4, "declined", { scheduled_at: FUTURE }) }));
  assert.match(declined, /Preferred schedule/);
  assert.doesNotMatch(declined, /Clinic schedule/);
});

test("status wording: students see Not Approved vs Cancelled; the clinic keeps its labels", () => {
  const { appointmentStatusLabel } = fresh("../components/app/badges.tsx");
  const { StudentAppointmentCard } = fresh("../features/appointments/components/student-appointment-card.tsx");
  const { STUDENT_TAB_LABELS } = fresh("../features/appointments/student-portal.ts");
  const statuses = ["pending", "approved", "completed", "declined", "cancelled"];
  assert.deepEqual(statuses.map((s) => appointmentStatusLabel(s, "student")), ["Pending Approval", "Approved", "Completed", "Not Approved", "Cancelled"]);
  assert.deepEqual(statuses.map((s) => appointmentStatusLabel(s)), ["Pending", "Approved", "Completed", "Declined", "Cancelled"]);
  assert.equal(STUDENT_TAB_LABELS.pending, "Pending Approval");
  assert.equal(STUDENT_TAB_LABELS.closed, "Cancelled / Not Approved");

  const card = (status, extra) => StudentAppointmentCard({ appointment: appt(1, status, extra) });
  const declined = card("declined", { staff_remarks: "Clinic closed that day." });
  assert.equal(find(declined, (n) => n.type?.name === "AppointmentStatusBadge").props.audience, "student");
  const declinedText = JSON.stringify(declined);
  assert.match(declinedText, /The clinic did not approve this request/);
  assert.match(declinedText, /Reason from the clinic: .*Clinic closed that day\./);
  assert.doesNotMatch(declinedText, /will no longer proceed|Clinic remarks/);

  const cancelledText = JSON.stringify(card("cancelled"));
  assert.match(cancelledText, /cancelled and will no longer proceed/);
  assert.doesNotMatch(cancelledText, /did not approve|Reason from the clinic/);

  for (const status of ["pending", "approved", "completed"]) {
    assert.doesNotMatch(JSON.stringify(card(status, { scheduled_at: status === "pending" ? null : FUTURE })), /did not approve|will no longer proceed/, status);
  }
});

test("dashboard Approved Appointments: all approved by status (nurse-booked, overdue), nothing else, no limit", async () => {
  const nurseBooked = (i, extra) => appt(i, "approved", { requested_by: "fictional-nurse", ...extra });
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => nurseBooked(100 + i, { scheduled_at: `2099-02-${String(10 - i).padStart(2, "0")}T01:00:00.000Z`, staff_remarks: i === 0 ? "Bring your ID." : null })),
    nurseBooked(120, { scheduled_at: PAST }),
    appt(121, "pending"), appt(122, "completed", { scheduled_at: PAST }), appt(123, "declined", { staff_remarks: "Full" }), appt(124, "cancelled"),
    appt(130, "approved", { student_id: "student-other", scheduled_at: FUTURE }),
  ];
  setup(rows);
  const tree = await fresh("../app/(portal)/portal/page.tsx").default();
  const cards = all(tree, (n) => n.type?.name === "StudentAppointmentCard");
  assert.equal(cards.length, 8); // no arbitrary cap
  assert.ok(cards.every((c) => c.props.appointment.status === "approved" && c.props.appointment.student_id !== "student-other"));
  assert.equal(cards[0].props.appointment.id, "fictional-120"); // overdue first (earliest), still shown
  assert.equal(cards[0].props.overdue, true);
  assert.ok(cards.slice(1).every((c) => c.props.overdue === false));
  const times = cards.map((c) => c.props.appointment.scheduled_at);
  assert.deepEqual(times, [...times].sort());
  const query = client.calls.find((c) => c.table === "appointments" && c.columns === STUDENT_COLUMNS && c.filters.some((f) => f[1] === "status" && f[2] === "approved"));
  assert.ok(query.filters.some(([k, key, v]) => k === "eq" && key === "student_id" && v === "student-mine"));
  assert.equal(query.filters.some((f) => f[1] === "scheduled_at"), false); // status, not a date window
  const heading = find(tree, (n) => n.props?.id === "approved-heading");
  assert.match(JSON.stringify(heading), /Approved Appointments/);
  const { Pending, Upcoming, Completed } = Object.fromEntries(all(tree, (n) => n.type?.name === "SummaryCard").map((c) => [c.props.label, c.props.value]));
  assert.deepEqual([Pending, Upcoming, Completed], [1, 7, 1]); // summary cards unchanged in meaning

  // Card content for an approved, overdue appointment.
  const { StudentAppointmentCard } = fresh("../features/appointments/components/student-appointment-card.tsx");
  const card = JSON.stringify(StudentAppointmentCard({ appointment: nurseBooked(140, { scheduled_at: PAST, staff_remarks: "Bring your ID." }), overdue: true }));
  for (const text of ["Reason 140", "Clinic schedule", "Overdue", "This time has passed", "Clinic remarks: ", "Bring your ID."]) assert.ok(card.includes(text), text);
});

test("My Appointments still lists every status (dashboard change does not touch history)", async () => {
  setup();
  const tree = await fresh("../app/(portal)/portal/appointments/page.tsx").default({ searchParams: Promise.resolve({}) });
  const statuses = all(tree, (n) => n.type?.name === "StudentAppointmentCard").map((c) => c.props.appointment.status).sort();
  assert.deepEqual(statuses, ["approved", "approved", "approved", "cancelled", "completed", "declined", "pending"]);
  assert.ok(all(tree, (n) => n.type?.name === "StudentAppointmentCard").every((c) => c.props.overdue === undefined));
});
