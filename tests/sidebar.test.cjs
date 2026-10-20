const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const pref = require("../components/app/sidebar-preference.ts");

function fakeRoot() {
  const attrs = new Map();
  return { attrs, getAttribute: (k) => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
}
function fakeStorage(initial = {}, { throws = false } = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => { if (throws) throw new Error("blocked"); return data[k] ?? null; }, setItem: (k, v) => { if (throws) throw new Error("blocked"); data[k] = v; } };
}
// Runs the real pre-paint script against fake browser globals.
function boot(storage) {
  const root = fakeRoot();
  vm.runInNewContext(pref.SIDEBAR_BOOT_SCRIPT, { localStorage: storage, document: { documentElement: root } });
  return root;
}

test("first visit defaults to expanded; a saved 'collapsed' is applied before paint", () => {
  assert.equal(pref.isSidebarCollapsed(boot(fakeStorage())), false);
  assert.equal(pref.isSidebarCollapsed(boot(fakeStorage({ "wupcare.sidebar": "expanded" }))), false);
  assert.equal(pref.isSidebarCollapsed(boot(fakeStorage({ "wupcare.sidebar": "collapsed" }))), true);
  assert.equal(pref.isSidebarCollapsed(boot(fakeStorage({ "wupcare.sidebar": "<script>" }))), false); // only the exact value
});

test("unavailable storage never breaks the page and keeps the default", () => {
  assert.doesNotThrow(() => boot(fakeStorage({}, { throws: true })));
  assert.equal(pref.isSidebarCollapsed(boot(fakeStorage({}, { throws: true }))), false);
  const root = fakeRoot();
  assert.doesNotThrow(() => pref.setSidebarCollapsed(true, root, fakeStorage({}, { throws: true })));
  assert.equal(pref.isSidebarCollapsed(root), true); // applies for this page even if not saved
  assert.doesNotThrow(() => pref.setSidebarCollapsed(false, root, null));
});

test("toggling saves the preference and updates the attribute both ways", () => {
  const root = fakeRoot(), storage = fakeStorage();
  pref.setSidebarCollapsed(true, root, storage);
  assert.equal(root.getAttribute("data-sidebar"), "collapsed");
  assert.equal(storage.data["wupcare.sidebar"], "collapsed");
  pref.setSidebarCollapsed(false, root, storage);
  assert.equal(root.getAttribute("data-sidebar"), null);
  assert.equal(storage.data["wupcare.sidebar"], "expanded");
  // Restored on the next load (refresh or a new route render).
  assert.equal(pref.isSidebarCollapsed(boot(storage)), false);
  pref.setSidebarCollapsed(true, root, storage);
  assert.equal(pref.isSidebarCollapsed(boot(storage)), true);
  assert.deepEqual(Object.keys(storage.data), ["wupcare.sidebar"]); // UI preference only
});

test("no server-side storage access: server snapshot is expanded and the boot script is inline in <head>", () => {
  assert.equal(pref.sidebarServerSnapshot(), false);
  const layout = read("app/layout.tsx");
  assert.match(layout, /<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: SIDEBAR_BOOT_SCRIPT \}\} \/>\s*<\/head>/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.doesNotMatch(read("components/app/sidebar-preference.ts").split("export const SIDEBAR_BOOT_SCRIPT")[0], /localStorage\./); // nothing at import time
  assert.match(read("components/app/clinic-shell.tsx"), /useSyncExternalStore\(subscribeSidebar, sidebarSnapshot, sidebarServerSnapshot\)/);
});

