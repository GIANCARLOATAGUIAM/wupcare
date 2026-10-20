const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("./register.cjs");
const { harness, find } = require("./confirmation-harness.cjs");
const { confirmationFor } = require("../components/app/confirmation.ts");
const NativeFormData = global.FormData;
global.FormData = class extends NativeFormData {
  constructor(source) { super(); if (source?.data) for (const [key, value] of source.data) this.append(key, value); }
};
const redirects = [];
let refreshes = 0;
mock("next/navigation", {
  useRouter: () => ({ refresh: () => { refreshes++; } }),
  unstable_rethrow(error) { if (error?.digest?.startsWith("NEXT_REDIRECT")) { redirects.push(error); throw error; } },
});
const copy = { title: "Cancel Appointment Request?", message: "Your pending appointment request will be cancelled.", confirmLabel: "Cancel Request", cancelLabel: "Keep Request", destructive: true };
const dialog = (tree) => find(tree, (node) => node.type?.name === "ConfirmationDialog");
const button = (tree) => find(tree, (node) => node.props?.type === "submit");
function setup(action, confirm = copy) {
  const h = harness("../components/app/action-form.tsx", "ActionForm", { action, submitLabel: "Cancel request", confirm });
  const form = { data: new NativeFormData(), resets: 0, reset() { this.resets++; } };
  form.data.set("reason", "fictional reason");
  function render() { const tree = h.render(); tree.props.ref.current = form; return tree; }
  function submit() { const tree = render(); tree.props.onSubmit({ preventDefault() {}, currentTarget: form }); return render(); }
  return { ...h, form, render, submit };
}

test("Cancel closes confirmation without a server call, reset or data mutation", () => {
  let writes = 0;
  const h = setup(async () => { writes++; return { ok: true }; });
  try {
    const opened = h.submit();
    assert.equal(writes, 0);
    dialog(opened).props.onCancel();
    assert.equal(dialog(h.render()), null);
    assert.equal(writes, 0);
    assert.equal(h.form.resets, 0);
    assert.equal(h.form.data.get("reason"), "fictional reason");
  } finally { h.restore(); }
});

test("Confirm dispatches exactly once; pending disables inputs/buttons and blocks Cancel", async () => {
  let calls = 0, resolve;
  const h = setup(async (_previous, data) => { calls++; assert.equal(data.get("reason"), "fictional reason"); return new Promise((done) => { resolve = done; }); });
  try {
    const request = dialog(h.submit());
    request.props.onConfirm();
    request.props.onConfirm();
    request.props.onCancel(); // even before the pending render, the latch blocks closing
    const pending = h.render();
    assert.equal(calls, 1);
    assert.equal(dialog(pending).props.pending, true);
    assert.equal(button(pending).props.disabled, true);
    assert.equal(find(pending, (node) => node.type === "fieldset").props.disabled, true);
    resolve({ ok: true, message: "Request cancelled." });
    await h.flush();
    const finished = h.render();
    assert.equal(dialog(finished), null);
    assert.equal(h.form.resets, 1);
    assert.equal(find(finished, (node) => node.type?.name === "FormAlert").props.state.message, "Request cancelled.");
  } finally { h.restore(); }
});

test("server validation and authorization errors stay open; retries require Confirm", async () => {
  let calls = 0;
  const h = setup(async () => { calls++; return calls === 1 ? { error: "Not allowed.", fieldErrors: { reason: "Enter a reason." } } : { ok: true, message: "Saved." }; });
  try {
    dialog(h.submit()).props.onConfirm(); await h.flush();
    const failed = dialog(h.render());
    assert.equal(failed.props.state.error, "Not allowed.");
    assert.equal(failed.props.state.fieldErrors.reason, "Enter a reason.");
    assert.equal(failed.props.pending, false);
    assert.equal(h.form.resets, 0);
    assert.equal(calls, 1);
    failed.props.onConfirm(); await h.flush();
    assert.equal(calls, 2);
    assert.equal(dialog(h.render()), null);
  } finally { h.restore(); }
});

test("thrown network errors give a useful message and preserve the open dialog", async () => {
  const h = setup(async () => { throw new Error("fictional network failure"); });
  try {
    dialog(h.submit()).props.onConfirm(); await h.flush();
    const failed = dialog(h.render());
    assert.match(failed.props.state.error, /connection.*try again/);
    assert.equal(h.form.resets, 0);
  } finally { h.restore(); }
});

