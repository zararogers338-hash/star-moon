const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { finishGuidedSetup } = require("../electron/finish-guided-setup.cjs");

const source = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
function sourceBetween(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing IPC source boundary: ${start}`);
  return source.slice(from, to);
}
const assistanceSource = sourceBetween("  const handlers = new Map();", '  handle("launcher:snapshot"');
const completionSource = sourceBetween('  handle("launcher:doctor"', '  handle("launcher:cancel-turns"');
const readyState = () => ({ onboardingComplete: true, coreSetupComplete: true, codexCatalogVerified: true,
  codexRestartRequired: false, mcpRuntimeInstalled: true, mcpSetupComplete: true,
  browserInteractionMode: "manual", guidedSetupComplete: false });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fakeLetter(overrides = {}) {
  const state = { active: true, revoked: false, expired: false, expiresAt: 1234567,
    operationRunning: false, reviewRequired: false, ...overrides };
  const calls = [];
  return { state, calls, info: { text: "fake-sensitive-capability", path: "/not-a-real-letter.md",
    controlUrl: "http://127.0.0.1:43123", expiresAt: state.expiresAt }, status: () => ({ ...state }),
    close: async () => { calls.push("close"); state.active = false; state.revoked = true; },
    revoke: () => { calls.push("revoke"); state.active = false; state.revoked = true; } };
}
function nativeFixture(options = {}) {
  let state = { ...readyState(), ...options.state }, config = { connection: "Native2", mode: "manual" };
  const updates = [], calls = [], registered = new Map(), created = [];
  const mainWindow = { webContents: { mainFrame: {} } };
  const currentBridge = { state: "connected", url: "https://mcp.example/mcp", publicUrl: "https://mcp.example/mcp", ...options.bridgeStatus };
  const bridge = { snapshot: () => ({ ...currentBridge }),
    configure: async input => { calls.push("configure"); return input; },
    login: async () => { calls.push("login"); return { state: "authorizing" }; },
    inspect: async () => { calls.push("fresh-agentdock"); return options.inspect ? options.inspect() : { ...currentBridge }; },
  };
  const context = { path, logger: {}, ipcMain: {}, mainWindow, launcherUserData: "/not-a-real-user-data-directory",
    agentDockBridge: null, moonLetterSession: options.session ?? null, moonLetterCreating: false,
    AgentDockBridge: function () { return bridge; },
    registerLoggedIpc: (_ipc, _logger, channel, callback) => registered.set(channel, callback),
    stateStore: { read: () => ({ ...state }), update: patch => { updates.push(patch); state = { ...state, ...patch }; return state; } },
    browserHost: { snapshot: () => ({ authenticated: true }), currentOperation: () => null,
      probeAuthentication: async () => { calls.push("authenticate"); return { authenticated: true }; },
      verifyConnector: async () => { calls.push("connector"); },
      setSurfaceActive: () => calls.push("activate-surface"), waitForSurfaceReady: async () => calls.push("surface-ready"),
      openConnectorSettings: async () => { calls.push("connector-settings"); return true; } },
    runtimeHost: { mcpCredentialsConfigured: () => true, runtimeConfigSnapshot: () => ({ config }),
      doctor: async () => { calls.push("doctor"); return { ok: true }; },
      devDoctor: async () => { calls.push("dev-doctor"); return { ok: true }; }, mcpConnectorName: () => "Native2" },
    IS_DEV_PROFILE: false, smokePassedThisSession: false, smokePassedForCurrentVersion: () => true,
    openWebUrl: async () => calls.push("open-web"), send: () => calls.push("notify"), finishGuidedSetup,
    createMoonLetter: async value => { created.push(value); return options.create ? options.create(value) : fakeLetter(); },
  };
  vm.runInNewContext(assistanceSource + completionSource, context);
  const trustedEvent = { sender: mainWindow.webContents, senderFrame: mainWindow.webContents.mainFrame };
  return { context, calls, created, registered, updates, bridge: currentBridge, trustedEvent,
    call: (channel, event = trustedEvent, ...args) => registered.get(channel)(event, ...args),
    setState: patch => { state = { ...state, ...patch }; }, setConfig: value => { config = value; } };
}

test("native setup IPC rejects unrelated webContents, child frames and closed windows before side effects", async () => {
  const protectedChannels = ["agentdock-read", "agentdock-configure", "agentdock-inspect", "agentdock-login",
    "agentdock-web-setup", "moon-letter-create", "moon-letter-status", "moon-letter-open", "moon-letter-stop", "finish-guided-setup"];
  for (const channel of protectedChannels) {
    const f = nativeFixture();
    for (const event of [{}, { ...f.trustedEvent, sender: {} }, { ...f.trustedEvent, senderFrame: {} }]) {
      await assert.rejects(async () => f.call(`launcher:${channel}`, event, true), /Untrusted launcher frame/, channel);
    }
    f.context.mainWindow = null;
    await assert.rejects(async () => f.call(`launcher:${channel}`, f.trustedEvent, true), /Untrusted launcher frame/, channel);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.created, []);
    assert.deepEqual(f.updates, []);
  }
});

test("native Moon Letter creation requires literal consent and completed mode selection", async () => {
  const prior = fakeLetter(), f = nativeFixture({ session: prior });
  for (const consent of [undefined, false, 1, "true", {}]) {
    await assert.rejects(f.call("launcher:moon-letter-create", undefined, consent), /consent/);
  }
  f.setState({ onboardingComplete: false });
  await assert.rejects(f.call("launcher:moon-letter-create", undefined, true), /consent/);
  assert.deepEqual(f.created, []);
  assert.deepEqual(prior.calls, []);
});

test("native Moon Letter concurrent creation is serialized before opening a second capability", async () => {
  const started = deferred(), complete = deferred(), letter = fakeLetter();
  const f = nativeFixture({ create: async () => { started.resolve(); await complete.promise; return letter; } });
  const first = f.call("launcher:moon-letter-create", undefined, true);
  await started.promise;
  assert.equal(f.context.moonLetterCreating, true);
  await assert.rejects(f.call("launcher:moon-letter-create", undefined, true), /current setup operation/);
  assert.equal(f.created.length, 1);
  complete.resolve();
  assert.equal((await first).controlUrl, letter.info.controlUrl);
  assert.equal(f.context.moonLetterCreating, false);
});

test("native Moon Letter regeneration cannot overlap an accepted operation, even after revoke", async () => {
  const prior = fakeLetter({ active: false, revoked: true, operationRunning: true });
  const f = nativeFixture({ session: prior });
  await assert.rejects(f.call("launcher:moon-letter-create", undefined, true), /current setup operation/);
  assert.deepEqual(f.created, []);
  assert.deepEqual(prior.calls, []);
});

test("native Moon Letter failed creation releases its guard and permits an explicit later retry", async () => {
  let attempts = 0;
  const f = nativeFixture({ create: async () => { if (++attempts === 1) throw new Error("offline test factory failure"); return fakeLetter(); } });
  await assert.rejects(f.call("launcher:moon-letter-create", undefined, true), /factory failure/);
  assert.equal(f.context.moonLetterCreating, false);
  await f.call("launcher:moon-letter-create", undefined, true);
  assert.equal(attempts, 2);
});

test("native Moon Letter status contains lifecycle flags but never the letter or capability", async () => {
  const prior = fakeLetter({ active: false, revoked: true, operationRunning: true, reviewRequired: true });
  const f = nativeFixture({ session: prior, state: { guidedSetupComplete: true } });
  const status = f.call("launcher:moon-letter-status");
  for (const field of ["active", "revoked", "expired", "expiresAt", "operationRunning", "reviewRequired"]) {
    assert.equal(status[field], prior.state[field]);
  }
  assert.equal(JSON.stringify(status).includes("fake-sensitive-capability"), false);
  for (const field of ["token", "text", "path", "controlUrl", "info"]) assert.equal(Object.hasOwn(status, field), false);
  assert.equal(status.complete, true);
  f.bridge.state = "timeout";
  assert.equal(f.call("launcher:moon-letter-status").complete, false);
});

test("native completion checks AgentDock afresh instead of accepting its previously connected snapshot", async () => {
  const f = nativeFixture({ inspect: async () => ({ state: "oauth-required" }) });
  await assert.rejects(f.call("launcher:finish-guided-setup"), /AgentDock connection is not verified/);
  assert.equal(f.calls.filter(value => value === "fresh-agentdock").length, 1);
  assert.deepEqual(f.updates, []);
  assert.equal(f.calls.includes("notify"), false);
});

test("native completion publishes the guided flag only after original checks and fresh AgentDock success", async () => {
  const f = nativeFixture();
  const result = await f.call("launcher:finish-guided-setup");
  assert.equal(result.guidedSetupComplete, true);
  assert.deepEqual(f.calls, ["doctor", "fresh-agentdock", "notify"]);
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].guidedSetupComplete, true);
});

test("native completion rereads readiness, selected mode and runtime config after async verification", async () => {
  for (const mutation of [f => f.setState({ mcpSetupComplete: false }),
    f => f.setState({ browserInteractionMode: "automatic" }), f => f.setConfig({ connection: "changed" })]) {
    let f;
    f = nativeFixture({ inspect: async () => { mutation(f); return { state: "connected" }; } });
    await assert.rejects(f.call("launcher:finish-guided-setup"), /Complete and verify|settings changed/);
    assert.deepEqual(f.updates, []);
    assert.equal(f.calls.includes("notify"), false);
  }
});

test("completion function fails closed when its fresh AgentDock verifier is absent, false or rejects", async () => {
  for (const verifyAgentDock of [undefined, async () => false, async () => { throw new Error("offline verification failed"); }]) {
    const f = nativeFixture();
    await assert.rejects(finishGuidedSetup({ stateStore: f.context.stateStore, browserHost: f.context.browserHost,
      runtimeHost: f.context.runtimeHost, isDevProfile: false, smokePassed: () => true,
      verifyAgentDock, notify: () => f.calls.push("notify") }), /AgentDock connection is not verified|offline verification failed/);
    assert.deepEqual(f.updates, []);
    assert.equal(f.calls.includes("notify"), false);
  }
});

test("completion still rejects each original readiness and automatic-browser failure", async () => {
  for (const key of ["onboardingComplete", "coreSetupComplete", "codexCatalogVerified", "mcpRuntimeInstalled", "mcpSetupComplete"]) {
    const f = nativeFixture({ state: { [key]: false } });
    await assert.rejects(f.call("launcher:finish-guided-setup"), /Complete and verify/);
    assert.deepEqual(f.updates, []);
    assert.equal(f.calls.includes("fresh-agentdock"), false);
  }
  const scenarios = [
    f => f.setState({ codexRestartRequired: true }),
    f => { f.context.browserHost.activeTraceId = "active-test-trace"; },
    f => { f.context.browserHost.currentOperation = () => "active"; },
    f => { f.context.runtimeHost.mcpCredentialsConfigured = () => false; },
    f => { f.context.runtimeHost.doctor = async () => ({ ok: false }); },
    f => { f.setState({ browserInteractionMode: "automatic" }); f.context.smokePassedForCurrentVersion = () => false; },
    f => { f.setState({ browserInteractionMode: "automatic" }); f.context.browserHost.probeAuthentication = async () => ({ authenticated: false }); },
    f => { f.setState({ browserInteractionMode: "automatic" }); f.context.browserHost.verifyConnector = async () => { throw new Error("connector failed"); }; },
  ];
  for (const setup of scenarios) {
    const f = nativeFixture(); setup(f);
    await assert.rejects(f.call("launcher:finish-guided-setup"));
    assert.deepEqual(f.updates, []);
    assert.equal(f.calls.includes("fresh-agentdock"), false);
  }
});
