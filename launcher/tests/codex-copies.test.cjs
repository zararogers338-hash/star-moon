const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { CodexCopies, copyConfig } = require("../electron/codex-copies.cjs");
const { isolatedEnvironment, launchSpec } = require("../electron/codex-copy-runner.cjs");
const { configIssues } = require("../electron/codex-copy-validator.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-copies-test-")), calls = [];
  const catalog = { models: [{ slug: "chatgpt-web/high", default_reasoning_level: "high" }] };
  const manager = new CodexCopies({ root: path.join(root, "copies"), engine: process.execPath,
    detect: () => ({ codexExecutable: process.execPath, desktopExecutable: process.execPath }),
    buildCatalog: async (file, target) => { calls.push({ file, target }); return { catalog, endpoint: "http://127.0.0.1:17842/v1" }; },
    run: async (executable, args, options) => { calls.push({ executable, args, env: options.env }); return { stdout: args[0].endsWith("codex-copy-validator.cjs") ? JSON.stringify({ ok: true, issues: [] }) : args[0] === "--version" ? "codex-cli 0.153.1\n" : JSON.stringify(catalog) }; },
  });
  return { root, manager, calls, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("copy environments remove all inherited provider credentials and desktop bindings", () => {
  const env = isolatedEnvironment("/isolated/home", "/isolated/ui", { HOME: "/user", PATH: "/bin", OPENAI_API_KEY: "PRIVATE", CODEX_API_KEY: "PRIVATE", CODEX_HOME: "/original", CODEX_ELECTRON_USER_DATA_PATH: "/original-ui", MCP_SECRET: "PRIVATE", SOME_API_KEY: "PRIVATE" });
  assert.deepEqual(env, { HOME: "/user", PATH: "/bin", CODEX_HOME: "/isolated/home", CODEX_ELECTRON_USER_DATA_PATH: "/isolated/ui" });
});

for (const mode of ["native", "web"]) test(`${mode} creation is private, atomic and never clones auth or task files`, async () => {
  const f = fixture();
  try {
    const copy = await f.manager.create({ name: "我的独立 Codex", mode });
    assert.equal(copy.status, "created"); assert.equal(copy.verification.modelCalls, 0);
    const config = fs.readFileSync(path.join(copy.home, "config.toml"), "utf8");
    assert.match(config, /cli_auth_credentials_store = "file"/);
    assert.match(config, /mcp_oauth_credentials_store = "file"/);
    assert.match(config, /sandbox_mode = "workspace-write"/);
    assert.equal(fs.existsSync(path.join(copy.home, "auth.json")), false);
    assert.equal(fs.existsSync(path.join(copy.home, "sessions")), false);
    if (mode === "web") { assert.match(config, /model_provider = "star_moon_web"/); assert.match(config, /chatgpt-web\/high/); }
    else assert.doesNotMatch(config, /openai_base_url|model_provider|model_catalog_json/);
    assert.equal(f.manager.list().copies.length, 1);
    assert.equal(fs.readdirSync(path.join(f.root, "copies")).some(name => name.startsWith(".creating-")), false);
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(copy.home, "config.toml")).mode & 0o077, 0);
    const spec = launchSpec(path.dirname(copy.home), f.manager.read(copy.id).data, true);
    assert.equal(spec.env.CODEX_HOME, copy.home); assert.equal(spec.env.CODEX_ELECTRON_USER_DATA_PATH, copy.desktopData);
    assert.deepEqual(spec.args, [`--user-data-dir=${copy.desktopData}`]);
  } finally { f.close(); }
});

