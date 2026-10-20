const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pageParam, pageRange, pageInfo, pageOutOfRange, hrefWith } = require("../lib/pagination.ts");
const { searchTerm, ilikeAny } = require("../lib/forms.ts");
for (const total of [0, 1, 10, 11, 21, 35]) {
  test(`pagination covers all ${total} records exactly once`, () => {
    const seen = [];
    const { pages } = pageInfo(1, total);
    for (let page = 1; page <= pages; page++) {
      const [from, to] = pageRange(page);
      for (let i = from; i <= to && i < total; i++) seen.push(i);
      assert.equal(pageOutOfRange(page, total, null), false);
      assert.equal(pageInfo(page, total).to, Math.min(to + 1, total));
    }
    assert.deepEqual(seen, Array.from({ length: total }, (_, i) => i));
    assert.equal(pageOutOfRange(pages + 1, total, null), true);
  });
}
test("invalid pages safely start at one", () => {
  for (const page of [undefined, "", "0", "-2", "1.1", "NaN", "Infinity", "1e3", "0x10", "9007199254740992", "214748365"]) assert.equal(pageParam({ page }), 1);
  assert.equal(pageParam({ page: ["3", "9"] }), 3);
  assert.equal(pageOutOfRange(2, null, { code: "PGRST103" }), true);
  assert.equal(pageOutOfRange(2, null, { code: "42501" }), false);
});
test("pagination URLs preserve search, filters, date ranges, and repeated params", () => {
  const sp = { q: "Ma. Cristina", scope: "demo", status: "active", from: "2026-10-01", to: "2026-10-31", tag: ["a", "b"], page: "2" };
  const url = new URL(hrefWith("/visits", sp, { page: "3" }), "https://example.test");
  for (const key of ["q", "scope", "status", "from", "to"]) assert.equal(url.searchParams.get(key), sp[key]);
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(new URL(hrefWith("/visits", sp, { page: undefined, q: "Santos" }), url).searchParams.has("page"), false);
});
test("search normalizes whitespace, removes wildcard operators and escapes quoted names", () => {
  assert.equal(searchTerm(" Maria  Santos%*\\ "), "Maria Santos");
  assert.equal(searchTerm("x".repeat(70)).length, 60);
  assert.equal(ilikeAny(["first_name", "last_name"], 'Ma. "C", O\'Brien'), 'first_name.ilike."%Ma. \\"C\\", O\'Brien%",last_name.ilike."%Ma. \\"C\\", O\'Brien%"');
});
