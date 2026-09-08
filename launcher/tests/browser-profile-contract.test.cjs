const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { EventEmitter } = require("node:events");
const { resolveLauncherProfile } = require("../electron/profile.cjs");

function browserFixture() {
  const filename = path.join(__dirname, "../electron/browser-host.cjs");
  const source = fs.readFileSync(filename, "utf8"), localRequire = createRequire(filename);
  const createdViews = [], addedViews = [];
  const fakeElectron = { clipboard: {}, WebContentsView: class {
    constructor(options) {
      createdViews.push(options);
      this.webContents = new EventEmitter();
      this.webContents.setZoomFactor = () => {};
    }
  } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, __filename: filename, __dirname: path.dirname(filename),
    require: name => name === "electron" ? fakeElectron : localRequire(name),
    process, Buffer, URL, setTimeout, clearTimeout,
    setInterval: () => ({ unref() {} }), clearInterval: () => {},
  }, { filename });
  const { BrowserHost } = module.exports;
  // Exercise the actual constructor and its WebContentsView preferences. Only
  // browser binding/navigation is stubbed: no Electron, account, sockets, files
  // or real timers are created by this fixture.
  for (const name of ["bindShellZoomShortcuts", "bindChatGptBackendRecovery", "bindWebContents"]) {
    BrowserHost.prototype[name] = () => {};
  }
  BrowserHost.prototype.initializePrimaryView = async () => {};
  const window = new EventEmitter();
  window.webContents = new EventEmitter();
  window.contentView = { addChildView: view => addedViews.push(view) };
  const options = { window, descriptorPath: "/unused-offline-descriptor.json", cdpPort: 0,
    getConnectorName: () => "Codex Native2", loginWithPasskey: () => { throw new Error("No account operation is permitted in this test"); },
    helper: {}, logger: { error() {} }, publishState() {} };
  return { BrowserHost, options, createdViews, addedViews };
}

function resolved(development) {
  const homeDir = path.join(os.tmpdir(), "star-moon-profile-contract-home");
  return resolveLauncherProfile({ argv: development ? ["electron", ".", "--dev-profile"] : ["electron", "."],
    env: {}, homeDir, appData: path.join(homeDir, ".config") });
}

test("resolved production and DEV profiles are accepted by the actual BrowserHost constructor", async () => {
  for (const development of [false, true]) {
    const profile = resolved(development), f = browserFixture();
    const host = new f.BrowserHost({ ...f.options, partition: profile.browserPartition, profile: profile.kind });
    await host.ready();
    assert.equal(host.profile, profile.kind);
    assert.equal(host.partition, development ? "persist:star-moon-dev-chatgpt" : "persist:star-moon-chatgpt");
    assert.equal(f.createdViews.length, 1);
    assert.equal(f.addedViews[0], host.view);
    const preferences = f.createdViews[0].webPreferences;
    assert.equal(preferences.partition, profile.browserPartition);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.sandbox, true);
  }
});

test("BrowserHost default remains production-only and selects the independent Star Moon partition", async () => {
  const f = browserFixture();
  const host = new f.BrowserHost(f.options);
  await host.ready();
  assert.equal(host.profile, "production");
  assert.equal(host.partition, resolved(false).browserPartition);
});

test("BrowserHost rejects old or cross-profile partitions before creating any browser view", () => {
  for (const development of [false, true]) {
    const profile = resolved(development);
    for (const partition of ["persist:codex-web-gpt-chatgpt", "persist:codex-web-gpt-dev-chatgpt",
      resolved(!development).browserPartition, "persist:unrelated", ""]) {
      const f = browserFixture();
      assert.throws(() => new f.BrowserHost({ ...f.options, profile: profile.kind, partition }), /partition does not match its profile/);
      assert.deepEqual(f.createdViews, []);
      assert.deepEqual(f.addedViews, []);
    }
  }
});

test("BrowserHost still rejects unsupported profile identifiers", () => {
  const f = browserFixture();
  assert.throws(() => new f.BrowserHost({ ...f.options, profile: "staging", partition: resolved(false).browserPartition }), /profile is invalid/);
  assert.deepEqual(f.createdViews, []);
});
