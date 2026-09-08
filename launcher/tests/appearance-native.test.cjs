const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { createStateStore, validateTheme } = require("../electron/state.cjs");

test("moon theme persists without changing browser interaction mode or setup receipts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-theme-"));
  try {
    const file = path.join(directory, "state.json");
    fs.writeFileSync(file, JSON.stringify({ version: 1, language: "zh-CN", onboardingComplete: true, browserInteractionMode: "manual", mcpGuideStep: 1, codexCatalogVerified: false }));
    const store = createStateStore(file);
    assert.equal(store.read().theme, "light");
    const before = store.read();
    store.update({ theme: validateTheme("dark") });
    assert.deepEqual(createStateStore(file).read(), { ...before, theme: "dark" });
    store.update({ theme: validateTheme("light") });
    assert.deepEqual(createStateStore(file).read(), before);
    fs.writeFileSync(file, JSON.stringify({ ...before, theme: "invalid" }));
    assert.deepEqual(createStateStore(file).read(), before);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("real theme IPC validates before writing and propagates persistence errors", () => {
  const source = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
  const snippet = source.slice(source.indexOf('  handle("launcher:set-theme"'), source.indexOf('  handle("launcher:complete-onboarding"'));
  let handler;
  let state = { theme: "light" };
  let writes = 0;
  let fail = false;
  vm.runInNewContext(snippet, {
    handle: (name, callback) => { assert.equal(name, "launcher:set-theme"); handler = callback; },
    validateTheme,
    stateStore: { update: patch => { if (fail) throw new Error("disk full"); writes += 1; state = { ...state, ...patch }; return state; } },
  });
  for (const value of [null, false, 1, "automatic", "manual", "system", { theme: "dark" }]) assert.throws(() => handler({}, value), /Theme must/);
  assert.equal(writes, 0);
  assert.equal(handler({}, "dark").theme, "dark");
  fail = true;
  assert.throws(() => handler({}, "light"), /disk full/);
  assert.equal(writes, 1);
  assert.equal(state.theme, "dark");
});
