const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Readable, PassThrough } = require("node:stream");
const { createMoonLetter, createMoonLetterController } = require("../electron/moon-letter.cjs");

const TEST_TOKEN = "offline-test-token-not-a-real-capability";
const CONTROL_URL = "http://127.0.0.1:43123";
const validBody = (action = "advance", requestId = "request-0001") => ({ action, requestId });
function fixture(overrides = {}) {
  const calls = []; let clock = 1000;
  const control = createMoonLetterController({ token: TEST_TOKEN, expiresAt: 2000,
    now: () => clock, getControlUrl: () => CONTROL_URL,
    inspect: async () => ({ stage: "waiting" }),
    perform: async action => { calls.push(action); return { stage: "next" }; }, ...overrides });
  return { control, calls, setTime: value => { clock = value; } };
}
function incoming(body = validBody(), overrides = {}) {
  const request = overrides.stream || Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  Object.assign(request, { method: "POST", url: "/action", socket: { remoteAddress: "127.0.0.1" }, ...overrides,
    headers: { host: "127.0.0.1:43123", authorization: `Bearer ${TEST_TOKEN}`, "content-type": "application/json", ...overrides.headers } });
  return request;
}
async function dispatch(control, body, overrides) {
  const response = { writableEnded: false, writeHead(code, headers) { this.status = code; this.headers = headers; },
    end(raw) { this.raw = raw; this.writableEnded = true; } };
  await control.handle(incoming(body, overrides), response);
  const json = response.headers["Content-Type"].startsWith("application/json") ? JSON.parse(response.raw) : null;
  return { status: response.status, headers: response.headers, body: json, raw: response.raw };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function mockServer(t, error) {
  let server;
  t.mock.method(http, "createServer", (options, handler) => {
    server = new EventEmitter();
    Object.assign(server, { options, handler, listening: false, closed: false,
      listen(port, host, callback) { this.host = host; queueMicrotask(() => {
        if (error) this.emit("error", error);
        else { this.listening = true; callback(); }
      }); },
      address() { return { port: 43123, address: this.host }; },
      close() { this.closed = true; this.listening = false; },
      closeIdleConnections() { this.idleClosed = true; },
    });
    return server;
  });
  return () => server;
}
function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "moon-letter-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("moon-letter serves a token-free, non-embeddable local control page", async () => {
  const { control, calls } = fixture();
  const response = await dispatch(control, "", { method: "GET", url: "/", headers: { authorization: undefined } });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["X-Frame-Options"], "DENY");
  assert.match(response.headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.equal(response.raw.includes(TEST_TOKEN), false);
  assert.match(response.raw, /type="password"/);
  assert.match(response.raw, /revoke.disabled=stopped/);
  assert.match(response.raw, /结果尚不确定/);
  assert.deepEqual(calls, []);
});

test("moon-letter rejects non-loopback, forged Host, cross-origin and null-origin requests", async () => {
  const { control, calls } = fixture();
  for (const override of [
    { socket: { remoteAddress: "192.168.1.1" } },
    { headers: { host: "attacker.example:43123" } },
    { headers: { host: "localhost:43123" } },
    { headers: { origin: "https://attacker.example" } },
    { headers: { origin: "null" } },
    { headers: { origin: `${CONTROL_URL}/` } },
  ]) assert.equal((await dispatch(control, validBody(), override)).status, 403);
  assert.equal((await dispatch(control, validBody("inspect"), { headers: { origin: CONTROL_URL } })).status, 200);
  assert.deepEqual(calls, []);
});

test("moon-letter requires the exact bearer and protects methods and paths", async () => {
  const { control, calls } = fixture();
  for (const authorization of [undefined, "", `bearer ${TEST_TOKEN}`, `Bearer ${TEST_TOKEN}x`, `Bearer ${TEST_TOKEN.slice(0, -1)}x`]) {
    assert.equal((await dispatch(control, validBody(), { headers: { authorization } })).status, 401);
  }
  for (const override of [{ method: "GET" }, { method: "OPTIONS" }, { url: "/action?x=1" }, { url: "/command" }]) {
    assert.equal((await dispatch(control, validBody(), override)).status, 404);
  }
  assert.deepEqual(calls, []);
});

