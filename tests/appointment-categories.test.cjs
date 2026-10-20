const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");

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
const rowKeys = (tree) => all(tree, (n) => n.type?.name === "TableRow" && n.key?.startsWith("fictional-")).map((r) => r.key);

const student = { id: "fictional-student", student_number: "FICTION-1", first_name: "Ana", middle_name: null, last_name: "Reyes", is_demo: true };
const ID = "00000000-0000-4000-8000-0000000000a1";
const appointment = (status, extra = {}) => ({
  id: ID, student_id: student.id, status, reason: "Recurring headache", preferred_date: "2099-01-15", preferred_time: "09:00:00",
  scheduled_at: null, staff_remarks: null, reschedule_count: 0, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01",
  students: student, requester: { full_name: "Ana Reyes", role: "student" }, handler: null, ...extra,
});
const mixed = () => [
  appointment("pending", { id: "fictional-pending" }),
  appointment("approved", { id: "fictional-overdue", scheduled_at: "2020-01-01T01:00:00.000Z" }),
  appointment("approved", { id: "fictional-upcoming", scheduled_at: "2099-01-16T02:30:00.000Z" }),
  appointment("completed", { id: "fictional-completed", staff_remarks: "Seen", updated_at: "2026-10-03" }),
  appointment("declined", { id: "fictional-declined", staff_remarks: "Full", updated_at: "2026-10-02" }),
  appointment("cancelled", { id: "fictional-cancelled", updated_at: "2026-10-01" }),
];
const list = async (route, sp) => {
  client = queryClient({ appointments: mixed() });
  const tree = await renderList(route, sp);
  return { tree, ids: rowKeys(tree) };
};

test("categories: All, Pending, Scheduled (past approved stay, as overdue), and History use existing statuses", async () => {
  assert.equal((await list("appointments")).ids.length, 6);
  assert.deepEqual((await list("appointments/pending")).ids, ["fictional-pending"]);
  const scheduled = await list("appointments/scheduled");
  assert.deepEqual(scheduled.ids, ["fictional-overdue", "fictional-upcoming"]); // earliest first; nothing hidden
  assert.equal(all(scheduled.tree, (n) => n.type?.name === "Badge" && n.props.children === "Overdue").length, 1);
  assert.deepEqual((await list("appointments/scheduled", { when: "overdue" })).ids, ["fictional-overdue"]);
  assert.deepEqual((await list("appointments/scheduled", { when: "upcoming" })).ids, ["fictional-upcoming"]);
  assert.deepEqual((await list("appointments/history")).ids, ["fictional-completed", "fictional-declined", "fictional-cancelled"]);
  assert.deepEqual((await list("appointments/history", { status: "declined" })).ids, ["fictional-declined"]);
  assert.equal((await list("appointments/history", { status: "approved" })).ids.length, 3); // only history outcomes
  // Today: approved within today's Manila day only.
  const { manilaToday } = require("../lib/format.ts");
  client = queryClient({ appointments: [
    appointment("approved", { id: "fictional-today", scheduled_at: `${manilaToday()}T10:00:00+08:00` }),
    appointment("approved", { id: "fictional-later", scheduled_at: "2099-01-01T10:00:00+08:00" }),
  ] });
  assert.deepEqual(rowKeys(await renderList("appointments/scheduled", { when: "today" })), ["fictional-today"]);
});

test("lists: every-word search, 10 per page, automatic filters, tabs keep shared filters only", async () => {
  const many = Array.from({ length: 12 }, (_, i) => appointment("approved", { id: `fictional-${String(i).padStart(2, "0")}`, scheduled_at: `2099-02-${String(i + 1).padStart(2, "0")}T01:00:00.000Z` }));
  const ben = appointment("approved", { id: "fictional-ben", scheduled_at: "2099-03-01T01:00:00.000Z", students: { ...student, first_name: "Ben" } });
  client = queryClient({ appointments: [...many, ben] });
  const tree = await renderList("appointments/scheduled", { q: "ana reyes", when: "upcoming", page: "2" });
  const call = client.calls.find((c) => c.table === "appointments");
  assert.deepEqual(call.range, [10, 19]);
  assert.equal(call.filters.filter(([kind, , options]) => kind === "or" && options?.referencedTable === "students").length, 2); // one per word
  assert.equal(call.result.length, 2); // 12 "Ana Reyes" matches, page 2; Ben excluded
  const tabs = all(tree, (n) => n.type?.name === "LinkTabs")[0].props.tabs;
  assert.deepEqual(tabs.map((t) => t.label), ["All", "Pending", "Scheduled", "History"]);
  assert.equal(tabs.find((t) => t.key === "history").href, "/appointments/history?q=ana+reyes");
  const bar = all(tree, (n) => n.type?.name === "AutoFilterBar")[0];
  assert.ok(bar, "automatic filter bar (no Apply button)");
  assert.deepEqual(all(bar, (n) => n.type?.name === "FilterSelect").map((s) => s.props.name), ["when", "scope"]);
  assert.equal(all(bar, (n) => n.type?.name === "FilterDate").length, 1);
  // Rows link back to this exact list, filters and page included.
  const link = all(tree, (n) => n.props?.href?.startsWith("/appointments/fictional-"))[0];
  assert.equal(new URL(link.props.href, "http://x").searchParams.get("back"), "/appointments/scheduled?q=ana+reyes&when=upcoming&page=2");
  client = queryClient({ appointments: [] });
  await assert.rejects(renderList("appointments/history", { page: "9", status: "completed" }), /REDIRECT:\/appointments\/history\?status=completed$/);
});

