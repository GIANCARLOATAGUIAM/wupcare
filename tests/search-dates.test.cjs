const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
const { harness, find } = require("./confirmation-harness.cjs");

let client;
mock("@/lib/supabase/server", { createClient: async () => client });
mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-me", fullName: "Nurse", role: "clinic_staff" }) });
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const { ilikeEveryWord, STUDENT_SEARCH_COLUMNS } = require("../lib/forms.ts");

// Fictional records only.
const student = (i, extra) => ({
  id: `fictional-${String(i).padStart(3, "0")}`, student_number: `FICTION-${i}`, first_name: "Ana", middle_name: null, last_name: "Reyes",
  college: "College of Arts", program: "BA Communication", year_level: 1, status: "active", is_demo: true, ...extra,
});
const rows = [
  student(1, { first_name: "Maria", last_name: "Cruz" }),
  student(2, { first_name: "Maria", last_name: "Santos", college: "College of Engineering" }),
  student(3, { program: "BS Nursing", college: "College of Nursing" }),
  student(4, { first_name: "Liam", last_name: "O'Brien", status: "inactive" }),
  student(5, { student_number: "FICTION-2026-77" }),
  ...Array.from({ length: 14 }, (_, i) => student(10 + i, { program: "BS Nursing", college: "College of Nursing" })),
];

async function search(sp) {
  client = queryClient({ students: rows });
  await fresh("../app/(clinic)/students/page.tsx").default({ searchParams: Promise.resolve(sp) });
  return client.calls.find((c) => c.table === "students");
}

test("word search builds one or() per word over number, name, college, and program", () => {
  assert.deepEqual(STUDENT_SEARCH_COLUMNS, ["student_number", "first_name", "middle_name", "last_name", "college", "program"]);
  const filters = ilikeEveryWord(STUDENT_SEARCH_COLUMNS, "  Maria   O'Brien%* ");
  assert.equal(filters.length, 2);
  assert.ok(filters[1].includes('last_name.ilike."%O\'Brien%"'));
  assert.ok(filters.every((f) => !f.includes("*") && f.split(",").length === 6));
  assert.equal(ilikeEveryWord(STUDENT_SEARCH_COLUMNS, "a b c d e f g").length, 5);
  assert.deepEqual(ilikeEveryWord(STUDENT_SEARCH_COLUMNS, "   "), []);
});

test("student list search: full name, college, program, number, partial and case-insensitive", async () => {
  const ids = async (q) => (await search({ q })).result.map((r) => r.id);
  assert.deepEqual(await ids("maria cruz"), ["fictional-001"]);
  assert.deepEqual(await ids("ENGINEER"), ["fictional-002"]);
  assert.deepEqual(await ids("2026-77"), ["fictional-005"]);
  assert.deepEqual(await ids("o'brien"), ["fictional-004"]);
  assert.equal((await ids("nursing")).length, 10); // 15 matches, first page of 10
});

test("search combines with Status/Year/Records filters and keeps 10-per-page server ranges", async () => {
  const call = await search({ q: "nursing", status: "active", year: "1", scope: "demo", page: "2" });
  assert.deepEqual(call.range, [10, 19]);
  assert.equal(call.count, "exact");
  assert.equal(call.result.length, 5);
  assert.ok(call.orders.some(([key]) => key === "id"));
  assert.equal(call.filters.filter(([kind]) => kind === "or").length, 1);
  assert.equal((await search({ q: "liam", status: "active" })).result.length, 0);
});

test("the separate College filter is gone; old ?college bookmarks are ignored", async () => {
  const page = read("app/(clinic)/students/page.tsx");
  assert.doesNotMatch(page, /FilterText|name="college"/);
  assert.match(page, /Search student ID, name, college, or program\.\.\./);
  const call = await search({ college: "Nothing matches" });
  assert.ok(!call.filters.some(([, key]) => key === "college"));
  assert.equal(call.result.length, 10);
});

