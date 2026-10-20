const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness, find } = require("./confirmation-harness.cjs");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const { accountHrefForRole } = require("../components/app/nav.ts");
// Visible text of an element tree (children only; no refs or owners).
const text = (n) => n == null || typeof n === "boolean" ? "" : typeof n !== "object" ? String(n) : Array.isArray(n) ? n.map(text).join(" ") : text(n.props?.children);

function menu(role, fullName = "Maria Santos", extra = {}) {
  let logouts = 0, navigations = 0;
  const h = harness("../components/app/account-menu.tsx", "AccountMenu", {
    user: { fullName, role }, accountHref: accountHrefForRole(role), current: false,
    onNavigate: () => navigations++, onLogout: () => logouts++, ...extra,
  });
  return { h, counts: () => ({ logouts, navigations }) };
}

test("same account menu for every role: initials, name, role, chevron; My Account per role", () => {
  for (const [role, label, href] of [["admin", "Administrator", "/account"], ["clinic_staff", "Clinic Personnel", "/account"], ["student", "Student", "/portal/account"]]) {
    const { h } = menu(role);
    try {
      const tree = h.render();
      const trigger = find(tree, (n) => n.type === "button");
      assert.equal(trigger.props.type, "button");
      assert.equal(trigger.props["aria-label"], `Account menu for Maria Santos, ${label}`);
      assert.match(text(trigger), new RegExp(`MS .*Maria Santos .*${label}`));
      assert.equal(find(trigger, (n) => n.type?.displayName === "ChevronsUpDown") !== null, true);
      const link = find(tree, (n) => n.props?.href);
      assert.equal(link.props.href, href, role);
      const items = [];
      (function walk(n) { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(walk); if (n.type?.name === "DropdownMenuItem") items.push(n); walk(n.props?.children); })(tree);
      assert.deepEqual(items.map((i) => text(i).trim()), ["My Account", "Log Out"]); // nothing else
    } finally { h.restore(); }
  }
});

test("menu opens upward inside the viewport; Sign Out hands off without signing out", () => {
  const { h, counts } = menu("student");
  try {
    const tree = h.render();
    const content = find(tree, (n) => n.type?.name === "DropdownMenuContent");
    assert.equal(content.props.side, "top");
    assert.equal(content.props.collisionPadding, 8);
    const signOut = find(tree, (n) => n.type?.name === "DropdownMenuItem" && typeof n.props.onSelect === "function");
    signOut.props.onSelect();
    assert.deepEqual(counts(), { logouts: 1, navigations: 0 }); // shell opens the shared confirmation
    let prevented = 0;
    content.props.onCloseAutoFocus({ preventDefault: () => prevented++ });
    assert.equal(prevented, 1); // focus stays in the confirmation
    content.props.onCloseAutoFocus({ preventDefault: () => prevented++ });
    assert.equal(prevented, 1); // a plain close restores focus to the trigger
    find(tree, (n) => n.props?.href === "/portal/account").props.onClick();
    assert.equal(counts().navigations, 1); // closes the mobile drawer before navigating
  } finally { h.restore(); }
});

test("shell: compact header, menu replaces the separate profile link and Sign out button", () => {
  const shell = read("components/app/clinic-shell.tsx");
  assert.match(shell, /flex h-16 shrink-0 items-center px-5 rail-collapsed:justify-center rail-collapsed:px-0">\s*<Brand className="h-9 self-center rail-collapsed:hidden" \/>/);
  assert.equal(shell.match(/\bh-16\b/g).length, 1); // only the brand row (logo breathing room)
  assert.doesNotMatch(shell, /ChevronRight|, account settings/);
  assert.match(read("components/ui/dropdown-menu.tsx"), /pointer-coarse:py-2\.5/);
});
