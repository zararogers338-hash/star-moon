const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { resolveLauncherProfile } = require("../electron/profile.cjs");
const { LINUX_DESKTOP_NAME, linuxDesktopEntry, setAutostart } = require("../electron/autostart.cjs");
const manifest = require("../package.json");
const repositoryManifest = require("../../package.json");
const launcherRoot = path.resolve(__dirname, "..");
const identity = { homeDir: path.resolve("/home/star-moon-test"), appData: path.resolve("/home/star-moon-test/.config"), argv: [], env: {} };
const resolve = options => resolveLauncherProfile({ ...identity, ...options });

test("Star Moon package identity differs from the existing launcher without a version split", () => {
  assert.equal(manifest.version, "5.0.2"); assert.equal(manifest.version, repositoryManifest.version);
  assert.equal(manifest.name, "star-moon"); assert.equal(manifest.build.productName, "Star Moon");
  assert.equal(manifest.build.appId, "dev.starmoon.launcher");
  assert.equal(manifest.desktopName, "star-moon.desktop");
  assert.equal(manifest.build.linux.executableName, "star-moon");
  assert.equal(manifest.build.linux.desktop.entry.StartupWMClass, "star-moon");
  assert.equal(manifest.build.deb.packageName, "star-moon");
  assert.deepEqual(manifest.build.linux.target, ["AppImage", "deb", "rpm"]);
  assert.match(manifest.build.artifactName, /^star-moon-/);
  assert.notEqual(manifest.build.nsis.guid, "d1a6026a-6210-588e-9a2b-da3936f94e02");
});

