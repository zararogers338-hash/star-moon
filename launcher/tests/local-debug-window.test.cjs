const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("native DevTools uses an explicit local opt-in and exact same-port origin", () => {
  const source = fs.readFileSync(require.resolve("../electron/main.cjs"), "utf8");
  const from = source.indexOf('  if (process.argv.includes("--local-debug-window"))');
  const to = source.indexOf('\n  }', from) + 4;
  assert.ok(from >= 0 && to > from);
  for (const enabled of [false, true]) {
    const calls = [];
    vm.runInNewContext(source.slice(from, to), {
      process: { argv: enabled ? ["--local-debug-window"] : [] }, cdpPort: 42341,
      app: { commandLine: { appendSwitch: (...args) => calls.push(args) } },
    });
    assert.deepEqual(calls, enabled ? [["remote-allow-origins", "http://127.0.0.1:42341"]] : []);
    assert.ok(!JSON.stringify(calls).includes("*"));
  }
});
