const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, fresh } = require("./register.cjs");

// Student self-registration (docs/STUDENT_REGISTRATION_PLAN.md). Fictional
// data and an in-memory Supabase double only; no live Auth or database.
let enabled = true, calls = [], behavior = {};
mock("@/lib/features", { studentRegistrationEnabled: () => enabled });
mock("@/lib/auth/dal", { requireRole: async () => ({ id: "fictional-staff", role: "clinic_staff" }) });
mock("next/headers", { headers: async () => new Map([["origin", "http://localhost:3000"]]) });
mock("@/lib/supabase/server", { createClient: async () => ({
  auth: {
    getClaims: async () => ({ data: behavior.signedIn ? { claims: { sub: "fictional-signed-in" } } : null, error: null }),
    signUp: async (args) => { calls.push(["signUp", args]); return behavior.signUp(args); },
    signInWithPassword: async () => { calls.push(["signIn"]); return behavior.signIn ? behavior.signIn() : { data: {}, error: { message: "Invalid login credentials" } }; },
    signOut: async () => { calls.push(["signOut"]); return { error: null }; },
  },
  rpc: async (name, args) => { calls.push(["rpc", name, args]); return behavior.rpc(args, calls.filter((c) => c[0] === "rpc").length); },
  from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: behavior.profile ?? null, error: null }) }),
}) });

const { registerStudent } = fresh("../features/registration/actions.ts");
const { registrationSchema, canonicalStudentId } = fresh("../features/registration/schema.ts");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const PASSWORD = "Fictional-Pass-91";
const form = (overrides = {}) => {
  const data = new FormData();
  const fields = { first_name: "Ana", middle_name: "", last_name: "Reyes", email: "Ana.Reyes@Example.test", student_number: " wup-2026-001 ", password: PASSWORD, confirm_password: PASSWORD, ...overrides };
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};
const available = () => ({ data: true, error: null });
const linked = { role: "student", student_id: "fictional-new-student", is_active: true };
const reset = (b) => { calls = []; enabled = true; behavior = { rpc: available, ...b }; };
const signUps = () => calls.filter((c) => c[0] === "signUp");
const leaks = (state) => JSON.stringify(state).includes(PASSWORD);

test("schema canonicalizes Student ID and names, and treats a blank middle name as absent", () => {
  const r = registrationSchema.parse(Object.fromEntries(form({ first_name: "  María  ", last_name: "Dela  Cruz", middle_name: "  " })));
  assert.equal(r.student_number, "WUP-2026-001");
  assert.equal(r.first_name, "María");
  assert.equal(r.last_name, "Dela Cruz");
  assert.equal(r.middle_name, null);
  assert.equal(r.email, "ana.reyes@example.test");
  assert.equal(canonicalStudentId("﻿ ab/12 "), "AB/12");
  for (const name of ["O'Brien", "Ma. Cristina", "Santos-Reyes", "Jr.", "李"]) assert.ok(registrationSchema.safeParse(Object.fromEntries(form({ last_name: name }))).success, name);
});

test("schema rejects invisible/format characters, non-allowlisted IDs, demo IDs and bad passwords", () => {
  const bad = [
    { student_number: "WUP؀001" }, { student_number: "WUP​001" }, { student_number: "WUP 001" },
    { student_number: "WUP 001" }, { student_number: "WUPİ001" }, { student_number: "demo-0001" },
    { student_number: "-001" }, { student_number: "" }, { student_number: "X".repeat(41) }, { student_number: "A<B" },
    { first_name: "An​a" }, { first_name: "‮Ana" }, { last_name: "ㅤ" }, { last_name: "Re️yes" },
    { first_name: "" }, { first_name: "   " }, { first_name: "<b>" }, { first_name: "x".repeat(81) }, { middle_name: "⁦M" },
    { email: "not-an-email" }, { password: "short", confirm_password: "short" }, { confirm_password: "Different-Pass-1" },
    { password: "x".repeat(73), confirm_password: "x".repeat(73) },
  ];
  for (const overrides of bad) assert.equal(registrationSchema.safeParse(Object.fromEntries(form(overrides))).success, false, JSON.stringify(overrides));
});

