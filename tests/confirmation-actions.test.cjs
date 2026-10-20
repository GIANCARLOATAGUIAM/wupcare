const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock, fresh } = require("./register.cjs");
const { find } = require("./confirmation-harness.cjs");
let deny = false, databaseCalls = 0, profile;
const roleChecks = [];
mock("@/lib/auth/dal", { requireRole: async (...roles) => { roleChecks.push(roles); if (deny) throw new Error("unauthorized"); return { id: "fictional-me" }; } });
mock("@/lib/supabase/server", { createClient: async () => ({
  from() { databaseCalls++; return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile }) }; },
  rpc: async () => ({ data: [], error: null }),
}) });
const users = fresh("../features/users/actions.ts");
const appointments = fresh("../features/appointments/actions.ts");
const medicines = fresh("../features/medications/actions.ts");
const students = fresh("../features/students/actions.ts");

test("sensitive existing actions still reject unauthorized calls before any database work", async () => {
  deny = true;
  const fd = new FormData();
  const actions = [
    () => users.setUserActive("fictional-other", false),
    () => users.updateUser("fictional-other", {}, fd),
    () => appointments.cancelMyAppointment("fictional-appointment"),
    () => appointments.updateAppointmentStatus("fictional-appointment", "cancel", {}, fd),
    () => medicines.setMedicineActive("fictional-medicine", false),
    () => medicines.adjustMedicine("fictional-medicine", {}, fd),
    () => students.updateStudent("fictional-student", {}, fd),
  ];
  for (const action of actions) await assert.rejects(action(), /unauthorized/);
  assert.equal(databaseCalls, 0);
  assert.ok(roleChecks.some((roles) => roles.includes("admin")));
  assert.ok(roleChecks.some((roles) => roles.includes("clinic_staff")));
  assert.ok(roleChecks.some((roles) => roles.includes("student")));
  deny = false;
});

test("account detail gates role changes and both access transitions, and hides self access actions", async () => {
  const { UserDetail } = fresh("../features/users/user-detail.tsx");
  for (const role of ["clinic_staff", "student"]) {
    for (const is_active of [true, false]) {
      profile = { id: "fictional-other", full_name: "Fictional Person", email: "fictional@example.test", role, is_active, created_at: "2026-10-20T00:00:00Z" };
      const tree = await UserDetail({ id: "00000000-0000-4000-8000-000000000001", kind: role === "student" ? "students" : "personnel", meId: "fictional-me" });
      const edit = find(tree, (node) => node.props?.submitLabel === "Save");
      assert.equal(Boolean(edit.props.confirm), role !== "student");
      const access = find(tree, (node) => /^(Deactivate|Reactivate) account$/.test(node.props?.submitLabel ?? ""));
      assert.ok(access.props.confirm);
      assert.equal(access.props.confirm.destructive === true, is_active);
    }
  }
  profile = { ...profile, id: "fictional-me", role: "admin" };
  const tree = await UserDetail({ id: "00000000-0000-4000-8000-000000000001", kind: "personnel", meId: "fictional-me" });
  assert.equal(find(tree, (node) => node.props?.submitLabel === "Save").props.confirm, undefined);
  assert.equal(find(tree, (node) => /^(Deactivate|Reactivate) account$/.test(node.props?.submitLabel ?? "")), null);
});
