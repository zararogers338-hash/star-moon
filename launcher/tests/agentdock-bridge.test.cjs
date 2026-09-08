const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { AgentDockBridge, validateMcpUrl, validateAuthorizationUrl, SERVER_NAME } = require("../electron/agentdock-bridge.cjs");
const { probe } = require("../scripts/probe-agentdock.cjs");

const MCP_URL = "https://agentdock.example/mcp";
const AUTH_URL = "https://agentdock.example/oauth/authorize?state=fake-test-state";
const tick = () => new Promise(resolve => setImmediate(resolve));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = overrides => ({ name: SERVER_NAME, authStatus: "notLoggedIn", runtimeStatus: "authenticationRequired", tools: {}, ...overrides });
const inventory = overrides => ({ data: [server(overrides)], nextCursor: null });

// No process, socket, browser or model is created by these tests.
class FakeChild extends EventEmitter {
  constructor(respond, options = {}) {
    super();
    this.pid = 12345;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdin = new EventEmitter();
    this.stdin.destroyed = false;
    this.stdin.writableEnded = false;
    this.messages = [];
    this.signals = [];
    this.endCount = 0;
    this.stdin.write = (value, callback = () => {}) => {
      if (options.throwWrite) throw new Error("fake provider credential must not escape");
      const message = JSON.parse(value);
      this.messages.push(message);
      queueMicrotask(() => {
        callback(options.writeError ? new Error("fake sensitive write detail") : null);
        if (!options.writeError) respond(message, this);
      });
      return true;
    };
    this.stdin.end = () => {
      this.endCount += 1;
      this.stdin.writableEnded = true;
      if (options.autoExit !== false) queueMicrotask(() => this.finish());
    };
    this.kill = signal => {
      this.signals.push(signal);
      if (options.exitOnKill !== false) this.finish(0, signal);
      return true;
    };
  }
  send(message) { this.stdout.write(JSON.stringify(message) + "\n"); }
  reply(message, result) { this.send({ id: message.id, result }); }
  completed(success, extra = {}) { this.send({ method: "mcpServer/oauthLogin/completed", params: { name: SERVER_NAME, success, threadId: null, ...extra } }); }
  finish(code = 0, signal = null) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
  }
}
function normalResponse(message, child) {
  if (message.method === "initialize") child.reply(message, { userAgent: "fake-codex" });
  if (message.method === "thread/start") child.reply(message, { thread: { id: "ephemeral-test-thread" } });
  if (message.method === "mcpServerStatus/list") child.reply(message, inventory());
  if (message.method === "mcpServer/oauth/login") child.reply(message, { authorizationUrl: AUTH_URL });
}
async function fixture(t, { respond = normalResponse, childOptions = {}, bridgeOptions = {}, configure = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-mcp-test-"));
  const children = [];
  const launches = [];
  const opened = [];
  const notifications = [];
  const bridge = new AgentDockBridge({
    directory,
    executable: "/fake/codex",
    spawnProcess: (...args) => { launches.push(args); const child = new FakeChild(respond, childOptions); children.push(child); return child; },
    openExternal: async url => { opened.push(url); },
    notify: status => { notifications.push(status); },
    timeouts: { request: 250, oauth: 300, term: 5, kill: 10, close: 30 },
    ...bridgeOptions,
  });
  t.after(async () => {
    const closing = bridge.close();
    for (const child of children) child.finish();
    await closing.catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  });
  if (configure) await bridge.configure({ url: MCP_URL });
  return { bridge, children, launches, opened, notifications, directory };
}

test("MCP and authorization URLs enforce protocol, credentials, exact origins and safe errors", () => {
  for (const value of [MCP_URL, "http://localhost:8765/mcp", "http://127.0.0.1:8765/mcp", "http://[::1]:8765/mcp"]) assert.equal(validateMcpUrl(value), value);
  for (const value of [null, "https://secret@agentdock.example/mcp", "https://agentdock.example/mcp?token=fake-secret", "https://agentdock.example/mcp#token", "http://remote.example/mcp", "file:///tmp/file", "ftp://localhost/mcp", "https://agentdock.example/\\evil", "https://agentdock.example/\n"]) assert.throws(() => validateMcpUrl(value));
  assert.throws(() => validateMcpUrl("fake-secret invalid URL"), error => !error.message.includes("fake-secret"));
  const settings = { url: MCP_URL, publicUrl: "https://public.example/mcp" };
  assert.equal(validateAuthorizationUrl(AUTH_URL, settings), AUTH_URL);
  assert.equal(validateAuthorizationUrl("https://public.example/authorize?state=test", settings), "https://public.example/authorize?state=test");
  for (const value of ["javascript:alert(1)", "ftp://localhost/authorize", "https://secret@agentdock.example/authorize", "https://agentdock.example/authorize#token", "https://agentdock.example.evil.test/authorize", "https://agentdock.example:444/authorize", "http://agentdock.example/authorize", "https://unapproved.example/authorize", "fake-secret"]) assert.throws(() => validateAuthorizationUrl(value, settings));
});

test("configuration is private, deterministic and isolated per endpoint and trusted origin", async t => {
  const { bridge, directory, launches } = await fixture(t);
  const firstHome = bridge.home;
  const config = fs.readFileSync(path.join(firstHome, "config.toml"), "utf8");
  assert.match(config, /cli_auth_credentials_store = "file"/);
  assert.match(config, /mcp_oauth_credentials_store = "file"/);
  assert.match(config, /star_moon_agentdock/);
  assert.equal(JSON.stringify(bridge.snapshot()).includes("authorizationUrl"), false);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(firstHome).mode & 0o777, 0o700);
    assert.equal(fs.statSync(bridge.settingsPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(firstHome, "config.toml")).mode & 0o777, 0o600);
  }
  await bridge.start();
  const [executable, args, options] = launches[0];
  assert.equal(executable, "/fake/codex"); assert.deepEqual(args, ["app-server"]);
  assert.equal(options.env.CODEX_HOME, firstHome); assert.equal(options.cwd, firstHome); assert.equal(options.shell, false);
  for (const key of ["OPENAI_API_KEY", "CHATGPT_TOKEN", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "DBUS_SESSION_BUS_ADDRESS"]) assert.equal(Object.hasOwn(options.env, key), false);
  await bridge.configure({ url: MCP_URL, publicUrl: "https://public.example/mcp" });
  assert.notEqual(bridge.home, firstHome);
  assert.ok(fs.existsSync(path.join(firstHome, "config.toml")), "previous connection data is retained");
  await bridge.configure({ url: MCP_URL });
  assert.equal(bridge.home, firstHome);
  const reopened = new AgentDockBridge({ directory, openExternal: async () => {} });
  assert.equal(reopened.snapshot().state, "configured"); assert.equal(reopened.home, firstHome);
  await assert.rejects(bridge.configure({ url: MCP_URL, publicUrl: "http://localhost/mcp" }), /HTTPS/);
});

