import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { afterEndlessNightStage, initialJourneyStage, resumedJourneyStage, journeyBackStage, needsConfigurationJourney, provisionAutomaticJourney, savedMcpJourneyStage, type JourneyStage } from "../src/configuration-journey";
import type { LauncherSnapshot, LauncherState } from "../src/types";

function snapshot(state: Partial<LauncherState> = {}, smokePassed = true, credentials = true): LauncherSnapshot {
  return {
    state: Object.freeze({ browserInteractionMode: "automatic", coreSetupComplete: true, mcpRuntimeInstalled: true,
      mcpSetupComplete: true, codexCatalogVerified: true, codexRestartRequired: false, guidedSetupComplete: false, ...state }),
    browser: { authenticated: true }, smokePassed, mcpCredentialsConfigured: credentials,
  } as LauncherSnapshot;
}

test("paused setup resumes an editable page without becoming a completed installation", () => {
  const paused = snapshot({ guidedSetupComplete: false, guidedSetupPaused: true, guidedSetupResumeStage: "credentials" });
  expect(needsConfigurationJourney(paused.state)).toBe(true);
  expect(resumedJourneyStage(paused)).toBe("credentials");
  expect(resumedJourneyStage({ ...paused, browser: { ...paused.browser!, authenticated: false, status: "signed-out" } })).toBe("account");
  expect(initialJourneyStage(snapshot({ guidedSetupResumeStage: "account" }))).not.toBe("account");
});

test("paused late setup resumes the saved chapter after a failed operation", () => {
  for (const stage of ["catalog", "connector", "verify", "agentdock", "endless-night", "complete"] as const) {
    const paused = snapshot({ guidedSetupComplete: false, guidedSetupPaused: true, guidedSetupResumeStage: stage });
    expect(resumedJourneyStage(paused)).toBe(stage);
  }
});

test("an unprobed browser session does not erase the late recovery page or pass completion", () => {
  const pending = { ...snapshot({ guidedSetupResumeStage: "endless-night" }),
    browser: { authenticated: false, status: "loading" } } as LauncherSnapshot;
  expect(resumedJourneyStage(pending)).toBe("endless-night");
  expect(afterEndlessNightStage(pending, { state: "connected" })).toBe("verify");
  expect(pending.state.guidedSetupComplete).toBe(false);
  const signedOut = { ...pending, browser: { ...pending.browser!, status: "signed-out" as const } };
  expect(resumedJourneyStage(signedOut)).toBe("account");
  expect(afterEndlessNightStage(signedOut, { state: "connected" })).toBe("account");
});

test("navigation and pause never wait for an exit animation in an occluded native window", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const rootRoutes = app.slice(app.indexOf("<CodexCopyLoginPane"), app.indexOf("{error ? <ErrorToast"));
  expect(rootRoutes).not.toContain('mode="wait"');
  const journey = readFileSync(new URL("../src/FirstRunJourney.tsx", import.meta.url), "utf8");
  expect(journey).not.toContain("<AnimatePresence");
  expect(journey).toContain('key={stage}');
  expect(journey).toContain('node.closest(".welcome-stage")?.scrollTo({ top: 0');
});

const source = readFileSync(new URL("../src/FirstRunJourney.tsx", import.meta.url), "utf8");

test("catalog and verification waits always have a useful editable Back target", () => {
  expect(journeyBackStage("catalog", "automatic")).toBe("prepare");
  expect(journeyBackStage("catalog", "manual")).toBe("credentials");
  expect(journeyBackStage("verify", "automatic")).toBe("connector");
  expect(journeyBackStage("verify", "manual")).toBe("connector");
  expect(journeyBackStage("tunnel", "automatic")).toBe("prepare");
  expect(journeyBackStage("tunnel", "manual")).toBeNull();
  expect(journeyBackStage("smoke", "automatic")).toBe("prepare");
  expect(journeyBackStage("install", "automatic")).toBe("prepare");
});

test("the first journey chapter can return to the onboarding entry without clearing setup data", () => {
  expect(source).toContain("const canReturnToOnboarding = !preview");
  expect(source).toContain("updateState(await api.reopenOnboarding())");
  expect(source).toContain("canReturnToOnboarding ? <button");
});

test("late chapters return through configuration without clearing or finishing anything", () => {
  const stages: JourneyStage[] = ["complete", "endless-night", "agentdock", "connector", "credentials", "tunnel", "prepare", "account"];
  for (let index = 0; index < stages.length - 1; index++) {
    expect(journeyBackStage(stages[index]!, "automatic")).toBe(stages[index + 1]!);
  }
  expect(journeyBackStage("account", "automatic")).toBeNull();
});

