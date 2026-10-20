const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { mock, fresh } = require("./register.cjs");
const { find } = require("./confirmation-harness.cjs");

test("name form validates locally, blocks duplicate submits, and reports save/retry states", async () => {
  let state = {}, pending = false, locked = { current: false }, calls = 0;
  let release;
  mock("react", { ...React, useRef: () => locked, useActionState: (action) => [state, async (data) => {
    pending = true;
    try { state = await action(state, data); } finally { pending = false; }
  }, pending] });
  mock("./actions", { updateDisplayName: async (_state, data) => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return { ok: true, message: "Display name saved.", values: { full_name: data.get("full_name") } };
  } });
  try {
    const { DisplayNameForm } = fresh("../features/account/display-name-form.tsx");
    const render = () => DisplayNameForm({ current: "Original Name" });
    const data = (value) => { const f = new FormData(); f.set("full_name", value); return f; };
    for (const invalid of ["", " ", "x".repeat(121), "Ana\nReyes", "Ana\u200bReyes", "<name>"]) {
      await render().props.action(data(invalid));
      assert.ok(state.fieldErrors.full_name);
      assert.equal(calls, 0);
    }
    const before = render();
    let prevented = 0;
    const event = { preventDefault: () => prevented++ };
    before.props.onSubmit(event);
    before.props.onSubmit(event);
    assert.equal(prevented, 1); // same tick, before React marks pending
    const saving = before.props.action(data("Maria Santos"));
    assert.equal(render().props["aria-busy"], true);
    render().props.onSubmit(event);
    assert.equal(prevented, 2);
    release();
    await saving;
    assert.equal(calls, 1);
    assert.equal(locked.current, false);
    const saved = render();
    assert.equal(find(saved, (n) => n.type?.name === "FormAlert").props.state.message, "Display name saved.");
    assert.equal(find(saved, (n) => n.type?.name === "TextField").props.defaultValue, "Maria Santos");
    mock("./actions", { updateDisplayName: async () => { throw new Error("offline"); } });
    const RetryForm = fresh("../features/account/display-name-form.tsx").DisplayNameForm;
    await RetryForm({ current: "Maria Santos" }).props.action(data("Ana Reyes"));
    assert.match(state.error, /Try again/);
    assert.equal(state.values.full_name, "Ana Reyes");
    assert.equal(locked.current, false);
  } finally { mock("react", React); }
});