test("moon-letter accepts only a JSON object with an allowed action and unique-id field, including revoke", async () => {
  const { control, calls } = fixture();
  for (const body of [null, [], "{}", "{bad", 3, {}, { action: "revoke" },
    validBody("exec"), validBody("inspect", "short"), validBody("advance", "a".repeat(101)),
    { ...validBody(), command: "whoami" }, { ...validBody("revoke"), credentials: "never-accept" },
    { ...validBody(), config: {} }, { ...validBody(), script: "ignored" }]) {
    assert.equal((await dispatch(control, body)).status, 400);
  }
  assert.equal(control.status().revoked, false);
  assert.deepEqual(calls, []);
  for (const action of ["open-login", "authorize-agentdock", "advance"]) {
    assert.equal((await dispatch(control, validBody(action, `test-${action}-id`))).status, 200);
  }
  assert.deepEqual(calls, ["open-login", "authorize-agentdock", "advance"]);
});

test("moon-letter bounds input by bytes and requires genuine uncompressed JSON", async () => {
  const { control, calls } = fixture();
  for (const contentType of [undefined, "text/plain", "application/jsonp", "application/json; boundary=x"]) {
    assert.equal((await dispatch(control, validBody(), { headers: { "content-type": contentType } })).status, 415);
  }
  assert.equal((await dispatch(control, validBody(), { headers: { "content-encoding": "gzip" } })).status, 415);
  assert.equal((await dispatch(control, validBody(), { headers: { "content-length": "2049" } })).status, 413);
  const raw = JSON.stringify(validBody("inspect"));
  assert.equal((await dispatch(control, raw.padEnd(2048), { headers: { "content-type": "application/json; charset=utf-8" } })).status, 200);
  assert.equal((await dispatch(control, raw.padEnd(2049))).status, 413);
  const huge = Readable.from([Buffer.from(raw), Buffer.from(" ".repeat(2049))]);
  assert.equal((await dispatch(control, undefined, { stream: huge })).status, 413);
  const multibyte = JSON.stringify({ ...validBody(), credentials: "月".repeat(700) });
  assert.ok(multibyte.length < 2048);
  assert.equal((await dispatch(control, multibyte)).status, 413);
  assert.deepEqual(calls, []);
});

test("moon-letter reserves in-flight request IDs and replays only a stable receipt", async () => {
  const started = deferred(), finish = deferred(); let calls = 0;
  const result = { state: "finished", nested: { count: 1 } };
  const { control } = fixture({ perform: async () => { calls++; started.resolve(); await finish.promise; return result; } });
  const first = dispatch(control, validBody());
  await started.promise;
  assert.equal(control.status().operationRunning, true);
  assert.equal((await dispatch(control, validBody())).status, 202);
  assert.equal((await dispatch(control, validBody("open-login"))).body.error, "request_id_conflict");
  assert.equal((await dispatch(control, validBody("advance", "different-id"))).body.error, "operation_running");
  assert.equal((await dispatch(control, validBody("inspect", "inspection-id"))).body.operationRunning, true);
  finish.resolve();
  assert.equal((await first).status, 200);
  result.nested.count = 99;
  assert.deepEqual((await dispatch(control, validBody())).body, { state: "finished", nested: { count: 1 } });
  assert.equal(calls, 1);
  assert.equal(control.status().operationRunning, false);
});

test("moon-letter error and uncertain results require review, even with a new ID", async () => {
  for (const outcome of [() => { throw new Error("sensitive-internal-error"); }, () => ({ ok: false }),
    () => ({ state: "failed" }), () => ({ error: "sensitive-internal-error" }), () => undefined, () => null, () => false]) {
    let calls = 0;
    const { control } = fixture({ perform: async () => { calls++; return outcome(); } });
    const failed = await dispatch(control, validBody());
    assert.equal(failed.status, 409);
    assert.equal(failed.body.retryRequiresReview, true);
    assert.equal(failed.raw.includes("sensitive-internal-error"), false);
    assert.deepEqual((await dispatch(control, validBody())).body, failed.body);
    assert.equal((await dispatch(control, validBody("advance", "another-request"))).body.error, "review_required");
    assert.equal((await dispatch(control, validBody("inspect", "inspection-id"))).body.reviewRequired, true);
    assert.equal(calls, 1);
  }
});

