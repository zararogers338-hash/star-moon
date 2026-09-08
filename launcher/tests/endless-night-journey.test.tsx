import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FirstRunJourney, type JourneyPreview } from "../src/FirstRunJourney";
import { afterCatalogStage, afterEndlessNightStage, agentDockConnected, applyEndlessNightChoice, continueAgentDockJourney, endlessNightNeedsCatalog, initialJourneyStage, journeyChapters, journeyGoalOrder, journeyStageGoals, type JourneyStage } from "../src/configuration-journey";
import { copyFor } from "../src/i18n";
import { journeyCopy } from "../src/journey-copy";
import { onboardingLanguages } from "../src/onboarding-presentation";
import type { AgentDockConnection, LauncherApi, LauncherSnapshot, LauncherState } from "../src/types";
import { previewCopy } from "./preview-copy";

// Synthetic receipts are confined to unit tests. The browser preview fixture
// does not save these values or claim to have completed native verification.
function snapshot(state: Partial<LauncherState> = {}, authenticated = true, mcpCredentialsConfigured = true): LauncherSnapshot {
  return {
    state: Object.freeze({ browserInteractionMode: "automatic", experimentalBiggerContext: false,
      coreSetupComplete: true, codexCatalogVerified: true, codexRestartRequired: false,
      mcpRuntimeInstalled: true, mcpSetupComplete: true, guidedSetupComplete: false, ...state }),
    browser: { authenticated }, connectorNames: { automatic: "TEST ONLY", manual: "TEST ONLY" },
    urls: {}, version: "test", mcpCredentialsConfigured,
  } as LauncherSnapshot;
}

const forbiddenApi = new Proxy({}, { get: () => () => { throw new Error("No native calls during rendering"); } }) as LauncherApi;

function markup(current: LauncherSnapshot, preview?: JourneyPreview) {
  return renderToStaticMarkup(<FirstRunJourney api={forbiddenApi} browser={current.browser} language="zh-CN" operation={null}
    refresh={async () => { throw new Error("No refresh during rendering"); }} snapshot={current}
    updateState={() => { throw new Error("No state write during rendering"); }} preview={preview} />);
}

function choiceSwitch(html: string) {
  return html.match(/<button\b[^>]*aria-describedby="journey-endless-night-disclosure(?: journey-endless-night-preview)?"[^>]*>/)?.[0] ?? "";
}

test("Endless Night is the penultimate mainline chapter in both modes", () => {
  for (const mode of ["automatic", "manual"] as const) {
    const chapters = journeyChapters(mode);
    expect(chapters.slice(-4)).toEqual(["verify", "agentdock", "endless-night", "complete"]);
    expect(chapters.filter(stage => stage === "endless-night")).toHaveLength(1);
    expect(chapters).toHaveLength(mode === "automatic" ? 12 : 8);
  }
});

test("the internal pages are presented as exactly three clear goal groups", () => {
  expect(journeyGoalOrder).toEqual(["goalWebModel", "goalLocalConnection", "goalBeginJourney"]);
  for (const stage of ["account", "prepare", "smoke", "install", "catalog"] as const) expect(journeyStageGoals[stage]).toBe("goalWebModel");
  for (const stage of ["tunnel", "credentials", "connector", "verify", "agentdock"] as const) expect(journeyStageGoals[stage]).toBe("goalLocalConnection");
  for (const stage of ["endless-night", "complete"] as const) expect(journeyStageGoals[stage]).toBe("goalBeginJourney");
  for (const mode of ["automatic", "manual"] as const) {
    for (const stage of journeyChapters(mode)) {
      const html = markup(snapshot({ browserInteractionMode: mode }), { startAt: stage, copyFor: language => previewCopy[language], finish: () => {} });
      const footer = html.match(/<footer class="welcome-footer">([\s\S]*?)<\/footer>/)?.[1] ?? "";
      expect(footer).toContain('aria-valuemax="3"');
      expect(footer.match(/<li\b/g)).toHaveLength(3);
      expect(footer.match(/class="is-current"/g)).toHaveLength(1);
      for (const goal of journeyGoalOrder) expect(footer).toContain(journeyCopy["zh-CN"][goal]);
      expect(footer).not.toMatch(/aria-valuemax="(?:8|12)"/);
    }
  }
});

test("all seven languages have complete choice, preview, restart and manual-mode copy", () => {
  for (const { value: language } of onboardingLanguages) {
    const words = journeyCopy[language];
    expect(Object.keys(words).sort()).toEqual(Object.keys(journeyCopy.en).sort());
    for (const value of Object.values(words)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(/TODO|TRANSLATE_ME/);
    }
    expect(words["endless-night"]).toBe(copyFor(language).biggerContext);
    if (language !== "en") {
      for (const key of ["endlessNightBody", "endlessNightPreview", "endlessNightManualSaved", "endlessNightRestart"] as const) {
        expect(words[key]).not.toBe(journeyCopy.en[key]);
      }
    }
  }
});

