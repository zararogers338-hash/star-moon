import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { copyFor } from "../src/i18n";
import { detectLanguage, welcomeCopy } from "../src/welcome-copy";
import { finishOptionalSupport } from "../src/onboarding-support";
import { readiness, setupChecks, type Receipt, type SetupCheck } from "../src/setup-readiness";
import type { Language } from "../src/types";

const languages: Language[] = ["zh-CN", "zh-Hant", "en", "fr", "ja", "ru", "de"];
for (const language of languages) {
  test(`${language}: complete non-empty UI and greeting dictionary`, () => {
    const copy = copyFor(language);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(copyFor("en")).sort());
    for (const value of Object.values(copy)) {
      expect(typeof value).toBe("string"); expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(/TODO|TRANSLATE_ME/);
    }
    expect(welcomeCopy[language].title.length).toBeGreaterThan(0);
    expect(welcomeCopy[language].graduation.length).toBeGreaterThan(0);
  });
}
test("language detection recognizes regional variants and safely falls back", () => {
  for (const [locale, expected] of [["zh-Hant-TW", "zh-Hant"], ["fr-CA", "fr"], ["ru-RU", "ru"], ["de-AT", "de"], ["ja_JP", "ja"], ["es-ES", "en"]]) {
    expect(detectLanguage(locale!)).toBe(expected);
  }
});
test("skip grants entry without opening a website", async () => {
  const calls: string[] = [];
  await finishOptionalSupport({ choice: "later", complete: async () => { calls.push("complete"); return { onboardingComplete: true }; }, updateState: () => { calls.push("entered"); }, openRepository: async () => { calls.push("open"); }, onOpenError: () => { calls.push("error"); } });
  expect(calls).toEqual(["complete", "entered"]);
});
test("star grants entry before opening, even when opening never finishes", async () => {
  const calls: string[] = [];
  await finishOptionalSupport({ choice: "star", complete: async () => { calls.push("complete"); return true; }, updateState: () => { calls.push("entered"); }, openRepository: async () => { calls.push("open"); return new Promise(() => {}); }, onOpenError: () => {} });
  expect(calls).toEqual(["complete", "entered", "open"]);
});
test("failed website launch reports an error but never revokes entry", async () => {
  let entered = false; let reported = false;
  await finishOptionalSupport({ choice: "star", complete: async () => true, updateState: () => { entered = true; }, openRepository: async () => { throw new Error("offline"); }, onOpenError: () => { reported = true; } });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(entered).toBe(true); expect(reported).toBe(true);
});
test("onboarding persistence failure never opens a promotion link", async () => {
  let opened = false;
  await expect(finishOptionalSupport({ choice: "star", complete: async () => { throw new Error("disk full"); }, updateState: () => {}, openRepository: async () => { opened = true; }, onOpenError: () => {} })).rejects.toThrow("disk full");
  expect(opened).toBe(false);
});
test("frontend, IPC and allowlist contain no social gate or X shortcut", () => {
  const root = resolve(import.meta.dir, "..");
  const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
  const main = readFileSync(resolve(root, "electron/main.cjs"), "utf8");
  const preload = readFileSync(resolve(root, "electron/preload.cjs"), "utf8");
  expect(app).not.toMatch(/githubOpened|xOpened|openSocial|urls\.x/);
  expect(main).not.toMatch(/current\.githubOpened|current\.xOpened|launcher:open-social|X_URL/);
  expect(preload).not.toContain("launcher:open-social");
  expect(readFileSync(resolve(root, "electron/project-links.cjs"), "utf8")).toContain("SUPPORT_REPOSITORY_URL = null");
  expect(app).toContain('hasSupportRepository ? moveStage("support") : void finish("later")');
});
function receipts(now = 1000): Record<SetupCheck, Receipt> {
  return Object.fromEntries(setupChecks.map(check => [check, { status: "passed", evidence: "real", configurationId: "config-1", checkedAt: now }])) as Record<SetupCheck, Receipt>;
}
test("graduation requires all real, current receipts for the selected configuration", () => {
  expect(readiness("bidirectional", "config-1", {}, 1000).ready).toBe(false);
  const all = receipts();
  expect(readiness("bidirectional", "config-1", all, 1000).ready).toBe(true);
  for (const check of setupChecks) {
    for (const patch of [{ status: "unknown" }, { status: "failed" }, { evidence: "simulation" }, { configurationId: "other" }, { checkedAt: NaN }, { checkedAt: 2000 }]) {
      expect(readiness("bidirectional", "config-1", { ...all, [check]: { ...all[check], ...patch } }, 1000).ready).toBe(false);
    }
  }
  expect(readiness("bidirectional", "config-1", all, 400_000).ready).toBe(false);
});
test("Codex-only graduation does not pretend that remote Work was connected", () => {
  const all = receipts(); delete (all as Partial<typeof all>).work_roundtrip;
  expect(readiness("codex-web", "config-1", all, 1000).ready).toBe(true);
  expect(readiness("bidirectional", "config-1", all, 1000).ready).toBe(false);
});