test("disabled registration and invalid input never reach Supabase or echo passwords", async () => {
  reset();
  enabled = false;
  assert.match((await registerStudent({}, form())).error, /not open/);
  enabled = true;
  const state = await registerStudent({}, form({ student_number: "WUP؀001", confirm_password: "Other-Pass-22" }));
  assert.ok(state.fieldErrors.student_number && state.fieldErrors.confirm_password);
  assert.equal(state.values.password, "");
  assert.equal(state.values.confirm_password, "");
  assert.equal(leaks(state), false);
  assert.deepEqual(calls, []);
});

test("an already signed-in user cannot register another account", async () => {
  reset({ signedIn: true });
  assert.match((await registerStudent({}, form())).error, /already signed in/);
  assert.equal(signUps().length, 0);
});

test("missing availability RPC (migration not applied) fails closed before signUp", async () => {
  reset({ rpc: () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) });
  const state = await registerStudent({}, form());
  assert.match(state.error, /temporarily unavailable/);
  assert.equal(signUps().length, 0);
});

test("an existing Student ID is rejected before signUp and reveals nothing else", async () => {
  reset({ rpc: () => ({ data: false, error: null }) });
  const state = await registerStudent({}, form());
  assert.match(state.fieldErrors.student_number, /already registered/);
  assert.equal(signUps().length, 0);
  assert.deepEqual(calls[0], ["rpc", "registration_student_id_available", { p_student_number: "WUP-2026-001" }]);
});

test("signUp sends only the v1 identity payload; never role, record ID or password", async () => {
  reset({ signUp: () => ({ data: { user: { id: "fictional-new" }, session: { access_token: "x" } }, error: null }), profile: linked });
  await assert.rejects(registerStudent({}, form()), /REDIRECT:\/portal/);
  const args = signUps()[0][1];
  assert.equal(args.email, "ana.reyes@example.test");
  assert.deepEqual(args.options.data, { wupcare_registration: "new_student_v1", student_number: "WUP-2026-001", first_name: "Ana", last_name: "Reyes" });
  assert.equal(JSON.stringify(args.options.data).includes(PASSWORD), false);

  reset({ signUp: () => ({ data: { user: { id: "fictional-new" }, session: { access_token: "x" } }, error: null }), profile: linked });
  await assert.rejects(registerStudent({}, form({ middle_name: " Santos ", role: "admin", student_id: "fictional-existing", wupcare_role: "admin" })), /REDIRECT:\/portal/);
  assert.deepEqual(Object.keys(signUps()[0][1].options.data).sort(), ["first_name", "last_name", "middle_name", "student_number", "wupcare_registration"]);
  assert.equal(signUps()[0][1].options.data.middle_name, "Santos");
});

test("a session without a linked student record is not presented as success and is signed out", async () => {
  reset({ signUp: () => ({ data: { user: { id: "fictional-new" }, session: { access_token: "x" } }, error: null }), profile: { role: "student", student_id: null, is_active: true } });
  const state = await registerStudent({}, form());
  assert.equal(state.ok, true);
  assert.match(state.message, /still needs to finish/);
  assert.ok(calls.some((c) => c[0] === "signOut"));
});

test("Confirm email still on: no session gives a neutral check-your-email message", async () => {
  reset({ signUp: () => ({ data: { user: { id: "fictional-new", identities: [] }, session: null }, error: null }) });
  const state = await registerStudent({}, form());
  assert.equal(state.ok, true);
  assert.match(state.message, /confirmation link/);
});

