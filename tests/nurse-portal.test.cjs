const { test, mock: timers } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock } = require("./register.cjs");
const { harness } = require("./confirmation-harness.cjs");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("clinic personnel sidebar is grouped, without Registrations or Account items", () => {
  const { navForRole } = require("../components/app/nav.ts");
  const sections = navForRole("clinic_staff").map((s) => ({ label: s.label, items: s.items.map((i) => `${i.label} ${i.href}`) }));
  assert.deepEqual(sections, [
    { label: undefined, items: ["Dashboard /dashboard"] },
    { label: "Student Management", items: ["Students /students"] },
    {
      label: "Appointments",
      items: ["All Appointments /appointments", "Pending /appointments/pending", "Scheduled /appointments/scheduled", "History /appointments/history"],
    },
    { label: "Clinic Operations", items: ["Clinic Visits /visits", "Medications /medications", "Health Incidents /incidents"] },
    { label: "Reports & Settings", items: ["Clinic Reports /reports", "Clinic Hours /settings/clinic-hours"] },
  ]);
  const hrefs = navForRole("clinic_staff").flatMap((s) => s.items.map((i) => i.href));
  assert.ok(!hrefs.includes("/account") && !hrefs.includes("/students/registrations"));
  // Admin navigation unchanged (student navigation: tests/student-portal.test.cjs).
  assert.deepEqual(navForRole("admin").map((s) => s.label), [undefined, "User Management", "Clinic Reports"]);
});

