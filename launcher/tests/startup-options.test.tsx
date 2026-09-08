import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { StartupOptions, StartupOptionError, saveStartupOption } from "../src/startup-options";
import { startupCopy } from "../src/startup-copy";
import { FirstRunJourney } from "../src/FirstRunJourney";
import { onboardingLanguages } from "../src/onboarding-presentation";
import { previewCopy } from "./preview-copy";
import type { LauncherApi, LauncherSnapshot, LauncherState } from "../src/types";

const calls: string[] = [];
const forbiddenApi = new Proxy({}, { get: (_target, key) => () => { calls.push(String(key)); throw new Error(`Unexpected native call: ${String(key)}`); } }) as LauncherApi;
const state = (patch: Partial<LauncherState> = {}) => Object.freeze({ autoStart: false, keepRunningOnClose: false,
  coreSetupComplete: false, codexCatalogVerified: false, guidedSetupComplete: false, ...patch }) as LauncherState;
const source = readFileSync(new URL("../src/startup-options.tsx", import.meta.url), "utf8");
const journey = readFileSync(new URL("../src/FirstRunJourney.tsx", import.meta.url), "utf8");

test("startup choices have complete seven-language copy and distinguish login from boot services", () => {
  expect(onboardingLanguages).toHaveLength(7);
  for (const { value: language } of onboardingLanguages) {
    expect(Object.keys(startupCopy[language]).sort()).toEqual(Object.keys(startupCopy.en).sort());
    for (const value of Object.values(startupCopy[language])) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toMatch(/TODO|TRANSLATE_ME/);
    }
  }
  expect(startupCopy.en.loginBody).toContain("after login");
  expect(startupCopy.en.loginBody).toContain("not as a system service before login");
  expect(startupCopy["zh-CN"].loginBody).toContain("不是登录前就运行的系统服务");
  expect(startupCopy["zh-Hant"].loginBody).toContain("不是登入前就執行的系統服務");
  expect(startupCopy.en.keepRunningBody).toContain("Without a tray, closing quits");
});

test("rendering uses existing native values without enabling anything or claiming a save", () => {
  for (const value of [false, true]) {
    const current = state({ autoStart: value, keepRunningOnClose: value });
    const html = renderToStaticMarkup(<StartupOptions api={forbiddenApi} language="zh-CN" state={current} updateState={() => { throw new Error("No state writes on render"); }} />);
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html.match(new RegExp(`aria-checked="${value}"`, "g"))).toHaveLength(2);
    expect(html).not.toContain(startupCopy["zh-CN"].saved);
    expect(html).not.toContain(startupCopy["zh-CN"].preview);
    expect(current.autoStart).toBe(value);
    expect(current.keepRunningOnClose).toBe(value);
  }
  expect(calls).toEqual([]);
});

test("remote debugging and web exposure are text-only separate permissions, not fake controls", () => {
  const html = renderToStaticMarkup(<StartupOptions api={forbiddenApi} language="en" state={state()} updateState={() => {}} />);
  expect(html).toContain(startupCopy.en.separateBody);
  const details = html.match(/<details class="welcome-about startup-separate-options">([\s\S]*?)<\/details>/)?.[1] ?? "";
  expect(details).toContain(startupCopy.en.separateTitle);
  expect(details).not.toMatch(/<button|<input|role="switch"/);
  expect(html.match(/<button\b/g)).toHaveLength(2);
});

test("parent busy disables both choices and preview is explicitly labeled", () => {
  const html = renderToStaticMarkup(<StartupOptions api={forbiddenApi} language="zh-Hant" state={state()} updateState={() => {}} disabled preview />);
  expect(html).toContain('data-preview="true"');
  expect(html).toContain(startupCopy["zh-Hant"].preview);
  const switches = html.match(/<button\b[^>]*>/g) ?? [];
  expect(switches).toHaveLength(2);
  for (const button of switches) expect(button).toContain("disabled");
});

test("the actual preview change handler modifies only its local choices", async () => {
  const body = source.match(/const change = async \([^)]*\) => \{([\s\S]*?)\n  \};/)?.[1];
  expect(body).toBeDefined();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
  let previewChoices = { autoStart: false, keepRunningOnClose: false };
  const scope = { disabled: false, saving: { current: false }, preview: true,
    setPreviewChoices: (update: (current: typeof previewChoices) => typeof previewChoices) => { previewChoices = update(previewChoices); },
    api: forbiddenApi, updateState: () => { throw new Error("Preview cannot save native state"); },
    onBusyChange: () => { throw new Error("A local preview must not begin a native save"); },
  };
  const change = new AsyncFunction(...Object.keys(scope), "option", "enabled", body!);
  await change(...Object.values(scope), "autoStart", true);
  await change(...Object.values(scope), "keepRunningOnClose", true);
  await change(...Object.values(scope), "autoStart", false);
  expect(previewChoices).toEqual({ autoStart: false, keepRunningOnClose: true });
  expect(calls).toEqual([]);
});

test("real login startup preserves the exact confirmed native state and brackets the operation with busy", async () => {
  for (const enabled of [true, false]) {
    const native = state({ autoStart: enabled, keepRunningOnClose: true });
    const events: string[] = [];
    await saveStartupOption({ option: "autoStart", enabled,
      api: { setAutostart: async value => { events.push(`autostart:${value}`); return { state: native, supported: true, enabled: value }; }, setPreference: forbiddenApi.setPreference },
      updateState: value => { expect(value).toBe(native); events.push("state"); }, onBusyChange: value => events.push(`busy:${value}`),
    });
    expect(events).toEqual(["busy:true", `autostart:${enabled}`, "state", "busy:false"]);
    expect(native.guidedSetupComplete).toBe(false);
    expect(native.codexCatalogVerified).toBe(false);
  }
});

