const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createStateStore } = require("../electron/state.cjs");
const source = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");

test("actual onboarding handler accepts both legacy social flags false", () => {
  const snippet = source.slice(source.indexOf('  handle("launcher:complete-onboarding"'), source.indexOf('  handle("launcher:open-external"'));
  let handler;
  let state = { githubOpened: false, xOpened: false, autoStart: false, keepRunningOnClose: false };
  vm.runInNewContext(snippet, {
    handle: (_name, callback) => { handler = callback; },
    stateStore: { read: () => state, update: patch => { state = { ...state, ...patch }; return state; } },
    validateLanguage: value => value, validateBrowserInteractionMode: value => value,
    setAutostart: () => { throw new Error("unexpected autostart"); }, app: {},
    updateTrayMenu: () => {}, logger: { info: () => {} },
  });
  const result = handler({}, "fr", "manual");
  assert.equal(result.onboardingComplete, true);
  assert.equal(result.githubOpened, false); assert.equal(result.xOpened, false);
  assert.equal(result.keepRunningOnClose, false);
});
for (const language of ["en", "zh-CN", "zh-Hant", "fr", "ja", "ru", "de"]) {
  test(`native state preserves ${language} across restart`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "duplex-language-"));
    try {
      const file = path.join(directory, "state.json");
      createStateStore(file).update({ language, onboardingComplete: true });
      assert.equal(createStateStore(file).read().language, language);
      const copySnippet = source.slice(source.indexOf("const NATIVE_COPY ="), source.indexOf("function updateTrayMenu"));
      const copy = vm.runInNewContext(copySnippet + `\nnativeCopyFor(${JSON.stringify(language)});`);
      assert.ok(copy.openLauncher); assert.ok(copy.removeMessage); assert.ok(copy.quit);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