test("one account menu for every role at the bottom of the sidebar", () => {
  const shell = read("components/app/clinic-shell.tsx");
  assert.doesNotMatch(shell, /user\.role === "admin" \?/);
  assert.match(shell, /<AccountMenu[\s\S]*accountHref=\{accountHref\}/);
  const menu = read("components/app/account-menu.tsx");
  assert.match(menu, /split\(\/\\s\+\/\)/); // whitespace, not the letter "s"
  assert.doesNotMatch(menu + shell, /\/s\+\//);
});

test("staff layout no longer caps clinic personnel at max-w-6xl", () => {
  assert.doesNotMatch(read("app/(clinic)/layout.tsx"), /max-w-6xl/);
});

test("clinic personnel and administrators share the self-service name form", () => {
  const page = read("app/(clinic)/account/page.tsx");
  assert.match(page, /<DisplayNameForm current=\{user.fullName\}/);
  assert.doesNotMatch(page, /isAdmin \? <DisplayNameForm/);
  assert.match(read("features/account/actions.ts"), /export async function updateDisplayName[\s\S]*?requireRole\("admin", "clinic_staff", "student"\)/);
  assert.equal(require("../lib/auth/display-name.ts").displayName("  ", "clinic_staff"), "Nurse");
});

test("pending filter status reserves the same full row before, during and after loading", async () => {
  const bar = setupBar("scope=real&page=2");
  const status = (tree) => tree.props.children[1];
  try {
    const idle = bar.h.render();
    bar.values.set("scope", "real");
    bar.change("status", "approved", "select");
    const loading = bar.h.render();
    assert.equal(loading.props["data-filter-pending"], "");
    assert.equal(status(idle).props.className, status(loading).props.className);
    assert.match(status(loading).props.className, /h-5 w-full shrink-0/);
    assert.doesNotMatch(status(loading).props.className, /sr-only|absolute|hidden/);
    assert.equal(status(loading).props.role, "status");
    assert.equal(status(loading).props["aria-live"], "polite");
    assert.deepEqual(bar.replaced, ["/students?scope=real&status=approved"]);
    await bar.h.flush();
    assert.equal(status(bar.h.render()).props.className, status(idle).props.className);
  } finally { bar.restore(); }
});

test("filter helpers drop empty values and page, and compare regardless of order", () => {
  const { filterQuery, sameQuery, filterTiming } = require("../components/app/auto-filter-bar.tsx");
  assert.equal(filterQuery([["q", " ana "], ["status", ""], ["view", "today"]]), "q=ana&view=today");
  assert.ok(sameQuery("a=1&b=2", "b=2&a=1"));
  assert.ok(!sameQuery("a=1", "a=2"));
  const ok = { valid: true, badInput: false };
  assert.equal(filterTiming({ tagName: "SELECT", type: "select-one", validity: ok }), "now");
  assert.equal(filterTiming({ tagName: "INPUT", type: "search", validity: ok }), "debounce");
  assert.equal(filterTiming({ tagName: "INPUT", type: "text", validity: ok }), "debounce");
  assert.equal(filterTiming({ tagName: "INPUT", type: "date", validity: ok }), "now");
  assert.equal(filterTiming({ tagName: "INPUT", type: "date", validity: { valid: false, badInput: true } }), "skip");
});

function setupBar(search) {
  const replaced = [];
  mock("next/navigation", {
    useRouter: () => ({ replace: (href) => replaced.push(href) }),
    usePathname: () => "/students",
    useSearchParams: () => new URLSearchParams(search),
  });
  const h = harness("../components/app/auto-filter-bar.tsx", "AutoFilterBar", { children: null });
  const NativeFormData = global.FormData;
  const values = new Map();
  global.FormData = class extends NativeFormData {
    constructor(source) { super(); if (source?.values) for (const [k, v] of source.values) this.append(k, v); }
  };
  const form = { values };
  const ok = { valid: true, badInput: false };
  function change(name, value, type = "search", validity = ok) {
    values.set(name, value);
    const tree = h.render();
    tree.props.ref.current = form;
    tree.props.onChange({ target: { tagName: type === "select" ? "SELECT" : "INPUT", type, validity } });
  }
  return { h, replaced, values, change, restore() { global.FormData = NativeFormData; h.restore(); } };
}

test("search waits 300 ms after the last keystroke and makes one request on page one", () => {
  timers.timers.enable({ apis: ["setTimeout"] });
  const bar = setupBar("q=a&page=3");
  try {
    bar.change("q", "an");
    timers.timers.tick(200);
    bar.change("q", "ana");
    timers.timers.tick(299);
    assert.deepEqual(bar.replaced, []);
    timers.timers.tick(1);
    assert.deepEqual(bar.replaced, ["/students?q=ana"]);
  } finally { bar.restore(); timers.timers.reset(); }
});

test("selects apply at once (cancelling pending search), incomplete dates wait, unchanged filters skip", () => {
  timers.timers.enable({ apis: ["setTimeout"] });
  const bar = setupBar("status=active");
  try {
    bar.values.set("status", "active");
    bar.change("q", "ben");
    bar.change("year", "2", "select");
    assert.deepEqual(bar.replaced, ["/students?status=active&q=ben&year=2"]);
    timers.timers.tick(500);
    assert.equal(bar.replaced.length, 1); // debounced search was cancelled
    bar.change("from", "", "date", { valid: false, badInput: true });
    assert.equal(bar.replaced.length, 1);
    bar.values.delete("q"); bar.values.delete("year"); bar.values.delete("from");
    bar.change("status", "active", "select");
    assert.equal(bar.replaced.length, 1); // same as current URL: no request
  } finally { bar.restore(); timers.timers.reset(); }
});

test("no Apply buttons remain on clinic personnel lists", () => {
  assert.doesNotMatch(read("components/app/list-controls.tsx"), />\s*Apply\s*</);
  assert.doesNotMatch(read("components/app/auto-filter-bar.tsx"), /type="submit"|>\s*Apply\s*</);
  for (const page of ["students", "visits", "appointments", "medications", "incidents", "reports"]) {
    // Appointment lists share one component (features/appointments/components/appointment-list.tsx).
    const source = read(page === "appointments" ? "features/appointments/components/appointment-list.tsx" : `app/(clinic)/${page}/page.tsx`);
    assert.match(source, /<FilterBar>/, page);
    assert.doesNotMatch(source, />\s*Apply\s*</, page);
  }
});
