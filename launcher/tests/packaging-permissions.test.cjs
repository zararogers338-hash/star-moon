const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { validatePublicPayload } = require("../electron/packaging-permissions.cjs");
test("valid hashes cannot hide unreadable installed assets or non-traversable directories", { skip: process.platform === "win32" }, () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-mode-test-"));
  const root = path.join(parent, "payload"), file = path.join(root, "app.asar");
  try {
    fs.mkdirSync(root, { mode: 0o755 }); fs.chmodSync(root, 0o755);
    fs.writeFileSync(file, "public application data"); fs.chmodSync(file, 0o644);
    assert.doesNotThrow(() => validatePublicPayload(root));
    fs.chmodSync(file, 0o600);
    assert.throws(() => validatePublicPayload(root), /ordinary installed user/);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600, "validation must not chmod user files");
    fs.chmodSync(file, 0o644); fs.chmodSync(root, 0o700);
    assert.throws(() => validatePublicPayload(root), /ordinary installed user/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
