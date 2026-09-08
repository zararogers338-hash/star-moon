import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { initialJourneyStage, afterCatalogStage, endlessNightNeedsCatalog, savedMcpJourneyStage, provisionAutomaticJourney } from "../src/configuration-journey";
import { CatalogReadiness, catalogContinue } from "../src/CatalogReadiness";
import type { LauncherSnapshot } from "../src/types";

function current() { return { state: { onboardingComplete: true, guidedSetupComplete: false, coreSetupComplete: true,
  codexCatalogVerified: false, codexRestartRequired: true, catalogCheckDeferred: true, browserInteractionMode: "automatic", mcpRuntimeInstalled: false, mcpSetupComplete: false },
  browser: { authenticated: true }, smokePassed: true, mcpCredentialsConfigured: false } as LauncherSnapshot; }

test("user continuation advances to the next configuration page without a fake success receipt", async () => {
  const snapshot = current();
  expect(initialJourneyStage(snapshot)).toBe("tunnel");
  expect(endlessNightNeedsCatalog(snapshot.state)).toBe(false);
  const moves: string[] = [];
  await provisionAutomaticJourney({ api: { smokeTest: async () => { throw new Error("must not retest a working copy"); }, setupCore: async () => { throw new Error("must not reinstall"); } }, refresh: async () => snapshot, move: stage => moves.push(stage) });
  expect(moves).toEqual(["tunnel"]);
  expect(snapshot.state.codexCatalogVerified).toBe(false);
  expect(snapshot.state.codexRestartRequired).toBe(true);
  expect(snapshot.state.guidedSetupComplete).toBe(false);
  snapshot.state.mcpRuntimeInstalled = true; snapshot.mcpCredentialsConfigured = true;
  expect(afterCatalogStage(snapshot)).toBe("connector");
  expect(savedMcpJourneyStage(snapshot)).toBe("connector");
});

test("native defer handler persists user choice only, denies uninstalled/busy state", () => {
  const main = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const start = main.indexOf('  trustedHandle("launcher:catalog-defer"');
  const end = main.indexOf('\n  // The existing handle()', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  let handler: () => unknown;
  let state = { coreSetupComplete: true, codexCatalogVerified: false, codexRestartRequired: true, mcpSetupComplete: false };
  let busy = false;
  const patches: unknown[] = [];
  vm.runInNewContext(main.slice(start, end), { trustedHandle: (_name: string, fn: () => unknown) => { handler = fn; },
    runtimeHost: { currentOperation: () => busy ? "setup" : null }, stateStore: { read: () => state, update: (patch: object) => { patches.push(patch); return { ...state, ...patch }; } }, send() {}, logger: { info() {} } });
  handler!();
  expect(patches).toEqual([{ catalogCheckDeferred: true }]);
  busy = true; expect(() => handler!()).toThrow("active operation");
  busy = false; state = { ...state, coreSetupComplete: false }; expect(() => handler!()).toThrow("Install");
});

test("continue control is enabled without an automatic catalog check and never runs itself", () => {
  let invoked = 0;
  const html = renderToStaticMarkup(<CatalogReadiness language="zh-CN" api={{ catalogStatus: async () => { throw new Error("must not auto-check"); } }} onContinue={() => invoked++} />);
  expect(html).toContain(catalogContinue["zh-CN"]);
  const button = html.match(/<button[^>]*class="button-primary"[^>]*>/)?.[0];
  expect(button).toBeDefined(); expect(button).not.toContain("disabled");
  expect(invoked).toBe(0);
});
