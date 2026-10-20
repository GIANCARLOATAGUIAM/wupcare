const { test } = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { mock, fresh } = require("./register.cjs");
const { harness, find } = require("./confirmation-harness.cjs");

const groups = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789", "!@#$%^&*()-_=+[]{}:,.?"];
const allowed = groups.join("");

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  return () => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
}

test("Web Crypto generator produces 20 allowed ASCII characters with all four groups", () => {
  const restore = replaceGlobal("crypto", webcrypto);
  const random = Math.random;
  Math.random = () => assert.fail("non-cryptographic randomness must not be used");
  try {
    const { generateStrongPassword } = fresh("../features/users/generate-password.ts");
    const seen = new Set();
    for (let i = 0; i < 256; i++) {
      const value = generateStrongPassword();
      assert.equal(value.length, 20);
      assert.ok([...value].every((char) => allowed.includes(char)));
      assert.ok(groups.every((group) => [...value].some((char) => group.includes(char))));
      assert.ok(Buffer.byteLength(value, "utf8") <= 72); // existing Auth/server limit
      seen.add(value);
    }
    assert.equal(seen.size, 256);
  } finally { Math.random = random; restore(); }
});

test("generator rejects biased bytes and candidates missing character groups", () => {
  let calls = 0;
  const restore = replaceGlobal("crypto", { getRandomValues(bytes) {
    calls++;
    for (let i = 0; i < bytes.length; i++) bytes[i] = calls === 1 ? 0 : [255, 0, 26, 52, 62][i % 5];
    return bytes;
  } });
  try {
    const value = fresh("../features/users/generate-password.ts").generateStrongPassword();
    assert.equal(calls, 2);
    assert.ok([...value].every((char) => "Aa0!".includes(char)));
    assert.equal(value.length, 20);
  } finally { restore(); }
});

test("generator fails closed when cryptographic randomness is unavailable", () => {
  const restore = replaceGlobal("crypto", undefined);
  try { assert.throws(() => fresh("../features/users/generate-password.ts").generateStrongPassword()); }
  finally { restore(); }
});

function field(error) {
  mock("react-dom", { ...require("react-dom"), useFormStatus: () => ({ pending: false }) });
  return harness("../features/users/temporary-password-field.tsx", "TemporaryPasswordField", { error });
}
const input = (tree) => find(tree, (n) => n.type?.name === "PasswordInput");
const generate = (tree) => find(tree, (n) => n.props?.["aria-label"] === "Generate strong password");
const copy = (tree) => find(tree, (n) => n.props?.onClick?.name === "copy");
const status = (tree) => find(tree, (n) => n.props?.role === "status").props.children;

test("Generate fills the existing named input, supports regeneration/manual edits, and never submits", () => {
  const restore = replaceGlobal("crypto", webcrypto);
  const h = field("Use at least 8 characters.");
  try {
    let tree = h.render();
    assert.equal(input(tree).props.name, "password");
    assert.equal(input(tree).props.value, "");
    assert.equal(copy(tree).props.disabled, true);
    assert.equal(input(tree).props["aria-invalid"], true);
    assert.match(input(tree).props["aria-describedby"], /password-error/);
    assert.equal(generate(tree).props.type, "button");
    assert.equal(copy(tree).props.type, "button");
    generate(tree).props.onClick();
    tree = h.render();
    const first = input(tree).props.value;
    assert.equal(first.length, 20);
    generate(tree).props.onClick();
    tree = h.render();
    assert.ok(input(tree).props.value !== first);
    input(tree).props.onChange({ target: { value: "fictional-manual-password" } });
    assert.equal(input(h.render()).props.value, "fictional-manual-password");
    assert.equal(copy(h.render()).props.disabled, false);
    assert.equal(find(tree, (n) => n.type === "form"), null);
  } finally { h.restore(); restore(); }
});

test("Copy reports success/denial/unavailable clipboard without exposing credentials or errors", async () => {
  let copied;
  const restore = replaceGlobal("navigator", { clipboard: { writeText: async (value) => { copied = value; } } });
  const h = field();
  try {
    input(h.render()).props.onChange({ target: { value: "fictional-manual-password" } });
    await copy(h.render()).props.onClick();
    assert.equal(copied, "fictional-manual-password");
    assert.equal(status(h.render()), "Password copied.");
    input(h.render()).props.onChange({ target: { value: "fictional-new-password" } });
    assert.equal(status(h.render()), "");
    navigator.clipboard.writeText = async () => { throw new Error("sensitive error contents"); };
    await copy(h.render()).props.onClick();
    assert.equal(status(h.render()), "Could not copy. Show the password and copy it manually.");
    navigator.clipboard = undefined;
    await copy(h.render()).props.onClick();
    assert.equal(status(h.render()), "Could not copy. Show the password and copy it manually.");
  } finally { h.restore(); restore(); }
});

