const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
let client, denied = false;
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", { requireRole: async () => { if (denied) throw new Error("denied"); return { id: "fictional-me", fullName: "Student", role: "student" }; } });
// Appointment routes render the shared async AppointmentList; run it too.
function expand(page) {
  return async (props) => { const el = await page(props); return el?.type?.name === "AppointmentList" ? el.type(el.props) : el; };
}
const modules = [
  ["students", "students"], ["visits", "clinic_visits"], ["appointments", "appointments"], ["incidents", "health_incidents"], ["medications", "medicines"],
].map(([route, table]) => ({ route, table, page: expand(fresh(`../app/(clinic)/${route}/page.tsx`).default) }));
const fixture = (i) => ({
  id: `fictional-${String(i).padStart(4, "0")}`, full_name: "Maria Santos", email: "fictional@example.test", role: "clinic_staff", is_active: true,
  student_number: `FICTION-${i}`, first_name: "Maria", last_name: "Santos", college: "Fictional College", year_level: 1, status: "active", is_demo: true,
  visit_at: "2026-10-10T00:00:00Z", occurred_at: "2026-10-10T00:00:00Z", created_at: "2026-10-10T00:00:00Z", preferred_date: "2026-10-10", preferred_time: "09:00", name: "Fictional Medicine", expiration_date: "2027-10-10", stock_quantity: i, reorder_level: 15,
  students: { student_number: `FICTION-${i}`, first_name: "Maria", last_name: "Santos", is_demo: true },
});
for (const { route, table, page } of modules) {
  for (const total of [0, 1, 10, 11, 25]) test(`${route}: server ranges and unique ordering with ${total} rows`, async () => {
    const rows = Array.from({ length: total }, (_, i) => ({ ...fixture(i), ...(table === "appointments" ? { status: "pending" } : {}) })).reverse();
    const seen = [];
    for (let n = 1; n <= Math.max(1, Math.ceil(total / 10)); n++) {
      client = queryClient({ [table]: rows });
      await page({ searchParams: Promise.resolve({ page: String(n) }) });
      const query = client.calls.find((c) => c.table === table && c.range);
      assert.deepEqual(query.range, [(n - 1) * 10, n * 10 - 1]);
      assert.equal(query.count, "exact");
      assert.ok(query.orders.some(([key]) => key === "id"));
      seen.push(...query.result.map((r) => r.id));
    }
    assert.equal(new Set(seen).size, total);
    assert.equal(seen.length, total);
  });
  test(`${route}: out-of-range page keeps filters and returns to page one`, async () => {
    client = queryClient({ [table]: [] });
    await assert.rejects(page({ searchParams: Promise.resolve({ page: "9", scope: "demo", q: "Maria" }) }), /REDIRECT:.*scope=demo.*q=Maria/);
  });
  test(`${route}: role guard runs before database access`, async () => {
    denied = true;
    client = queryClient({});
    await assert.rejects(page({ searchParams: Promise.resolve({}) }), /denied/);
    assert.equal(client.calls.length, 0);
    denied = false;
  });
}
test("student search and combined filters apply before page ranges", async () => {
  const rows = Array.from({ length: 35 }, (_, i) => ({ ...fixture(i), is_demo: i < 25, college: i === 0 ? "Other" : "Fictional College" }));
  const seen = [];
  for (let page = 1; page <= 3; page++) {
    client = queryClient({ students: rows });
    // College is part of the combined search now (no separate College filter).
    await modules[0].page({ searchParams: Promise.resolve({ page: String(page), q: "Santos Fictional", scope: "demo", status: "active", year: "1" }) });
    seen.push(...client.calls.find((c) => c.table === "students").result.map((r) => r.id));
  }
  assert.equal(seen.length, 24);
  assert.equal(new Set(seen).size, 24);
});
test("low stock is counted across metadata batches with ten full rows per page", async () => {
  client = queryClient({ medicines: Array.from({ length: 525 }, (_, i) => ({ ...fixture(i), stock_quantity: i % 2, reorder_level: 0 })) });
  await modules.find((m) => m.route === "medications").page({ searchParams: Promise.resolve({ flag: "low", scope: "demo", page: "2" }) });
  const full = client.calls.find((c) => c.columns === "*");
  assert.equal(client.calls.filter((c) => c.columns === "id, stock_quantity, reorder_level").length, 3);
  assert.equal(full.result.length, 10);
  assert.ok(full.result.every((r) => r.stock_quantity === 0));
  assert.equal(full.result[0].id, "fictional-0020");
});
test("account lists page personnel and students and preserve page in return links", async () => {
  const { UserList, listReturnQuery } = fresh("../features/users/user-list.tsx");
  for (const kind of ["personnel", "students"]) {
    client = queryClient({ profiles: Array.from({ length: 25 }, (_, i) => ({ ...fixture(i), role: kind === "personnel" ? "clinic_staff" : "student" })) });
    await UserList({ kind, sp: { page: "2", q: "Santos", status: "active" }, meId: "fictional-me" });
    assert.equal(client.calls.find((c) => c.table === "profiles").result.length, 10);
    assert.deepEqual(client.calls.find((c) => c.table === "profiles").range, [10, 19]);
  }
  assert.equal(listReturnQuery({ return: "q=Santos&status=active&page=2&evil=discard" }), "?q=Santos&status=active&page=2");
});
test("student request availability checks pending appointments outside the displayed page", async () => {
  // The dashboard owns the Request action; My Appointments pages the history.
  const page = fresh("../app/(portal)/portal/page.tsx").default;
  client = queryClient({ profiles: [{ id: "fictional-me", student_id: "fictional-student" }], appointments: Array.from({ length: 25 }, (_, i) => ({ ...fixture(i), student_id: "fictional-student", status: i === 0 ? "pending" : "completed" })) });
  const tree = await page();
  const pending = client.calls.find((c) => c.filters.some((f) => f[1] === "status" && f[2] === "pending"));
  assert.equal(pending.result, null); // HEAD count, never fetch all histories.
  const header = tree.props.children.find((node) => node?.props?.title === "Hello, Student!");
  assert.equal(header.props.actions.props.disabled, true);
});
test("medicine transaction history uses ten-row server ranges and full ledger totals", async () => {
  const page = fresh("../app/(clinic)/medications/[id]/page.tsx").default;
  const id = "00000000-0000-4000-8000-000000000001";
  for (const count of [0, 1, 10, 11, 25]) {
    const seen = [];
    for (let n = 1; n <= Math.max(1, Math.ceil(count / 10)); n++) {
      client = queryClient({ medicines: [{ ...fixture(0), id, stock_quantity: count }], medication_transactions: Array.from({ length: count }, (_, i) => ({ ...fixture(i), medicine_id: id, quantity: 1, type: "restock" })) });
      await page({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ page: String(n) }) });
      const history = client.calls.find((c) => c.table === "medication_transactions" && c.count === "exact");
      assert.deepEqual(history.range, [(n - 1) * 10, n * 10 - 1]);
      seen.push(...history.result.map((r) => r.id));
    }
    assert.equal(new Set(seen).size, count);
  }
});
