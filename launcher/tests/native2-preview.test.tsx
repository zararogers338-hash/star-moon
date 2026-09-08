import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
// Load the presentation runtime before briefly supplying the IPC-only window
// stub. These are server-rendered unit tests, not a browser or Electron session.
import { AppearanceContext } from "../src/appearance";
import { copyFor } from "../src/i18n";
import { onboardingLanguages } from "../src/onboarding-presentation";
import type { Language, LauncherApi, LauncherSnapshot, LauncherState, OperationState } from "../src/types";

const nativeCalls: string[] = [];
const forbiddenApi = new Proxy({}, { get: (_target, key) => () => {
  nativeCalls.push(String(key));
  throw new Error(`Native call forbidden in this unit test: ${String(key)}`);
} }) as LauncherApi;
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: { codexWebLauncher: forbiddenApi } });
const { McpSurface, Onboarding, persistOnboardingLanguage } = await import("../src/App");
if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
else Reflect.deleteProperty(globalThis, "window");

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const mcpSource = appSource.slice(appSource.indexOf("export function McpSurface("), appSource.indexOf("function ActivitySurface("));

function snapshot(step = 0, state: Partial<LauncherState> = {}, credentials = false): LauncherSnapshot {
  return {
    profile: "production", state: Object.freeze({ language: "zh-CN", browserInteractionMode: "automatic", mcpGuideStep: step,
      onboardingComplete: false, experimentalBiggerContext: false, codexCatalogVerified: false, mcpSetupComplete: false,
      coreSetupComplete: false, guidedSetupComplete: false, ...state }),
    browser: { authenticated: false }, connectorNames: { automatic: "PREVIEW ONLY", manual: "PREVIEW ONLY" },
    urls: { github: null, connectors: "", tunnels: "", keys: "" }, version: "test", mcpCredentialsConfigured: credentials,
  } as LauncherSnapshot;
}

function renderMcp(current: LauncherSnapshot, preview?: boolean, mode = current.state.browserInteractionMode,
  operation: OperationState | null = null, language: Language = "zh-CN") {
  return renderToStaticMarkup(<McpSurface copy={copyFor(language)} devProfile={false} preview={preview} interactionMode={mode}
    onDone={() => { throw new Error("Rendering cannot finish the wizard"); }} operation={operation}
    setError={() => { throw new Error("Rendering cannot change an error"); }} snapshot={current}
    updateState={() => { throw new Error("Rendering cannot write state"); }} />);
}

function primary(html: string) {
  const footer = html.match(/<div class="wizard-footer">([\s\S]*?)<\/div>/)?.[1] ?? "";
  return footer.match(/<button\b[^>]*class="button-primary"[^>]*>/)?.[0] ?? "";
}