test("the packaging configuration validates against the installed electron-builder schema", () => {
  const { validateSchema } = require("app-builder-lib/out/util/config/schemaValidator.js");
  const schema = require("app-builder-lib/scheme.json");
  assert.doesNotThrow(() => validateSchema(schema, structuredClone(manifest.build)));
  assert.match(manifest.homepage, /^https:\/\//);
  assert.match(manifest.build.deb.maintainer, /local build.*\.invalid>/);
});

test("Star Moon defaults have separate core, session, logs and profile identities", () => {
  const production = resolve();
  const development = resolve({ argv: ["--dev-profile"] });
  assert.equal(production.coreHome, path.join(identity.homeDir, ".star-moon"));
  assert.equal(production.userData, path.join(identity.appData, "Star Moon"));
  assert.equal(production.codexHome, path.join(identity.homeDir, ".codex"));
  assert.equal(production.browserPartition, "persist:star-moon-chatgpt");
  assert.equal(production.appId, manifest.build.appId);
  assert.equal(production.windowClass, manifest.build.linux.desktop.entry.StartupWMClass);
  assert.equal(development.coreHome, path.join(identity.homeDir, ".star-moon-dev"));
  assert.equal(development.codexHome, path.join(development.coreHome, "codex-home"));
  assert.equal(development.browserPartition, "persist:star-moon-dev-chatgpt");
  assert.equal(development.windowClass, "star-moon-dev");
});

test("legacy launcher overrides are never reused as Star Moon storage", () => {
  const actual = resolve({ env: {
    CODEX_CHATGPT_WEB_HOME: path.join(identity.homeDir, "existing-core"),
    CODEX_WEB_GPT_DEV_HOME: path.join(identity.homeDir, "existing-dev"),
    CODEX_WEB_GPT_LAUNCHER_DATA_DIR: path.join(identity.homeDir, "existing-browser"),
  } });
  assert.equal(actual.coreHome, path.join(identity.homeDir, ".star-moon"));
  assert.equal(actual.userData, path.join(identity.appData, "Star Moon"));
});

test("Star Moon-specific smoke overrides isolate all writes including the Codex target", () => {
  const env = { STAR_MOON_HOME: "~/trial/core", STAR_MOON_LAUNCHER_DATA_DIR: "~/trial/launcher", STAR_MOON_CODEX_HOME: "~/trial/codex" };
  const actual = resolve({ env });
  assert.equal(actual.coreHome, path.join(identity.homeDir, "trial/core"));
  assert.equal(actual.userData, path.join(identity.homeDir, "trial/launcher"));
  assert.equal(actual.codexHome, path.join(identity.homeDir, "trial/codex"));
});

test("explicit storage collisions, nested legacy paths and broad directories fail closed", () => {
  for (const target of [identity.homeDir, identity.appData, path.parse(identity.homeDir).root, os.tmpdir(), path.join(identity.homeDir, ".codex"), path.join(identity.homeDir, ".codex-chatgpt-web/browser"), path.join(identity.appData, "Codex Web GPT")]) {
    for (const key of ["STAR_MOON_HOME", "STAR_MOON_LAUNCHER_DATA_DIR"]) assert.throws(() => resolve({ env: { [key]: target } }), /dedicated|overlap/);
  }
  assert.throws(() => resolve({ env: { STAR_MOON_HOME: "~/shared", CODEX_CHATGPT_WEB_HOME: "~/shared" } }), /overlap/);
  assert.throws(() => resolve({ env: { STAR_MOON_HOME: "~/shared", STAR_MOON_DEV_HOME: "~/shared/nested" } }), /must differ/);
  assert.doesNotThrow(() => resolve({ env: { STAR_MOON_HOME: "~/.codex-chatgpt-web-star-moon" } }));
});

test("path isolation resolves existing symlinks before accepting a not-yet-created data directory", { skip: process.platform === "win32" }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-path-test-"));
  try {
    const homeDir = path.join(directory, "home");
    const appData = path.join(homeDir, ".config");
    const legacy = path.join(homeDir, ".codex-chatgpt-web");
    fs.mkdirSync(legacy, { recursive: true });
    fs.symlinkSync(legacy, path.join(homeDir, "alias"));
    assert.throws(() => resolveLauncherProfile({ homeDir, appData, argv: [], env: { STAR_MOON_HOME: path.join(homeDir, "alias/new") } }), /overlap/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("autostart uses a distinct desktop file and ignores upstream executable overrides", () => {
  assert.equal(LINUX_DESKTOP_NAME, "dev.starmoon.launcher.desktop");
  const names = ["CODEX_WEB_GPT_LAUNCHER_EXECUTABLE", "CODEX_WEB_GPT_APPIMAGE", "STAR_MOON_LAUNCHER_EXECUTABLE", "STAR_MOON_APPIMAGE", "APPIMAGE"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.CODEX_WEB_GPT_LAUNCHER_EXECUTABLE = "/upstream/codex-web-gpt";
    process.env.CODEX_WEB_GPT_APPIMAGE = "/upstream/Codex Web GPT.AppImage";
    const entry = linuxDesktopEntry({ getPath: () => "/opt/Star Moon/star-moon" });
    assert.match(entry, /^Name=Star Moon$/m); assert.match(entry, /^Exec="\/opt\/Star Moon\/star-moon" --hidden$/m);
    assert.doesNotMatch(entry, /upstream/);
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});

test("disabling Star Moon autostart preserves an existing Codex Web GPT entry", { skip: process.platform !== "linux" }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-autostart-test-"));
  const previous = process.env.XDG_CONFIG_HOME;
  try {
    process.env.XDG_CONFIG_HOME = directory;
    const folder = path.join(directory, "autostart");
    fs.mkdirSync(folder);
    const upstream = path.join(folder, "dev.codexwebgpt.launcher.desktop");
    fs.writeFileSync(upstream, "upstream entry\n");
    const app = { isPackaged: true, getPath: () => "/opt/Star Moon/star-moon" };
    setAutostart(app, true);
    assert.ok(fs.existsSync(path.join(folder, LINUX_DESKTOP_NAME)));
    setAutostart(app, false);
    assert.equal(fs.readFileSync(upstream, "utf8"), "upstream entry\n");
  } finally {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("smoke launch selects only Star Moon private override names", () => {
  const source = fs.readFileSync(path.join(launcherRoot, "scripts/smoke-package.cjs"), "utf8");
  const start = source.indexOf("function smokeEnvironment()");
  const end = source.indexOf("\ntry {", start);
  const result = vm.runInNewContext(`${source.slice(start, end)}\nsmokeEnvironment();`, { process: { env: {} }, path, scratch: "/tmp/star-moon-fixture", coreHome: "/tmp/star-moon-fixture/core-home", markerPath: "/tmp/star-moon-fixture/ready.json" });
  assert.equal(result.STAR_MOON_HOME, "/tmp/star-moon-fixture/core-home");
  assert.equal(result.STAR_MOON_CODEX_HOME, "/tmp/star-moon-fixture/codex-home");
  assert.equal(result.STAR_MOON_SMOKE_FILE, "/tmp/star-moon-fixture/ready.json");
  assert.equal(result.CODEX_CHATGPT_WEB_HOME, undefined);
  assert.equal(result.CODEX_WEB_GPT_LAUNCHER_DATA_DIR, undefined);
});

function artifactFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-artifact-test-"));
  const artifactsDirectory = path.join(directory, "artifacts");
  const staging = path.join(directory, "staging");
  fs.mkdirSync(artifactsDirectory); fs.mkdirSync(staging);
  const name = "star-moon-5.0.2-linux-x64.deb";
  fs.writeFileSync(path.join(artifactsDirectory, name), "previous same-version build");
  fs.writeFileSync(path.join(artifactsDirectory, "star-moon-5.0.1-linux-x64.deb"), "older version");
  fs.writeFileSync(path.join(artifactsDirectory, "codex-web-gpt-5.0.2-linux-x64.AppImage"), "upstream version");
  fs.writeFileSync(path.join(staging, name), "new build");
  const source = fs.readFileSync(path.join(launcherRoot, "scripts/package.cjs"), "utf8");
  const code = source.slice(source.indexOf("let artifactHistoryDirectory"), source.indexOf("function runChecked"));
  return { directory, artifactsDirectory, staging, name, source, code };
}

test("packager collects deb files, preserves old artifacts and archives same-name builds before atomic publication", () => {
  const fixture = artifactFixture();
  try {
    const publish = vm.runInNewContext(`${fixture.code}\npublishArtifact;`, { fs, path, artifactsDirectory: fixture.artifactsDirectory, staging: fixture.staging });
    publish({ name: fixture.name });
    assert.equal(fs.readFileSync(path.join(fixture.artifactsDirectory, fixture.name), "utf8"), "new build");
    assert.equal(fs.readFileSync(path.join(fixture.artifactsDirectory, "star-moon-5.0.1-linux-x64.deb"), "utf8"), "older version");
    assert.equal(fs.readFileSync(path.join(fixture.artifactsDirectory, "codex-web-gpt-5.0.2-linux-x64.AppImage"), "utf8"), "upstream version");
    const history = path.join(fixture.artifactsDirectory, "history");
    assert.equal(fs.readdirSync(history).length, 1);
    assert.equal(fs.readFileSync(path.join(history, fs.readdirSync(history)[0], fixture.name), "utf8"), "previous same-version build");
    assert.equal(fs.readdirSync(fixture.artifactsDirectory).some(name => name.startsWith(".star-moon-publish-")), false);
    const matcher = fixture.source.match(/entry\.isFile\(\) && (\/[^\n]+\/[a-z]*)\.test\(entry\.name\)/)?.[1];
    assert.ok(matcher); assert.equal(vm.runInNewContext(matcher).test(fixture.name), true);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("a failed artifact copy leaves the prior distributable usable", () => {
  const fixture = artifactFixture();
  try {
    const failingFs = Object.create(fs);
    failingFs.copyFileSync = (from, to, flags) => {
      if (from.startsWith(fixture.staging)) throw new Error("simulated copy failure");
      return fs.copyFileSync(from, to, flags);
    };
    const publish = vm.runInNewContext(`${fixture.code}\npublishArtifact;`, { fs: failingFs, path, artifactsDirectory: fixture.artifactsDirectory, staging: fixture.staging });
    assert.throws(() => publish({ name: fixture.name }), /simulated copy failure/);
    assert.equal(fs.readFileSync(path.join(fixture.artifactsDirectory, fixture.name), "utf8"), "previous same-version build");
    assert.equal(fs.readdirSync(fixture.artifactsDirectory).some(name => name.startsWith(".star-moon-publish-")), false);
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("smoke artifact selection ignores retained older-version packages", () => {
  const source = fs.readFileSync(path.join(launcherRoot, "scripts/smoke-package.cjs"), "utf8");
  const code = source.slice(source.indexOf("function artifact("), source.indexOf("function smokeEnvironment()"));
  const select = vm.runInNewContext(`${code}\nartifact;`, {
    fs: { readdirSync: () => ["star-moon-5.0.1-linux-x64.AppImage", "star-moon-5.0.2-linux-x64.AppImage"] },
    path, artifactsDirectory: "/artifacts", expectedVersion: "5.0.2",
  });
  assert.equal(select(/-linux-x64\.AppImage$/, "AppImage"), "/artifacts/star-moon-5.0.2-linux-x64.AppImage");
});
