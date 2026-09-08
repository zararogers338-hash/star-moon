const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
const copySource = source.slice(source.indexOf("const NATIVE_COPY"), source.indexOf("function updateTrayMenu"));
const handlerSource = source.slice(source.indexOf('  handle("launcher:uninstall-integration"'), source.indexOf('  handle("launcher:setup-core"'));

function fixture(response, language = "zh-CN", fail = false) {
  let handler;
  const calls = [];
  let options;
  vm.runInNewContext(copySource + handlerSource, {
    handle: (_name, callback) => { handler = callback; },
    IS_DEV_PROFILE: false, mainWindow: {},
    stateStore: { read: () => ({ language }), update: patch => { calls.push("state"); return patch; } },
    dialog: { showMessageBox: async (_window, value) => { options = value; return { response }; } },
    runtimeHost: { uninstallIntegration: async () => { calls.push("uninstall"); if (fail) throw new Error("cleanup failed"); } },
    browserHost: { writeDescriptor: () => calls.push("descriptor") },
    send: () => calls.push("notify"), stopCatalogVerificationMonitor: () => calls.push("stop-monitor"),
  });
  return { run: () => handler(), calls, get options() { return options; } };
}

test("farewell has one sentence, exactly two choices, and defaults to cancelling", async () => {
  const f = fixture(0);
  const result = await f.run();
  assert.equal(result.cancelled, true);
  assert.equal(f.options.message, "愿星光与你同行，我们下次再会");
  assert.deepEqual(Array.from(f.options.buttons), ["取消卸载", "确认卸载"]);
  assert.equal(f.options.defaultId, 0);
  assert.equal(f.options.cancelId, 0);
  assert.equal(f.options.type, "none");
  assert.equal("detail" in f.options, false);
  assert.deepEqual(f.calls, []);
});

test("only explicit native confirmation invokes removal; failures do not publish success", async () => {
  const f = fixture(1);
  const result = await f.run();
  assert.equal(result.cancelled, false);
  assert.deepEqual(f.calls, ["uninstall", "descriptor", "state", "notify", "stop-monitor"]);
  const failed = fixture(1, "zh-CN", true);
  await assert.rejects(failed.run(), /cleanup failed/);
  assert.deepEqual(failed.calls, ["uninstall", "descriptor"]);
});

test("all seven native farewell dialogs keep exactly two localized choices", async () => {
  for (const language of ["en", "zh-CN", "zh-Hant", "fr", "ja", "ru", "de"]) {
    const f = fixture(0, language);
    await f.run();
    assert.equal(f.options.buttons.length, 2);
    assert.ok(f.options.message.length > 10);
    assert.equal("detail" in f.options, false);
    assert.deepEqual(f.calls, []);
  }
});
