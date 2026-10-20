const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock, fresh } = require("./register.cjs");
let deny = false;
const checks = [];
mock("@/lib/auth/dal", { requireRole: async (...roles) => { checks.push(roles); if (deny) throw new Error("denied"); return { id: "fictional-self", role: "admin" }; } });
const users = fresh("../features/users/actions.ts");
const account = fresh("../features/account/actions.ts");
const form = (values) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const valid = { full_name: "Maria Santos", email: "fictional@example.test", password: "fictional-password", role: "clinic_staff" };
test("create account validates required fields, email, password, role and student link before client access", async () => {
  for (const change of [{ full_name: "" }, { email: "bad" }, { password: "short" }, { password: "x".repeat(73) }, { role: "owner" }, { role: "student", student_id: "not-a-uuid" }]) {
    const result = await users.createUser({}, form({ ...valid, ...change }));
    assert.ok(result.fieldErrors);
    assert.equal(result.values.password, "");
  }
});
test("display name action rejects controls, blank and >120 chars without database access", async () => {
  for (const full_name of [" ", "x".repeat(121), "Ma\nSantos", "<Maria>"]) assert.ok((await account.updateDisplayName({}, form({ full_name }))).fieldErrors.full_name);
});
test("account actions enforce role guards before validation or mutation", async () => {
  deny = true;
  for (const action of [() => users.createUser({}, form(valid)), () => users.updateUser("fictional-other", {}, form(valid)), () => users.setUserActive("fictional-other", false), () => users.setTemporaryPassword("fictional-other", {}, form(valid)), () => account.updateDisplayName({}, form({ full_name: "Maria Santos" }))]) await assert.rejects(action(), /denied/);
  assert.ok(checks.every((roles) => roles[0] === "admin" && (roles.length === 1 || roles.join() === "admin,clinic_staff,student")));
  deny = false;
});
test("self-deactivation and admin temporary password changes to self are blocked", async () => {
  assert.match((await users.setUserActive("fictional-self", false)).error, /own account/);
  assert.match((await users.setTemporaryPassword("fictional-self", {}, form(valid))).error, /own password/);
});
test("password mismatch and reuse are rejected before auth mutation", async () => {
  mock("@/lib/auth/dal", { getAuthState: async () => ({ status: "ok", user: { email: valid.email } }) });
  const { changePassword } = fresh("../features/account/actions.ts");
  for (const values of [{ current_password: "old-password", new_password: "new-password", confirm_password: "different" }, { current_password: "same-password", new_password: "same-password", confirm_password: "same-password" }]) assert.ok((await changePassword({}, form(values))).fieldErrors);
});
test("saving a name normalizes spaces and updates only the authenticated administrator", async () => {
  const calls = [];
  mock("@/lib/auth/dal", { requireRole: async (...roles) => { assert.deepEqual(roles, ["admin", "clinic_staff", "student"]); return { id: "fictional-self", role: "admin" }; } });
  mock("@/lib/supabase/server", { createClient: async () => ({ from(table) {
    assert.equal(table, "profiles");
    return { update(value) { calls.push(value); return this; }, eq(key, value) { calls.push([key, value]); return this; }, select: async () => ({ data: [{ id: "fictional-self" }], error: null }) };
  } }) });
  const { updateDisplayName } = fresh("../features/account/actions.ts");
  const result = await updateDisplayName({}, form({ full_name: "  Maria   Santos  ", id: "fictional-other", role: "student", email: "changed@example.test", student_id: "fictional-record" }));
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ full_name: "Maria Santos" }, ["id", "fictional-self"]]);
});

for (const role of ["clinic_staff", "student"]) {
  test(`${role} invalid names never reach the scoped RPC`, async () => {
    mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-self", role }) });
    mock("@/lib/supabase/server", { createClient: async () => assert.fail("invalid input must not access database") });
    const { updateDisplayName } = fresh("../features/account/actions.ts");
    for (const full_name of ["", " ", "x".repeat(121), "Ana\tReyes", "Ana\u200bReyes", "<name>"]) {
      assert.ok((await updateDisplayName({}, form({ full_name }))).fieldErrors.full_name);
    }
  });
  test(`${role} saves only their account name via identity-scoped RPC and refreshes layouts`, async () => {
    const calls = [], refreshes = [];
    mock("@/lib/auth/dal", { requireRole: async (...roles) => {
      assert.deepEqual(roles, ["admin", "clinic_staff", "student"]);
      return { id: "fictional-self", role };
    } });
    mock("next/cache", { revalidatePath: (...args) => refreshes.push(args) });
    mock("@/lib/supabase/server", { createClient: async () => ({ rpc: async (...args) => { calls.push(args); return { error: null }; } }) });
    const { updateDisplayName } = fresh("../features/account/actions.ts");
    const result = await updateDisplayName({}, form({ full_name: "  José O'Brien  ", id: "fictional-other", role: "admin", student_id: "fictional-record" }));
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [["update_own_display_name", { p_full_name: "José O'Brien" }]]);
    assert.deepEqual(refreshes, [["/", "layout"]]);
  });
}

test("RPC denial and uninstalled function never report success or refresh stale names", async () => {
  mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-self", role: "student" }) });
  mock("next/cache", { revalidatePath: () => assert.fail("must not refresh on failure") });
  for (const code of ["42501", "PGRST202"]) {
    mock("@/lib/supabase/server", { createClient: async () => ({ rpc: async () => ({ error: { code, message: "denied" } }) }) });
    const result = await fresh("../features/account/actions.ts").updateDisplayName({}, form({ full_name: "Maria Santos" }));
    assert.ok(result.error);
    assert.equal(result.ok, undefined);
    assert.equal(result.values.full_name, "Maria Santos");
    if (code === "PGRST202") assert.match(result.error, /awaiting a database update/);
  }
});