test("old ?view= links redirect to the matching category, keeping filters", async () => {
  const page = fresh("../app/(clinic)/appointments/page.tsx").default;
  const go = (sp) => page({ searchParams: Promise.resolve(sp) });
  await assert.rejects(go({ view: "pending", q: "ana", page: "3" }), /REDIRECT:\/appointments\/pending\?q=ana$/);
  await assert.rejects(go({ view: "today" }), /REDIRECT:\/appointments\/scheduled\?when=today$/);
  await assert.rejects(go({ view: "approved" }), /REDIRECT:\/appointments\/scheduled$/);
  await assert.rejects(go({ view: "cancelled" }), /REDIRECT:\/appointments\/history\?status=cancelled$/);
  await assert.rejects(go({ view: "bogus" }), /REDIRECT:\/appointments$/);
  const dashboard = read("app/(clinic)/dashboard/page.tsx");
  assert.match(dashboard, /href="\/appointments\/pending"/);
  assert.doesNotMatch(dashboard, /\?view=/);
});

test("lifecycle: each action lands in the right category; back link survives; bad input never reaches the database", async () => {
  const { categoryForStatus, doneMessage, safeBackHref } = require("../features/appointments/categories.ts");
  // Pending -> Approved -> Scheduled; Approved -> Completed/Cancelled -> History; Pending -> Declined -> History.
  const outcomes = { approve: "approved", reschedule: "approved", complete: "completed", decline: "declined", cancel: "cancelled" };
  for (const [intent, status] of Object.entries(outcomes)) assert.equal(doneMessage(intent).category, categoryForStatus(status), intent);
  assert.deepEqual(["approved", "completed", "declined", "cancelled"].map(categoryForStatus), ["scheduled", "history", "history", "history"]);
  assert.equal(categoryForStatus("pending"), "pending");
  assert.equal(doneMessage("__proto__"), undefined);
  // Back links: only the appointment lists, never another site or page.
  assert.equal(safeBackHref("/appointments/scheduled?when=overdue&page=2"), "/appointments/scheduled?when=overdue&page=2");
  for (const bad of ["//evil.example", "https://evil.example", "/students", "/appointments/../admin", "/appointments?x=<script>", 7]) assert.equal(safeBackHref(bad), undefined, String(bad));

  const updates = [];
  client = { from: () => ({ update(row) { updates.push(row); return { eq: () => ({ select: async () => ({ data: [{ id: ID }], error: null }) }) }; } }) };
  const { updateAppointmentStatus } = fresh("../features/appointments/actions.ts");
  const withBack = (back) => { const fd = new FormData(); fd.set("back", back); return fd; };
  await assert.rejects(updateAppointmentStatus(ID, "complete", {}, withBack("/appointments/scheduled?when=today")), /REDIRECT:\/appointments\/[0-9a-f-]+\?done=complete&back=%2Fappointments%2Fscheduled%3Fwhen%3Dtoday$/);
  await assert.rejects(updateAppointmentStatus(ID, "cancel", {}, withBack("https://evil.example")), /\?done=cancel$/);
  const decline = withBack("/appointments/pending"); decline.set("staff_remarks", "Clinic closed");
  await assert.rejects(updateAppointmentStatus(ID, "decline", {}, decline), /done=decline&back=%2Fappointments%2Fpending$/);
  assert.deepEqual(updates, [{ status: "completed" }, { status: "cancelled" }, { status: "declined", staff_remarks: "Clinic closed" }]);
  assert.match((await updateAppointmentStatus("not-a-uuid", "complete", {}, new FormData())).error, /not found/);
  assert.equal(updates.length, 3);
  // A transition the database rejects stays on the page with the error; no redirect.
  client = { from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: null, error: { code: "22023", message: "An appointment cannot go from completed to cancelled." } }) }) }) }) };
  const rejected = await fresh("../features/appointments/actions.ts").updateAppointmentStatus(ID, "cancel", {}, new FormData());
  assert.ok(rejected.error);
  // Only clinic personnel can change a status, checked before any database work.
  denied = true;
  client = queryClient({});
  await assert.rejects(fresh("../features/appointments/actions.ts").updateAppointmentStatus(ID, "approve", {}, new FormData()), /denied/);
  assert.equal(client.calls.length, 0);
  denied = false;
});