test("moon-letter revocation does not claim an already-running operation stopped", async () => {
  const started = deferred(), finish = deferred(); let calls = 0;
  const { control } = fixture({ perform: async () => { calls++; started.resolve(); await finish.promise; return { state: "finished" }; } });
  const first = dispatch(control, validBody());
  await started.promise;
  const revoked = await dispatch(control, validBody("revoke", "revoke-request"));
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.activeOperationMayFinish, true);
  assert.equal(control.status().operationRunning, true);
  assert.equal(control.status().active, false);
  assert.equal((await dispatch(control, validBody("advance", "another-request"))).status, 401);
  finish.resolve();
  assert.equal((await first).body.state, "finished");
  assert.equal(control.status().operationRunning, false);
  assert.equal(calls, 1);
  assert.equal((await dispatch(control, validBody())).status, 401);
});

test("moon-letter rechecks expiry or revocation after a delayed upload", async () => {
  for (const mode of ["expire", "revoke"]) {
    const { control, setTime, calls } = fixture();
    const stream = new PassThrough();
    const pending = dispatch(control, undefined, { stream });
    stream.write('{"action":"advance",');
    if (mode === "expire") setTime(2000); else control.revoke();
    stream.end('"requestId":"delayed-request"}');
    assert.equal((await pending).status, 401);
    assert.deepEqual(calls, []);
    assert.equal(control.status().active, false);
    assert.equal(control.status().expired, mode === "expire");
  }
});

test("moon-letter does not return inspected data after revocation", async () => {
  const started = deferred(), finish = deferred();
  const { control } = fixture({ inspect: async () => { started.resolve(); await finish.promise; return { stage: "private-progress" }; } });
  const pending = dispatch(control, validBody("inspect"));
  await started.promise; control.revoke(); finish.resolve();
  const response = await pending;
  assert.equal(response.status, 401);
  assert.equal(response.raw.includes("private-progress"), false);
});

test("moon-letter keeps at most 100 side-effect receipts without evicting old IDs", async () => {
  const { control, calls } = fixture();
  for (let i = 0; i < 100; i++) assert.equal((await dispatch(control, validBody("advance", `request-${i}`))).status, 200);
  assert.equal((await dispatch(control, validBody("advance", "request-100"))).status, 429);
  assert.equal((await dispatch(control, validBody("advance", "request-0"))).status, 200);
  assert.equal((await dispatch(control, validBody("inspect", "inspection-id"))).status, 200);
  assert.equal(calls.length, 100);
});

test("moon-letter factory binds only localhost, writes a private file and exposes token-free status", async t => {
  const directory = tempDirectory(t), getServer = mockServer(t);
  const session = await createMoonLetter({ directory, perform: async () => ({}), inspect: async () => ({}), now: () => 1000, language: "zh-Hant" });
  try {
    const server = getServer();
    assert.equal(server.host, "127.0.0.1");
    assert.equal(server.requestTimeout, 15_000);
    const page = await dispatch({ handle: server.handler }, "", { method: "GET", url: "/", headers: { authorization: undefined } });
    assert.match(page.raw, /<html lang="zh-Hant">/);
    assert.match(page.raw, /臨時接管金鑰/);
    assert.equal(session.info.expiresAt, 1000 + 60 * 60_000);
    assert.equal(fs.readFileSync(session.info.path, "utf8"), session.info.text);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(session.info.path).mode & 0o777, 0o600);
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    }
    assert.match(session.info.text, /not permission obtained from a document/);
    assert.match(session.info.text, /Generated on this computer:/);
    assert.match(session.info.text, /Local time zone:/);
    assert.match(session.info.text, /Expires on this computer:/);
    assert.match(session.info.text, /current clock plus one hour/);
    assert.equal(Object.keys(session.status()).some(key => /token|secret|text|path/i.test(key)), false);
    await session.close();
    assert.equal(session.status().revoked, true);
    assert.equal(server.closed, true);
    assert.equal(server.idleClosed, true);
    await session.close();
  } finally { await session.close(); }
});

