const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { isolatedEnvironment } = require("./codex-copy-runner.cjs");
const { terminateOwnedProcessTree, DETACH_OWNED_CHILD } = require("./process-tree.cjs");

const OPENAI = new Set(["https://auth.openai.com", "https://auth0.openai.com", "https://chatgpt.com"]);
const IDP = new Set(["https://accounts.google.com", "https://login.live.com", "https://login.microsoftonline.com", "https://appleid.apple.com"]);
function validateLoginUrl(raw) {
  if (typeof raw !== "string" || raw.length > 16384) throw new Error("SM_COPY_LOGIN_URL_REJECTED");
  const url = new URL(raw);
  if (!OPENAI.has(url.origin) || url.username || url.password || url.hash) throw new Error("SM_COPY_LOGIN_URL_REJECTED");
  const redirect = new URL(url.searchParams.get("redirect_uri"));
  if (redirect.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(redirect.hostname)
    || !redirect.port || redirect.pathname !== "/auth/callback" || redirect.username || redirect.password || redirect.search || redirect.hash
    || !url.searchParams.get("state") || !url.searchParams.get("code_challenge")) throw new Error("SM_COPY_LOGIN_CALLBACK_REJECTED");
  return { url: url.toString(), origin: url.origin, callbackOrigin: redirect.origin };
}
function loginNavigationAllowed(raw, callbackOrigin) {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return false;
    return OPENAI.has(url.origin) || IDP.has(url.origin)
      || (url.origin === callbackOrigin && ["/auth/callback", "/success"].includes(url.pathname));
  } catch { return false; }
}
function privateAuthFile(home) {
  try { const stat = fs.lstatSync(path.join(home, "auth.json")); return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1024 * 1024 && (process.platform === "win32" || ((stat.mode & 0o077) === 0 && stat.uid === process.getuid())); }
  catch { return false; }
}