test("concurrent inspection shares one initialize and ephemeral read-only thread, never a turn or tool call", async t => {
  const { bridge, children, launches } = await fixture(t);
  const first = bridge.inspect();
  assert.equal(bridge.inspect(), first); assert.equal(bridge.inspect(), first);
  const result = await first;
  assert.equal(result.state, "auth-required"); assert.equal(result.authenticated, false);
  assert.equal(launches.length, 1);
  const messages = children[0].messages;
  assert.deepEqual(messages.map(message => message.method), ["initialize", "initialized", "thread/start", "mcpServerStatus/list"]);
  assert.equal(messages[0].params.capabilities.experimentalApi, true);
  assert.deepEqual(messages[2].params, { cwd: bridge.home, approvalPolicy: "never", sandbox: "read-only", ephemeral: true });
  assert.deepEqual(messages[3].params, { threadId: "ephemeral-test-thread", detail: "toolsAndAuthOnly", limit: 100 });
  await bridge.inspect();
  assert.equal(messages.filter(message => message.method === "thread/start").length, 1);
  await assert.rejects(bridge.request("turn/start", {}), /not allowed/);
  await assert.rejects(bridge.request("mcpServer/tool/call", {}), /not allowed/);
});

test("inventory follows pagination and requires current runtime connection evidence", async t => {
  let runtimeStatus = null;
  const { bridge, children } = await fixture(t, { respond: (message, child) => {
    if (message.method !== "mcpServerStatus/list") return normalResponse(message, child);
    child.reply(message, message.params.cursor ? inventory({ authStatus: "oAuth", runtimeStatus, tools: { list_jobs: {} }, serverInfo: { name: "AgentDock", version: "test" } }) : { data: [], nextCursor: "next-page" });
  } });
  assert.equal((await bridge.inspect()).state, "unverified", "cached tools and server metadata are not live connectivity proof");
  runtimeStatus = "connected";
  assert.equal((await bridge.inspect()).state, "connected");
  runtimeStatus = "authenticationRequired";
  const result = await bridge.inspect();
  assert.equal(result.state, "auth-required"); assert.equal(result.authenticated, false);
  assert.equal(children[0].messages.filter(message => message.params?.cursor === "next-page").length, 3);
  const copy = bridge.snapshot(); copy.tools.push("injected"); assert.deepEqual(bridge.snapshot().tools, ["list_jobs"]);
});