test("the student picker uses the same combined search, automatically", async () => {
  client = queryClient({ students: rows });
  const results = await fresh("../features/students/queries.ts").searchStudents("maria santos");
  assert.deepEqual(results.map((r) => r.id), ["fictional-002"]);
  // The picker is now an autocomplete over the same search (suggestStudents -> searchStudents).
  assert.match(read("features/students/actions.ts"), /searchStudents\(String\(q \?\? ""\), 8\)/);
  assert.doesNotMatch(read("features/students/components/student-picker.tsx"), /type="submit"|method="get"/);
});

test("DateInput: icon per type, Clear only for optional fields with a value", () => {
  for (const [type, icon] of [["date", "CalendarDays"], ["datetime-local", "CalendarClock"], ["time", "Clock"]]) {
    const h = harness("../components/app/date-input.tsx", "DateInput", { type, name: "d", defaultValue: "2026-10-20" });
    try {
      const tree = h.render();
      assert.equal(tree.props.children[0].type.displayName, icon, type);
      const input = find(tree, (n) => n.props?.type === type);
      assert.equal(input.props.defaultValue, "2026-10-20");
      assert.equal(find(tree, (n) => n.type === "button"), null); // not clearable
    } finally { h.restore(); }
  }
  const h = harness("../components/app/date-input.tsx", "DateInput", { name: "from", defaultValue: "2026-10-20", clearable: true, clearLabel: "Clear from date" });
  try {
    const clear = find(h.render(), (n) => n.type === "button");
    assert.equal(clear.props.type, "button"); // never submits the form
    assert.equal(clear.props["aria-label"], "Clear from date");
  } finally { h.restore(); }
  const empty = harness("../components/app/date-input.tsx", "DateInput", { name: "from", clearable: true });
  try { assert.equal(find(empty.render(), (n) => n.type === "button"), null); } finally { empty.restore(); }
});

test("TextField and FilterDate route every date/time type through DateInput, keeping min/max", () => {
  const { TextField } = fresh("../components/app/fields.tsx");
  const field = (props) => find(TextField({ name: "x", label: "Birth date", ...props }), (n) => n.type?.name === "DateInput" || n.type?.name === "Input");
  const optional = field({ type: "date" });
  assert.equal(optional.type.name, "DateInput");
  assert.equal(optional.props.clearable, true);
  assert.equal(optional.props.clearLabel, "Clear birth date");
  const required = field({ type: "date", required: true, min: "2026-10-20", max: "2026-11-20" });
  assert.equal(required.props.clearable, false);
  assert.deepEqual([required.props.min, required.props.max], ["2026-10-20", "2026-11-20"]);
  assert.equal(field({ type: "datetime-local", required: true }).props.type, "datetime-local");
  assert.equal(field({ type: "time", step: 900 }).props.step, 900);
  assert.equal(field({ type: "number" }).type.name, "Input");
  const { FilterDate } = fresh("../components/app/list-controls.tsx");
  const filter = find(FilterDate({ name: "from", label: "From", defaultValue: "2026-10-01" }), (n) => n.type?.name === "DateInput");
  assert.equal(filter.props.clearable, true);
  // No raw native date inputs remain outside the shared component.
  for (const file of ["components/app/list-controls.tsx", "features/appointments/components/request-form.tsx", "features/medications/components/medicine-form.tsx"]) {
    assert.doesNotMatch(read(file), /<Input[^>]*type="(date|time|datetime-local)"/, file);
  }
});

test("layouts: report tables fill the width, clinic hours uses one card, portal is wider", () => {
  const report = read("features/reports/report-table.tsx");
  assert.doesNotMatch(report, /max-w-(2xl|3xl)|fullWidth/);
  assert.match(report, /hidden print:table-row/); // print keeps every row, not only the current page
  const hours = read("app/(clinic)/settings/clinic-hours/page.tsx");
  assert.match(hours, /section aria-labelledby="hours-heading" className="[^"]*rounded-xl border bg-card/);
  assert.doesNotMatch(hours, /lg:grid-cols-\[16rem_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(read("app/(portal)/layout.tsx"), /max-w-3xl/);
  assert.match(read("features/users/auto-list-filters.tsx"), /<FilterBar/); // one shared automatic filter bar
});
