const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const launcherRoot = path.resolve(__dirname, "..");
const companion = require(path.join(launcherRoot, "electron", "companion-extension.cjs"));
const mainSource = fs.readFileSync(path.join(launcherRoot, "electron", "main.cjs"), "utf8");
const rendererSource = fs.readFileSync(path.join(launcherRoot, "src", "SetupAssistance.tsx"), "utf8");
const rendererCopySource = fs.readFileSync(path.join(launcherRoot, "src", "companion-extension.ts"), "utf8");

test("the browser companion is pinned, attributable, and versioned", () => {
  const info = companion.companionExtensionInfo();
  assert.equal(info.provider, "chat-on-steroids");
  assert.equal(info.version, "2.0.6");
  assert.match(info.auditedCommit, /^[a-f0-9]{40}$/);
  assert.equal(
    info.downloadUrl,
    "https://github.com/totec448-spec/chat-on-steroids/releases/download/v2.0.6/Chat-On-Steroids-Extension.zip",
  );
  assert.equal(info.installedByLauncher, false);
  assert.equal(info.status, "optional-upstream");
});

test("the launcher allowlists the pinned download and exposes it from the MCP setup surface", () => {
  assert.match(mainSource, /COMPANION_EXTENSION\.downloadUrl/);
  assert.match(mainSource, /COMPANION_EXTENSION\.repository/);
  assert.match(rendererSource, /CHAT_ON_STEROIDS_EXTENSION_URL/);
  assert.match(rendererSource, /api\.openExternal\(CHAT_ON_STEROIDS_EXTENSION_URL\)/);
  assert.match(rendererCopySource, /Optional upstream|可选的上游浏览器伴侣/);
});
