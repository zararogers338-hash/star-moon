// Native Electron regression: a local streamed form, no account or model access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { app, BrowserWindow } = require("electron");

const modulePath = process.argv.find(value => value.startsWith("--host-module="))?.slice(14);
const expectBroken = process.argv.includes("--expect-broken");
if (!modulePath || !path.isAbsolute(modulePath)) throw new Error("Pass --host-module with an absolute BrowserHost module");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-login-smoke-"));
app.setPath("userData", path.join(scratch, "desktop"));
app.setPath("sessionData", path.join(scratch, "session"));
const realSetTimeout = global.setTimeout;
const delay = ms => new Promise(resolve => realSetTimeout(resolve, ms));
// Compress only the application's 60-second watchdog inside this isolated test.
global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 60_000 ? 200 : ms, ...args);
let host, window, server;
const requests = [];
app.whenReady().then(async () => {
  const { BrowserHost } = require(modulePath);
  server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url !== "/form") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    response.write('<!doctype html><html><body><h1>Local login regression — no account</h1><form><button id="continue">Continue</button></form><script>window.ready=false;window.clicks=0;document.addEventListener("submit",e=>{e.preventDefault();window.trustedSubmit=e.isTrusted;if(window.ready)window.clicks++})</script>');
    realSetTimeout(() => response.end('<script>window.ready=true</script></body></html>'), 650);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  window = new BrowserWindow({ width: 850, height: 650, show: true, title: "Star Moon · local regression (no account)", webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  host = new BrowserHost({ window, descriptorPath: path.join(scratch, "browser.json"), cdpPort: 0,
    profile: "development", partition: "persist:star-moon-dev-chatgpt", helper: {},
    getConnectorName: () => "Codex Native2", loginWithPasskey: () => { throw new Error("No account access in this test"); },
    logger: { info() {}, warn() {}, error() {}, debug() {} }, publishState() {} });
  await host.ready();
  host.setBounds({ x: 0, y: 0, width: 800, height: 550 });
  host.show();
  const contents = host.view.webContents;
  let loadFailed = false;
  try { await contents.loadURL(`http://127.0.0.1:${server.address().port}/form`); } catch { loadFailed = true; }
  await delay(850);
  const hydrated = await contents.executeJavaScript("window.ready === true");
  const point = await contents.executeJavaScript('(()=>{const r=document.querySelector("#continue").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  window.focus();
  contents.focus();
  contents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  contents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  await delay(100);
  const clicks = await contents.executeJavaScript("window.clicks");
  const trustedSubmit = await contents.executeJavaScript("window.trustedSubmit === true");
  assert.equal(hydrated, !expectBroken);
  assert.equal(clicks, expectBroken ? 0 : 1);
  assert.equal(trustedSubmit, true);
  let popupHistoryPreserved = null;
  if (!expectBroken) {
    const url = `http://127.0.0.1:${server.address().port}/form`;
    contents.setWindowOpenHandler(({ url: requested }) => requested === url
      ? { action: "allow", createWindow: options => host.createAuthView(options, url) }
      : { action: "deny" });
    await contents.executeJavaScript('window.open("/form"); void 0');
    await delay(850);
    const popup = host.authView?.webContents;
    assert.ok(popup && !popup.isDestroyed());
    assert.equal(await popup.executeJavaScript("window.ready === true"), true);
    await popup.executeJavaScript('history.replaceState(null,"","#synthetic-step")');
    await delay(350);
    popupHistoryPreserved = Boolean(host.authView && !popup.isDestroyed());
    assert.equal(popupHistoryPreserved, true);
  }
  assert.ok(requests.every(url => ["/form", "/favicon.ico"].includes(url)));
  console.log(JSON.stringify({ expectedBroken: expectBroken, hydrated, realPointerSubmitCount: clicks, trustedSubmit, loadFailed, popupHistoryPreserved, accountsUsed: false, modelCalls: 0, network: "loopback synthetic form only" }));
}).catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  host?.destroy();
  window?.destroy();
  server?.closeAllConnections();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  global.setTimeout = realSetTimeout;
  app.exit(process.exitCode || 0);
});
