const { spawnSync } = require("node:child_process");

const LINUX_BROWSERS = {
  "chromium_chromium.desktop": ["/snap/bin/chromium"],
  "chromium.desktop": ["/usr/bin/chromium", "/usr/bin/chromium-browser"],
  "chromium-browser.desktop": ["/usr/bin/chromium-browser", "/usr/bin/chromium"],
  "google-chrome.desktop": ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
  "google-chrome-stable.desktop": ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"],
  "microsoft-edge.desktop": ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"],
};

function resolveSystemLoginBrowser({ usable, run = spawnSync }) {
  const result = run("xdg-settings", ["get", "default-web-browser"], {
    encoding: "utf8", timeout: 3_000, windowsHide: true, maxBuffer: 16_384,
  });
  const desktopId = result.status === 0 ? result.stdout.trim() : "";
  // Never evaluate a desktop Exec line or silently read an existing browser profile.
  const candidates = Object.hasOwn(LINUX_BROWSERS, desktopId) ? LINUX_BROWSERS[desktopId] : [];
  const executable = candidates.find(usable);
  if (!executable) throw new Error("The default browser does not support isolated ChatGPT session handoff. Set Chromium, Chrome or Edge as the default browser, or use embedded sign-in.");
  return executable;
}

module.exports = { resolveSystemLoginBrowser };
