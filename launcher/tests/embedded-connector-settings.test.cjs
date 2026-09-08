const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { BrowserHost } = require("../electron/browser-host.cjs");

const SETTINGS_URL = "https://chatgpt.com/#settings/Plugins";
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ ready, loadURL, mode = "manual" } = {}) {
  const calls = [];
  let currentUrl = "about:blank";
  const retainedTurn = { id: "retained-turn", traceId: "finished-trace", status: "completed", view: { webContents: { loadURL: () => { throw new Error("turn view must not navigate"); } } } };
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    setWindowOpenHandler: () => {},
    getURL: () => currentUrl,
    setTestUrl: value => { currentUrl = value; },
    setBackgroundThrottling: value => { calls.push(["throttle", value]); },
    loadURL: async url => { calls.push(["load", url]); currentUrl = url; if (loadURL) return loadURL(url); },
    executeJavaScript: () => { throw new Error("DOM inspection is forbidden"); },
  });
  const host = Object.assign(Object.create(BrowserHost.prototype), {
    manualOperation: null,
    loginOperation: null,
    sessionRefreshOperation: null,
    selectedTabId: retainedTurn.id,
    turnTabs: new Map([[retainedTurn.id, retainedTurn]]),
    view: { webContents: contents },
    state: { authenticated: false, status: "signed-out", visible: false },
    getBrowserInteractionMode: () => mode,
    ready: async () => { calls.push(["ready"]); if (ready) await ready(); },
    clearHomeNavigationTimeout: () => {},
    activateHomeSurface() { calls.push(["activate-home"]); this.selectedTabId = "home"; },
    show() { calls.push(["show"]); this.state.visible = true; },
    snapshot() { return { ...this.state, selectedTabId: this.selectedTabId }; },
    setState(patch) { calls.push(["set-state", patch]); this.state = { ...this.state, ...patch }; },
    activeView: () => { throw new Error("selected turn view must not be used for settings"); },
  });
  for (const method of ["openLogin", "probeAuthentication", "waitForAuthenticated", "inspectSession", "runSessionInspection", "runBrowserHelperOperation", "waitForSurfaceReady", "markOwnedSurface", "applyViewportCss", "verifyConnector"]) {
    host[method] = () => { throw new Error(`Forbidden automation: ${method}`); };
  }
  return { host, calls, retainedTurn, contents };
}
function assertNoSurfaceMutation(observed) {
  assert.equal(observed.host.selectedTabId, observed.retainedTurn.id);
  assert.equal(observed.host.state.visible, false);
  assert.equal(observed.host.turnTabs.get(observed.retainedTurn.id), observed.retainedTurn);
  assert.equal(observed.calls.some(([name]) => ["activate-home", "show", "load", "throttle"].includes(name)), false);
}

for (const mode of ["manual", "automatic"]) {
  test(`connector settings opens only the fixed home URL without inspecting auth (${mode})`, async () => {
    const observed = fixture({ mode });
    // Extra JavaScript arguments cannot turn this into arbitrary navigation.
    const result = await observed.host.openConnectorSettings("https://untrusted.example/");
    assert.deepEqual(observed.calls, [["ready"], ["activate-home"], ["throttle", false], ["show"], ["load", SETTINGS_URL], ["throttle", true]]);
    assert.equal(result.selectedTabId, "home"); assert.equal(result.visible, true);
    assert.equal(result.authenticated, false); assert.equal(result.status, "signed-out");
    assert.equal(observed.host.manualOperation, null);
    assert.equal(observed.host.turnTabs.get(observed.retainedTurn.id), observed.retainedTurn);
  });
}

for (const blocker of ["manual", "login", "refresh", "turn"]) {
  test(`connector settings rejects an existing ${blocker} operation without stealing a surface`, async () => {
    const observed = fixture();
    if (blocker === "manual") observed.host.manualOperation = "another manual operation";
    if (blocker === "login") observed.host.loginOperation = Promise.resolve();
    if (blocker === "refresh") observed.host.sessionRefreshOperation = Promise.resolve();
    if (blocker === "turn") observed.host.turnTabs.set("background-turn", { id: "background-turn", traceId: "running-trace", status: "running" });
    await assert.rejects(observed.host.openConnectorSettings(), /busy|refreshing|active ChatGPT turns/);
    assert.deepEqual(observed.calls, []);
    assertNoSurfaceMutation(observed);
  });
}

