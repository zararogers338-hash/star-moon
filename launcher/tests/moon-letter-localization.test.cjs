const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { Readable } = require("node:stream");
const { createMoonLetterController } = require("../electron/moon-letter.cjs");
const { MOON_LETTER_LANGUAGES, moonLetterPageCopy } = require("../electron/moon-letter-copy.cjs");

const TEST_TOKEN = "offline-token-never-a-real-capability";
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
async function page(language) {
  const controller = createMoonLetterController({ language, token: TEST_TOKEN, expiresAt: 2000, now: () => 1000,
    getControlUrl: () => "http://127.0.0.1:43123", inspect: async () => ({}), perform: async () => ({}) });
  const request = Object.assign(Readable.from([]), { method: "GET", url: "/", socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "127.0.0.1:43123" } });
  let html;
  await controller.handle(request, { writeHead(status) { assert.equal(status, 200); }, end(value) { html = value; } });
  return html;
}
function client(html, fetch) {
  const elements = Object.fromEntries(["key", "status", "receipt", "revoke"].map(id => [id, { textContent: "", value: id === "key" ? TEST_TOKEN : "", disabled: false }]));
  const buttons = ["inspect", "advance", "open-login", "authorize-agentdock"].map(action => ({ dataset: { action }, disabled: false }));
  const context = { document: { getElementById: id => elements[id], querySelectorAll: () => buttons },
    crypto: { randomUUID: () => "offline-request-0001" }, fetch };
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  vm.runInNewContext(script, context);
  return { elements, buttons, call: context.call, describe: context.describe };
}

test("Moon Letter control copy is complete and independently localized in all seven languages", async () => {
  assert.deepEqual([...MOON_LETTER_LANGUAGES], ["zh-CN", "zh-Hant", "en", "ja", "fr", "ru", "de"]);
  const keys = Object.keys(moonLetterPageCopy("en").copy).sort();
  for (const language of MOON_LETTER_LANGUAGES) {
    const selected = moonLetterPageCopy(language), copy = selected.copy, html = await page(language);
    assert.equal(selected.language, language);
    assert.deepEqual(Object.keys(copy).sort(), keys);
    assert.deepEqual(Object.keys(copy.actions), ["inspect", "advance", "open-login", "authorize-agentdock", "revoke"]);
    for (const value of [...Object.values(copy).filter(value => typeof value === "string"), ...Object.values(copy.actions)]) {
      assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|TRANSLATE_ME/);
    }
    assert.ok(Object.isFrozen(copy) && Object.isFrozen(copy.actions));
    assert.ok(html.includes(`<html lang="${language}">`));
    assert.ok(html.includes(escapeHtml(copy.keyLabel)));
    assert.ok(html.includes(escapeHtml(copy.actions.advance)));
    assert.ok(html.includes(escapeHtml(copy.boundary)));
    assert.equal(html.includes(TEST_TOKEN), false);
    assert.equal((html.match(/<script>/g) || []).length, 1);
    if (language !== "zh-CN") assert.equal(html.includes("结果尚不确定"), false);
  }
  const traditional = await page("zh-Hant");
  assert.match(traditional, /星月計畫|臨時接管金鑰|開啟登入/);
  assert.doesNotMatch(traditional, /本地接管|临时接管|打开登录/);
});

test("Moon Letter page defaults to Simplified and safely rejects unknown or markup-bearing locale keys", async () => {
  assert.equal(moonLetterPageCopy().language, "zh-CN");
  assert.match(await page(undefined), /<html lang="zh-CN">/);
  for (const language of ["__proto__", "constructor", '<script>alert(1)</script>', null, {}]) {
    assert.equal(moonLetterPageCopy(language).language, "en");
    const html = await page(language);
    assert.match(html, /<html lang="en">/);
    assert.equal(html.includes("alert(1)"), false);
  }
});

test("localized control status leaves action keys, bearer headers and original JSON untouched", async () => {
  const result = { state: "needs-user", action: "complete-sign-in", operationRunning: false };
  for (const language of MOON_LETTER_LANGUAGES) {
    let submitted;
    const ui = client(await page(language), async (url, options) => {
      submitted = { url, options }; return { ok: true, status: 200, json: async () => result };
    });
    await ui.call("open-login");
    assert.equal(submitted.url, "/action");
    assert.equal(submitted.options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
    assert.deepEqual(JSON.parse(submitted.options.body), { action: "open-login", requestId: "offline-request-0001" });
    assert.equal(ui.elements.status.textContent, moonLetterPageCopy(language).copy.needsUser);
    assert.equal(ui.elements.receipt.textContent, JSON.stringify(result, null, 2));
    const copy = moonLetterPageCopy(language).copy;
    assert.equal(ui.describe({ state: "needs-review" }, 409), copy.needsReview);
    assert.equal(ui.describe({ state: "operation-running" }, 202), copy.operationRunning);
    assert.equal(ui.describe({}, 401), copy.unauthorized);
    assert.equal(ui.describe({ state: "revoked", activeOperationMayFinish: true }, 200), `${copy.revoked} ${copy.operationRunning}`);
  }
});

test("localized network uncertainty still prevents blind retries while preserving inspect and revoke", async () => {
  const ui = client(await page("zh-Hant"), async () => { throw new Error("offline fixture"); });
  ui.elements.receipt.textContent = "old result";
  await ui.call("advance");
  assert.equal(ui.elements.status.textContent, moonLetterPageCopy("zh-Hant").copy.uncertain);
  assert.equal(ui.elements.receipt.textContent, "");
  assert.equal(ui.buttons.find(button => button.dataset.action === "advance").disabled, true);
  assert.equal(ui.buttons.find(button => button.dataset.action === "inspect").disabled, false);
  assert.equal(ui.elements.revoke.disabled, false);
});