test("Auth errors map to safe messages without echoing passwords", async () => {
  const cases = [
    [{ code: "user_already_exists", message: "User already registered", status: 422 }, /email cannot be used/],
    [{ code: "weak_password", message: "Password is too weak", status: 422 }, /highlighted/],
    [{ code: "signup_disabled", message: "Signups not allowed for this instance", status: 422 }, /not open yet/],
    [{ code: "over_request_rate_limit", message: "Request rate limit reached", status: 429 }, /Too many attempts/],
  ];
  for (const [error, pattern] of cases) {
    reset({ signUp: () => ({ data: {}, error }) });
    const state = await registerStudent({}, form());
    assert.match(state.error, pattern);
    assert.equal(leaks(state), false);
    assert.equal(calls.some((c) => c[0] === "signIn"), false);
  }
});

test("session-issuance failure after Auth committed the account recovers by password sign-in", async () => {
  reset({
    signUp: () => ({ data: {}, error: { code: "unexpected_failure", message: "Database error granting user", status: 500 } }),
    signIn: () => ({ data: { user: { id: "fictional-new" }, session: {} }, error: null }),
    profile: linked,
  });
  await assert.rejects(registerStudent({}, form()), /REDIRECT:\/portal/);
});

test("generic trigger failure: lost Student ID race is reported; otherwise a generic error", async () => {
  const dbError = { data: {}, error: { code: "unexpected_failure", message: "Database error saving new user", status: 500 } };
  reset({ signUp: () => dbError, rpc: (_args, n) => ({ data: n === 1, error: null }) });
  let state = await registerStudent({}, form());
  assert.match(state.fieldErrors.student_number, /already registered/);
  assert.ok(calls.some((c) => c[0] === "signIn"));

  reset({ signUp: () => dbError });
  state = await registerStudent({}, form());
  assert.match(state.error, /Could not create the account/);
  assert.equal(leaks(state), false);
});

test("registration form collects names and validates on the client with the shared schema", () => {
  const source = read("app/(public)/register/register-form.tsx");
  for (const field of ["first_name", "middle_name", "last_name", "email", "student_number", "password", "confirm_password"]) assert.match(source, new RegExp(`name="${field}"`));
  assert.match(source, /onSubmit=\{validate\}/);
  assert.match(source, /registrationSchema\.safeParse/);
  assert.doesNotMatch(read("app/(public)/register/page.tsx"), /checks your student record before/);
});

test("migration 0012 keeps the reviewed safeguards", () => {
  assert.doesNotMatch(read("docs/sql/student-self-registration.draft.sql"), /^\s*(create|alter|drop|grant|insert)\b/im);
  const sql = read("supabase/migrations/0012_student_self_registration_v1.sql");
  assert.match(sql, /0011 is NOT applied/);
  // Legacy pending-account payloads are closed for new Auth users and fail closed.
  assert.match(sql, /new\.created_at >= coalesce\(\s*\(select p\.legacy_signup_cutoff from private\.registration_policy p\), '-infinity'::timestamptz\)/);
  assert.match(sql, /This registration method is no longer available/);
  assert.doesNotMatch(sql, /^\s*(begin|commit);/im);
  // Rollback restores the exact 0010 trigger body.
  const fn = (text) => text.slice(text.indexOf("create or replace function private.handle_new_auth_user()"), text.indexOf("revoke all on function private.handle_new_auth_user()"));
  assert.equal(fn(read("docs/sql/student-self-registration.rollback.sql")), fn(read("supabase/migrations/0010_student_self_registration.sql")));
  assert.match(sql, /\^\[A-Z0-9\]\[A-Z0-9\.\/_-\]\{0,39\}\$/);
  assert.match(sql, /Unsupported registration version/);
  assert.match(sql, /students_student_number_canonical_key/);
  assert.doesNotMatch(sql, /on conflict \([^)]*\) do update/i);
  assert.doesNotMatch(sql, /create policy|alter policy|drop policy|grant (select|insert|update|delete)/i);
  assert.match(sql, /grant execute on function public\.registration_student_id_available\(text\) to anon;/);
  const schema = read("features/registration/schema.ts");
  assert.match(schema, /\^\[A-Z0-9\]\[A-Z0-9\.\/_-\]\{0,39\}\$/);
});