for (const wire of ["null\n", "[]\n", "true\n", "{broken-json}\n", '{"id":{},"result":{}}\n']) {
  test(`invalid wire payload fails safely (${wire.trim()})`, async t => {
    const { bridge, children } = await fixture(t, { respond: () => {} });
    const operation = bridge.start();
    const rejected = assert.rejects(operation, /Invalid Codex MCP response/);
    await tick();
    children[0].stdout.write(wire);
    await rejected;
    await tick();
    assert.equal(bridge.pending.size, 0); assert.equal(bridge.child, null);
    assert.equal(bridge.snapshot().authenticated, false);
  });
}

test("split JSON lines work, unexpected interactive server requests are rejected", async t => {
  const { bridge, children } = await fixture(t, { respond: (message, child) => {
    if (message.method === "initialize") {
      child.stdout.write(`{"id":${message.id},"res`);
      child.stdout.write('ult":{}}\n');
    } else normalResponse(message, child);
  } });
  await bridge.start();
  const child = children[0];
  child.completed(true);
  assert.equal(bridge.snapshot().authenticated, false, "unsolicited success is ignored");
  child.send({ id: "permission-request", method: "item/permissions/requestApproval", params: { token: "fake-sensitive-test-value" } });
  await tick();
  const denied = child.messages.find(message => message.id === "permission-request");
  assert.equal(denied.error.code, -32601); assert.equal(Object.hasOwn(denied, "result"), false);
  assert.equal(JSON.stringify(denied).includes("fake-sensitive-test-value"), false);
});

for (const authorizationUrl of ["https://unapproved.example/authorize", "https://secret@agentdock.example/authorize", "ftp://localhost/authorize", "fake-secret invalid URL"]) {
  test(`login does not open unsafe or unapproved OAuth URL (${authorizationUrl.split(":")[0]})`, async t => {
    const { bridge, opened, notifications } = await fixture(t, { respond: (message, child) => {
      if (message.method !== "mcpServer/oauth/login") return normalResponse(message, child);
      child.completed(true);
      child.reply(message, { authorizationUrl });
    } });
    await assert.rejects(bridge.login(), error => !error.message.includes("fake-secret"));
    assert.deepEqual(opened, []); assert.equal(bridge.snapshot().authenticated, false);
    assert.equal(notifications.some(status => status.authenticated), false);
    assert.equal(JSON.stringify(notifications).includes("authorizationUrl"), false);
  });
}

test("concurrent login opens once, accepts only matching callbacks, and preserves early completion", async t => {
  let finishOpen;
  const openGate = new Promise(resolve => { finishOpen = resolve; });
  const { bridge, children } = await fixture(t, { bridgeOptions: { openExternal: () => openGate } });
  const first = bridge.login(); assert.equal(bridge.login(), first);
  await tick();
  const child = children[0];
  child.completed(true, { name: "some_other_server" });
  child.completed(true, { threadId: "unrelated-thread" });
  child.completed("true");
  assert.equal(bridge.snapshot().authenticated, false);
  child.completed(true);
  assert.equal(bridge.snapshot().authenticated, false, "opening must complete before publishing authorization");
  finishOpen();
  assert.equal((await first).state, "authorized");
  assert.equal(bridge.snapshot().authenticated, true);
  assert.equal(child.messages.filter(message => message.method === "mcpServer/oauth/login").length, 1);
});

test("active login is not reopened; retry uses a fresh process and ignores old callbacks", async t => {
  const { bridge, children, opened } = await fixture(t);
  assert.equal((await bridge.login()).state, "authorizing");
  await bridge.login(); assert.equal(opened.length, 1);
  const oldChild = children[0];
  oldChild.completed(false);
  assert.equal(bridge.snapshot().state, "auth-required");
  const retry = bridge.login(); assert.equal(bridge.login(), retry);
  assert.equal((await retry).state, "authorizing");
  assert.equal(children.length, 2); assert.equal(opened.length, 2);
  oldChild.completed(true);
  assert.equal(bridge.snapshot().state, "authorizing");
  children[1].completed(true);
  assert.equal(bridge.snapshot().state, "authorized");
});

test("OAuth completion deadline stops its helper and ignores late success", async t => {
  const { bridge, children } = await fixture(t, { bridgeOptions: { timeouts: { request: 100, oauth: 15, term: 2, kill: 5, close: 15 } } });
  await bridge.login();
  await pause(25);
  assert.equal(bridge.snapshot().state, "timeout"); assert.equal(bridge.child, null);
  children[0].completed(true);
  assert.equal(bridge.snapshot().authenticated, false);
});