test("collapse styling applies only to the desktop sidebar, never the mobile drawer", () => {
  const css = read("app/globals.css");
  assert.match(css, /@custom-variant rail-collapsed \(&:where\(html\[data-sidebar="collapsed"\] \[data-desktop-sidebar\], html\[data-sidebar="collapsed"\] \[data-desktop-sidebar\] \*\)\);/);
  const shell = read("components/app/clinic-shell.tsx");
  const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
  assert.match(aside, /data-desktop-sidebar/);
  assert.match(aside, /w-60[^"]*rail-collapsed:w-16/); // 240px expanded, 64px collapsed
  assert.match(aside, /motion-reduce:transition-none/);
  assert.match(aside, /aria-controls="app-sidebar"/);
  assert.match(aside, /aria-expanded=\{!collapsed\}/);
  assert.match(aside, /aria-label=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
  assert.match(aside, /tooltips=\{collapsed\}/);
  // The toggle is inside the desktop aside only; the drawer instance gets no tooltips.
  const sheet = shell.slice(shell.indexOf("<SheetContent"), shell.indexOf("</SheetContent>"));
  assert.doesNotMatch(sheet, /tooltips|data-desktop-sidebar|setSidebarCollapsed/);
});

test("collapsed rail: icon logo, hidden labels keep accessible names, tooltips, avatar-only account trigger", () => {
  const shell = read("components/app/clinic-shell.tsx");
  assert.match(shell, /<Brand className="h-9 self-center rail-collapsed:hidden" \/>/);
  assert.match(shell, /<BrandMark className="hidden size-8 rail-collapsed:inline-block" label="WUPCare" \/>/);
  assert.match(shell, /<span className="truncate rail-collapsed:sr-only">\{item\.label\}<\/span>/); // sr-only, not display:none
  assert.match(shell, /rail-collapsed:sr-only">\s*\{section\.label\}/);
  assert.match(shell, /<TooltipContent side="right">\{item\.label\}<\/TooltipContent>/);
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/); // active highlight unchanged
  const menu = read("components/app/account-menu.tsx");
  assert.match(menu, /leading-tight rail-collapsed:hidden/);
  assert.match(menu, /text-muted-foreground rail-collapsed:hidden/);
  assert.match(menu, /collisionPadding=\{8\}/); // menu stays in the viewport
  assert.match(menu, /aria-label=\{`Account menu for \$\{user\.fullName\}/);
});

test("visual refinements: rounded right corners without clipping, centered logo row, toggle clear of the logo", () => {
  const shell = read("components/app/clinic-shell.tsx");
  const asideClass = shell.match(/<aside[\s\S]*?className="([^"]+)"/)[1];
  assert.match(asideClass, /\brounded-r-xl\b/); // 12px top-right and bottom-right only
  assert.doesNotMatch(asideClass, /\brounded-(xl|lg|l-|tl|bl)|overflow-hidden/); // left square; nothing clipped
  assert.match(shell, /className="w-64 gap-0 rounded-r-xl bg-sidebar p-0 text-sidebar-foreground"/); // drawer matches
  // 64px brand row with the 36px logo centered (~14px above and below).
  assert.match(shell, /flex h-16 shrink-0 items-center px-5 rail-collapsed:justify-center rail-collapsed:px-0">\s*<Brand className="h-9 self-center rail-collapsed:hidden" \/>/);
  // Brand's base class is self-start; the shell overrides it (cn merges) so the
  // logo is truly centered, not pinned to the top of the row.
  assert.equal(shell.match(/<Brand className="h-9 self-center/g).length, 2); // sidebar + mobile top bar
  // Toggle: 24px at top 20px, centered on the 64px row, straddling the edge (-12px), so it
  // sits right of the 32px icon logo (16–48px in the 64px rail) and far from the wordmark.
  assert.match(shell, /className="absolute top-5 -right-3 z-10 grid size-6/);
  // Floating layers stay portaled outside the aside.
  assert.match(read("components/ui/dropdown-menu.tsx"), /<DropdownMenuPrimitive\.Portal>/);
  assert.match(read("components/ui/tooltip.tsx"), /<TooltipPrimitive\.Portal>/);
  assert.match(read("components/ui/alert-dialog.tsx"), /<AlertDialogPrimitive\.Portal>/);
});