for (const blocker of ["login", "refresh", "turn"]) {
  test(`connector settings rechecks ${blocker} activity that starts during ready() before selecting home`, async () => {
    const gate = deferred();
    const observed = fixture({ ready: () => gate.promise });
    const opening = observed.host.openConnectorSettings();
    const rejected = assert.rejects(opening, /busy|refreshing|running Codex turn/);
    if (blocker === "login") observed.host.loginOperation = Promise.resolve();
    if (blocker === "refresh") observed.host.sessionRefreshOperation = Promise.resolve();
    if (blocker === "turn") observed.host.turnTabs.set("background-turn", { id: "background-turn", traceId: "running-trace", status: "running" });
    gate.resolve();
    await rejected;
    assert.deepEqual(observed.calls, [["ready"]]);
    assertNoSurfaceMutation(observed);
  });
}

test("parallel connector-settings requests cannot race to navigate twice", async () => {
  const gate = deferred();
  const observed = fixture({ loadURL: () => gate.promise });
  const first = observed.host.openConnectorSettings();
  const second = observed.host.openConnectorSettings();
  await assert.rejects(second, /busy with connector settings/);
  assert.equal(observed.host.manualOperation, "connector settings");
  assert.equal(observed.calls.filter(([name]) => name === "load").length, 1);
  gate.resolve();
  await first;
  assert.equal(observed.host.manualOperation, null);
});

test("navigation failure releases the manual lock without changing authentication", async () => {
  const observed = fixture({ loadURL: async () => { throw new Error("settings navigation failed"); } });
  await assert.rejects(observed.host.openConnectorSettings(), /settings navigation failed/);
  assert.equal(observed.host.manualOperation, null);
  assert.deepEqual(observed.calls.at(-1), ["throttle", true]);
  assert.equal(observed.host.state.authenticated, false);
  assert.equal(observed.host.turnTabs.get(observed.retainedTurn.id), observed.retainedTurn);
});

test("a destroyed home view is rejected before the selected surface changes", async () => {
  const observed = fixture();
  observed.contents.isDestroyed = () => true;
  await assert.rejects(observed.host.openConnectorSettings(), /home browser is unavailable/);
  assertNoSurfaceMutation(observed);
});

test("an active manual navigation blocks a turn until the fixed load finishes", async () => {
  const gate = deferred();
  const observed = fixture({ loadURL: () => gate.promise });
  const opening = observed.host.openConnectorSettings();
  await tick();
  assert.equal(observed.host.currentOperation(), "connector settings");
  assert.throws(() => observed.host.navigate("reload"), /locked during connector settings/);
  await assert.rejects(observed.host.beginTurn("blocked-automatic-turn"), /busy with connector settings/);
  assert.throws(() => observed.host.beginManualTurn("blocked-manual-turn"), /busy with connector settings/);
  gate.resolve();
  await opening;
  assert.equal(observed.host.currentOperation(), null);
});

test("the real primary load listener does not indirectly inspect the settings document", async () => {
  const observed = fixture({ mode: "automatic", loadURL: () => { observed.contents.emit("did-finish-load"); } });
  observed.host.bindWebContents();
  await observed.host.openConnectorSettings();
  assert.equal(observed.host.state.authenticated, false);
  assert.equal(observed.host.state.url, SETTINGS_URL);
  // A delayed load event after the operation lock is released must also stay
  // navigation-only while this exact settings document is displayed.
  assert.equal(observed.host.manualOperation, null);
  observed.contents.emit("did-finish-load");
  await tick();
  assert.equal(observed.host.state.authenticated, false);
});

test("a redirect during user-driven settings navigation is not automatically auth-probed", async () => {
  const observed = fixture({ mode: "automatic", loadURL: () => {
    observed.contents.setTestUrl("https://auth.openai.com/login");
    observed.contents.emit("did-finish-load");
  } });
  observed.host.bindWebContents();
  await observed.host.openConnectorSettings();
  await tick();
  assert.equal(observed.host.state.url, "https://auth.openai.com/login");
  assert.equal(observed.host.state.authenticated, false);
});

test("settings suppression does not disable existing automatic behavior on unrelated documents", async () => {
  const observed = fixture({ mode: "automatic" });
  observed.host.bindWebContents();
  await observed.host.openConnectorSettings();
  const automated = [];
  observed.host.applyViewportCss = () => { automated.push("css"); };
  observed.host.markOwnedSurface = async () => { automated.push("mark"); };
  observed.host.probeAuthentication = async () => { automated.push("probe"); };
  observed.contents.setTestUrl("https://chatgpt.com/?temporary-chat=true");
  observed.contents.emit("did-finish-load");
  await tick();
  assert.deepEqual(automated, ["css", "mark", "probe"]);
});
