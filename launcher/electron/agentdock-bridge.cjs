const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");

const SERVER_NAME = "star_moon_agentdock";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ALLOWED_METHODS = new Set(["initialize", "thread/start", "mcpServerStatus/list", "mcpServer/oauth/login"]);
const EMPTY_STATUS = { tools: [], authenticated: false, serverName: null, serverVersion: null, checkedAt: undefined };
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function parseUrl(value, label, maxLength) {
  if (typeof value !== "string" || !value || value.length > maxLength || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error(`Invalid ${label} URL`);
  try { return new URL(value); } catch { throw new Error(`Invalid ${label} URL`); }
}
function validateMcpUrl(value) {
  const url = parseUrl(value, "MCP", 2048);
  if (url.username || url.password || url.hash || url.search) throw new Error("MCP URL must not contain credentials, a query or a fragment");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) throw new Error("Use HTTPS, or HTTP on localhost only");
  return url.toString();
}
function validateSettings(input) {
  const url = validateMcpUrl(input?.url);
  const publicUrl = input?.publicUrl ? validateMcpUrl(input.publicUrl) : "";
  if (publicUrl && new URL(publicUrl).protocol !== "https:") throw new Error("The web-facing MCP address must use HTTPS");
  return { url, publicUrl };
}
function validateAuthorizationUrl(value, settings) {
  const url = parseUrl(value, "authorization", 16384);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)))) throw new Error("Unsafe authorization URL");
  const origins = [settings.url, settings.publicUrl].filter(Boolean).map(value => new URL(value).origin);
  if (!origins.includes(url.origin)) throw new Error("Authorization origin differs; confirm the public MCP address in connection settings");
  return url.toString();
}
function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(directory).isDirectory()) throw new Error("MCP private directory must not be a symbolic link");
  if (process.platform !== "win32") fs.chmodSync(directory, 0o700);
}
function privateWrite(file, value) {
  privateDirectory(path.dirname(file));
  const temporary = `${file}.${randomUUID()}.next`;
  try {
    fs.writeFileSync(temporary, value, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
function defaultCodexExecutable() {
  const known = process.platform === "linux" ? "/usr/lib/chatgpt/resources/codex" : null;
  return known && fs.existsSync(known) ? known : "codex";
}

// MCP configuration, user-initiated OAuth and inventory only. This helper cannot
// send model turns or tool calls, and does not use the Native2 callback channel.
class AgentDockBridge {
  constructor({ directory, openExternal, notify = () => {}, spawnProcess = spawn, executable = defaultCodexExecutable(), timeouts = {} }) {
    this.directory = path.resolve(directory);
    this.settingsPath = path.join(this.directory, "connection.json");
    this.openExternal = openExternal;
    this.notify = notify;
    this.spawnProcess = spawnProcess;
    this.executable = executable;
    this.timeouts = { request: 25000, oauth: 300000, term: 1000, kill: 2500, close: 5000, ...timeouts };
    this.child = null;
    this.session = null;
    this.starting = null;
    this.inspectPromise = null;
    this.loginPromise = null;
    this.configurationTail = Promise.resolve();
    this.generation = 0;
    this.pending = new Map();
    this.nextId = 0;
    this.status = { ...EMPTY_STATUS, state: "unconfigured" };
    this.settings = { url: "", publicUrl: "" };
    try {
      this.settings = validateSettings(JSON.parse(fs.readFileSync(this.settingsPath, "utf8")));
      this.status.state = "configured";
    } catch (error) {
      if (error.code !== "ENOENT") this.status.state = "invalid-config";
    }
    this.home = this.clientHome(this.settings);
  }
  clientHome(settings) {
    // A different endpoint or explicitly trusted public origin gets a different
    // credential namespace. Old connection credentials are retained, not copied.
    const key = createHash("sha256").update(JSON.stringify(settings)).digest("hex");
    return path.join(this.directory, "codex-mcp-client", key);
  }
  writeConfig(settings, home) {
    privateDirectory(this.directory);
    privateDirectory(path.join(this.directory, "codex-mcp-client"));
    privateWrite(path.join(home, "config.toml"), `cli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\n\n[mcp_servers.${SERVER_NAME}]\nurl = ${JSON.stringify(settings.url)}\nstartup_timeout_sec = 15\n`);
  }
  snapshot() { return { ...this.settings, ...this.status, tools: [...this.status.tools] }; }
  publish(status) {
    this.status = { ...this.status, ...status };
    const result = this.snapshot();
    try { this.notify(result); } catch { /* A closed renderer must not break transport cleanup. */ }
    return this.snapshot();
  }
  configure(input) {
    let settings;
    try { settings = validateSettings(input); } catch (error) { return Promise.reject(error); }
    const operation = this.configurationTail.then(async () => {
      await this.close();
      const home = this.clientHome(settings);
      this.writeConfig(settings, home);
      privateWrite(this.settingsPath, JSON.stringify(settings, null, 2));
      this.settings = settings;
      this.home = home;
      return this.publish({ ...EMPTY_STATUS, state: "configured" });
    });
    this.configurationTail = operation.catch(() => {});
    return operation;
  }
  assertSession(session) {
    if (!session || session !== this.session || session.stopping || session.exited || session.failed) throw new Error("Codex MCP helper stopped");
  }
  async start() {
    const generation = this.generation;
    await this.configurationTail;
    if (generation !== this.generation) throw new Error("MCP operation was cancelled");
    if (this.session) this.assertSession(this.session);
    if (this.starting) return this.starting;
    if (this.session) return;
    if (!this.settings.url) throw new Error("Configure an AgentDock MCP URL first");
    this.writeConfig(this.settings, this.home);
    const env = {};
    for (const key of ["PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"])
      if (process.env[key]) env[key] = process.env[key];
    env.CODEX_HOME = this.home;
    let child;
    try { child = this.spawnProcess(this.executable, ["app-server"], { cwd: this.home, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false }); }
    catch { throw new Error("Cannot start Codex MCP helper"); }
    const session = { child, ready: false, exited: false, stopping: false, failed: false, threadId: null, oauth: null, oauthAttempted: false, authRevision: 0 };
    this.session = session;
    this.child = child;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      if (this.session !== session || session.stopping || session.failed) return;
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) return this.failSession(session, new Error("Codex MCP response exceeded the size limit"));
      for (let index; (index = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { this.failSession(session, new Error("Invalid Codex MCP response")); return; }
        if (!isObject(message)) { this.failSession(session, new Error("Invalid Codex MCP response")); return; }
        this.receive(session, message);
        if (session.stopping || session.failed) return;
      }
    });
    child.stderr.on("data", () => {}); // Never log OAuth URLs, errors from providers or credentials.
    child.on("error", () => {
      this.failSession(session, new Error("Cannot run Codex MCP helper"));
      if (!child.pid) this.ended(session); // A failed spawn need not emit exit.
    });
    child.on("exit", () => this.ended(session));
    child.on("close", () => this.ended(session));
    child.stdin.on("error", () => this.failSession(session, new Error("Cannot write to Codex MCP helper")));
    const starting = this.request("initialize", { clientInfo: { name: "star_moon_mcp", title: "Star & Moon AgentDock", version: "0.1.0" }, capabilities: { experimentalApi: true } }, this.timeouts.request, session).then(async result => {
      if (!isObject(result)) throw new Error("Invalid Codex initialization response");
      this.assertSession(session);
      await this.write(session, { method: "initialized", params: {} });
      this.assertSession(session);
      session.ready = true;
    }).catch(error => { this.failSession(session, error); throw error; });
    this.starting = starting;
    return starting;
  }
  write(session, message) {
    return new Promise((resolve, reject) => {
      try {
        this.assertSession(session);
        if (session.child.stdin.destroyed || session.child.stdin.writableEnded) throw new Error();
        session.child.stdin.write(JSON.stringify(message) + "\n", error => error ? reject(new Error("Cannot write to Codex MCP helper")) : resolve());
      } catch { reject(new Error("Cannot write to Codex MCP helper")); }
    });
  }
  receive(session, message) {
    if (message.id !== undefined) {
      if (!(typeof message.id === "string" || Number.isSafeInteger(message.id))) return this.failSession(session, new Error("Invalid Codex MCP response"));
      const result = Object.hasOwn(message, "result");
      const error = Object.hasOwn(message, "error");
      if (result || error) {
        if (result === error || (error && !isObject(message.error))) return this.failSession(session, new Error("Invalid Codex MCP response"));
        const waiting = this.pending.get(message.id);
        if (!waiting || waiting.session !== session) return;
        this.pending.delete(message.id); clearTimeout(waiting.timer);
        if (error) waiting.reject(new Error(`Codex MCP operation failed (${Number.isSafeInteger(message.error.code) ? message.error.code : "unknown"})`));
        else waiting.resolve(message.result);
      } else if (typeof message.method === "string") {
        this.write(session, { id: message.id, error: { code: -32601, message: "Interactive requests must be handled by the user" } }).catch(() => this.failSession(session, new Error("Cannot write to Codex MCP helper")));
      } else this.failSession(session, new Error("Invalid Codex MCP response"));
      return;
    }
    if (message.method === "mcpServer/oauthLogin/completed") {
      const flow = session.oauth;
      const params = message.params;
      // OAuth is app-scoped here. A notification for another thread, old process
      // or unsolicited login is not evidence that this connection was authorized.
      if (!flow || !isObject(params) || params.name !== SERVER_NAME || params.threadId != null || typeof params.success !== "boolean") return;
      flow.completion = params.success;
      if (flow.opened) this.completeOAuth(session, flow);
    }
  }
  rejectPending(session, error) {
    for (const [id, pending] of this.pending) {
      if (pending.session !== session) continue;
      this.pending.delete(id); clearTimeout(pending.timer); pending.reject(error);
    }
  }
  clearOAuth(session) {
    if (session.oauth) clearTimeout(session.oauth.timer);
    session.oauth = null;
  }
  ended(session) {
    if (session.exited) return;
    session.exited = true;
    this.rejectPending(session, new Error("Codex MCP helper stopped"));
    this.clearOAuth(session);
    session.finishClose?.();
    if (this.session !== session) return;
    this.session = null; this.child = null; this.starting = null;
    this.inspectPromise = null;
    if (!session.stopping && !session.failed) this.publish({ ...EMPTY_STATUS, state: "error" });
  }
  failSession(session, error) {
    if (session !== this.session || session.exited || session.failed || session.stopping) return;
    session.failed = true;
    this.rejectPending(session, error);
    this.clearOAuth(session);
    this.publish({ ...EMPTY_STATUS, state: /timed out/.test(error.message) ? "timeout" : "error" });
    this.stopSession(session).catch(() => {});
  }
  request(method, params, timeoutMs = this.timeouts.request, session = this.session) {
    if (!ALLOWED_METHODS.has(method)) return Promise.reject(new Error("MCP helper method is not allowed"));
    try {
      this.assertSession(session);
      if (method !== "initialize" && !session.ready) throw new Error("Codex MCP helper is not initialized");
    } catch (error) { return Promise.reject(error); }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.failSession(session, new Error("MCP request timed out")), timeoutMs);
      this.pending.set(id, { resolve, reject, timer, session });
      this.write(session, { id, method, params }).catch(() => this.failSession(session, new Error("Cannot write to Codex MCP helper")));
    });
  }
  inspect() {
    if (this.session?.oauth) return Promise.resolve(this.snapshot());
    if (this.inspectPromise) return this.inspectPromise;
    const generation = this.generation;
    const operation = this.inspectOnce(generation);
    this.inspectPromise = operation;
    operation.finally(() => { if (this.inspectPromise === operation) this.inspectPromise = null; }).catch(() => {});
    return operation;
  }
  async inspectOnce(generation) {
    this.publish({ ...EMPTY_STATUS, state: "checking" });
    let session;
    try {
      await this.start();
      session = this.session;
      this.assertSession(session);
      const authRevision = session.authRevision;
      if (session.oauth) return this.snapshot();
      if (!session.threadId) {
        // Ephemeral, read-only context initializes the MCP runtime. No turn or
        // tool invocation follows, so this path performs no model inference.
        const opened = await this.request("thread/start", { cwd: this.home, approvalPolicy: "never", sandbox: "read-only", ephemeral: true }, this.timeouts.request, session);
        this.assertSession(session);
        if (session.authRevision !== authRevision || session.oauth) return this.snapshot();
        if (!isObject(opened) || !isObject(opened.thread) || typeof opened.thread.id !== "string" || !opened.thread.id) throw new Error("Invalid Codex thread response");
        session.threadId = opened.thread.id;
      }
      const cursors = new Set();
      let cursor;
      for (let page = 0; page < 20; page += 1) {
        const response = await this.request("mcpServerStatus/list", { threadId: session.threadId, detail: "toolsAndAuthOnly", limit: 100, ...(cursor ? { cursor } : {}) }, this.timeouts.request, session);
        this.assertSession(session);
        if (session.authRevision !== authRevision || session.oauth) return this.snapshot();
        if (!isObject(response) || !Array.isArray(response.data) || response.data.some(value => !isObject(value))) throw new Error("Invalid MCP inventory response");
        const server = response.data.find(value => value.name === SERVER_NAME);
        if (server) {
          if (!isObject(server.tools) || typeof server.authStatus !== "string") throw new Error("Invalid MCP inventory response");
          const tools = Object.keys(server.tools).slice(0, 300);
          // Cached tools/serverInfo alone do not establish a current connection.
          const connected = server.runtimeStatus === "connected";
          const requiresAuth = server.authStatus === "notLoggedIn" || server.runtimeStatus === "authenticationRequired";
          return this.publish({ state: requiresAuth ? "auth-required" : connected ? "connected" : server.runtimeStatus === "starting" ? "checking" : "unverified",
            authenticated: !requiresAuth && ["oAuth", "bearerToken"].includes(server.authStatus), tools,
            serverName: typeof server.serverInfo?.name === "string" ? server.serverInfo.name.slice(0, 200) : null,
            serverVersion: typeof server.serverInfo?.version === "string" ? server.serverInfo.version.slice(0, 100) : null, checkedAt: Date.now() });
        }
        if (response.nextCursor == null) return this.publish({ ...EMPTY_STATUS, state: "unconfigured", checkedAt: Date.now() });
        if (typeof response.nextCursor !== "string" || !response.nextCursor || cursors.has(response.nextCursor)) throw new Error("Invalid MCP inventory cursor");
        cursor = response.nextCursor; cursors.add(cursor);
      }
      throw new Error("MCP inventory pagination limit exceeded");
    } catch (error) {
      if (generation === this.generation && (!session || session === this.session) && !session?.stopping) this.publish({ ...EMPTY_STATUS, state: /timed out/.test(error.message) ? "timeout" : "error" });
      throw error;
    }
  }
  login() {
    if (this.loginPromise) return this.loginPromise;
    if (this.session?.oauth) return Promise.resolve(this.snapshot());
    const operation = this.loginOnce();
    this.loginPromise = operation;
    operation.finally(() => { if (this.loginPromise === operation) this.loginPromise = null; }).catch(() => {});
    return operation;
  }
  async loginOnce() {
    let generation = this.generation;
    await this.start();
    this.assertSession(this.session);
    // There is no OAuth flow ID in the notification schema. Never reuse a
    // transport for a second login: late completion cannot identify a new flow.
    if (this.session.oauthAttempted) {
      generation = ++this.generation;
      this.inspectPromise = null;
      await this.stopSession(this.session);
      if (generation !== this.generation) throw new Error("MCP operation was cancelled");
      await this.start();
    }
    const session = this.session;
    this.assertSession(session);
    const flow = { opened: false, completion: null, timer: null };
    session.oauthAttempted = true;
    session.oauth = flow;
    session.authRevision += 1;
    session.threadId = null;
    this.publish({ ...EMPTY_STATUS, state: "authorizing" });
    flow.timer = setTimeout(() => this.failSession(session, new Error("MCP authorization timed out")), this.timeouts.oauth);
    flow.timer.unref?.();
    try {
      const response = await this.request("mcpServer/oauth/login", { name: SERVER_NAME, timeoutSecs: Math.ceil(this.timeouts.oauth / 1000) }, this.timeouts.request, session);
      this.assertSession(session);
      const authorization = validateAuthorizationUrl(response?.authorizationUrl, this.settings);
      try { await this.openExternal(authorization); } catch { throw new Error("Cannot open the authorization page"); }
      this.assertSession(session);
      flow.opened = true;
      if (flow.completion !== null) return this.completeOAuth(session, flow);
      return this.publish({ ...EMPTY_STATUS, state: "authorizing" });
    } catch (error) {
      this.failSession(session, error);
      throw error;
    }
  }
  completeOAuth(session, flow) {
    if (session !== this.session || session.oauth !== flow || session.stopping) return this.snapshot();
    this.clearOAuth(session);
    session.authRevision += 1;
    session.threadId = null;
    return this.publish({ ...EMPTY_STATUS, state: flow.completion ? "authorized" : "auth-required", authenticated: flow.completion === true });
  }
  stopSession(session) {
    if (session.closePromise) return session.closePromise;
    if (session.exited) return Promise.resolve();
    session.stopping = true;
    this.rejectPending(session, new Error("Codex MCP helper stopped"));
    this.clearOAuth(session);
    session.closePromise = new Promise((resolve, reject) => {
      const timers = [];
      const finish = error => {
        for (const timer of timers) clearTimeout(timer);
        session.finishClose = null;
        if (error) reject(error); else resolve();
      };
      session.finishClose = () => finish();
      const kill = signal => { try { session.child.kill(signal); } catch { /* Only exit/close confirms termination. */ } };
      timers.push(setTimeout(() => kill("SIGTERM"), this.timeouts.term));
      timers.push(setTimeout(() => kill("SIGKILL"), this.timeouts.kill));
      timers.push(setTimeout(() => finish(new Error("MCP helper shutdown could not be confirmed")), this.timeouts.close));
      if (Number.isInteger(session.child.exitCode) || typeof session.child.signalCode === "string") { this.ended(session); return; }
      try { session.child.stdin.end(); } catch { kill("SIGTERM"); }
    });
    return session.closePromise;
  }
  close() {
    this.generation += 1;
    this.inspectPromise = null;
    this.loginPromise = null;
    this.publish({ ...EMPTY_STATUS, state: this.settings.url ? "configured" : "unconfigured" });
    return this.session ? this.stopSession(this.session) : Promise.resolve();
  }
}
module.exports = { AgentDockBridge, validateMcpUrl, validateAuthorizationUrl, SERVER_NAME };
