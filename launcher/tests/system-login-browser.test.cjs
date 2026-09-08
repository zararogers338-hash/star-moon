const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveSystemLoginBrowser } = require("../electron/system-login-browser.cjs");
const { pauseGuidedSetup } = require("../electron/guided-setup-control.cjs");

test("Linux external login follows the supported default browser without evaluating desktop commands", () => {
  const calls = [];
  const selected = resolveSystemLoginBrowser({
    usable: value => value === "/snap/bin/chromium",
    run: (...args) => { calls.push(args); return { status: 0, stdout: "chromium_chromium.desktop\n" }; },
  });
  assert.equal(selected, "/snap/bin/chromium");
  assert.deepEqual(calls[0].slice(0, 2), ["xdg-settings", ["get", "default-web-browser"]]);
  for (const id of ["firefox.desktop", "__proto__", "$(untrusted).desktop"]) {
    assert.throws(() => resolveSystemLoginBrowser({ usable: () => true, run: () => ({ status: 0, stdout: id }) }), /does not support isolated/);
  }
});

test("configuration pause preserves native receipts and saves no key or fake success", () => {
  const state = { guidedSetupComplete: false, coreSetupComplete: true, catalogCheckDeferred: true };
  const store = { update(patch) { return Object.assign(state, patch); } };
  pauseGuidedSetup(store, "credentials", false);
  assert.deepEqual(state, { guidedSetupComplete: false, coreSetupComplete: true, catalogCheckDeferred: true, guidedSetupPaused: true, guidedSetupResumeStage: "credentials" });
  assert.throws(() => pauseGuidedSetup(store, "unknown", false), /Invalid/);
  assert.throws(() => pauseGuidedSetup(store, "credentials", "setup-core"), /active operation/);
});
