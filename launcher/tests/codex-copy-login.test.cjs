const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { CodexCopyLogin, validateLoginUrl, loginNavigationAllowed, privateAuthFile } = require("../electron/codex-copy-login.cjs");
const AUTH = "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=SECRET_STATE&code_challenge=SECRET_CHALLENGE";
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-login-test-"));
  fs.mkdirSync(path.join(root, "home"), { mode: 0o700 });
  const writes = [], states = [], logs = [];
  let closed = false, view, spawnOptions;
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null; child.signalCode = null; child.pid = 999999;
  child.stdin = new Writable({ write(chunk, _encoding, done) {
    const message = JSON.parse(chunk.toString()); writes.push(message);
    if (message.id && !message.error) queueMicrotask(() => {
      const result = message.method === "account/login/start" ? { loginId: "login-1", authUrl: options.authUrl || AUTH }
        : message.method === "account/read" ? { account: { type: "chatgpt", email: "PRIVATE_EMAIL" } } : {};
      child.stdout.write(JSON.stringify({ id: message.id, result }) + "\n");
    });
    done();
  } });
  const controller = new CodexCopyLogin({
    copies: { summary: () => ({ issues: [], archived: false }), read: () => ({ root, data: { codexExecutable: "/installed/codex", name: "Private copy" } }), checkConfig: async () => ({ ok: true }) },
    window: { contentView: { addChildView() {}, removeChildView() {} }, webContents: { getZoomFactor: () => 1 }, getContentSize: () => [720, 600], isVisible: () => true },
    createView: partition => {
      const contents = new EventEmitter(); let url = "about:blank";
      contents.session = new EventEmitter();
      contents.session.setPermissionRequestHandler = callback => { contents.permission = callback; };
      contents.session.setPermissionCheckHandler = callback => { contents.permissionCheck = callback; };
      contents.setWindowOpenHandler = callback => { contents.popup = callback; };
      contents.getURL = () => url; contents.isDestroyed = () => closed;
      contents.close = () => { closed = true; };
      contents.loadURL = async value => { url = value; contents.emit("did-finish-load"); };
      view = { partition, webContents: contents, setVisible(value) { this.visible = value; }, setBounds(value) { this.bounds = value; } };
      return view;
    },
    spawnProcess: (_exe, args, opts) => { spawnOptions = opts; assert.deepEqual(args, ["-c", 'model_provider="openai"', "app-server"]); return child; },
    terminate: () => { if (!options.unconfirmedStop) { child.signalCode = "SIGTERM"; child.emit("exit", null, "SIGTERM"); } },
    closeTimeoutMs: 5, timeoutMs: options.timeoutMs || 10000,
    publish: state => states.push(state), logger: { info: (event, detail) => logs.push({ event, detail }) },
  });
  return { root, controller, child, writes, states, logs, get view() { return view; }, get spawnOptions() { return spawnOptions; },
    complete: (loginId = "login-1") => child.stdout.write(JSON.stringify({ method: "account/login/completed", params: { loginId, success: true } }) + "\n"),
    close: async () => { child.signalCode = "SIGTERM"; child.emit("exit"); await controller.cancel(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test("authorization is HTTPS on an exact trusted host and callback stays on loopback", () => {
  assert.equal(validateLoginUrl(AUTH).callbackOrigin, "http://localhost:1455");
  for (const url of [AUTH.replace("auth.openai.com", "auth.openai.com.evil.example"), AUTH.replace("https:", "http:"), AUTH.replace("localhost", "evil.example"), AUTH.replace("&state=SECRET_STATE", ""), "file:///secret"]) {
    assert.throws(() => validateLoginUrl(url));
  }
  assert.equal(loginNavigationAllowed("https://accounts.google.com/signin", "http://localhost:1455"), true);
  assert.equal(loginNavigationAllowed("http://localhost:1455/auth/callback?code=private", "http://localhost:1455"), true);
  assert.equal(loginNavigationAllowed("http://localhost:1456/auth/callback", "http://localhost:1455"), false);
  assert.equal(loginNavigationAllowed("https://user:pass@auth.openai.com/", "http://localhost:1455"), false);
});

test("page-ready is not login success; correct callback and private credential file are both required", async () => {
  const f = fixture();
  try {
    await f.controller.begin("copy-id");
    assert.equal(f.controller.snapshot().state, "waiting-user");
    assert.equal(f.controller.snapshot().pageLoaded, true);
    assert.equal(f.spawnOptions.env.CODEX_HOME, path.join(f.root, "home"));
    assert.equal(f.view.partition, "persist:star-moon-codex-login-copy-id");
    f.complete("other-login"); await tick(); assert.equal(f.controller.snapshot().state, "waiting-user");
    fs.writeFileSync(path.join(f.root, "home/auth.json"), "SYNTHETIC_AUTH", { mode: 0o600 });
    f.complete(); await tick(); await tick();
    assert.equal(f.controller.snapshot().state, "complete");
    assert.deepEqual(f.writes.filter(message => message.method).map(message => message.method), ["initialize", "initialized", "account/login/start", "account/read"]);
    assert.doesNotMatch(JSON.stringify([f.states, f.logs]), /SECRET_STATE|SECRET_CHALLENGE|PRIVATE_EMAIL/);
  } finally { await f.close(); }
});

test("failed private-file validation never marks authenticated", async () => {
  const f = fixture();
  try { await f.controller.begin("copy-id"); f.complete(); await tick(); await tick(); assert.equal(f.controller.snapshot().state, "failed"); assert.ok(!f.states.some(state => state.state === "complete")); }
  finally { await f.close(); }
});

test("a saved login can be verified without opening a page or starting OAuth again", async () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, "home/auth.json"), "SYNTHETIC_AUTH", { mode: 0o600 });
    await f.controller.begin("copy-id", { verifySaved: true });
    assert.equal(f.controller.snapshot().state, "complete");
    assert.equal(f.view, undefined);
    assert.deepEqual(f.writes.filter(message => message.method).map(message => message.method), ["initialize", "initialized", "account/read"]);
    assert.equal(f.logs.find(entry => entry.event === "codex_copy.login_verified").detail.source, "saved-login");
  } finally { await f.close(); }
});