test("Next redirects from existing actions are rethrown, never turned into save errors", async () => {
  const redirect = { digest: "NEXT_REDIRECT;replace;/login;307;" };
  const h = setup(async () => { throw redirect; });
  try {
    dialog(h.submit()).props.onConfirm();
    await assert.rejects(h.flush(), (error) => error === redirect);
    assert.ok(redirects.includes(redirect));
  } finally { h.restore(); }
});

test("ordinary forms submit directly once without adding a dialog", async () => {
  let calls = 0;
  const form = { data: new NativeFormData() };
  const ordinary = harness("../components/app/action-form.tsx", "ActionForm", { action: async () => { calls++; return { ok: true }; }, submitLabel: "Save" });
  try {
    const tree = ordinary.render();
    tree.props.onSubmit({ preventDefault() {}, currentTarget: form });
    tree.props.onSubmit({ preventDefault() {}, currentTarget: form });
    await ordinary.flush();
    assert.equal(calls, 1);
    assert.equal(dialog(ordinary.render()), null);
  } finally { ordinary.restore(); }
});

test("role changes show old/new roles; name-only, self and student edits need no role prompt", () => {
  const rule = { ...copy, title: "Change Role?", whenChanged: { field: "role", from: "clinic_staff", to: ["clinic_staff", "admin"], label: "role", labels: { clinic_staff: "Clinic Personnel", admin: "Administrator" } } };
  const data = new NativeFormData(); data.set("role", "clinic_staff");
  assert.equal(confirmationFor(rule, data), null);
  data.set("role", "admin");
  assert.match(confirmationFor(rule, data).message, /Current role: Clinic Personnel. New role: Administrator/);
  assert.equal(confirmationFor(undefined, data), null);
});

test("student archiving asks only on a changed Inactive/Graduated status", () => {
  const rule = { ...copy, whenChanged: { field: "status", from: "active", to: ["inactive", "graduated"], label: "status", labels: { active: "Active", inactive: "Inactive", graduated: "Graduated" } } };
  const data = new NativeFormData();
  for (const value of ["active", "inactive", "graduated"]) {
    data.set("status", value);
    assert.equal(Boolean(confirmationFor(rule, data)), value !== "active");
  }
});