test("crypto failure gives safe feedback and preserves manual entry", () => {
  const restore = replaceGlobal("crypto", undefined);
  const h = field();
  try {
    input(h.render()).props.onChange({ target: { value: "fictional-manual-password" } });
    generate(h.render()).props.onClick();
    assert.equal(input(h.render()).props.value, "fictional-manual-password");
    assert.equal(status(h.render()), "Could not generate a password. Enter one manually or try again.");
  } finally { h.restore(); restore(); }
});

test("reused Show/Hide preserves the password and uses accessible non-submit controls", () => {
  const h = harness("../features/auth/password-field.tsx", "PasswordInput", { id: "password", name: "password", toggleLabel: "temporary password", value: "fictional-password" });
  try {
    const renderedInput = (tree) => find(tree, (n) => n.type?.name === "Input");
    let tree = h.render();
    const button = find(tree, (n) => n.type === "button");
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-controls"], "password");
    assert.equal(button.props["aria-label"], "Show temporary password");
    assert.equal(renderedInput(tree).props.type, "password");
    button.props.onClick();
    tree = h.render();
    assert.equal(renderedInput(tree).props.type, "text");
    assert.equal(renderedInput(tree).props.value, "fictional-password");
    assert.equal(find(tree, (n) => n.type === "button").props["aria-label"], "Hide temporary password");
    find(tree, (n) => n.type === "button").props.onClick();
    assert.equal(renderedInput(h.render()).props.type, "password");
  } finally { h.restore(); }
});

test("Add Account retains its action/roles and resets transient password state with the form", () => {
  const React = require("react");
  let cursor = 0;
  const slots = [];
  const action = async () => {};
  mock("./actions", { createUser: action });
  mock("@/features/students/components/student-form", { FormActions() {} });
  mock("react", { ...React,
    useActionState: (_action, initial) => { assert.equal(_action, action); return [initial, action]; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= initial;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
  });
  try {
    const { CreateUserForm } = fresh("../features/users/create-user-form.tsx");
    const render = (kind = "personnel") => { cursor = 0; return CreateUserForm({ students: [], kind }); };
    const tree = render();
    assert.equal(tree.props.action, action);
    const passwordField = (n) => find(n, (el) => el.type?.name === "TemporaryPasswordField");
    assert.equal(passwordField(tree).key, "0");
    const role = find(tree, (n) => n.props?.name === "role");
    assert.deepEqual(role.props.options.map((option) => option.value), ["clinic_staff", "admin"]);
    assert.equal(role.props.value, "clinic_staff");
    tree.props.onReset();
    assert.equal(passwordField(render()).key, "1"); // remount clears all local credential state
    assert.equal(passwordField(render("students")), null); // student form stays unchanged
  } finally { mock("react", React); }
});

for (const role of ["clinic_staff", "admin"]) {
  test(`generated password passes existing ${role} creation validation with admin authorization`, async () => {
    const restore = replaceGlobal("crypto", webcrypto);
    let checks = 0, calls = 0;
    const value = fresh("../features/users/generate-password.ts").generateStrongPassword();
    mock("@/lib/auth/dal", { requireRole: async (...roles) => { checks++; assert.deepEqual(roles, ["admin"]); } });
    mock("@/lib/supabase/admin", { createAdminClient: () => ({ auth: { admin: { createUser: async (attributes) => {
      calls++;
      assert.ok(attributes.password === value);
      assert.equal(attributes.app_metadata.wupcare_role, role);
      assert.equal(attributes.email_confirm, true);
      return { data: { user: { id: "fictional-created" } }, error: null };
    } } } }) });
    try {
      const data = new FormData();
      for (const [key, field] of Object.entries({ full_name: "Fictional Nurse", email: "fictional@example.test", role, password: value })) data.set(key, field);
      await assert.rejects(fresh("../features/users/actions.ts").createUser({}, data), /REDIRECT:\/admin\/users\/fictional-created/);
      assert.equal(checks, 1);
      assert.equal(calls, 1);
    } finally { restore(); }
  });
}
