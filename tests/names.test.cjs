const { test } = require("node:test");
const assert = require("node:assert/strict");
const { displayNameSchema } = require("../features/account/schema.ts");
const { displayName } = require("../lib/auth/display-name.ts");

for (const name of ["Maria Santos", "Ma. Cristina", "Dela Cruz", "Isabel Santos", "Jess", "José O'Brien", "Cris", "Pepito {bad}"]) {
  test(`display name: ${name}`, () => {
    const result = displayNameSchema.safeParse({ full_name: name });
    if (name.includes("{")) assert.equal(result.success, false);
    else assert.equal(result.data.full_name, name);
  });
}
test("trim and collapse repeated Unicode spaces without damaging lowercase s", () => {
  assert.equal(displayNameSchema.parse({ full_name: "  Maria   Santos\u00a0 Cruz  " }).full_name, "Maria Santos Cruz");
});
for (const name of ["", " ", "a", "x".repeat(121), "Maria\0Santos", "Maria\tSantos", "Maria\nSantos", "Maria\u007fSantos", "Maria\u200bSantos", "Maria\u2028Santos", "<name>"]) {
  test(`reject invalid name ${JSON.stringify(name)}`, () => assert.equal(displayNameSchema.safeParse({ full_name: name }).success, false));
}
test("120 characters are valid persisted data, never silently called corrupt", () => {
  const name = "x".repeat(120);
  assert.equal(displayNameSchema.parse({ full_name: name }).full_name, name);
  assert.equal(displayName(name, "admin"), name);
});
for (const [role, fallback] of [["admin", "Administrator"], ["clinic_staff", "Nurse"], ["student", "Student"]]) {
  test(`${role} fallback applies only to missing names`, () => {
    for (const name of [null, undefined, "", "  \t "]) assert.equal(displayName(name, role), fallback);
    assert.equal(displayName("  Maria Santos  ", role), "Maria Santos");
  });
}
