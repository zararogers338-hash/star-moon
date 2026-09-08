// Exercise the real default Chromium binary with a new synthetic profile only.
// No real account, normal browser profile, or external service is used.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { browserLoginProfileParent } from "../src/browser-login";

const executable = process.argv[2];
const offlineOnly = process.argv.includes("--offline-only");
if (executable !== "/snap/bin/chromium") throw new Error("This local preflight targets the verified default Snap Chromium only");
const parent = browserLoginProfileParent(executable, "/unused/synthetic-state.json");
mkdirSync(parent, { recursive: true, mode: 0o700 });
const profile = mkdtempSync(join(parent, "login-profile-preflight-"));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let browser: ReturnType<typeof spawn> | undefined, context;
try {
  if (!offlineOnly) {
  browser = spawn(executable, [`--user-data-dir=${profile}`, "--new-window", "--disable-background-mode", "--disable-background-networking", "--no-first-run", "--no-default-browser-check",
    "data:text/html,<title>Star Moon browser connection test</title><h1>Star Moon: local browser test</h1><p>No account is used. This test window will close automatically.</p>"], { stdio: "ignore" });
  await delay(2500);
  if (browser.exitCode !== null || browser.signalCode !== null) throw new Error("Default browser exited before the isolated window test");
  const closed = new Promise(resolve => browser!.once("exit", resolve));
  // Ask this exact disposable profile to quit through Chromium's own UI command;
  // AppArmor can reject cross-profile Unix signals even for the same user.
  const quitRequest = spawn(executable, [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--app=chrome://quit"], { stdio: "ignore" });
  quitRequest.on("error", error => console.error(error.message));
  await Promise.race([closed, delay(5000).then(() => { throw new Error("Owned test browser did not close"); })]);
  }
  context = await chromium.launchPersistentContext(profile, { executablePath: executable, headless: true, chromiumSandbox: true, offline: true, serviceWorkers: "block",
    ignoreDefaultArgs: ["--no-sandbox", "--enable-automation", "--password-store=basic", "--use-mock-keychain"],
    args: ["--disable-background-mode", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--restore-last-session"], timeout: 20000 });
  await context.setOffline(true);
  await context.addCookies([{ name: "star_moon_synthetic_preflight", value: "non-secret-fixture", domain: ".chatgpt.com", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const state = await context.storageState();
  if (state.cookies.length !== 1 || state.cookies[0]?.name !== "star_moon_synthetic_preflight") throw new Error("Unexpected isolated test state");
  console.log(JSON.stringify({ defaultBrowser: "Chromium", normalWindowOpened: !offlineOnly, offlinePipeCapture: true, isolatedProfile: true, accountsUsed: false, modelCalls: 0 }));
} finally {
  await context?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) console.error("Close the dedicated synthetic test window; its private profile was retained at " + profile);
  else rmSync(profile, { recursive: true, force: true });
}
