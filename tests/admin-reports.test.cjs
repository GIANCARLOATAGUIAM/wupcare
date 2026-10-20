const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { mock, fresh } = require("./register.cjs");
const { adminReportFilters, adminReportHref } = require("../features/reports/admin-month.ts");
const { manilaToday, manilaDayStart } = require("../lib/format.ts");

let url = new URL("https://example.test/reports/visits?month=02&year=2024&scope=demo&page=3");
const navigations = [];
mock("next/navigation", {
  usePathname: () => url.pathname,
  useSearchParams: () => url.searchParams,
  useRouter: () => ({ replace: (href, options) => navigations.push({ href, options }) }),
  redirect: (href) => { throw new Error(`REDIRECT:${href}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
});
mock("next/link", { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) });

test("admin defaults to current Manila month/year and full month, not today", () => {
  const today = manilaToday();
  const result = adminReportFilters({});
  assert.equal(result.month, today.slice(5, 7));
  assert.equal(result.year, today.slice(0, 4));
  assert.equal(result.from, `${today.slice(0, 7)}-01`);
  assert.equal(result.period, "month");
  assert.equal(result.scope, "real");
  assert.equal(adminReportFilters({}, "2026-10-20").to, "2026-10-31");
});

for (const [year, month, last] of [["2024", "02", "29"], ["2025", "02", "28"], ["1900", "02", "28"], ["2000", "02", "29"], ["2026", "04", "30"], ["2026", "12", "31"], ["2027", "01", "31"]]) {
  test(`complete Manila calendar month ${year}-${month}`, () => {
    const filters = adminReportFilters({ month, year });
    assert.equal(filters.from, `${year}-${month}-01`);
    assert.equal(filters.to, `${year}-${month}-${last}`);
    // Manila month starts at 16:00 UTC on the preceding date.
    assert.equal(new Date(manilaDayStart(filters.from)).getUTCHours(), 16);
  });
}

test("invalid month/year/scope fall back safely; old links use their starting month", () => {
  for (const month of ["0", "13", "-1", "1.5", "x"]) assert.equal(adminReportFilters({ month }, "2026-10-20").month, "10");
  for (const year of ["0", "1899", "2101", "2026.5", "x"]) assert.equal(adminReportFilters({ year }, "2026-10-20").year, "2026");
  assert.equal(adminReportFilters({ month: ["2", "4"], year: "2024", scope: "bad" }).from, "2024-02-01");
  assert.equal(adminReportFilters({ scope: "bad" }).scope, "real");
  assert.equal(adminReportFilters({ from: "2024-02-14", to: "2025-01-01" }).to, "2024-02-29");
  assert.equal(adminReportFilters({ from: "2024-02-30" }, "2026-10-20").from, "2026-10-01");
  assert.equal(adminReportFilters({ month: "04", year: "2025", from: "2024-02-14" }).from, "2025-04-01");
});

test("filter URLs preserve Records, remove page and legacy date/day parameters", () => {
  const href = adminReportHref("/reports/visits", { page: "4", from: "2026-01-01", to: "2026-06-01", period: "day", report: "visits" }, { month: "02", year: "2024", scope: "all" });
  assert.equal(href, "/reports/visits?month=02&year=2024&scope=all");
});

let role = "admin";
let active = true;
let calls = [];
const fixture = {
  report_visits: { period: "2024-02-01", visit_count: 1 },
  report_concerns: { category: "Fictional concern", visit_count: 2 },
  report_medication_usage: { medicine_id: "fictional-medicine", medicine_name: "Fictional medicine", quantity_issued: 3, stock_quantity: 20, unit: "tablets" },
  report_incidents: { incident_type: "injury", incident_count: 4 },
  report_appointments: { status: "pending", appointment_count: 2 },
};
mock("@/lib/supabase/env", { isSupabaseConfigured: () => true });
mock("@/lib/supabase/server", { createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "fictional-admin", email: "fictional@example.test" } } }) },
  from(table) {
    // Only the DAL may read the signed-in profile; clinical reads fail here.
    assert.equal(table, "profiles");
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: "fictional-admin", role, is_active: active, full_name: "Fictional Administrator" } }) };
  },
  rpc(name, args) {
    calls.push({ name, args });
    return { order() { return this; }, range(from) { return Promise.resolve({ data: from === 0 ? [fixture[name]] : [], error: null }); } };
  },
}) });
const { loadReport, reportFilters, rangeLabel } = fresh("../features/reports/report-data.ts");
const AdminReportPage = fresh("../app/(clinic)/reports/[report]/page.tsx").default;

for (const scope of ["real", "demo", "all"]) test(`five reports use monthly RPC parameters and ${scope} scope`, async () => {
  calls = [];
  const filters = adminReportFilters({ month: "02", year: "2024", scope });
  for (const report of ["visits", "concerns", "medications", "incidents", "appointments"]) {
    const result = await loadReport(report, filters);
    assert.equal(result.failed, false);
    assert.equal(result.rows.length, 1);
    assert.ok(result.rows[0].count >= 1 && result.rows[0].count <= 4); // exact numeric RPC responses are preserved
  }
  assert.ok(calls.length >= 5);
  for (const { name, args } of calls) {
    assert.equal(args.p_from, "2024-02-01");
    assert.equal(args.p_to, "2024-02-29");
    assert.equal(args.p_scope, scope);
    if (name === "report_visits") assert.equal(args.p_period, "month");
  }
  assert.equal(rangeLabel(filters, true), "February 2024");
});

test("nurse date range, daily grouping and print label remain unchanged", () => {
  const filters = reportFilters({ from: "2024-02-14", to: "2024-02-17", period: "day", scope: "demo" }, false);
  assert.deepEqual(filters, { from: "2024-02-14", to: "2024-02-17", period: "day", scope: "demo" });
  assert.equal(rangeLabel(filters, false), "Feb 14, 2024 – Feb 17, 2024");
});

test("all admin pages keep print and full-width reports", async () => {
  for (const report of ["visits", "concerns", "medications", "incidents", "appointments"]) {
    const tree = await AdminReportPage({ params: Promise.resolve({ report }), searchParams: Promise.resolve({ month: "02", year: "2024", scope: "demo" }) });
    const html = renderToStaticMarkup(tree);
    assert.match(html, /February 2024/);
    assert.match(html, /Print or save as PDF/);
    assert.match(html, /grid w-full min-w-0/);
    assert.match(html, /Individual student medical records are not included/);
    assert.doesNotMatch(html, /counts below 5/);
  }
});

test("actual admin page guard rejects nurse, student and inactive admin before report RPCs", async () => {
  for (const nextRole of ["clinic_staff", "student", "admin"]) {
    role = nextRole;
    active = nextRole !== "admin";
    calls = [];
    await assert.rejects(AdminReportPage({ params: Promise.resolve({ report: "visits" }), searchParams: Promise.resolve({}) }), /REDIRECT:/);
    assert.equal(calls.length, 0);
  }
  role = "admin";
  active = true;
});

test("month/year/Records markup is aligned, responsive and hidden in print, with no Apply", () => {
  const { AutoReportFilters } = fresh("../features/reports/auto-report-filters.tsx");
  const html = renderToStaticMarkup(React.createElement(AutoReportFilters, { initial: { month: "02", year: "2024", scope: "demo" } }, "Report"));
  assert.equal((html.match(/<select/g) ?? []).length, 3);
  for (const label of ["Month", "Year", "Records", "Real only", "Demo only", "All records"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /type="date"|Apply|>From<|>To</);
  assert.equal((html.match(/sm:w-40/g) ?? []).length, 3);
  assert.match(html, /print:hidden/);
});

test("each dropdown updates automatically; rapid changes retain month/year/scope", () => {
  navigations.length = 0;
  url = new URL("https://example.test/reports/visits?month=02&year=2024&scope=demo&page=3&from=2024-01-01&to=2024-02-29&period=day");
  mock("react", { ...React, useEffect: () => {}, useState: (value) => [value, () => {}], useRef: (value) => ({ current: value }), useTransition: () => [false, (run) => run()] });
  try {
    const { AutoReportFilters } = fresh("../features/reports/auto-report-filters.tsx");
    const tree = AutoReportFilters({ initial: { month: "02", year: "2024", scope: "demo" }, children: null });
    const selects = tree.props.children[0].props.children.filter((node) => node?.props?.onChange);
    selects[0].props.onChange("12");
    selects[1].props.onChange("2025");
    selects[2].props.onChange("all");
    assert.equal(navigations.length, 3);
    assert.equal(navigations[0].href, "/reports/visits?month=12&year=2024&scope=demo");
    assert.equal(navigations[2].href, "/reports/visits?month=12&year=2025&scope=all");
    assert.ok(navigations.every((n) => n.options.scroll === false));
  } finally { mock("react", React); }
});

test("Print control still invokes browser print", () => {
  let printed = false;
  global.window = { print: () => { printed = true; } };
  try { fresh("../components/app/print-button.tsx").PrintButton({}).props.onClick(); }
  finally { delete global.window; }
  assert.equal(printed, true);
});

test("admin sidebar keeps month/year/Records across all five reports without keeping a page", () => {
  url = new URL("https://example.test/reports/visits?month=02&year=2024&scope=demo&page=3");
  mock("./brand", { Brand: () => React.createElement("span", null, "WUPCare"), BrandMark: () => React.createElement("span", null, "W") });
  const { ClinicShell } = fresh("../components/app/clinic-shell.tsx");
  const html = renderToStaticMarkup(React.createElement(ClinicShell, { user: { fullName: "Fictional Administrator", email: "fictional@example.test", role: "admin" } }));
  // Server render needs no browser storage and uses the expanded default.
  assert.match(html, /aria-label="Collapse sidebar"/);
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /data-slot="tooltip/);
  for (const report of ["visits", "concerns", "medications", "incidents", "appointments"]) {
    assert.ok(html.includes(`/reports/${report}?month=02&amp;year=2024&amp;scope=demo`));
  }
  assert.doesNotMatch(html, /page=3/);
});
