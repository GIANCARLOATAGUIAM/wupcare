const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock, fresh } = require("./register.cjs");
let profile, claims;
mock("@/lib/supabase/env", { isSupabaseConfigured: () => true });
mock("@/lib/supabase/server", { createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims } }) },
  from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile }) }),
}) });
const { requireRole, getAuthState } = fresh("../lib/auth/dal.ts");
for (const role of ["admin", "clinic_staff", "student"]) {
  test(`${role}: protected role routes and fallback`, async () => {
    claims = { sub: "fictional-id", email: "fictional@example.test", user_metadata: { role: "admin" } };
    profile = { id: claims.sub, full_name: " ", role, is_active: true };
    assert.equal((await requireRole(role)).role, role);
    assert.equal((await getAuthState()).user.fullName, { admin: "Administrator", clinic_staff: "Nurse", student: "Student" }[role]);
    for (const other of ["admin", "clinic_staff", "student"].filter((r) => r !== role)) {
      await assert.rejects(requireRole(other), new RegExp(`REDIRECT:${role === "student" ? "/portal" : "/dashboard"}`));
    }
  });
}
test("signed-out, inactive, missing and invalid profiles fail closed", async () => {
  claims = null;
  await assert.rejects(requireRole("admin"), /REDIRECT:\/login/);
  claims = { sub: "fictional-id", email: "fictional@example.test", user_metadata: { role: "admin" } };
  for (const p of [null, { role: "owner", is_active: true }, { role: "admin", is_active: false }]) {
    profile = p;
    await assert.rejects(requireRole("admin"), /REDIRECT:\/login/);
  }
});