test("request timeout clears pending work, retires the process and does not leak provider errors", async t => {
  const { bridge, children } = await fixture(t, { respond: (message, child) => {
    if (message.method === "initialize") normalResponse(message, child);
  } });
  await bridge.start();
  await assert.rejects(bridge.request("mcpServerStatus/list", {}, 10), /timed out/);
  await tick();
  assert.equal(bridge.pending.size, 0); assert.equal(bridge.child, null);
  children[0].reply(children[0].messages.at(-1), inventory({ authStatus: "oAuth", runtimeStatus: "connected" }));
  assert.equal(bridge.snapshot().authenticated, false);
});

test("close cancels initialization promptly and coalesces termination; late replies cannot revive it", async t => {
  const { bridge, children } = await fixture(t, { respond: () => {}, childOptions: { autoExit: false } });
  const starting = bridge.start();
  const rejected = assert.rejects(starting, /stopped/);
  await tick();
  const closing = bridge.close(); assert.equal(bridge.close(), closing);
  await rejected;
  await assert.rejects(bridge.start(), /stopped/);
  children[0].reply(children[0].messages[0], {});
  children[0].finish();
  await closing;
  assert.equal(children[0].endCount, 1); assert.equal(bridge.child, null); assert.equal(bridge.pending.size, 0);
});

test("close before the deferred start prevents spawning a new helper", async t => {
  const { bridge, launches } = await fixture(t);
  const operation = bridge.start();
  const rejected = assert.rejects(operation, /cancelled/);
  await bridge.close(); await rejected;
  assert.equal(launches.length, 0);
});

test("unconfirmed shutdown rejects and blocks replacement until termination is observed", async t => {
  const { bridge, children } = await fixture(t, { childOptions: { autoExit: false, exitOnKill: false } });
  await bridge.start();
  await assert.rejects(bridge.close(), /could not be confirmed/);
  assert.deepEqual(children[0].signals, ["SIGTERM", "SIGKILL"]);
  await assert.rejects(bridge.start(), /stopped/);
  await assert.rejects(bridge.configure({ url: "https://new.example/mcp" }), /could not be confirmed/);
  assert.equal(bridge.snapshot().url, MCP_URL);
  children[0].finish();
  await bridge.configure({ url: "https://new.example/mcp" });
  assert.equal(bridge.snapshot().url, "https://new.example/mcp");
});

test("failed spawn without exit and write errors settle once without leaked details", async t => {
  const { bridge, children } = await fixture(t, { respond: () => {}, childOptions: { autoExit: false, exitOnKill: false } });
  const operation = bridge.start();
  const rejected = assert.rejects(operation, error => /Cannot run/.test(error.message) && !error.message.includes("fake-secret"));
  await tick();
  children[0].pid = undefined;
  children[0].emit("error", new Error("fake-secret from provider"));
  await rejected; await bridge.close();
  assert.equal(bridge.child, null); assert.equal(bridge.pending.size, 0);
});

for (const childOptions of [{ throwWrite: true }, { writeError: true }]) {
  test(`stdin failure is sanitized (${Object.keys(childOptions)[0]})`, async t => {
    const { bridge } = await fixture(t, { childOptions });
    await assert.rejects(bridge.start(), error => error.message === "Cannot write to Codex MCP helper");
    await tick(); assert.equal(bridge.pending.size, 0); assert.equal(bridge.child, null);
  });
}

test("concurrent reconfiguration is ordered and interrupted inspection cannot overwrite new settings", async t => {
  const { bridge, children } = await fixture(t, { respond: (message, child) => {
    if (message.method !== "mcpServerStatus/list") normalResponse(message, child);
  } });
  const inspection = bridge.inspect();
  const rejected = assert.rejects(inspection, /stopped/);
  await tick();
  const oldChild = children[0];
  const first = bridge.configure({ url: "https://first.example/mcp" });
  const second = bridge.configure({ url: "https://second.example/mcp" });
  await Promise.all([first, second, rejected]);
  oldChild.completed(true);
  oldChild.reply(oldChild.messages.at(-1), inventory({ authStatus: "oAuth", runtimeStatus: "connected" }));
  assert.equal(bridge.snapshot().url, "https://second.example/mcp");
  assert.equal(bridge.snapshot().state, "configured"); assert.equal(bridge.snapshot().authenticated, false);
});