test("detail page: outcome banner names the list now holding the record; Back keeps the list filters", async () => {
  const detail = async (a, sp) => {
    client = queryClient({ appointments: [a], clinic_visits: [] });
    return fresh("../app/(clinic)/appointments/[id]/page.tsx").default({ params: Promise.resolve({ id: a.id }), searchParams: Promise.resolve(sp) });
  };
  const approved = await detail(appointment("approved", { scheduled_at: "2099-01-16T02:30:00.000Z" }), { done: "approve", back: "/appointments/pending?q=ana" });
  const banner = all(approved, (n) => n.type?.name === "Alert")[0];
  assert.equal(banner.props.role, "status");
  assert.ok(all(banner, (n) => n.props?.children === "Appointment approved.").length);
  assert.ok(all(banner, (n) => n.props?.href === "/appointments/scheduled").length);
  const backLink = all(approved, (n) => n.props?.href === "/appointments/pending?q=ana")[0];
  assert.match(JSON.stringify(backLink.props.children), /Pending Requests/);
  // Every action form returns to the same list.
  const hidden = all(approved, (n) => n.type === "input" && n.props.name === "back");
  assert.equal(hidden.length, 3);
  assert.ok(hidden.every((h) => h.props.value === "/appointments/pending?q=ana"));
  // A stale or forged outcome is not shown; an unsafe back falls back to the record's list.
  const completed = await detail(appointment("completed", { scheduled_at: "2020-01-01T01:00:00.000Z", staff_remarks: "Seen today" }), { done: "approve", back: "//evil.example" });
  assert.equal(all(completed, (n) => n.type?.name === "Alert").length, 0);
  assert.ok(all(completed, (n) => n.props?.href === "/appointments/history").length >= 2); // Back + "Listed in"
  assert.equal(all(completed, (n) => n.type?.name === "ActionForm").length, 0); // no further status changes
  assert.equal(all(completed, (n) => n.type?.name === "DetailItem" && n.props.label === "Clinic remarks")[0].props.children, "Seen today");
  // Past approved: still actionable, flagged overdue.
  const overdue = await detail(appointment("approved", { scheduled_at: "2020-01-01T01:00:00.000Z" }), {});
  assert.equal(all(overdue, (n) => n.type?.name === "Badge" && n.props.children === "Overdue").length, 1);
  assert.deepEqual(all(overdue, (n) => n.type?.name === "ActionForm").map((f) => f.props.submitLabel), ["Mark completed", "Reschedule", "Cancel appointment"]);
});

test("sidebar: Appointments is one collapsible group; the collapsed rail still shows its icons", () => {
  const { navForRole } = require("../components/app/nav.ts");
  const group = navForRole("clinic_staff").find((s) => s.label === "Appointments");
  assert.equal(group.collapsible, true);
  assert.equal(group.items.find((i) => i.countKey === "pendingAppointments").href, "/appointments/pending");
  assert.equal(navForRole("clinic_staff").flatMap((s) => s.items).filter((i) => i.href.startsWith("/appointments")).length, 4); // no duplicate entries
  for (const role of ["admin", "student"]) assert.ok(!navForRole(role).some((s) => s.collapsible), role);
  const shell = read("components/app/clinic-shell.tsx");
  assert.match(shell, /aria-expanded=\{open\}/);
  assert.match(shell, /<span id=\{id\} className="min-w-0 truncate whitespace-nowrap">/); // group label stays on one line
  assert.deepEqual(group.items.map((i) => i.label), ["All Appointments", "Pending", "Scheduled", "History"]);
  assert.match(shell, /aria-controls=\{`\$\{id\}-items`\}/);
  assert.match(shell, /focus-visible:outline-sidebar-ring rail-collapsed:hidden/); // toggle hidden on the icon rail
  assert.match(shell, /!open && "hidden rail-collapsed:grid"/); // items always visible on the rail
});