test("resuming a Native2-verified connection first visits AgentDock without changing the saved preference", () => {
  for (const browserInteractionMode of ["automatic", "manual"] as const) {
    for (const experimentalBiggerContext of [false, true]) {
      const current = snapshot({ browserInteractionMode, experimentalBiggerContext });
      expect(initialJourneyStage(current)).toBe("agentdock");
      expect(current.state.experimentalBiggerContext).toBe(experimentalBiggerContext);
      expect(current.state.guidedSetupComplete).toBe(false);
    }
  }
});

test("a catalog recheck returns to AgentDock instead of looping through Native2 connector verification", () => {
  const waiting = snapshot({ experimentalBiggerContext: true, codexCatalogVerified: false, codexRestartRequired: true });
  expect(initialJourneyStage(waiting)).toBe("catalog");
  expect(afterCatalogStage(snapshot({ experimentalBiggerContext: true }))).toBe("agentdock");
  expect(afterCatalogStage(snapshot({ mcpSetupComplete: false }))).toBe("connector");
  expect(afterCatalogStage(snapshot({}, true, false))).toBe("tunnel");
});

test("Continue waits for the actual catalog receipt, not merely a cleared restart flag", () => {
  for (const state of [
    { codexCatalogVerified: false, codexRestartRequired: true },
    { codexCatalogVerified: false, codexRestartRequired: false },
    { codexCatalogVerified: true, codexRestartRequired: true },
    { codexCatalogVerified: undefined, codexRestartRequired: false },
  ]) {
    const current = snapshot(state);
    expect(endlessNightNeedsCatalog(current.state)).toBe(true);
    expect(afterEndlessNightStage(current)).toBe("endless-night");
    expect(current.state.guidedSetupComplete).toBe(false);
  }
  for (const experimentalBiggerContext of [false, true]) {
    const current = snapshot({ experimentalBiggerContext });
    expect(endlessNightNeedsCatalog(current.state)).toBe(false);
    expect(afterEndlessNightStage(current, { state: "connected" })).toBe("complete");
    expect(current.state.guidedSetupComplete).toBe(false);
  }
});

test("only connected AgentDock state passes; authorization and saved addresses do not", async () => {
  expect(agentDockConnected(undefined)).toBe(false);
  expect(agentDockConnected(null)).toBe(false);
  for (const state of ["unconfigured", "configured", "checking", "auth-required", "authorizing", "authorized", "unverified", "timeout", "error", "preview-only", "connected"]) {
    const native = Object.freeze({ url: "http://127.0.0.1:8765/mcp", publicUrl: "", state, authenticated: true, tools: ["agentdock_context"] }) as AgentDockConnection;
    let reads = 0;
    const updates: AgentDockConnection[] = [];
    const moves: JourneyStage[] = [];
    await continueAgentDockJourney({ api: { agentDockRead: async () => { reads++; return native; } },
      updateConnection: connection => updates.push(connection), move: stage => moves.push(stage) });
    expect(reads).toBe(1);
    expect(updates).toEqual([native]);
    expect(updates[0]).toBe(native);
    expect(agentDockConnected(native)).toBe(state === "connected");
    expect(moves).toEqual([state === "connected" ? "endless-night" : "agentdock"]);
    expect(afterEndlessNightStage(snapshot(), native)).toBe(state === "connected" ? "complete" : "agentdock");
  }
  expect(afterEndlessNightStage(snapshot())).toBe("agentdock");
});

test("a failed AgentDock status read cannot advance or create a receipt", async () => {
  const moves: JourneyStage[] = [];
  const updates: AgentDockConnection[] = [];
  await expect(continueAgentDockJourney({ api: { agentDockRead: async () => { throw new Error("read failed"); } },
    updateConnection: value => updates.push(value), move: stage => moves.push(stage),
  })).rejects.toThrow("read failed");
  expect(moves).toEqual([]);
  expect(updates).toEqual([]);
});

test("lost prerequisites return to their real checks and are not promoted to completion", () => {
  expect(afterEndlessNightStage(snapshot({ mcpSetupComplete: false }))).toBe("verify");
  expect(afterEndlessNightStage(snapshot({}, false))).toBe("verify");
  expect(afterEndlessNightStage(snapshot({}, true, false))).toBe("tunnel");
  expect(afterEndlessNightStage(snapshot({ coreSetupComplete: false }))).toBe("prepare");
});