test("cancellation revokes the matching login and late completion cannot revive it", async () => {
  const f = fixture();
  try {
    await f.controller.begin("copy-id"); await f.controller.cancel(); f.complete(); await tick();
    assert.equal(f.controller.snapshot().state, "idle");
    assert.ok(f.writes.some(message => message.method === "account/login/cancel" && message.params.loginId === "login-1"));
  } finally { await f.close(); }
});

test("embedded bounds are clipped and webpage permissions are denied", async () => {
  const f = fixture();
  try {
    await f.controller.begin("copy-id"); f.controller.setBounds({ x: 10, y: 170, width: 1000, height: 1000 });
    assert.deepEqual(f.view.bounds, { x: 10, y: 170, width: 710, height: 430 });
    assert.equal(f.view.visible, true); assert.equal(f.view.webContents.permissionCheck(), false);
    let granted; f.view.webContents.permission(null, "camera", value => { granted = value; }); assert.equal(granted, false);
    assert.throws(() => f.controller.setBounds({ x: 0, y: 0, width: NaN, height: 300 }));
  } finally { await f.close(); }
});

test("unconfirmed helper shutdown blocks a replacement login", async () => {
  const f = fixture({ unconfirmedStop: true });
  try { await f.controller.begin("copy-id"); await assert.rejects(f.controller.cancel(), /STOP_UNCONFIRMED/); await assert.rejects(f.controller.begin("copy-id"), /ALREADY_ACTIVE/); }
  finally { await f.close(); }
});

test("credential checks do not accept a public or empty auth file", { skip: process.platform === "win32" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-private-auth-test-"));
  try { const file = path.join(root, "auth.json"); fs.writeFileSync(file, ""); fs.chmodSync(file, 0o600); assert.equal(privateAuthFile(root), false);
    fs.writeFileSync(file, "SYNTHETIC_AUTH"); fs.chmodSync(file, 0o644); assert.equal(privateAuthFile(root), false); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