function stepper(html: string) {
  return html.match(/<div class="wizard-stepper"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
}

// Execute the actual small handler bodies with injected setters and a forbidden
// native API. This checks branch behavior, not merely a success-looking render.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
function runHandler(name: string, scope: Record<string, unknown>, argumentNames: string[] = [], argumentValues: unknown[] = []) {
  const body = mcpSource.match(new RegExp(`const ${name} = async \\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};`))?.[1];
  if (!body) throw new Error(`Handler not found: ${name}`);
  const execute = new AsyncFunction(...Object.keys(scope), ...argumentNames, body.replaceAll("api!.", "api."));
  return execute(...Object.values(scope), ...argumentValues);
}

test("Native2 preview shows all three pages without catalog or credential gates in either mode", () => {
  for (const browserInteractionMode of ["automatic", "manual"] as const) {
    for (const step of [0, 1, 2]) {
      const current = snapshot(step, { browserInteractionMode });
      const html = renderMcp(current, true);
      expect(html).toContain(copyFor("zh-CN").native2Title);
      expect(html).toContain(copyFor("zh-CN").native2PreviewNotice);
      expect(html).toContain(`aria-label="${step + 1} / 3"`);
      expect(primary(html)).not.toBe("");
      expect(primary(html)).not.toContain("disabled");
      expect(stepper(html).match(/<button\b/g)).toHaveLength(3);
      expect(stepper(html)).not.toContain("disabled");
      expect(stepper(html)).not.toContain("is-complete");
      expect(html).not.toContain("doctor-summary");
      expect(html).not.toContain("saved-credentials");
      expect(html).not.toContain(copyFor("zh-CN").mcpCatalogRequired);
      expect(html).toContain(step < 2 ? copyFor("zh-CN").native2PreviewNext : copyFor("zh-CN").native2PreviewExit);
      expect(current.state.codexCatalogVerified).toBe(false);
      expect(current.state.mcpSetupComplete).toBe(false);
    }
  }
});

test("preview keeps credentials empty and disabled even with a stale saved-credentials flag", () => {
  const html = renderMcp(snapshot(1, {}, true), true);
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  expect(inputs).toHaveLength(2);
  for (const input of inputs) {
    expect(input).toContain("disabled");
    expect(input).toContain('value=""');
    expect(input).toContain(copyFor("zh-CN").native2PreviewField);
  }
  expect(html).not.toContain("saved-credentials");
  expect(html).not.toContain(copyFor("zh-CN").credentialsConfiguredBody);
});

test("preview disables all external website buttons", () => {
  for (const step of [0, 2]) {
    const buttons = renderMcp(snapshot(step), true).match(/<button\b[^>]*class="button-secondary"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(step === 0 ? 2 : 1);
    for (const button of buttons) expect(button).toContain("disabled");
  }
});

test("inactive-mode preview remains inspectable and ignores irrelevant real-operation locks", () => {
  const operation: OperationState = { name: "mcp-verification", status: "running", message: "Real operation" };
  const html = renderMcp(snapshot(0), true, "manual", operation);
  expect(html).toContain('aria-label="2 / 3"');
  expect(primary(html)).not.toContain("disabled");
  expect(stepper(html)).not.toContain("disabled");
});

test("preview navigation mutates only the local page and never calls setMcpStep", async () => {
  let current = 0;
  const viewed: number[] = [];
  const directions: number[] = [];
  for (const next of [1, 2, 0, 2, 1, 1]) {
    await runHandler("move", { preview: true, api: forbiddenApi, step: current,
      setDirection: (value: number) => directions.push(value),
      setStep: (value: number) => { current = value; viewed.push(value); },
      updateState: () => { throw new Error("Preview must not save navigation"); },
    }, ["next"], [next]);
  }
  expect(viewed).toEqual([1, 2, 0, 2, 1, 1]);
  expect(directions).toEqual([1, 1, -1, 1, -1, 1]);
});

test("install, verify and external handlers are inert in preview even when invoked directly", async () => {
  for (const name of ["install", "verify", "openExternal"]) {
    await runHandler(name, { preview: true, busy: false, api: forbiddenApi });
  }
  expect(nativeCalls).toEqual([]);
});

test("preview exit returns to AgentDock and never relies on a fake diagnostic", () => {
  expect(appSource).toContain('<div className="native2-page" data-preview={preview}>');
  expect(appSource).toMatch(/<McpSurface[\s\S]*?preview=\{preview\}/);
  expect(appSource).toContain('if (preview) setNative2Page(false);');
  expect(mcpSource).toContain('if (step < 2) void safeMove(step + 1); else onDone();');
  expect(mcpSource).not.toMatch(/setDoctor\(\s*\{|codexCatalogVerified\s*:\s*true|mcpSetupComplete\s*:\s*true/);
});

test("omitted preview defaults to production and retains catalog, credentials and busy gates", () => {
  const copy = copyFor("zh-CN");
  const unverified = renderMcp(snapshot(1));
  expect(unverified).toContain(copy.mcpCatalogRequired);
  expect(unverified).not.toContain(copy.native2PreviewNotice);
  expect(primary(unverified)).toContain("disabled");
  expect(primary(renderMcp(snapshot(1, { codexCatalogVerified: true }), false))).toContain("disabled");
  const configured = snapshot(1, { codexCatalogVerified: true }, true);
  expect(primary(renderMcp(configured, false))).not.toContain("disabled");
  const operation: OperationState = { name: "mcp-install", status: "running", message: "Busy" };
  expect(primary(renderMcp(configured, false, "automatic", operation))).toContain("disabled");
  const start = renderMcp(snapshot(0), false);
  expect(stepper(start).match(/disabled/g)).toHaveLength(2);
});

test("user-confirmed catalog deferral unlocks configuration but not missing credentials or busy operations", () => {
  const deferred = snapshot(1, { catalogCheckDeferred: true, codexCatalogVerified: false }, true);
  expect(primary(renderMcp(deferred, false))).not.toContain("disabled");
  expect(primary(renderMcp(snapshot(1, { catalogCheckDeferred: true }, false), false))).toContain("disabled");
  const operation: OperationState = { name: "setup", status: "running", message: "Busy" };
  expect(primary(renderMcp(deferred, false, "automatic", operation))).toContain("disabled");
  expect(deferred.state.codexCatalogVerified).toBe(false);
});

test("production manual and inactive-mode rules stay unchanged, and final verification remains real", () => {
  const manual = snapshot(1, { browserInteractionMode: "manual" }, true);
  expect(primary(renderMcp(manual, false))).not.toContain("disabled");
  expect(primary(renderMcp(snapshot(1, {}, true), false, "manual"))).toContain("disabled");
  const final = renderMcp(snapshot(2), false);
  expect(final).toContain(copyFor("zh-CN").verifyRuntime);
  expect(final).not.toContain(copyFor("zh-CN").native2PreviewExit);
  expect(mcpSource).toContain("setDoctor(await api!.verifyMcp())");
  expect(mcpSource).toContain("doctor?.ok ? onDone() : verify()");
});

test("production move still saves its step before changing the displayed page", async () => {
  const events: string[] = [];
  const saved = snapshot(1).state;
  await runHandler("move", { preview: false, step: 0,
    api: { setMcpStep: async (step: number) => { events.push(`save:${step}`); return saved; } },
    setDirection: () => events.push("direction"), setStep: () => events.push("step"),
    updateState: (state: LauncherState) => { expect(state).toBe(saved); events.push("state"); },
  }, ["next"], [1]);
  expect(events).toEqual(["save:1", "direction", "step", "state"]);
});

test("all supported languages name Native2 clearly and provide complete preview and save-failure copy", () => {
  for (const { value: language } of onboardingLanguages) {
    const copy = copyFor(language);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(copyFor("en")).sort());
    for (const key of ["native2Title", "native2Subtitle", "native2PreviewNotice", "native2PreviewNext", "native2PreviewExit", "native2PreviewField", "native2PreviewStepOne", "native2PreviewStepTwo", "native2PreviewStepThree", "languageSaveFailed"] as const) {
      expect(copy[key].trim()).not.toBe("");
      expect(copy[key]).not.toMatch(/TODO|TRANSLATE_ME/);
      if (language !== "en") expect(copy[key]).not.toBe(copyFor("en")[key]);
    }
    expect(copy.native2Title).toContain("Native2");
    expect(copy.native2Subtitle).toContain("AgentDock");
  }
});

test("the first greeting header exposes the language selector without removing the moon", () => {
  for (const { value: language } of onboardingLanguages) {
    const html = renderToStaticMarkup(<AppearanceContext.Provider value={{ theme: "light", busy: false, changeTheme: async () => {} }}>
      <Onboarding language={language} snapshot={snapshot(0, { language })} setError={() => {}} updateState={() => {}}
        onAssisted={() => { throw new Error("Rendering cannot start assistance"); }} />
    </AppearanceContext.Provider>);
    const header = html.match(/<header class="welcome-top draggable">([\s\S]*?)<\/header>/)?.[1] ?? "";
    expect(html).toContain('data-stage="welcome"');
    expect(header).toContain("welcome-header-language no-drag");
    expect(header).toContain('class="language-menu-trigger"');
    expect(header).toContain('aria-haspopup="listbox"');
    expect(header).toContain("moon-theme-switch");
    expect(header).toContain(`aria-label="${copyFor(language).language}"`);
    expect(header).not.toContain("disabled");
  }
  const menu = appSource.slice(appSource.indexOf("function LanguageMenu("), appSource.indexOf("function StateDot("));
  for (const { value: language } of onboardingLanguages) expect(menu).toContain(`value: "${language}"`);
  expect(appSource).toContain("save: value => api!.setLanguage(value)");
  expect(appSource).toContain('className="welcome-language-error" role="alert"');
});

test("language changes are reflected only after the actual save resolves", async () => {
  const events: string[] = [];
  let resolveSave!: (state: LauncherState) => void;
  const saved = snapshot(0, { language: "fr" }).state;
  const pending = persistOnboardingLanguage({ language: "fr", failedMessage: "not saved",
    save: language => { events.push(`save:${language}`); return new Promise(resolve => { resolveSave = resolve; }); },
    commit: state => { expect(state).toBe(saved); events.push("commit"); },
  });
  expect(events).toEqual(["save:fr"]);
  resolveSave(saved);
  await pending;
  expect(events).toEqual(["save:fr", "commit"]);
});

test("a rejected or mismatched language save does not change the displayed selection", async () => {
  let commits = 0;
  const commit = () => { commits++; };
  await expect(persistOnboardingLanguage({ language: "de", failedMessage: "not saved", commit,
    save: async () => { throw new Error("disk unavailable"); },
  })).rejects.toThrow("disk unavailable");
  await expect(persistOnboardingLanguage({ language: "de", failedMessage: "not saved", commit,
    save: async () => snapshot(0, { language: "en" }).state,
  })).rejects.toThrow("not saved");
  expect(commits).toBe(0);
  expect(nativeCalls).toEqual([]);
});
