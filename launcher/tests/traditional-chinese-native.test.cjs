const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createStateStore } = require("../electron/state.cjs");
const main = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");

test("Traditional Chinese remains canonical in persisted native launcher state", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-hant-test-"));
  try {
    const file = path.join(directory, "state.json");
    const stored = createStateStore(file).update({ language: "zh-Hant", onboardingComplete: true });
    assert.equal(stored.language, "zh-Hant");
    assert.equal(createStateStore(file).read().language, "zh-Hant");
    assert.equal(createStateStore(file).read().onboardingComplete, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Traditional Chinese is accepted by native IPC and used by every tray and uninstall label", () => {
  const copyStart = main.indexOf("const NATIVE_COPY ="), copyEnd = main.indexOf("function updateTrayMenu", copyStart);
  const validatorStart = main.indexOf("function validateLanguage("), validatorEnd = main.indexOf("function validateBrowserInteractionMode", validatorStart);
  assert.ok(copyStart >= 0 && copyEnd > copyStart && validatorStart >= 0 && validatorEnd > validatorStart);
  const native = vm.runInNewContext(main.slice(copyStart, copyEnd) + main.slice(validatorStart, validatorEnd)
    + "\n({ nativeCopyFor, validateLanguage });");
  assert.equal(native.validateLanguage("zh-Hant"), "zh-Hant");
  const copy = native.nativeCopyFor("zh-Hant");
  assert.deepEqual(Object.keys(copy).sort(), Object.keys(native.nativeCopyFor("en")).sort());
  assert.equal(copy.openLauncher, "開啟星月計畫");
  assert.equal(copy.quit, "結束");
  assert.equal(copy.cancel, "取消解除安裝");
  assert.equal(copy.remove, "確認解除安裝");
  assert.equal(copy.removeTitle, "移除 Codex 整合");
  assert.equal(copy.removeMessage, "願星光與你同行，我們下次再會");
  assert.match(copy.exportDiagnostics, /匯出.*診斷/);
});