class CodexCopyLogin {
  constructor({ copies, window, createView, beforeOpen = async () => {}, showWindow = () => {}, publish = () => {}, logger = { info() {} }, spawnProcess = spawn, terminate = terminateOwnedProcessTree, timeoutMs = 600000, closeTimeoutMs = 2000 }) {
    Object.assign(this, { copies, window, createView, beforeOpen, showWindow, publish, logger, spawnProcess, terminate, timeoutMs, closeTimeoutMs });
    this.state = { state: "idle", copyId: null, name: "", origin: "", pageLoaded: false };
    this.pending = new Map(); this.nextId = 0; this.generation = 0; this.child = null; this.view = null; this.operation = false; this.bounds = null; this.closing = null;
  }
  snapshot() { return { ...this.state }; }
  setState(patch) { this.state = { ...this.state, ...patch }; try { this.publish(this.snapshot()); } catch {} }
  rpc(method, params, timeout = 15000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("SM_COPY_LOGIN_TIMEOUT")); }, timeout);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      try { this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n"); }
      catch { this.pending.get(id)?.reject(new Error("SM_COPY_LOGIN_PIPE_FAILED")); this.pending.delete(id); }
    });
  }
  async begin(id, { verifySaved = false } = {}) {
    if (this.operation || this.child || this.closing) throw new Error("SM_COPY_LOGIN_ALREADY_ACTIVE");
    this.operation = true;
    const generation = ++this.generation;
    try {
      const summary = this.copies.summary(id), { root, data } = this.copies.read(id);
      if (summary.archived || summary.issues.length || !(await this.copies.checkConfig(root, data)).ok) throw new Error("SM_COPY_CONFIG_REQUIRES_REVIEW");
      await this.beforeOpen();
      if (generation !== this.generation) return this.snapshot();
      this.copyRoot = root; this.loginId = null; this.earlyCompletion = null; this.bounds = null;
      this.setState({ state: verifySaved ? "verifying" : "preparing", copyId: id, name: data.name, origin: "", pageLoaded: false, error: null });
      this.showWindow();
      // Auth inspection must not inherit a web/local provider that declares
      // requires_openai_auth=false: account/read legitimately returns null for
      // that provider even after successful ChatGPT login. This is a process-
      // only override for an auth helper; the user's working provider is untouched.
      const child = this.spawnProcess(data.codexExecutable, ["-c", 'model_provider="openai"', "app-server"], { cwd: path.join(root, "workspace"),
        env: isolatedEnvironment(path.join(root, "home"), path.join(root, "desktop")), detached: DETACH_OWNED_CHILD, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      this.child = child;
      const pipeFailure = () => { if (generation === this.generation) void this.fail("SM_COPY_LOGIN_PIPE_FAILED"); };
      child.stdin.on("error", pipeFailure); child.stdout.on("error", pipeFailure); child.stderr.on("error", pipeFailure);
      let buffer = "";
      child.stderr.on("data", () => {}); // Never log auth URLs, one-time codes or RPC account payloads.
      child.stdout.on("data", chunk => {
        if (generation !== this.generation) return;
        buffer += chunk.toString("utf8");
        if (buffer.length > 2 * 1024 * 1024) { void this.fail("SM_COPY_LOGIN_FRAME_TOO_LARGE"); return; }
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (!message || typeof message !== "object" || Array.isArray(message)) { void this.fail("SM_COPY_LOGIN_INVALID_RESPONSE"); return; }
          if (message.id !== undefined && this.pending.has(message.id)) {
            const pending = this.pending.get(message.id); this.pending.delete(message.id);
            if (message.error) pending.reject(new Error("SM_COPY_LOGIN_RPC_FAILED")); else pending.resolve(message.result);
          } else if (message.method === "account/login/completed") {
            if (this.loginId === null) this.earlyCompletion = message.params;
            else void this.completed(message.params, generation);
          } else if (message.method && message.id !== undefined) {
            try { child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: "No tools or automatic approvals in login helper" } }) + "\n"); }
            catch { pipeFailure(); }
          }
        }
      });
      const exited = () => {
        if (generation !== this.generation) return;
        for (const pending of this.pending.values()) pending.reject(new Error("SM_COPY_LOGIN_PROCESS_EXITED"));
        this.pending.clear();
        if (!["complete", "cancelled", "failed", "idle"].includes(this.state.state)) void this.fail("SM_COPY_LOGIN_PROCESS_EXITED");
      };
      child.once("error", exited); child.once("exit", exited);
      await this.rpc("initialize", { clientInfo: { name: "star_moon_copy_login", title: "Star Moon independent Codex login", version: "1.0.0" } });
      child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
      if (verifySaved) {
        await this.verifyAccount(generation, "saved-login");
        return this.snapshot();
      }
      const result = await this.rpc("account/login/start", { type: "chatgpt" });
      if (generation !== this.generation) return this.snapshot();
      if (typeof result?.loginId !== "string" || !result.loginId) throw new Error("SM_COPY_LOGIN_INVALID_RESPONSE");
      this.loginId = result.loginId;
      const verified = validateLoginUrl(result.authUrl);
      this.callbackOrigin = verified.callbackOrigin;
      this.view = this.createView(`persist:star-moon-codex-login-${id}`);
      const contents = this.view.webContents;
      const pageFailure = () => { if (generation === this.generation && this.state.state === "waiting-user") void this.fail("SM_COPY_LOGIN_PAGE_FAILED"); };
      contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      contents.session.setPermissionCheckHandler(() => false);
      contents.session.on("will-download", event => event.preventDefault());
      const navigation = (event, url) => {
        if (!loginNavigationAllowed(url, this.callbackOrigin)) { event.preventDefault(); void this.fail("SM_COPY_LOGIN_NAVIGATION_REJECTED"); }
        else this.setState({ pageLoaded: false });
      };
      contents.on("will-navigate", navigation); contents.on("will-redirect", navigation);
      contents.setWindowOpenHandler(({ url }) => {
        if (loginNavigationAllowed(url, this.callbackOrigin)) void contents.loadURL(url).catch(pageFailure);
        else void this.fail("SM_COPY_LOGIN_NAVIGATION_REJECTED");
        return { action: "deny" };
      });
      contents.on("will-attach-webview", event => event.preventDefault());
      contents.on("render-process-gone", pageFailure);
      contents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) pageFailure(); });
      contents.on("did-navigate", (_event, url) => {
        if (generation === this.generation && loginNavigationAllowed(url, this.callbackOrigin)) this.setState({ origin: new URL(url).origin });
      });
      contents.on("did-finish-load", () => {
        if (generation !== this.generation || contents.isDestroyed()) return;
        if (!loginNavigationAllowed(contents.getURL(), this.callbackOrigin)) return;
        this.setState({ pageLoaded: true, origin: new URL(contents.getURL()).origin });
        this.logger.info("codex_copy.login_page_ready", { copyId: id, origin: this.state.origin, embedded: true });
      });
      this.window.contentView.addChildView(this.view); this.view.setVisible(false);
      this.setState({ state: "waiting-user", origin: verified.origin });
      this.timer = setTimeout(() => void this.fail("SM_COPY_LOGIN_EXPIRED"), this.timeoutMs);
      this.timer.unref?.();
      if (this.bounds) this.setBounds(this.bounds);
      await contents.loadURL(verified.url);
      if (this.earlyCompletion) void this.completed(this.earlyCompletion, generation);
      return this.snapshot();
    } catch (error) { if (generation === this.generation) await this.fail(/^SM_COPY_/.test(error.message) ? error.message : "SM_COPY_LOGIN_START_FAILED"); return this.snapshot(); }
    finally { this.operation = false; }
  }
  setBounds(bounds) {
    if (!bounds || ["x", "y", "width", "height"].some(key => !Number.isFinite(bounds[key])) || bounds.width < 0 || bounds.height < 0) throw new Error("SM_COPY_LOGIN_INVALID_BOUNDS");
    this.bounds = bounds;
    if (!this.view) return;
    const zoom = this.window.webContents.getZoomFactor(), [width, height] = this.window.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(bounds.x * zoom))), y = Math.max(0, Math.min(height, Math.round(bounds.y * zoom)));
    this.view.setBounds({ x, y, width: Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom))), height: Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom))) });
    this.view.setVisible(bounds.width > 1 && bounds.height > 1);
    this.setState({ embeddedVisible: bounds.width > 1 && bounds.height > 1 });
    if (bounds.width > 1 && bounds.height > 1) this.logger.info("codex_copy.login_view_attached", {
      copyId: this.state.copyId, width: Math.round(bounds.width), height: Math.round(bounds.height), windowVisible: this.window.isVisible(), embedded: true,
    });
  }
  async completed(params, generation) {
    if (generation !== this.generation || params?.loginId !== this.loginId || this.state.state !== "waiting-user") return;
    if (params.success !== true) return this.fail("SM_COPY_LOGIN_REJECTED");
    this.setState({ state: "verifying" });
    await this.verifyAccount(generation, "oauth-callback");
  }
  async verifyAccount(generation, source) {
    try {
      const result = await this.rpc("account/read", { refreshToken: false });
      if (generation !== this.generation) return;
      if (result?.account?.type !== "chatgpt" || !privateAuthFile(path.join(this.copyRoot, "home"))) throw new Error("SM_COPY_LOGIN_NOT_VERIFIED");
      const id = this.state.copyId;
      await this.dispose();
      if (this.state.state !== "verifying") return;
      this.setState({ state: "complete", error: null });
      this.logger.info("codex_copy.login_verified", { copyId: id, credentialFilePrivate: true, source });
    } catch { if (this.state.state === "verifying") await this.fail("SM_COPY_LOGIN_NOT_VERIFIED"); }
  }
  dispose() {
    if (this.closing) return this.closing;
    this.closing = this.disposeOnce().finally(() => { this.closing = null; });
    return this.closing;
  }
  async disposeOnce() {
    clearTimeout(this.timer);
    if (this.view) {
      const view = this.view; this.view = null;
      try { this.window.contentView.removeChildView(view); } catch {}
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    const child = this.child; this.child = null;
    ++this.generation;
    for (const pending of this.pending.values()) pending.reject(new Error("SM_COPY_LOGIN_CANCELLED"));
    this.pending.clear();
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise(resolve => { const timer = setTimeout(resolve, this.closeTimeoutMs); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
      try { this.terminate(child); } catch (error) { this.child = child; throw error; }
      await closed;
      if (child.exitCode === null && child.signalCode === null) { this.child = child; throw new Error("SM_COPY_LOGIN_STOP_UNCONFIRMED"); }
    }
  }
  async fail(error) { if (this.state.state === "idle" || this.state.state === "cancelled") return; this.setState({ state: "failed", error }); try { await this.dispose(); } catch { this.setState({ error: "SM_COPY_LOGIN_STOP_UNCONFIRMED" }); } }
  async cancel() {
    this.setState({ state: "cancelled" });
    if (this.child && this.child.exitCode === null && this.child.signalCode === null && this.loginId) { try { await this.rpc("account/login/cancel", { loginId: this.loginId }, 2000); } catch {} }
    await this.dispose(); this.setState({ state: "idle", copyId: null, name: "", origin: "", pageLoaded: false, error: null });
    return this.snapshot();
  }
}

module.exports = { CodexCopyLogin, validateLoginUrl, loginNavigationAllowed, privateAuthFile };
