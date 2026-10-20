// Test-only TypeScript loader: reuse the project's compiler; no test dependency.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const mocks = new Map();
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  return resolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, ...args);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    module._compile(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText, filename);
  };
}
const load = Module._load;
Module._load = function (request, parent, ...args) {
  const key = request.startsWith("@/") ? path.join(root, request.slice(2)) : request;
  if (mocks.has(key)) return mocks.get(key);
  if (request === "server-only") return {};
  return load.call(this, request, parent, ...args);
};
exports.mock = (name, value) => mocks.set(name.startsWith("@/") ? path.join(root, name.slice(2)) : name, value);
exports.unmock = (name) => mocks.delete(name.startsWith("@/") ? path.join(root, name.slice(2)) : name);
exports.fresh = (name) => { delete require.cache[require.resolve(name)]; return require(name); };
// Never load .env files or allow a test to reach Supabase, even by mistake.
for (const key of Object.keys(process.env)) if (/SUPABASE|ADMIN_PASSWORD/.test(key)) delete process.env[key];
global.fetch = async () => { throw new Error("Network access is forbidden in automated tests"); };
exports.mock("@/lib/supabase/server", { createClient: async () => { throw new Error("Use an isolated Supabase mock"); } });
exports.mock("@/lib/supabase/admin", { createAdminClient: () => { throw new Error("Live account access is forbidden"); } });
exports.mock("next/cache", { revalidatePath() {} });
exports.mock("next/server", { connection: async () => {} });
exports.mock("next/navigation", { redirect: (url) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } });
