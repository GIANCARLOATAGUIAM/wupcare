const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
const { collectRows } = require("../lib/collect-rows.ts");
mock("next/link", { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) });

test("complete aggregate collection survives an API cap below requested batch size", async () => {
  const values = Array.from({ length: 1201 }, (_, i) => ({ id: i }));
  const { data, error } = await collectRows((from, to) => Promise.resolve({ data: values.slice(from, Math.min(to + 1, from + 200)), error: null }));
  assert.equal(error, null);
  assert.deepEqual(data, values);
});
test("failed aggregate page never produces a partial total", async () => {
  const result = await collectRows((from) => Promise.resolve(from === 0 ? { data: [{ count: 4 }], error: null } : { data: null, error: "denied" }));
  assert.equal(result.data, null);
  assert.equal(result.error, "denied");
});
test("report loader retrieves all authorized aggregate groups beyond 1000", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({ medicine_id: `fictional-${String(i).padStart(4, "0")}`, medicine_name: `Fictional ${i}`, quantity_issued: 10, stock_quantity: 20, unit: "tablets" }));
  const client = queryClient({ report_medication_usage: rows });
  mock("@/lib/supabase/server", { createClient: async () => client });
  const { loadReport } = fresh("../features/reports/report-data.ts");
  const result = await loadReport("medications", { from: "2026-10-01", to: "2026-10-31", scope: "demo", period: "month" });
  assert.equal(result.failed, false);
  assert.equal(result.rows.length, 1201);
  assert.ok(client.calls.every((c) => c.range && c.orders.some(([key]) => key === "medicine_id")));
});
test("report page two keeps full totals and all rows for print/PDF", () => {
  const { ReportTable } = fresh("../features/reports/report-table.tsx");
  const rows = Array.from({ length: 25 }, (_, i) => ({ label: `Fictional ${i}`, count: i < 5 ? i : 2 }));
  const html = renderToStaticMarkup(React.createElement(ReportTable, { report: "visits", title: "Visits", subtitle: "Demo", rows, header: ["Date", "Visits"], failed: false, sp: { page: "2", scope: "demo" }, path: "/reports" }));
  assert.match(html, />50<\/td>/); // exact total of all 25 groups: 0+1+2+3+4 + 20*2
  for (const n of [0, 1, 2, 3, 4]) assert.match(html, new RegExp(`Fictional ${n}</td><td[^>]*>${n}</td>`)); // exact small counts
  assert.doesNotMatch(html, /&lt;5|<5|\d\+</);
  assert.equal((html.match(/hidden print:table-row/g) ?? []).length, 15);
  assert.equal((html.match(/<td[^>]*>Fictional /g) ?? []).length, 25);
  assert.match(html, /Showing 11–20 of 25 records/);
  assert.match(html, /Page 2 of 3/);
  assert.match(html, /scope=demo/);
});
test("pagination first/last/empty states render disabled controls", () => {
  const { Pagination } = fresh("../components/app/list-controls.tsx");
  for (const [page, total, previous, next] of [[1, 0, true, true], [1, 11, true, false], [2, 11, false, true]]) {
    const html = renderToStaticMarkup(React.createElement(Pagination, { path: "/students", sp: {}, page, total }));
    for (const [label, disabled] of [["Previous page", previous], ["Next page", next]]) {
      assert.equal(new RegExp(`<button[^>]*disabled=""[^>]*aria-label="${label}"`).test(html), disabled);
    }
    if (!total) assert.match(html, /Showing 0–0 of 0 records/);
    assert.match(html, /flex-wrap/);
    assert.match(html, /print:hidden/);
  }
});
test("ledger warning uses all transactions, not the displayed page", async () => {
  const client = queryClient({ medication_transactions: Array.from({ length: 1201 }, (_, i) => ({ id: String(i).padStart(4, "0"), medicine_id: "fictional-medicine", quantity: i === 0 ? 1200 : -1 })) });
  mock("@/lib/supabase/server", { createClient: async () => client });
  const { ledgerTotal } = fresh("../features/medications/ledger-total.ts");
  assert.equal(await ledgerTotal(client, "fictional-medicine"), 0);
  assert.equal(client.calls.length, 4);
});