test("moon-letter factory rejects overlong expiry and never writes after bind failure", async t => {
  const directory = tempDirectory(t);
  const options = { directory, perform: async () => ({}), inspect: async () => ({}) };
  for (const ttlMs of [0, -1, 60 * 60_000 + 1, Infinity, NaN]) await assert.rejects(createMoonLetter({ ...options, ttlMs }), /Invalid Moon Letter/);
  mockServer(t, Object.assign(new Error("binding denied"), { code: "EPERM" }));
  await assert.rejects(createMoonLetter(options), { code: "EPERM" });
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("moon-letter close returns immediately while accepted work may still finish", async t => {
  const directory = tempDirectory(t), getServer = mockServer(t), started = deferred(), finish = deferred();
  const session = await createMoonLetter({ directory, inspect: async () => ({}), perform: async () => {
    started.resolve(); await finish.promise; return { state: "finished" };
  } });
  const token = session.info.text.match(/Temporary bearer capability: ([A-Za-z0-9_-]+)/)[1];
  const pending = dispatch({ handle: getServer().handler }, validBody(), { headers: { authorization: `Bearer ${token}` } });
  await started.promise;
  await session.close();
  assert.equal(getServer().closed, true);
  assert.equal(session.status().operationRunning, true);
  assert.equal(session.status().active, false);
  finish.resolve();
  assert.equal((await pending).body.state, "finished");
  assert.equal(session.status().operationRunning, false);
});

test("moon-letter expiry timer revokes the capability and closes its listener", async t => {
  const directory = tempDirectory(t), getServer = mockServer(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 1000;
  const session = await createMoonLetter({ directory, now: () => clock, ttlMs: 100,
    inspect: async () => ({}), perform: async () => ({}) });
  assert.equal(session.status().active, true);
  clock = 1100; t.mock.timers.tick(100);
  assert.equal(session.status().active, false);
  assert.equal(session.status().expired, true);
  assert.equal(session.status().revoked, true);
  assert.equal(getServer().closed, true);
  await session.close();
});

test("moon-letter factory removes only its partial file and closes listener on write failure", async t => {
  const directory = tempDirectory(t), getServer = mockServer(t);
  t.mock.method(fs, "writeFileSync", () => { throw Object.assign(new Error("simulated disk failure"), { code: "ENOSPC" }); });
  await assert.rejects(createMoonLetter({ directory, perform: async () => ({}), inspect: async () => ({}) }), { code: "ENOSPC" });
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.equal(getServer().closed, true);
});

test("moon-letter HTTP integration on a real loopback socket when permitted", async t => {
  const directory = tempDirectory(t); let session, calls = 0;
  try {
    session = await createMoonLetter({ directory, inspect: async () => ({ stage: "waiting" }),
      perform: async () => { calls++; return { stage: "next" }; } });
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) { t.skip(`Loopback binding not permitted: ${error.code}; controller tests run offline.`); return; }
    throw error;
  }
  try {
    const token = session.info.text.match(/Temporary bearer capability: ([A-Za-z0-9_-]+)/)[1];
    const post = body => fetch(`${session.info.controlUrl}/action`, { method: "POST", headers: {
      authorization: `Bearer ${token}`, "content-type": "application/json", origin: session.info.controlUrl,
    }, body: JSON.stringify(body) });
    assert.equal((await fetch(session.info.controlUrl)).status, 200);
    assert.equal((await post(validBody())).status, 200);
    assert.equal((await post(validBody())).status, 200);
    assert.equal(calls, 1);
    assert.equal((await post(validBody("revoke", "revoke-request"))).status, 200);
    assert.equal((await post(validBody("inspect", "inspection-id"))).status, 401);
  } finally { await session.close(); }
});