test("malformed inventory, pagination and thread results fail without an unhandled exception", async t => {
  for (const broken of [null, { data: {} }, { data: [null] }, { data: [server({ tools: null })] }, { data: [], nextCursor: 3 }]) {
    const { bridge } = await fixture(t, { respond: (message, child) => {
      if (message.method === "mcpServerStatus/list") child.reply(message, broken);
      else normalResponse(message, child);
    } });
    await assert.rejects(bridge.inspect(), /Invalid MCP inventory/);
    assert.equal(bridge.snapshot().authenticated, false);
    await bridge.close();
  }
  const { bridge } = await fixture(t, { respond: (message, child) => {
    if (message.method === "thread/start") child.reply(message, { thread: null });
    else normalResponse(message, child);
  } });
  await assert.rejects(bridge.inspect(), /Invalid Codex thread response/);
});

test("renderer notification exceptions do not break cleanup or connection state", async t => {
  const { bridge } = await fixture(t, { bridgeOptions: { notify: () => { throw new Error("renderer closed"); } } });
  assert.equal((await bridge.inspect()).state, "auth-required");
  await bridge.close(); assert.equal(bridge.child, null);
});

test("an in-flight old inventory cannot overwrite OAuth progress and post-login inspection is fresh", async t => {
  let holdInventory = true;
  let held;
  const { bridge, children } = await fixture(t, { respond: (message, child) => {
    if (message.method !== "mcpServerStatus/list") return normalResponse(message, child);
    if (holdInventory) held = message;
    else child.reply(message, inventory({ authStatus: "oAuth", runtimeStatus: "connected" }));
  } });
  const checking = bridge.inspect();
  await tick();
  await bridge.login();
  assert.equal((await bridge.inspect()).state, "authorizing");
  children[0].completed(true);
  children[0].reply(held, inventory());
  assert.equal((await checking).state, "authorized");
  holdInventory = false;
  assert.equal((await bridge.inspect()).state, "connected");
  assert.equal(children[0].messages.filter(message => message.method === "thread/start").length, 2);
});

test("user close while a login retry is retiring the old process cannot spawn a replacement", async t => {
  const { bridge, children } = await fixture(t, { childOptions: { autoExit: false } });
  await bridge.login(); children[0].completed(false);
  const retry = bridge.login();
  const rejected = assert.rejects(retry, /cancelled/);
  await tick();
  const closing = bridge.close();
  children[0].finish();
  await Promise.all([closing, rejected]);
  assert.equal(children.length, 1); assert.equal(bridge.child, null);
});

test("probe is opt-in, uses only inventory, denies browser opening and removes its temporary home after close", async () => {
  let directory;
  const calls = [];
  const result = await probe(MCP_URL, { bridgeFactory: options => {
    directory = options.directory;
    return {
      async configure(input) { calls.push("configure"); assert.equal(input.url, MCP_URL); await assert.rejects(options.openExternal(AUTH_URL), /No login/); },
      async inspect() { calls.push("inspect"); return { state: "auth-required", authenticated: false, tools: [], serverName: null }; },
      async close() { calls.push("close"); assert.equal(fs.existsSync(directory), true); },
    };
  } });
  assert.deepEqual(calls, ["configure", "inspect", "close"]);
  assert.deepEqual(result, { state: "auth-required", authenticated: false, tools: 0, serverName: null, inferenceUsed: false });
  assert.equal(fs.existsSync(directory), false);
  let constructed = false;
  await assert.rejects(probe("invalid-url", { bridgeFactory: () => { constructed = true; } }), /Invalid MCP URL/);
  assert.equal(constructed, false);
});

test("probe preserves a temporary home if shutdown cannot be confirmed", async () => {
  let directory;
  try {
    await assert.rejects(probe(MCP_URL, { bridgeFactory: options => {
      directory = options.directory;
      return {
        async configure() {},
        async inspect() { return { state: "auth-required", authenticated: false, tools: [] }; },
        async close() { throw new Error("MCP helper shutdown could not be confirmed"); },
      };
    } }), /could not be confirmed/);
    assert.equal(fs.existsSync(directory), true);
  } finally {
    // This test used no child process; only this exact test-created home is removed.
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("probe cancellation closes its helper and cleans up without beginning inspection", async () => {
  const controller = new AbortController();
  let directory;
  let closes = 0;
  await assert.rejects(probe(MCP_URL, { signal: controller.signal, bridgeFactory: options => {
    directory = options.directory;
    return {
      async configure() { controller.abort(); },
      async inspect() { throw new Error("inspection must not start"); },
      async close() { closes += 1; },
    };
  } }), /cancelled/);
  assert.equal(closes, 2); assert.equal(fs.existsSync(directory), false);
});
