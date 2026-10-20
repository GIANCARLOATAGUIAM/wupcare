const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock } = require("./register.cjs");
const { harness, find } = require("./confirmation-harness.cjs");

// Class-contract regressions for the mobile layout. Real rendering at each
// width is a browser check (docs/DEVLOG.md); these keep the decisions from
// silently reverting.
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

mock("@/features/auth/actions", { confirmedLogout: async () => ({ error: "fictional" }) });
mock("next/navigation", { unstable_rethrow() {} });

test("Sign Out: the shell renders the one confirmation alone, outside the menu and drawer", () => {
  let closed = 0;
  const focusRef = { current: null };
  const dialog = harness("../components/app/logout-button.tsx", "LogoutButton", { dialogOnly: { onClose: () => closed++, returnFocusRef: focusRef } });
  try {
    const tree = dialog.render();
    assert.equal(find(tree, (n) => n.type?.name === "Button"), null); // dialog only, no second trigger
    const confirmation = find(tree, (n) => n.type?.name === "ConfirmationDialog");
    assert.equal(confirmation.props.confirmation.title, "Log out of WUPCare?");
    assert.equal(confirmation.props.returnFocusRef, focusRef); // focus goes back to the menu button
    confirmation.props.onCancel();
    assert.equal(closed, 1);
  } finally { dialog.restore(); }

  const shell = read("components/app/clinic-shell.tsx");
  assert.match(shell, /setOpen\(false\);\s*setLoggingOut\("mobile"\);/); // close drawer, then confirm
  assert.match(shell, /onLogout=\{\(\) => setLoggingOut\("desktop"\)\}/);
  assert.match(shell, /returnFocusRef: loggingOut === "mobile" \? menuRef : profileRef/);
  assert.equal(shell.match(/<LogoutButton/g).length, 1); // one logout implementation
});

test("dashboards use container-width grids with two metric columns on phones", () => {
  const staff = read("app/(clinic)/dashboard/page.tsx");
  assert.match(staff, /@container grid gap-3[\s\S]*grid grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-3 @4xl:grid-cols-6/);
  assert.match(staff, /grid-cols-2 gap-2 sm:gap-3 @lg:grid-cols-3 @4xl:grid-cols-5/);
  assert.doesNotMatch(staff, /(?<![@\w])(md:grid-cols-4|xl:grid-cols-6)/); // device breakpoints replaced
  const student = read("app/(portal)/portal/page.tsx");
  assert.match(student, /grid grid-cols-3 gap-2 sm:gap-3/); // never a single tall stack
  assert.match(student, /<span className="sr-only"> appointments<\/span>/); // short labels keep full meaning
});

test("touch devices get larger controls; mouse sizes are unchanged", () => {
  const button = read("components/ui/button.tsx");
  assert.match(button, /"h-8 gap-1\.5 px-2\.5 pointer-coarse:h-10/);
  assert.match(button, /icon: "size-8 pointer-coarse:size-10"/);
  assert.match(read("components/ui/input.tsx"), /"h-8 pointer-coarse:h-10 /);
  assert.match(read("components/ui/native-select.tsx"), /h-8 pointer-coarse:h-10 /);
});

test("filter status reserves a stable row, empty states stay one row, tighter phone padding", () => {
  for (const file of ["components/app/auto-filter-bar.tsx", "features/reports/auto-report-filters.tsx"]) {
    assert.match(read(file), /role="status" aria-live="polite" aria-atomic="true" className="[^"]*h-5 w-full shrink-0/, file);
    assert.doesNotMatch(read(file), /empty:sr-only/, file);
  }
  const empty = read("components/app/empty-state.tsx");
  assert.doesNotMatch(empty, /flex-col/);
  for (const file of ["app/(clinic)/layout.tsx", "app/(portal)/layout.tsx"]) {
    assert.match(read(file), /px-4 py-4 sm:px-6 sm:py-6 lg:px-8/, file);
  }
  assert.match(read("components/ui/alert-dialog.tsx"), /max-h-\[calc\(100dvh-2rem\)\] w-\[calc\(100%-2rem\)\][^"]*overflow-y-auto/); // dialogs fit small screens
  assert.match(read("components/app/date-input.tsx"), /relative min-w-0/); // date fields cannot overflow cells
});