test("keeping the existing setting is a no-op, including the default off choice", async () => {
  for (const enabled of [false, true]) {
    let reads = 0;
    const current = snapshot({ experimentalBiggerContext: enabled });
    await applyEndlessNightChoice({ enabled, unavailable: "unavailable", interrupted: "interrupted",
      refresh: async () => { reads++; return current; },
      api: { setBiggerContext: async () => { throw new Error("An unchanged preference must not be rewritten"); } },
      updateState: () => { throw new Error("An unchanged preference must not be written"); },
    });
    expect(reads).toBe(1);
    expect(current.state.experimentalBiggerContext).toBe(enabled);
  }
});

test("manual and uninstalled connections cannot mutate the preference", async () => {
  for (const current of [snapshot({ browserInteractionMode: "manual" }), snapshot({ coreSetupComplete: false })]) {
    await expect(applyEndlessNightChoice({ enabled: true, unavailable: "unavailable", interrupted: "interrupted",
      refresh: async () => current,
      api: { setBiggerContext: async () => { throw new Error("Unsupported native mutation"); } },
      updateState: () => { throw new Error("Unsupported state mutation"); },
    })).rejects.toThrow("unavailable");
  }
});

test("explicit enabling or disabling forwards only the native state and retains its restart requirement", async () => {
  for (const enabled of [true, false]) {
    const before = snapshot({ experimentalBiggerContext: !enabled });
    const saved = snapshot({ experimentalBiggerContext: enabled, codexCatalogVerified: false, codexRestartRequired: true });
    const calls: boolean[] = [];
    const updates: LauncherState[] = [];
    let reads = 0;
    await applyEndlessNightChoice({ enabled, unavailable: "unavailable", interrupted: "interrupted",
      refresh: async () => ++reads === 1 ? before : saved,
      api: { setBiggerContext: async desired => { calls.push(desired); return saved.state; } },
      updateState: state => updates.push(state),
    });
    expect(calls).toEqual([enabled]);
    expect(reads).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toBe(saved.state);
    expect(saved.state.codexCatalogVerified).toBe(false);
    expect(saved.state.codexRestartRequired).toBe(true);
    expect(saved.state.guidedSetupComplete).toBe(false);
    expect(afterEndlessNightStage(saved)).toBe("endless-night");
  }
});

test("a failed native toggle is not retried, marked complete, or followed by a test request", async () => {
  let mutations = 0;
  let updates = 0;
  let reads = 0;
  await expect(applyEndlessNightChoice({ enabled: true, unavailable: "unavailable", interrupted: "interrupted",
    refresh: async () => { reads++; return snapshot(); },
    api: { setBiggerContext: async () => { mutations++; throw new Error("disk unavailable"); } },
    updateState: () => { updates++; },
  })).rejects.toThrow("disk unavailable");
  expect(mutations).toBe(1);
  expect(updates).toBe(0);
  expect(reads).toBe(1);
});

test("an unsaved or mismatched preference is reported rather than claimed as enabled", async () => {
  for (const returnedEnabled of [false, true]) {
    const before = snapshot();
    let reads = 0;
    await expect(applyEndlessNightChoice({ enabled: true, unavailable: "unavailable", interrupted: "not saved",
      refresh: async () => { reads++; return before; },
      api: { setBiggerContext: async () => snapshot({ experimentalBiggerContext: returnedEnabled }).state },
      updateState: () => {},
    })).rejects.toThrow("not saved");
    expect(reads).toBe(2);
    expect(before.state.experimentalBiggerContext).toBe(false);
  }
});

test("the Endless Night chapter preserves name, poem, technical subtitle, warnings and the default-off choice", () => {
  const html = markup(snapshot(), { startAt: "endless-night", copyFor: language => previewCopy[language], finish: () => {} });
  const title = html.indexOf('id="journey-heading"');
  const poem = html.indexOf(copyFor("zh-CN").biggerContextTagline);
  const subtitle = html.indexOf(copyFor("zh-CN").biggerContextSubtitle);
  expect(html).toContain('data-stage="endless-night"');
  expect(html).toContain('aria-valuemax="3" aria-valuenow="3"');
  expect(poem).toBeGreaterThan(title);
  expect(subtitle).toBeGreaterThan(poem);
  expect(html).toContain("不增加账号用量额度");
  expect(html).toContain("默认关闭");
  expect(html).toContain("不会自动开启");
  expect(choiceSwitch(html)).toContain('aria-checked="false"');
  expect(choiceSwitch(html)).not.toContain("disabled");
});

test("manual mode shows an inert saved preference and cannot imply that Endless Night is active", () => {
  const html = markup(snapshot({ browserInteractionMode: "manual", experimentalBiggerContext: true }), { startAt: "endless-night", copyFor: language => previewCopy[language], finish: () => {} });
  expect(html).toContain('data-stage="endless-night"');
  expect(html).toContain('aria-valuemax="3" aria-valuenow="3"');
  expect(choiceSwitch(html)).toContain('aria-checked="true"');
  expect(choiceSwitch(html)).toContain("disabled");
  expect(html).toContain(journeyCopy["zh-CN"].endlessNightManualSaved);
  expect(html).toContain(copyFor("zh-CN").manualBiggerContextUnavailable);
  expect(html).not.toContain(journeyCopy["zh-CN"].endlessNightOn);
});

