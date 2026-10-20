const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");
const { harness, find } = require("./confirmation-harness.cjs");

// Fictional, isolated sign-out: no Supabase client or session is touched.
let calls = 0, next = async () => ({ error: "Could not log out. Check your connection and try again." });
mock("@/features/auth/actions", { confirmedLogout: () => { calls++; return next(); } });
mock("next/navigation", { redirect: (url) => { throw new Error(`REDIRECT:${url}`); }, unstable_rethrow(error) { if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error; } });
const redirectError = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });

const dialog = (tree) => find(tree, (node) => node.type?.name === "ConfirmationDialog");
const trigger = (tree) => find(tree, (node) => node.type?.name === "Button");
function setup() {
  calls = 0;
  const h = harness("../components/app/logout-button.tsx", "LogoutButton", {});
  return { ...h, open() { trigger(h.render()).props.onClick(); return h.render(); } };
}

test("Sign out opens the logout confirmation without ending the session", () => {
  const h = setup();
  try {
    assert.equal(dialog(h.render()), null);
    const request = dialog(h.open()).props;
    assert.equal(calls, 0);
    assert.equal(request.confirmation.title, "Log out of WUPCare?");
    assert.equal(request.confirmation.message, "You'll need to log in again to access your account.");
    assert.equal(request.confirmation.confirmLabel, "Log Out");
    assert.equal(request.confirmation.cancelLabel ?? "Cancel", "Cancel");
    assert.notEqual(request.confirmation.destructive, true); // blue, non-destructive
    assert.equal(request.pending, false);
  } finally { h.restore(); }
});

test("Cancel closes the dialog and keeps the user signed in", () => {
  const h = setup();
  try {
    dialog(h.open()).props.onCancel();
    assert.equal(dialog(h.render()), null);
    assert.equal(calls, 0);
  } finally { h.restore(); }
});

test("Log Out signs out once, shows pending, and lets the redirect through", async () => {
  const h = setup();
  let finish;
  next = () => new Promise((_resolve, reject) => { finish = () => reject(redirectError()); });
  try {
    const request = dialog(h.open()).props;
    request.onConfirm();
    request.onConfirm();
    request.onCancel();
    const pending = h.render();
    assert.equal(calls, 1);
    assert.equal(dialog(pending).props.pending, true);
    assert.equal(trigger(pending).props.disabled, true);
    finish();
    await assert.rejects(h.flush(), /NEXT_REDIRECT/); // handed to Next.js, not swallowed
    const leaving = h.render();
    assert.equal(dialog(leaving).props.pending, true);
    dialog(leaving).props.onConfirm();
    dialog(leaving).props.onCancel();
    assert.equal(calls, 1);
    assert.ok(dialog(h.render()));
  } finally { h.restore(); }
});

test("a failed sign-out keeps the dialog open with an error and allows retry", async () => {
  const h = setup();
  next = async () => ({ error: "Could not log out. Check your connection and try again." });
  try {
    dialog(h.open()).props.onConfirm();
    await h.flush();
    const failed = dialog(h.render()).props;
    assert.equal(failed.state.error, "Could not log out. Check your connection and try again.");
    assert.equal(failed.pending, false);
    next = async () => { throw new Error("network down"); };
    failed.onConfirm();
    await h.flush();
    assert.match(dialog(h.render()).props.state.error, /connection/);
    assert.equal(calls, 2);
  } finally { h.restore(); }
});

test("confirmedLogout reports sign-out failure instead of redirecting, and redirects on success", async () => {
  let signOutError = { message: "fictional network error" }, signOuts = 0;
  mock("@/lib/supabase/env", { isSupabaseConfigured: () => true });
  mock("@/lib/supabase/server", { createClient: async () => ({ auth: { signOut: async () => { signOuts++; return { error: signOutError }; } } }) });
  const { unmock } = require("./register.cjs");
  unmock("@/features/auth/actions");
  try {
    const { confirmedLogout } = fresh("../features/auth/actions.ts");
    assert.deepEqual(await confirmedLogout(), { error: "Could not log out. Check your connection and try again." });
    signOutError = null;
    await assert.rejects(confirmedLogout(), /REDIRECT:\/login/);
    assert.equal(signOuts, 2);
  } finally {
    unmock("@/lib/supabase/env");
    mock("@/lib/supabase/server", { createClient: async () => { throw new Error("Use an isolated Supabase mock"); } });
  }
});

test("admin and clinic personnel (desktop and mobile) and student portal all use the confirmed logout", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const shell = read("components/app/clinic-shell.tsx");
  const portal = read("app/(portal)/layout.tsx");
  for (const source of [shell, portal]) assert.doesNotMatch(source, /action=\{logout\}/);
  assert.equal(shell.match(/<LogoutButton/g).length, 1); // shared confirmation, rendered once by the shell
  // The student portal renders the same shell, so it gets the same Sign out.
  assert.match(portal, /<ClinicShell/);
  // The one SidebarContents (with the account menu) renders in both the desktop
  // aside and the mobile sheet; both hand Sign Out to that confirmation.
  assert.equal(shell.match(/<SidebarContents/g).length, 2);
  const sidebar = shell.slice(shell.indexOf("function SidebarContents"));
  assert.match(sidebar, /<AccountMenu[\s\S]*onLogout=\{onLogout\}/);
});
