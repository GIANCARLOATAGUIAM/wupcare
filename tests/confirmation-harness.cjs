// Tiny hook/event harness for existing Node tests; no DOM or live clients.
// This exercises our lifecycle callbacks, not Radix's browser focus trap.
const React = require("react");
const { mock, fresh } = require("./register.cjs");

exports.harness = function (file, name, props, context = () => {}) {
  const slots = [], tasks = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (value) => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useTransition() {
      const index = cursor++;
      slots[index] ??= { pending: false };
      return [slots[index].pending, (work) => {
        slots[index].pending = true;
        tasks.push(Promise.resolve(work()).finally(() => { slots[index].pending = false; }));
      }];
    },
    useContext: () => context,
    useEffect() {}, // effects are browser-only; tests drive handlers directly
    useId: () => "fictional-id",
  };
  mock("react", hooks);
  fresh("../components/app/use-action-runner.ts");
  const Component = fresh(file)[name];
  return {
    render(next = props) { cursor = 0; return Component(next); },
    async flush() { await Promise.all(tasks.splice(0)); },
    restore() { mock("react", React); },
  };
};

exports.find = function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (Array.isArray(tree)) { for (const node of tree) { const found = find(node, predicate); if (found) return found; } return null; }
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
};
