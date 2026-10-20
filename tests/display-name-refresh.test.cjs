const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock, fresh } = require("./register.cjs");
const { queryClient } = require("./query-client.cjs");
const { harness, find } = require("./confirmation-harness.cjs");
// Static image imports belong to Next's bundler, not this Node test loader.
mock("@/components/app/clinic-shell", { ClinicShell() {} });

for (const role of ["admin", "clinic_staff", "student"]) {
  test(`${role}: successful save supplies the fresh name to sidebar, dropdown and dashboard`, async () => {
    let name = "Original Name";
    const refreshed = [];
    mock("@/lib/auth/dal", { requireRole: async (...roles) => {
      assert.ok(roles.includes(role));
      return { id: "fictional-self", fullName: name, email: "fictional@example.test", role };
    } });
    mock("next/cache", { revalidatePath: (...args) => refreshed.push(args) });
    const reads = queryClient({ appointments: [], profiles: [{ id: "fictional-self", student_id: null }] });
    mock("@/lib/supabase/server", { createClient: async () => ({
      from(table) {
        if (table !== "profiles") return reads.from(table);
        return { ...reads.from(table), update(values) {
          return { eq(key, id) {
            assert.equal(key, "id"); assert.equal(id, "fictional-self");
            name = values.full_name;
            return { select: async () => ({ data: [{ id }], error: null }) };
          } };
        } };
      },
      rpc: async (fn, args) => {
        assert.equal(fn, "update_own_display_name");
        name = args.p_full_name;
        return { error: null };
      },
    }) });
    const layoutFile = role === "student" ? "../app/(portal)/layout.tsx" : "../app/(clinic)/layout.tsx";
    const Layout = fresh(layoutFile).default;
    assert.equal((await Layout({ children: null })).props.user.fullName, "Original Name");
    const data = new FormData(); data.set("full_name", "Ana Reyes");
    assert.equal((await fresh("../features/account/actions.ts").updateDisplayName({}, data)).ok, true);
    assert.deepEqual(refreshed, [["/", "layout"]]);
    const shell = await Layout({ children: null });
    assert.equal(shell.props.user.fullName, "Ana Reyes");
    const menu = harness("../components/app/account-menu.tsx", "AccountMenu", {
      user: shell.props.user, accountHref: role === "student" ? "/portal/account" : "/account",
      onNavigate() {}, onLogout() {},
    });
    try {
      const trigger = find(menu.render(), (n) => n.type === "button");
      assert.match(trigger.props["aria-label"], /Ana Reyes/);
    } finally { menu.restore(); }
    const page = await fresh(role === "student" ? "../app/(portal)/portal/page.tsx" : "../app/(clinic)/dashboard/page.tsx").default();
    assert.match(find(page, (n) => n.type?.name === "PageHeader").props.title, /^Hello, Ana!?$/);
  });
}
