const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { loadLoginEntry, waitForLoginOperation } = require("../electron/login-navigation.cjs");
const { BrowserHost, allowedLoginSurfaceUrl } = require("../electron/browser-host.cjs");

const entry = "https://chatgpt.com/";
const verification = "https://auth.openai.com/email-verification";
const options = { allowedUrl: allowedLoginSurfaceUrl, timeoutMs: 500 };

function contentsFixture() {
  const contents = new EventEmitter();
  let url = "about:blank";
  let stopped = 0;
  contents.isDestroyed = () => false;
  contents.getURL = () => url;
  contents.stop = () => stopped++;
  contents.loadURL = () => new Promise(() => {});
  return { contents, stopped: () => stopped, commit(destination) {
    url = destination;
    contents.emit("did-navigate", {}, destination, 200, "OK");
  } };
}

test("login entry resolves on the committed document, before a streamed form is hydrated", async () => {
  const f = contentsFixture();
  const pending = loadLoginEntry(f.contents, entry, options);
  f.commit(verification);
  await pending;
  assert.equal(f.stopped(), 0);
  assert.equal(f.contents.listenerCount("did-navigate"), 0);
  assert.equal(f.contents.listenerCount("did-fail-load"), 0);
});

test("ERR_ABORTED waits for a real allowed redirect and does not claim authentication", async () => {
  const f = contentsFixture();
  f.contents.loadURL = async () => { throw Object.assign(new Error(" (-3) loading 'private-url'"), { code: "ERR_ABORTED" }); };
  const pending = loadLoginEntry(f.contents, entry, options);
  await new Promise(resolve => setImmediate(resolve));
  f.commit(verification);
  assert.equal(await pending, undefined);
  assert.equal(f.stopped(), 0);
});

test("an abort without a new commit times out without truncating the page", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = contentsFixture();
  f.contents.loadURL = async () => { throw Object.assign(new Error("ERR_ABORTED"), { code: -3 }); };
  const pending = loadLoginEntry(f.contents, entry, { ...options, timeoutMs: 100 });
  const rejected = assert.rejects(pending, /did not open in time/);
  await Promise.resolve();
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(f.stopped(), 0);
});

test("login rejects lookalike origins, credentials in URLs, real failures and renderer loss", async () => {
  for (const url of [
    "https://chatgpt.com.evil.test/",
    "https://chatgpt.com/?temporary-chat=true",
    "https://chatgpt.com/?temporary-chat=TRUE",
    "http://auth.openai.com/",
    "https://user:secret@auth.openai.com/",
    "file:///tmp/login.html",
  ]) {
    assert.equal(allowedLoginSurfaceUrl(url), false);
  }
  for (const event of [
    ["did-navigate", {}, "https://unexpected.invalid/", 200, "OK"],
    ["did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", entry, true],
    ["render-process-gone", {}, { reason: "crashed" }],
    ["destroyed"],
  ]) {
    const f = contentsFixture();
    const pending = loadLoginEntry(f.contents, entry, options);
    const rejected = assert.rejects(pending);
    f.contents.emit(...event);
    await rejected;
    assert.equal(f.stopped(), 0);
    assert.equal(f.contents.listenerCount("did-navigate"), 0);
  }
});

test("cancel interrupts a pending commit and a hung auth probe without touching the page", async () => {
  const f = contentsFixture(), controller = new AbortController();
  const pending = loadLoginEntry(f.contents, entry, { ...options, signal: controller.signal });
  const rejected = assert.rejects(pending, { code: "login_cancelled" });
  controller.abort();
  await rejected;
  assert.equal(f.stopped(), 0);
  const probeController = new AbortController();
  const probe = waitForLoginOperation(() => new Promise(() => {}), probeController.signal);
  const probeRejected = assert.rejects(probe, { code: "login_cancelled" });
  probeController.abort();
  await probeRejected;
});

test("primary watchdog leaves committed streamed auth pages intact but still stops a missing response", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const committed of [true, false]) {
    const f = contentsFixture();
    f.contents.setWindowOpenHandler = () => {};
    f.contents.isLoadingMainFrame = () => true;
    const host = Object.assign(Object.create(BrowserHost.prototype), {
      view: { webContents: f.contents }, state: {}, turnTabs: new Map(), logger: { info() {}, error() {} },
      setState(patch) { Object.assign(this.state, patch); },
    });
    host.bindWebContents();
    f.contents.emit("did-start-navigation", {}, verification, false, true);
    if (committed) f.commit(verification);
    t.mock.timers.tick(60_001);
    assert.equal(f.stopped(), committed ? 0 : 1);
    assert.equal(host.state.status === "error", !committed);
  }
});

test("returning from a pending login preserves its verification page and does not create success", async () => {
  let navigations = 0, inspections = 0;
  const host = Object.assign(Object.create(BrowserHost.prototype), {
    state: { authenticated: false }, logger: { info() {} },
    view: { webContents: { getURL: () => verification, loadURL: () => navigations++ } },
    show() {}, activateHomeSurface() {}, ready: async () => {},
    snapshot() { return { ...this.state }; },
    setState(patch) { Object.assign(this.state, patch); },
    withManualOperation: async (_name, action) => action(),
    probeAuthentication: async () => new Promise(() => {}),
    runSessionInspection: async () => inspections++,
  });
  const pending = host.openLogin();
  await new Promise(resolve => setImmediate(resolve));
  await host.cancelLogin();
  assert.equal((await pending).authenticated, false);
  assert.equal(navigations, 0);
  assert.equal(inspections, 0);
  assert.equal(host.loginOperation, null);
  assert.equal(host.loginController, null);
});
