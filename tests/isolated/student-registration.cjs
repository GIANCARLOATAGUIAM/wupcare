// Explicit local-only integration runner. Never loads .env or a remote URL.
// Dependencies/runtime live outside the repo; see the validation report.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { randomBytes, createHmac, createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const repo = path.resolve(__dirname, "../..");
const toolsRoot = path.resolve(process.argv[2] || path.join(os.tmpdir(), "wupcare-registration-validation"));
const authExecutable = process.argv[3] && path.resolve(process.argv[3]);
const results = [];
const draft = fs.readFileSync(path.join(repo, "supabase/migrations/0012_student_self_registration_v1.sql"), "utf8");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const empty = "00000000-0000-0000-0000-000000000000";
const metadata = (number, extra = {}) => ({ wupcare_registration: "new_student_v1", student_number: number, first_name: "Fictional", last_name: "Student", ...extra });

async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}

async function main() {
  assert.ok(authExecutable && fs.existsSync(authExecutable), "Pass an explicitly local Supabase Auth executable");
  const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(toolsRoot, "node_modules/embedded-postgres/dist/index.js")));
  const { Client } = require(path.join(toolsRoot, "node_modules/pg"));
  const dbPort = await port(), apiPort = await port();
  const password = randomBytes(24).toString("hex");
  const jwtSecret = randomBytes(32).toString("hex");
  const fixturePassword = randomBytes(20).toString("base64url") + "!aA1";
  const databaseDir = fs.mkdtempSync(path.join(toolsRoot, "cluster-"));
  const pg = new EmbeddedPostgres({ databaseDir, user: "postgres", password, port: dbPort, persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"], onLog() {}, onError() {} });
  const config = { host: "127.0.0.1", port: dbPort, user: "postgres", password, database: "postgres", ssl: false };
  const admin = new Client(config);
  let auth, authLogs = "", smtpConnections = 0;
  const smtpTrap = net.createServer((socket) => { smtpConnections++; socket.destroy(); });
  const allPublic = ["profiles", "students", "health_records", "appointments", "clinic_visits", "health_incidents", "medicines", "medication_transactions", "clinic_settings", "health_concern_categories"];
  let serial = 0;
  const email = () => `isolated-${++serial}@example.test`;
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  const jwt = (role) => {
    const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, aud: "authenticated", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 })}`;
    return `${body}.${createHmac("sha256", jwtSecret).update(body).digest("base64url")}`;
  };
  async function request(route, body, token) {
    const url = new URL(route, `http://127.0.0.1:${apiPort}`);
    assert.equal(url.hostname, "127.0.0.1");
    const response = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
    return { status: response.status, data: await response.json() };
  }
  const signup = (number, extra, address = email()) => request("/signup", { email: address, password: fixturePassword, data: metadata(number, extra) });
  async function adminUser(role, extra = {}) {
    const response = await request("/admin/users", { email: email(), password: fixturePassword, email_confirm: true, app_metadata: { wupcare_role: role, full_name: `Fictional ${role}`, ...extra } }, jwt("service_role"));
    assert.equal(response.status, 200, "local Auth admin creation should succeed");
    return response.data.user ?? response.data;
  }
  const rows = async (query, args) => (await admin.query(query, args)).rows;
  const scalar = async (query, args) => Object.values((await rows(query, args))[0])[0];
  const totals = async () => Object.fromEntries(await Promise.all(["auth.users", "auth.identities", ...["profiles", "students", "health_records"].map((v) => `public.${v}`)].map(async (table) => [table, Number(await scalar(`select count(*) from ${table}`))])));
  async function roleQuery(id, work, role = "authenticated") {
    assert.ok(["authenticated", "anon"].includes(role));
    const client = new Client(config); await client.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role })]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { await client.end(); }
  }
  async function check(name, work) {
    try { await work(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: "FAIL", reason: error.code || error.message.replaceAll(password, "[redacted]").replaceAll(jwtSecret, "[redacted]").replaceAll(fixturePassword, "[redacted]") }); console.log(`FAIL ${name}: ${error.code || "assertion"}`); }
  }
  async function linked(userId) {
    return (await rows("select p.*, s.student_number, s.created_by, s.is_demo, s.status as student_status from public.profiles p join public.students s on s.id=p.student_id where p.id=$1", [userId]))[0];
  }
  async function expectSignupRollback(number, extra = {}) {
    const before = await totals();
    const response = await signup(number, extra);
    assert.ok(response.status >= 400, "registration must be rejected");
    assert.deepEqual(await totals(), before, "Auth, identity, profile, student and health counts must be unchanged");
    return response;
  }
  try {
    await pg.initialise(); await pg.start(); await admin.connect();
    await admin.query(`
      create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role supabase_auth_admin login password '${password}';
      create schema auth authorization supabase_auth_admin;
      alter role supabase_auth_admin set search_path to auth, public;
      grant usage on schema public to supabase_auth_admin;
      create extension if not exists pgcrypto; create extension if not exists "uuid-ossp";
    `);
    await new Promise((resolve) => smtpTrap.listen(0, "127.0.0.1", resolve));
    const env = Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    Object.assign(env, {
      GOTRUE_DB_DRIVER: "postgres", GOTRUE_DB_NAMESPACE: "auth", DB_NAMESPACE: "auth",
      DATABASE_URL: `postgres://supabase_auth_admin:${password}@127.0.0.1:${dbPort}/postgres?sslmode=disable`,
      GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@127.0.0.1:${dbPort}/postgres?sslmode=disable`,
      GOTRUE_JWT_SECRET: jwtSecret, GOTRUE_JWT_EXP: "3600", GOTRUE_JWT_AUD: "authenticated", GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_SITE_URL: "http://127.0.0.1:3000", API_EXTERNAL_URL: `http://127.0.0.1:${apiPort}`,
      GOTRUE_API_HOST: "127.0.0.1", PORT: String(apiPort), GOTRUE_API_PORT: String(apiPort),
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_DISABLE_SIGNUP: "false", GOTRUE_MAILER_AUTOCONFIRM: "true",
      GOTRUE_SMTP_HOST: "127.0.0.1", GOTRUE_SMTP_PORT: String(smtpTrap.address().port), GOTRUE_SMTP_ADMIN_EMAIL: "isolated@example.test",
      GOTRUE_PASSWORD_MIN_LENGTH: "8", GOTRUE_LOG_LEVEL: "error", GOTRUE_RATE_LIMIT_SIGNUP: "1000",
    });
    auth = spawn(authExecutable, [], { cwd: path.dirname(authExecutable), env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    auth.stdout.on("data", (chunk) => { authLogs += chunk.toString(); });
    auth.stderr.on("data", (chunk) => { authLogs += chunk.toString(); });
    let healthy = false;
    for (let i=0; i<200; i++) {
      if (auth.exitCode !== null) break;
      try { if ((await request("/health")).status === 200) { healthy = true; break; } } catch {}
      await delay(100);
    }
    if (!healthy) throw Error(`Local Auth startup failed: ${authLogs.replaceAll(password, "[redacted]").replaceAll(jwtSecret, "[redacted]").slice(-4000)}`);
    console.log(`Local PostgreSQL ${await scalar("show server_version")} and real Supabase Auth ready`);
    await admin.query(`
      create or replace function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
          nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    const files = fs.readdirSync(path.join(repo, "supabase/migrations")).filter((file) => /^\d{4}_.*\.sql$/.test(file) && Number(file.slice(0,4)) <= 11).sort();
    for (const file of files) await admin.query(fs.readFileSync(path.join(repo, "supabase/migrations", file), "utf8"));
    const nurse = await adminUser("clinic_staff"), otherNurse = await adminUser("clinic_staff"), administrator = await adminUser("admin");
    const existing = await roleQuery(nurse.id, async (client) => (await client.query("insert into public.students(student_number,first_name,last_name) values ('FICTION-EXIST','Existing','Fictional') returning id")).rows[0].id);
    const legacyStudent = await adminUser("student", { student_id: existing });
    const legacyPending = await request("/signup", { email: email(), password: fixturePassword, data: { student_number: "FICTION-PENDING" } });
    assert.ok(legacyPending.status < 300);
    const beforeMigration = {};
    for (const table of allPublic) beforeMigration[table] = hash(JSON.stringify(await rows(`select * from public.${table} order by id`)));
    const policies = JSON.stringify(await rows("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname"));
    await check("migration refuses pre-existing canonical ID collisions without partial DDL", async () => {
      const duplicate = await scalar("insert into public.students(student_number,first_name,last_name,created_by) values ('fiction-exist','Collision','Fixture',null) returning id");
      try { await assert.rejects(admin.query(draft), /normalization conflicts/); }
      finally { await admin.query("rollback"); }
      assert.equal(await scalar("select to_regprocedure('public.registration_student_id_available(text)')"), null);
      await admin.query("delete from public.health_records where student_id=$1", [duplicate]);
      await admin.query("delete from public.students where id=$1", [duplicate]);
    });
    await admin.query(draft);
    await check("migration preserves every baseline public row and all RLS policies", async () => {
      for (const table of allPublic) assert.equal(hash(JSON.stringify(await rows(`select * from public.${table} order by id`))), beforeMigration[table], table);
      assert.equal(JSON.stringify(await rows("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")), policies);
    });
    let student, profile;
    await check("real Auth signup atomically creates user, identity, student, empty health record and linked profile", async () => {
      const before = await totals();
      const result = await signup("  fiction-new  ");
      assert.equal(result.status, 200);
      assert.ok(result.data.access_token, "immediate session required");
      student = result.data.user; profile = await linked(student.id);
      assert.ok(profile);
      assert.equal(profile.role, "student"); assert.equal(profile.student_number, "FICTION-NEW");
      assert.equal(profile.created_by, student.id); assert.equal(profile.is_active, true); assert.equal(profile.is_demo, false);
      const after = await totals();
      for (const table of Object.keys(before)) assert.equal(after[table], before[table]+1, table);
      const health = (await rows("select * from public.health_records where student_id=$1", [profile.student_id]))[0];
      assert.ok(health && health.medical_history === null && health.allergies === null && health.health_notes === null);
      const login = await request("/token?grant_type=password", { email: student.email, password: fixturePassword });
      assert.equal(login.status, 200); assert.ok(login.data.access_token);
    });
    await check("duplicate exact, case-variant and trimmed Student IDs roll back the Auth signup", async () => {
      for (const value of ["FICTION-EXIST", "fiction-exist", "  Fiction-Exist  "]) {
        const response = await expectSignupRollback(value);
        const body = JSON.stringify(response.data);
        assert.ok(!body.includes(existing) && !body.includes("Existing Fictional"));
      }
    });
    await check("duplicate email cannot create extra profile/student/health rows", async () => {
      const before = await totals();
      const response = await signup("FICTION-UNUSED", {}, student.email);
      assert.ok(response.status >= 400);
      assert.deepEqual(await totals(), before);
    });
    await check("post-commit session failure retains a complete account that can recover through password login", async () => {
      const before = await totals(), address = email();
      await admin.query("create function auth.isolated_session_fail() returns trigger language plpgsql as $$begin raise exception 'isolated token issuance failure'; end;$$; create trigger isolated_session_fail before insert on auth.sessions for each row execute function auth.isolated_session_fail();");
      let response;
      try { response = await signup("FICTION-SESSION-FAIL", {}, address); }
      finally { await admin.query("drop trigger isolated_session_fail on auth.sessions; drop function auth.isolated_session_fail();"); }
      assert.ok(response.status >= 400);
      const after = await totals();
      for (const table of Object.keys(before)) assert.equal(after[table], before[table]+1, table);
      const login = await request("/token?grant_type=password", { email: address, password: fixturePassword });
      assert.equal(login.status, 200);
      assert.ok(await linked(login.data.user.id));
    });
    await check("invalid and hostile metadata cannot choose account role, student UUID or audit identity", async () => {
      for (const extra of [{ first_name: "" }, { first_name: { nested: "name" } }, { last_name: "X\nY" }, { middle_name: null }, { first_name: "x".repeat(81) }]) await expectSignupRollback("FICTION-INVALID", extra);
      const response = await signup("FICTION-HOSTILE", { role: "admin", wupcare_role: "admin", student_id: existing, is_active: false, is_demo: true, created_by: administrator.id, status: "graduated" });
      assert.equal(response.status, 200);
      const p = await linked(response.data.user.id);
      assert.equal(p.role, "student"); assert.notEqual(p.student_id, existing); assert.equal(p.created_by, p.id);
      assert.equal(p.student_status, "active"); assert.equal(p.is_demo, false); assert.equal(p.is_active, true);
      const raw = await request("/signup", { email: email(), password: fixturePassword, data: metadata("FICTION-RAW-ROLE"), app_metadata: { wupcare_role: "admin", student_id: existing } });
      assert.equal(raw.status, 200);
      assert.equal((await linked(raw.data.user.id)).role, "student");
    });
    for (const stage of ["health", "profile", "audit"]) {
      await check(`${stage} failure rolls back Auth user, identity and all application inserts`, async () => {
        const number = `FICTION-FAIL-${stage.toUpperCase()}`;
        const triggerTable = { health: "health_records", profile: "profiles", audit: "students" }[stage];
        const condition = stage === "health" ? `exists(select 1 from public.students where id=new.student_id and student_number='${number}')` : stage === "profile" ? `new.requested_student_number='${number}'` : `new.student_number='${number}'`;
        await admin.query(`create function public.isolated_fail() returns trigger language plpgsql as $$begin if ${condition} then raise exception 'isolated injected failure'; end if; return new; end;$$; create trigger isolated_fail before ${stage === "audit" ? "update" : "insert"} on public.${triggerTable} for each row execute function public.isolated_fail();`);
        try { await expectSignupRollback(number); }
        finally { await admin.query(`drop trigger isolated_fail on public.${triggerTable}; drop function public.isolated_fail();`); }
      });
    }
    await check("two overlapping Auth registrations produce exactly one canonical Student ID and no loser orphans", async () => {
      const before = await totals();
      await admin.query("create function public.isolated_race() returns trigger language plpgsql as $$begin if upper(btrim(new.student_number))='FICTION-RACE' then perform pg_advisory_xact_lock(715193); end if; return new; end;$$; create trigger isolated_race before insert on public.students for each row execute function public.isolated_race();");
      await admin.query("select pg_advisory_lock(715193)");
      const a = signup("FICTION-RACE"), b = signup(" fiction-race ");
      let waiting = 0;
      try {
        for (let i=0; i<100; i++) { waiting = Number(await scalar("select count(*) from pg_stat_activity where wait_event='advisory' and datname=current_database()")); if (waiting >= 2) break; await delay(50); }
      } finally { await admin.query("select pg_advisory_unlock(715193)"); }
      const outcomes = await Promise.all([a,b]);
      await admin.query("drop trigger isolated_race on public.students; drop function public.isolated_race();");
      assert.equal(waiting, 2, "both independent signup transactions must overlap at the barrier");
      assert.equal(outcomes.filter((r) => r.status === 200).length, 1);
      assert.equal(outcomes.filter((r) => r.status >= 400).length, 1);
      const after = await totals();
      for (const table of Object.keys(before)) assert.equal(after[table], before[table]+1, table);
    });
    await check("anonymous availability RPC returns only a boolean; direct records and private trigger stay inaccessible", async () => {
      await roleQuery(empty, async (client) => {
        const result = await client.query("select public.registration_student_id_available(' fiction-exist ') as available");
        assert.deepEqual(result.rows, [{ available: false }]);
      }, "anon");
      for (const query of ["select * from public.students", "select private.handle_new_auth_user()", "select * from public.profiles"]) await assert.rejects(roleQuery(empty, (client) => client.query(query), "anon"), { code: "42501" });
      await assert.rejects(roleQuery(student.id, (client) => client.query("select public.registration_student_id_available('FICTION-EXIST')")), { code: "42501" });
    });
    const second = await signup("FICTION-SECOND"), secondProfile = await linked(second.data.user.id);
    let appointment;
    await check("new Student can immediately request and read own appointment under existing RLS", async () => {
      appointment = await roleQuery(student.id, async (client) => {
        const day = (await client.query("select d::date::text as day from generate_series(private.manila_today()+1,private.manila_today()+7,interval '1 day') d where extract(isodow from d) between 1 and 5 limit 1")).rows[0].day;
        return (await client.query("insert into public.appointments(student_id,preferred_date,preferred_time,reason) values ($1,$2,'09:00','Isolated test') returning id", [profile.student_id, day])).rows[0].id;
      });
      const result = await roleQuery(student.id, (client) => client.query("select id from public.appointments"));
      assert.deepEqual(result.rows.map((r) => r.id), [appointment]);
    });
    await check("other Students cannot read/modify appointments, link records, self-promote, or access clinical tables", async () => {
      const other = second.data.user.id;
      assert.equal((await roleQuery(other, (client) => client.query("select id from public.appointments"))).rowCount, 0);
      assert.equal((await roleQuery(other, (client) => client.query("update public.appointments set status='cancelled' where id=$1", [appointment]))).rowCount, 0);
      for (const table of ["students", "health_records", "clinic_visits", "health_incidents", "medicines", "medication_transactions"]) assert.equal((await roleQuery(student.id, (client) => client.query(`select * from public.${table}`))).rowCount, 0, table);
      const own = await roleQuery(student.id, (client) => client.query("select id from public.profiles"));
      assert.deepEqual(own.rows.map((r) => r.id), [student.id]);
      assert.equal((await roleQuery(student.id, (client) => client.query("update public.profiles set role='admin',student_id=$1 where id=$2", [secondProfile.student_id, student.id]))).rowCount, 0);
      await assert.rejects(roleQuery(student.id, (client) => client.query("select public.approve_student_link($1,$2)", [student.id, existing])), { code: "42501" });
      assert.equal((await linked(student.id)).student_id, profile.student_id);
    });
    await check("Nurses share new records and Admin account listing retains restricted clinical access", async () => {
      for (const account of [nurse, otherNurse]) assert.equal((await roleQuery(account.id, (client) => client.query("select id from public.students where id=$1", [profile.student_id]))).rowCount, 1);
      await roleQuery(otherNurse.id, (client) => client.query("update public.health_records set health_notes='Isolated fictional note' where student_id=$1", [profile.student_id]));
      assert.equal(await scalar("select updated_by from public.health_records where student_id=$1", [profile.student_id]), otherNurse.id);
      assert.equal((await roleQuery(administrator.id, (client) => client.query("select id from public.profiles where role='student' and id=$1", [student.id]))).rowCount, 1);
      const numbers = await roleQuery(administrator.id, (client) => client.query("select * from public.account_student_numbers()"));
      assert.ok(numbers.rows.some((r) => r.profile_id === student.id && r.student_number === "FICTION-NEW"));
      assert.equal((await roleQuery(administrator.id, (client) => client.query("select id from public.health_records"))).rowCount, 0);
      assert.equal((await roleQuery(administrator.id, (client) => client.query("select id from public.students"))).rowCount, 0);
    });
    await check("Admin/Nurse provisioning and existing linked/pending accounts remain compatible", async () => {
      for (const role of ["admin", "clinic_staff"]) assert.equal(await scalar("select role from public.profiles where id=$1", [(await adminUser(role)).id]), role);
      assert.equal((await linked(legacyStudent.id)).student_id, existing);
      assert.equal(await scalar("select student_id from public.profiles where id=$1", [legacyPending.data.user.id]), null);
      const count = await totals();
      await admin.query("update auth.users set raw_app_meta_data=raw_app_meta_data||'{\"test_repeat\":true}'::jsonb where id=$1", [student.id]);
      assert.deepEqual(await totals(), count);
      assert.equal((await linked(student.id)).student_id, profile.student_id);
    });
    await check("deactivation denies the Nurse clinical access and preserves records for another Nurse", async () => {
      const before = Number(await scalar("select count(*) from public.students"));
      await roleQuery(administrator.id, (client) => client.query("update public.profiles set is_active=false where id=$1", [nurse.id]));
      assert.equal((await roleQuery(nurse.id, (client) => client.query("select id from public.students"))).rowCount, 0);
      assert.equal((await roleQuery(otherNurse.id, (client) => client.query("select id from public.students"))).rowCount, before);
      assert.equal(Number(await scalar("select count(*) from public.students")), before);
    });
    await check("uncovered Unicode format controls cannot enter Student IDs via direct Auth signup", async () => {
      await expectSignupRollback("FICTION-FORMAT\u0600");
      for (const value of ["FICTION\u200bZW", "FICTION\u2066BIDI", "\ufeffFICTION-BOM", "FICTION ID", "FICT\u0130ON-DOT", "FICTION\u00a0NBSP", "DEMO-FICTION", "-FICTION"]) await expectSignupRollback(value);
    });
    await check("invisible or blank names cannot enter student records via direct Auth signup", async () => {
      for (const extra of [{ first_name: "Fict\u200bional" }, { last_name: "Stu\u202edent" }, { middle_name: "\u2066M" }, { first_name: "\u00a0\u3000" }, { last_name: "\u3164" }, { first_name: "Fict\ufe0fional" }]) await expectSignupRollback("FICTION-NAME", extra);
    });
    await check("unknown version markers cannot silently bypass direct-registration validation", async () => {
      await expectSignupRollback("FICTION-UNKNOWN", { wupcare_registration: "new_student_v2" });
      await expectSignupRollback("FICTION-UNKNOWN", { wupcare_registration: 1 });
      await expectSignupRollback("FICTION-UNKNOWN", { wupcare_registration: null });
      assert.equal(Number(await scalar("select count(*) from public.profiles where requested_student_number='FICTION-UNKNOWN'")), 0);
    });
    await check("availability RPC rejects non-allowlisted Student IDs without revealing existence", async () => {
      for (const value of ["FICTION\u0600", "FICTION ID", "DEMO-1", ""]) await assert.rejects(roleQuery(empty, (client) => client.query("select public.registration_student_id_available($1)", [value]), "anon"), { code: "22023" });
    });
    await check("legacy pending-account payload is closed for new real Auth signups", async () => {
      await expectSignupRollback("FICTION-LEGACY-NEW", { wupcare_registration: undefined });
      const raw = await request("/signup", { email: email(), password: fixturePassword, data: { student_number: "FICTION-LEGACY-RAW" } });
      assert.ok(raw.status >= 400);
      assert.equal(Number(await scalar("select count(*) from public.profiles where requested_student_number like 'FICTION-LEGACY-%'")), 0);
      assert.equal(await scalar("select student_id from public.profiles where id=$1", [legacyPending.data.user.id]), null);
    });
    await check("no SMTP message was attempted by the isolated Auth workflow", async () => assert.equal(smtpConnections, 0));
  } finally {
    if (auth && auth.exitCode === null) { auth.kill(); await new Promise((resolve) => auth.once("exit", resolve)); }
    await admin.end().catch(() => {});
    await pg.stop().catch(() => {});
    await new Promise((resolve) => smtpTrap.close(resolve));
    fs.writeFileSync(path.join(repo, "tests/isolated/student-registration-results.json"), JSON.stringify({ draft_sha256: hash(draft), runtime: "PostgreSQL 17.6 + real Supabase Auth v2.197.0", local_only: true, results }, null, 2) + "\n");
  }
  const failures = results.filter((r) => r.status === "FAIL");
  console.log(`${results.length-failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
}
main().then(() => { process.exit(process.exitCode || 0); }).catch((error) => { console.error(`Isolated runner failed: ${error.message}`); process.exit(1); });
