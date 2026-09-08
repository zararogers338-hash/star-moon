import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { setupRecoveryCopy, setupFailureHint } from "../src/setup-recovery";
import { journeyBackStage, provisionAutomaticJourney } from "../src/configuration-journey";
import type { LauncherSnapshot } from "../src/types";

test("recovery translations are complete and recognize the actual installation failure", () => {
  for (const [language, copy] of Object.entries(setupRecoveryCopy)) {
    expect(Object.keys(copy)).toEqual(Object.keys(setupRecoveryCopy.en));
    expect(Object.values(copy).every(value => value.trim().length > 0)).toBe(true);
    expect(setupFailureHint("Codex config already contains a codex-chatgpt-web interrupt hook marker", language as keyof typeof setupRecoveryCopy)).toBe(copy.hook);
  }
  expect(setupFailureHint("Cannot bind 127.0.0.1:17841: EADDRINUSE", "en")).toBe(setupRecoveryCopy.en.port);
  expect(setupFailureHint("unrelated", "en")).toBeNull();
});

test("failed install can return and retry without rerunning the paid browser test", async () => {
  const snapshot = { state: { browserInteractionMode: "automatic", coreSetupComplete: false }, browser: { authenticated: true }, smokePassed: true } as LauncherSnapshot;
  let attempts = 0;
  const moves: string[] = [];
  const options = {
    api: { smokeTest: async () => { throw new Error("must not send another model request"); }, setupCore: async () => {
      if (++attempts === 1) throw new Error("interrupt hook marker");
      snapshot.state.coreSetupComplete = true;
      return { ok: true, stdout: "", restartRequired: true };
    } }, refresh: async () => snapshot, move: (stage: string) => moves.push(stage),
  };
  await expect(provisionAutomaticJourney(options)).rejects.toThrow("interrupt hook");
  expect(snapshot.state.coreSetupComplete).toBe(false);
  expect(journeyBackStage("install", "automatic")).toBe("prepare");
  await provisionAutomaticJourney(options);
  expect(attempts).toBe(2);
  expect(moves).toEqual(["install", "install", "catalog"]);
});

test("diagnostics retain the original failure, do not auto-retry, and use guarded local IPC", () => {
  const source = readFileSync(new URL("../src/FirstRunJourney.tsx", import.meta.url), "utf8");
  const recover = source.slice(source.indexOf("const recover ="), source.indexOf("useEffect(() =>", source.indexOf("const recover =")));
  expect(recover).not.toContain("setFailure(null)");
  expect(recover).not.toContain("setupCore");
  expect(source).toContain("await api.doctor()");
  expect(source).toContain("await api.exportLogs()");
  expect(source).toContain("await api.openDevTools()");
  expect(source).toContain("await api.uninstallIntegration()");
  expect(readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8")).toContain('handle("launcher:open-devtools"');
});

test("the login dialog can pause and reload without waiting for the login promise", () => {
  const source = readFileSync(new URL("../src/FirstRunJourney.tsx", import.meta.url), "utf8");
  const controls = source.slice(source.indexOf("const controlLogin ="), source.indexOf("const primary ="));
  expect(controls.indexOf("await api.cancelLogin()")).toBeLessThan(controls.indexOf("await loginRequest.current"));
  expect(controls).toContain("++loginAttempt.current");
  expect(source).toContain("if (attempt !== loginAttempt.current) return");
  expect(source).toContain('disabled={stage === "account" ? loginControlBusy : busy}');
  expect(source).toContain("onClick={() => void controlLogin(true)}");
  expect(controls).not.toContain("authenticated: true");
  expect(controls).not.toContain("guidedSetupComplete");
});