test("the live AgentDock chapter embeds setup and blocks the footer until a checked connection exists", () => {
  const html = markup(snapshot());
  expect(html).toContain('data-stage="agentdock"');
  expect(html).toContain('data-chapter-index="10" data-chapter-count="12"');
  expect(html).toContain('class="journey-agentdock"');
  expect(html).toContain(journeyCopy["zh-CN"].agentdockBody);
  expect(html).toContain(journeyCopy["zh-CN"].agentdockWaiting);
  const footer = html.match(/<footer class="welcome-footer">([\s\S]*?)<\/footer>/)?.[1] ?? "";
  expect(footer).toMatch(/class="button-primary" disabled/);
  expect(footer).toContain('aria-valuemax="3" aria-valuenow="2"');
  expect(html).not.toContain("journey-browser-panel");
});

test("AgentDock preview can continue without authorizing, connecting or fabricating a native receipt", () => {
  const current = snapshot({ coreSetupComplete: false, codexCatalogVerified: false, mcpRuntimeInstalled: false, mcpSetupComplete: false }, false, false);
  const html = markup(current, { startAt: "agentdock", copyFor: language => previewCopy[language], finish: () => {} });
  const footer = html.match(/<footer class="welcome-footer">([\s\S]*?)<\/footer>/)?.[1] ?? "";
  expect(html).toContain('data-stage="agentdock"');
  expect(footer).toContain(previewCopy["zh-CN"].next);
  expect(footer).not.toMatch(/class="button-primary" disabled/);
  expect(current.state.mcpSetupComplete).toBe(false);
  expect(current.state.guidedSetupComplete).toBe(false);
});

test("the isolated preview can inspect the chapter with an explicitly simulated, usable switch", () => {
  const current = snapshot({ coreSetupComplete: false, codexCatalogVerified: false, mcpRuntimeInstalled: false, mcpSetupComplete: false }, false, false);
  const html = markup(current, { startAt: "endless-night", copyFor: language => previewCopy[language], finish: () => {} });
  expect(html).toContain('data-preview="true"');
  expect(html).toContain('data-stage="endless-night"');
  expect(html).toContain(journeyCopy["zh-CN"].endlessNightPreview);
  expect(choiceSwitch(html)).toContain(journeyCopy["zh-CN"].endlessNightPreviewToggle);
  expect(choiceSwitch(html)).toContain('aria-checked="false"');
  expect(choiceSwitch(html)).not.toContain("disabled");
  expect(html).toContain(previewCopy["zh-CN"].next);
  expect(html).not.toContain("journey-endless-night-restart");
  expect(current.state.experimentalBiggerContext).toBe(false);
  expect(current.state.codexCatalogVerified).toBe(false);
  expect(current.state.guidedSetupComplete).toBe(false);
});

test("preview handlers stay local and live completion retains its native gate", () => {
  const source = readFileSync(new URL("../src/FirstRunJourney.tsx", import.meta.url), "utf8");
  const toggle = source.slice(source.indexOf("const setEndlessNight ="), source.indexOf("const continueEndlessNight ="));
  const previewBranch = toggle.slice(toggle.indexOf("if (preview)"), toggle.indexOf("return run("));
  expect(previewBranch).toContain("setPreviewEndlessNightEnabled(enabled)");
  expect(previewBranch).not.toMatch(/api\.|await |refresh\(|updateState\(/);
  const verify = source.slice(source.indexOf("const verify ="), source.indexOf("const setEndlessNight ="));
  expect(verify).toContain("await api.verifyMcp()");
  expect(verify).toContain("!result.ok || !next.state.mcpSetupComplete");
  expect(verify).toContain('move("agentdock")');
  expect(verify).not.toContain('move("complete")');
  const browser = source.slice(source.indexOf("const openAgentDockWebSetup ="), source.indexOf("const provision ="));
  expect(browser).toContain("if (preview) return");
  expect(browser).toContain("setShowBrowser(true)");
  expect(browser).toContain("await api.setBrowserSurfaceActive(true)");
  expect(browser).toContain("await api.openAgentDockWebSetup()");
  expect(browser).not.toContain("openExternal");
  expect(source).toContain("api.onAgentDockChanged");
  expect(source).toContain('stage === "agentdock" && !agentDockReady');
  expect(source).toContain("updateState(await api.finishGuidedSetup())");
  expect(source).toContain('message.includes("AgentDock") ? "agentdock" : "verify"');
  expect(source).not.toMatch(/guidedSetupComplete\s*:\s*true|codexCatalogVerified\s*:\s*true|codexRestartRequired\s*:\s*false/);
});