test("archive and restore change only the entry, keeping credentials, tasks and user edits", async () => {
  const f = fixture();
  try {
    const copy = await f.manager.create({ name: "Copy", mode: "native" });
    fs.writeFileSync(path.join(copy.home, "auth.json"), "PRIVATE", { mode: 0o600 });
    fs.appendFileSync(path.join(copy.home, "config.toml"), "# user edit\n");
    assert.equal(f.manager.archive(copy.id, true).archived, true);
    assert.equal(fs.readFileSync(path.join(copy.home, "auth.json"), "utf8"), "PRIVATE");
    assert.equal(f.manager.archive(copy.id, false).archived, false);
    assert.equal((await f.manager.inspect(copy.id)).status, "created");
    assert.equal(f.manager.summary(copy.id).customizedConfig, true);
    assert.match(fs.readFileSync(path.join(copy.home, "config.toml"), "utf8"), /user edit/);
  } finally { f.close(); }
});

test("ordinary desktop preferences remain editable but key isolation changes fail closed", () => {
  const config = { cli_auth_credentials_store: "file", mcp_oauth_credentials_store: "file", desktop: { theme: "dark" } };
  assert.deepEqual(configIssues(config, "native"), []);
  assert.deepEqual(configIssues({ ...config, cli_auth_credentials_store: "keyring" }, "native"), ["credential-store-not-isolated"]);
  const web = { ...config, model: "chatgpt-web/high", model_catalog_json: "models.json", model_provider: "star_moon_web", model_providers: { star_moon_web: { base_url: "http://127.0.0.1:17842/v1", requires_openai_auth: false } } };
  assert.deepEqual(configIssues(web, "web", "http://127.0.0.1:17842/v1"), []);
  assert.ok(configIssues({ ...web, model_provider: "other" }, "web", "http://127.0.0.1:17842/v1").includes("web-route-changed"));
});

test("unsafe credential-file permissions are diagnosed before any copy launch", { skip: process.platform === "win32" }, async () => {
  const f = fixture();
  try {
    const copy = await f.manager.create({ name: "Private", mode: "native" });
    fs.writeFileSync(path.join(copy.home, "auth.json"), "SYNTHETIC_ONLY", { mode: 0o644 });
    fs.chmodSync(path.join(copy.home, "auth.json"), 0o644);
    assert.ok(f.manager.summary(copy.id).issues.includes("credential-file-permissions"));
    await assert.rejects(f.manager.open(copy.id), /REQUIRES_REVIEW/);
  } finally { f.close(); }
});

test("failed generation leaves earlier copies and parent data intact", async () => {
  const f = fixture();
  try {
    const old = await f.manager.create({ name: "Keep", mode: "native" });
    f.manager.buildCatalog = async () => { throw new Error("SECRET-BACKEND-ERROR"); };
    await assert.rejects(f.manager.create({ name: "Fail", mode: "web" }), error => error.message.startsWith("SM_COPY_CREATE_FAILED") && !error.message.includes("SECRET"));
    assert.deepEqual(fs.readdirSync(path.join(f.root, "copies")), [old.id]);
    assert.equal(f.manager.list().copies[0].name, "Keep");
  } finally { f.close(); }
});

test("path traversal, symlink substitution and invalid modes fail before mutation", async () => {
  const f = fixture();
  try {
    assert.throws(() => f.manager.read("../../outside"), /INVALID_ID|ENOENT/);
    await assert.rejects(f.manager.create({ name: "Copy", mode: "unsafe" }), /INVALID_INPUT/);
    const copy = await f.manager.create({ name: "Copy", mode: "native" });
    const config = path.join(copy.home, "config.toml");
    fs.renameSync(config, config + ".saved"); fs.symlinkSync(config + ".saved", config);
    assert.equal(f.manager.summary(copy.id).status, "needs-attention");
    await assert.rejects(f.manager.open(copy.id), /REQUIRES_REVIEW/);
  } finally { f.close(); }
});

test("generated web clients cannot route a native model or send to a remote endpoint", () => {
  assert.throws(() => copyConfig({ mode: "web", endpoint: "https://example.org/v1", catalog: { models: [{ slug: "chatgpt-web/high" }] } }), /UNSAFE_ENDPOINT/);
  assert.throws(() => copyConfig({ mode: "web", endpoint: "http://127.0.0.1:17842/v1", catalog: { models: [{ slug: "gpt-native" }] } }), /INVALID_CATALOG/);
});
