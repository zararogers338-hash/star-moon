const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveLauncherProfile } = require("../electron/profile.cjs");

test("only the dedicated explicit codex-home may be nested in a production core", () => {
  const homeDir = path.resolve("/Users/tester"), appData = path.join(homeDir, "Library", "Application Support");
  const options = { homeDir, appData, argv: [], env: { STAR_MOON_CODEX_HOME: path.join(homeDir, ".star-moon", "codex-home") } };
  assert.equal(resolveLauncherProfile(options).codexHome, options.env.STAR_MOON_CODEX_HOME);
  for (const target of [path.join(homeDir, ".star-moon"), path.join(homeDir, ".star-moon", "runtime"), path.join(homeDir, ".codex"), homeDir]) {
    assert.throws(() => resolveLauncherProfile({ ...options, env: { STAR_MOON_CODEX_HOME: target } }), /overlap|dedicated/);
  }
  assert.throws(() => resolveLauncherProfile({ ...options, env: { CODEX_HOME: path.join(homeDir, ".star-moon", "codex-home") } }), /overlap/);
});

test("DEV launcher profile isolates every durable home from production", () => {
  const homeDir = path.resolve("/Users/tester");
  const production = resolveLauncherProfile({
    argv: ["electron", "."],
    env: {},
    homeDir,
    appData: path.join(homeDir, "Library", "Application Support"),
  });
  const development = resolveLauncherProfile({
    argv: ["electron", ".", "--dev-profile"],
    env: {},
    homeDir,
    appData: path.join(homeDir, "Library", "Application Support"),
  });

  assert.equal(production.kind, "production");
  assert.equal(development.kind, "development");
  assert.notEqual(development.coreHome, production.coreHome);
  assert.notEqual(development.codexHome, production.codexHome);
  assert.notEqual(development.userData, production.userData);
  assert.notEqual(development.browserPartition, production.browserPartition);
  assert.equal(development.userData, path.join(development.coreHome, "launcher"));
  assert.equal(development.codexHome, path.join(development.coreHome, "codex-home"));
});

test("DEV launcher refuses an explicit home collision with production", () => {
  const homeDir = path.resolve("/Users/tester");
  const shared = path.join(homeDir, "shared");
  assert.throws(() => resolveLauncherProfile({
    argv: ["electron", ".", "--dev-profile"],
    env: {
      STAR_MOON_DEV_HOME: shared,
      STAR_MOON_HOME: shared,
    },
    homeDir,
    appData: path.join(homeDir, "Library", "Application Support"),
  }), /must differ from the production/);
});

test("DEV launcher ignores generic production path overrides", () => {
  const homeDir = path.resolve("/Users/tester");
  const development = resolveLauncherProfile({
    argv: ["electron", ".", "--dev-profile"],
    env: {
      CODEX_CHATGPT_WEB_HOME: path.join(homeDir, "production-core"),
      CODEX_HOME: path.join(homeDir, "production-codex"),
      CODEX_WEB_GPT_LAUNCHER_DATA_DIR: path.join(homeDir, "production-launcher"),
      STAR_MOON_DEV_HOME: path.join(homeDir, "isolated-dev"),
    },
    homeDir,
    appData: path.join(homeDir, "Library", "Application Support"),
  });

  assert.equal(development.coreHome, path.join(homeDir, "isolated-dev"));
  assert.equal(development.codexHome, path.join(homeDir, "isolated-dev", "codex-home"));
  assert.equal(development.userData, path.join(homeDir, "isolated-dev", "launcher"));
});