test("the actual Back handler only changes viewing state and preserves typed fields", () => {
  const body = source.match(/const goBack = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  expect(body).toBeDefined();
  for (const [busy, inFlight, previous, shouldMove] of [
    [false, false, "tunnel", true], [true, false, "tunnel", false], [false, true, "tunnel", false], [false, false, null, false],
  ] as const) {
    const events: unknown[] = [];
    const forbidden = () => { throw new Error("Back must not clear input or run a native operation"); };
    const scope = { busy, inFlight: { current: inFlight }, startupBusyRef: { current: false }, previous,
      setFailure: (value: null) => events.push(["failure", value]), move: (...args: unknown[]) => events.push(["move", ...args]),
      setTunnelId: forbidden, setRuntimeKey: forbidden, setReplaceCredentials: forbidden,
      api: new Proxy({}, { get: () => forbidden }),
    };
    new Function(...Object.keys(scope), body!)(...Object.values(scope));
    expect(events).toEqual(shouldMove ? [["failure", null], ["move", "tunnel", true]] : []);
  }
});

test("intentional backward viewing cannot be immediately undone by the sign-in auto-advance effect", () => {
  expect(source).toContain("if (preview || busy || failure || viewingPrevious) return");
  expect(source).toContain("setViewingPrevious(backwardsReview)");
  const login = source.slice(source.indexOf("const openLogin ="), source.indexOf("const openAgentDockWebSetup ="));
  expect(login).toContain("setViewingPrevious(false)");
  expect(source).toContain('move(next.browser?.authenticated ? "prepare" : "account")');
  expect(source).toContain("onBusyChange={setAgentDockBusy}");
  expect(source).toContain("(!preview && agentDockBusy)");
});

test("continuing from an already completed setup does not rerun smoke or reinstall core", async () => {
  for (const codexCatalogVerified of [true, false]) {
    const current = snapshot({ codexCatalogVerified, codexRestartRequired: !codexCatalogVerified });
    const moves: JourneyStage[] = [];
    let reads = 0;
    await provisionAutomaticJourney({
      api: { smokeTest: async () => { throw new Error("Completed smoke test must not run again"); }, setupCore: async () => { throw new Error("Completed installation must not run again"); } },
      refresh: async () => { reads++; return current; }, move: value => moves.push(value),
    });
    expect(reads).toBe(1);
    expect(moves).toEqual([codexCatalogVerified ? "agentdock" : "catalog"]);
    expect(current.state.guidedSetupComplete).toBe(false);
    expect(current.state.codexCatalogVerified).toBe(codexCatalogVerified);
  }
});

test("a missing current smoke receipt still needs explicit testing but does not reinstall an existing core", async () => {
  const before = snapshot({}, false);
  const checked = snapshot();
  const events: string[] = [];
  let reads = 0;
  await provisionAutomaticJourney({
    api: { smokeTest: async () => { events.push("smoke-request"); return { ok: true, effort: "test", response: "unit test only" }; },
      setupCore: async () => { throw new Error("Existing core must not be installed again"); } },
    refresh: async () => ++reads === 1 ? before : checked, move: value => events.push(value),
  });
  expect(events).toEqual(["smoke", "smoke-request", "agentdock"]);
});

test("an incomplete core still installs once and remains behind its native catalog gate", async () => {
  const before = snapshot({ coreSetupComplete: false });
  const after = snapshot({ codexCatalogVerified: false, codexRestartRequired: true });
  const events: string[] = [];
  let reads = 0;
  await provisionAutomaticJourney({
    api: { smokeTest: async () => { throw new Error("A saved current smoke receipt must be reused"); },
      setupCore: async () => { events.push("install-call"); return { ok: true, stdout: "test", restartRequired: true }; } },
    refresh: async () => ++reads === 1 ? before : after, move: value => events.push(value),
  });
  expect(events).toEqual(["install", "install-call", "catalog"]);
});

test("saved MCP work is reused only with the required real saved state", () => {
  expect(savedMcpJourneyStage(snapshot())).toBe("agentdock");
  expect(savedMcpJourneyStage(snapshot(), true)).toBe("agentdock");
  expect(savedMcpJourneyStage(snapshot({ mcpSetupComplete: false }))).toBe("connector");
  expect(savedMcpJourneyStage(snapshot({ mcpSetupComplete: false }), true)).toBeNull();
  expect(savedMcpJourneyStage(snapshot({ codexCatalogVerified: false, codexRestartRequired: true }), true)).toBe("catalog");
  expect(savedMcpJourneyStage(snapshot({ coreSetupComplete: false }))).toBeNull();
  expect(savedMcpJourneyStage(snapshot({ mcpRuntimeInstalled: false }))).toBeNull();
  expect(savedMcpJourneyStage(snapshot({}, true, false))).toBeNull();
  expect(source).toContain("savedCredentials ? savedMcpJourneyStage(before) : null");
  expect(source).toContain("!failure ? savedMcpJourneyStage(before, true) : null");
});