test("dialog focuses Keep first, restores trigger, and permits Escape only when idle", () => {
  let cancelled = 0, focus = 0, restored = 0;
  const trigger = { current: { isConnected: true, focus: () => { restored++; } } };
  const props = { confirmation: copy, state: {}, pending: false, returnFocusRef: trigger, onCancel: () => { cancelled++; }, onConfirm() {} };
  const h = harness("../components/app/confirmation-dialog.tsx", "ConfirmationDialog", props);
  try {
    let tree = h.render();
    let content = tree.props.children;
    const keep = find(tree, (node) => node.props?.children === "Keep Request");
    keep.props.ref.current = { focus: () => { focus++; } };
    content.props.onOpenAutoFocus({ preventDefault() {} });
    assert.equal(focus, 1);
    let prevented = false;
    content.props.onEscapeKeyDown({ preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    tree.props.onOpenChange(false);
    assert.equal(cancelled, 1);
    content.props.onCloseAutoFocus({ preventDefault() {} });
    assert.equal(restored, 1);
    tree = h.render({ ...props, pending: true }); content = tree.props.children;
    content.props.onEscapeKeyDown({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    tree.props.onOpenChange(false);
    assert.equal(cancelled, 1);
    assert.equal(content.props["aria-busy"], true);
    assert.equal(find(tree, (node) => node.props?.children === "Keep Request").props.disabled, true);
    assert.equal(find(tree, (node) => node.props?.onClick === props.onConfirm).props.disabled, true);
  } finally { h.restore(); }
});

test("account menu confirmations retain existing server actions, explicit roles, errors and refresh", async () => {
  let calls = 0;
  const announced = [];
  const h = harness("../features/users/row-actions.tsx", "RowActions", {
    name: "Fictional Nurse", active: true, viewHref: "/fictional/account",
    setActive: async () => { calls++; return { ok: true, message: "Account deactivated." }; },
    makeAdmin: async (_previous, data) => { calls++; assert.equal(data.get("role"), "admin"); return { ok: true, message: "Account saved." }; },
  }, (result) => announced.push(result));
  try {
    const tree = h.render();
    const roleItem = find(tree, (node) => node.props?.onSelect && String(node.props.children).includes("Change Role"));
    assert.ok(roleItem);
    roleItem.props.onSelect();
    let request = dialog(h.render());
    assert.match(request.props.confirmation.message, /current role is Clinic Personnel; new role is Administrator/);
    request.props.onCancel(); assert.equal(calls, 0);
    const deactivate = find(tree, (node) => node.props?.onSelect && !String(node.props.children).includes("Change Role"));
    deactivate.props.onSelect(); request = dialog(h.render());
    assert.equal(request.props.confirmation.cancelLabel, "Keep Account");
    request.props.onConfirm(); request.props.onConfirm(); await h.flush();
    assert.equal(calls, 1);
    assert.equal(announced[0].message, "Account deactivated.");
    assert.equal(refreshes, 1);
    assert.equal(dialog(h.render()), null);
  } finally { h.restore(); }
});

test("student edit form gates archiving but keeps an ordinary active record edit direct", async () => {
  let calls = 0;
  const props = { student: { id: "fictional-student", status: "active", first_name: "Fictional", last_name: "Student" }, cancelHref: "/fictional/student", action: async () => { calls++; return { ok: true, message: "Saved." }; } };
  const h = harness("../features/students/components/student-form.tsx", "StudentForm", props);
  const form = { data: new NativeFormData() };
  try {
    form.data.set("status", "inactive");
    h.render().props.onSubmit({ preventDefault() {}, currentTarget: form });
    let request = dialog(h.render());
    assert.equal(request.props.confirmation.title, "Archive Student Record?");
    assert.match(request.props.confirmation.message, /nothing will be deleted/);
    assert.equal(calls, 0);
    request.props.onCancel();
    assert.equal(calls, 0);
    form.data.set("status", "active");
    h.render().props.onSubmit({ preventDefault() {}, currentTarget: form });
    await h.flush();
    assert.equal(calls, 1);
    assert.equal(dialog(h.render()), null);
    form.data.set("status", "graduated");
    h.render().props.onSubmit({ preventDefault() {}, currentTarget: form });
    request = dialog(h.render()); request.props.onConfirm(); request.props.onConfirm();
    await h.flush();
    assert.equal(calls, 2);
    assert.equal(dialog(h.render()), null);
  } finally { h.restore(); }
});

test("non-destructive dialogs stay medical blue; failure feedback and mobile button layout are retained", () => {
  const h = harness("../components/app/confirmation-dialog.tsx", "ConfirmationDialog", {
    confirmation: { title: "Change Role?", message: "Permissions will change.", confirmLabel: "Change Role" },
    state: { fieldErrors: { role: "Not allowed to change this role." } }, pending: false,
    returnFocusRef: { current: null }, onCancel() {}, onConfirm() {},
  });
  try {
    const tree = h.render();
    assert.equal(find(tree, (node) => node.props?.children === "Change Role").props.variant, "default");
    assert.equal(find(tree, (node) => node.type?.name === "FormAlert").props.state.error, "Not allowed to change this role.");
    assert.ok(find(tree, (node) => node.props?.className?.includes("flex-col-reverse") && node.props.className.includes("sm:flex-row")));
  } finally { h.restore(); }
});

test("after a successful role change removes a row, focus falls back to main", () => {
  let focused = 0;
  const attributes = new Map();
  const main = { getAttribute: (name) => attributes.get(name) ?? null, setAttribute: (name, value) => attributes.set(name, value), removeAttribute: (name) => attributes.delete(name), focus: () => { focused++; } };
  global.document = { getElementById: (id) => id === "main" ? main : null };
  const h = harness("../components/app/confirmation-dialog.tsx", "ConfirmationDialog", { confirmation: copy, state: {}, pending: false, returnFocusRef: { current: null }, onCancel() {}, onConfirm() {} });
  try {
    h.render().props.children.props.onCloseAutoFocus({ preventDefault() {} });
    assert.equal(focused, 1);
    assert.equal(attributes.has("tabindex"), false);
  } finally { delete global.document; h.restore(); }
});

test("dialog surface stays compact and scrolls within a mobile viewport", () => {
  const { AlertDialogContent } = require("../components/ui/alert-dialog.tsx");
  const tree = AlertDialogContent({});
  const content = find(tree, (node) => node.props?.["data-slot"] === "alert-dialog-content");
  for (const className of ["max-w-md", "w-[calc(100%-2rem)]", "max-h-[calc(100dvh-2rem)]", "overflow-y-auto", "bg-card"]) assert.ok(content.props.className.includes(className));
});