test("window-close choice uses only the keepRunningOnClose preference and preserves other returned fields", async () => {
  for (const enabled of [true, false]) {
    const native = state({ autoStart: true, keepRunningOnClose: enabled });
    const updates: LauncherState[] = [];
    const requests: unknown[] = [];
    await saveStartupOption({ option: "keepRunningOnClose", enabled,
      api: { setAutostart: forbiddenApi.setAutostart, setPreference: async (key, value) => { requests.push([key, value]); return native; } },
      updateState: value => updates.push(value),
    });
    expect(requests).toEqual([["keepRunningOnClose", enabled]]);
    expect(updates[0]).toBe(native);
    expect(updates[0]!.autoStart).toBe(true);
  }
});

test("unsupported login startup is not a success even when a native result echoes the requested value", async () => {
  const native = state();
  const updates: LauncherState[] = [];
  const busy: boolean[] = [];
  await expect(saveStartupOption({ option: "autoStart", enabled: true,
    api: { setAutostart: async () => ({ state: native, supported: false, enabled: true }), setPreference: forbiddenApi.setPreference },
    updateState: value => updates.push(value), onBusyChange: value => busy.push(value),
  })).rejects.toBeInstanceOf(StartupOptionError);
  expect(updates[0]).toBe(native);
  expect(updates[0]!.autoStart).toBe(false);
  expect(busy).toEqual([true, false]);
});

test("mismatched OS confirmation or persisted preferences are errors rather than fabricated settings", async () => {
  for (const result of [
    { state: state({ autoStart: true }), supported: true, enabled: false },
    { state: state({ autoStart: false }), supported: true, enabled: true },
  ]) {
    await expect(saveStartupOption({ option: "autoStart", enabled: true,
      api: { setAutostart: async () => result, setPreference: forbiddenApi.setPreference }, updateState: value => expect(value).toBe(result.state),
    })).rejects.toBeInstanceOf(StartupOptionError);
  }
  const native = state();
  await expect(saveStartupOption({ option: "keepRunningOnClose", enabled: true,
    api: { setAutostart: forbiddenApi.setAutostart, setPreference: async () => native }, updateState: value => expect(value).toBe(native),
  })).rejects.toBeInstanceOf(StartupOptionError);
});

test("native failures do not change state, retry automatically or leave parent navigation locked", async () => {
  let attempts = 0;
  let updates = 0;
  const busy: boolean[] = [];
  await expect(saveStartupOption({ option: "autoStart", enabled: true,
    api: { setAutostart: async () => { attempts++; throw new Error("OS rejected the change"); }, setPreference: forbiddenApi.setPreference },
    updateState: () => { updates++; }, onBusyChange: value => busy.push(value),
  })).rejects.toThrow("OS rejected the change");
  expect(attempts).toBe(1);
  expect(updates).toBe(0);
  expect(busy).toEqual([true, false]);
});

test("pending preference saves block immediate parent Advance and Back via the busy ref", async () => {
  const busy: boolean[] = [];
  let finish!: (result: Awaited<ReturnType<LauncherApi["setAutostart"]>>) => void;
  const pending = saveStartupOption({ option: "autoStart", enabled: true,
    api: { setAutostart: () => new Promise(resolve => { finish = resolve; }), setPreference: forbiddenApi.setPreference },
    updateState: () => {}, onBusyChange: value => busy.push(value),
  });
  expect(busy).toEqual([true]);
  const primaryBody = journey.match(/const primary = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  const backBody = journey.match(/const goBack = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  expect(primaryBody).toBeDefined(); expect(backBody).toBeDefined();
  new Function("startupBusyRef", primaryBody!)({ current: true });
  new Function("startupBusyRef", "previous", "busy", "inFlight", backBody!)({ current: true }, "account", false, { current: false });
  finish({ state: state({ autoStart: true }), supported: true, enabled: true });
  await pending;
  expect(busy).toEqual([true, false]);
});

test("both automatic preparation and the first manual chapter include lifecycle choices", () => {
  for (const [browserInteractionMode, startAt] of [["automatic", "prepare"], ["manual", "tunnel"]] as const) {
    const current = { state: state({ browserInteractionMode }), browser: { authenticated: false }, version: "test",
      urls: { github: null, tunnels: "", keys: "", connectors: "" }, connectorNames: { automatic: "TEST", manual: "TEST" }, mcpCredentialsConfigured: false } as LauncherSnapshot;
    const html = renderToStaticMarkup(<FirstRunJourney api={forbiddenApi} language="zh-CN" browser={current.browser} operation={null}
      snapshot={current} refresh={async () => { throw new Error("No native refresh in preview rendering"); }} updateState={() => {}}
      preview={{ startAt, copyFor: language => previewCopy[language], finish: () => {} }} />);
    expect(html).toContain('class="startup-options"');
    expect(html).toContain(startupCopy["zh-CN"].login);
    expect(html).toContain(startupCopy["zh-CN"].keepRunning);
    expect(html).toContain(startupCopy["zh-CN"].preview);
  }
  expect(calls).toEqual([]);
});
