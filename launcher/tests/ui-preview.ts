// Browser-only visual fixture. Never included in the production renderer entry.
import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { previewCopy } from "./preview-copy";
import { showFarewellPreview } from "./farewell-preview";
import "../src/tokens.css";
import "../src/styles.css";
import "../src/star-moon.css";
import "./ui-preview.css";
const query = new URLSearchParams(location.search);
const themeKey = "star-moon-ui-preview-theme";
let savedTheme = "light";
try { savedTheme = localStorage.getItem(themeKey) ?? "light"; } catch { /* Storage may be disabled for file previews. */ }
const initialTheme = query.get("theme") ?? savedTheme;
let state = {
  version: 1, language: query.get("lang") ?? "zh-CN", theme: initialTheme === "dark" ? "dark" : "light", onboardingComplete: query.has("shell") || query.has("workbench"),
  // Visual-only route into Settings; this fixture never creates real setup receipts.
  guidedSetupComplete: query.has("workbench") ? true : undefined,
  githubOpened: false, xOpened: false, autoStart: false, keepRunningOnClose: false,
  showBrowserDuringTurns: true, browserInteractionMode: query.get("mode") === "manual" ? "manual" : "automatic", experimentalBiggerContext: false,
  zeroRiskProEnabled: false, sidebarOpen: true, sidebarWidth: 252, mcpGuideStep: 0,
  sessionRefreshReminderAt: null,
};
const browser = { status: "signed-out", authenticated: false, tabs: [], visible: false, maxTabs: 5, zoomFactor: 1, activeTabId: "", loading: false, canGoBack: false, canGoForward: false };
const listeners = new Set<(value: unknown) => void>();
let agentDockPreview = { url:"",publicUrl:"",state:"unconfigured",authenticated:false,tools:[] as string[] };
const patch = (next: object) => { state = { ...state, ...next }; for (const listener of listeners) listener(state); return state; };
const fixtureApi = {
  cockpitStatus: async () => ({
    configured: true,
    enabled: true,
    baseUrl: "http://127.0.0.1:42421/v1",
    models: ["gpt-5.6-sol"],
    accounts: [
      { id: "gpt-preview", label: "GPT pool preview", provider: "gpt" as const, enabled: true, health: "ready", priority: 0, models: ["gpt-5.6-sol"] },
      { id: "claude-preview", label: "Claude pool preview", provider: "claude" as const, enabled: true, health: "ready", priority: 0, models: ["claude-opus"] },
    ],
    routes: [
      { id: "gpt-preview-route", namespace: "gpt", provider: "gpt" as const, accountIds: ["gpt-preview"], models: ["gpt-5.6-sol"], strict: true },
      { id: "claude-preview-route", namespace: "claude", provider: "claude" as const, accountIds: ["claude-preview"], models: ["claude-opus"], strict: true },
    ],
    rollback: "unavailable" as const,
    evidencePath: "PREVIEW ONLY",
    evidence: { gate: "observed" as const, total: 3, completedRequests: 0, failedRequests: 0, cancelledRequests: 0, lastProvider: "gpt", lastRouteId: "gpt-preview-route", lastModel: "gpt-5.6-sol" },
    profilePath: "PREVIEW ONLY",
  }),
  cockpitConfigure: async () => { throw new Error("Preview only: Cockpit configuration is disabled"); },
  cockpitProbe: async () => ({ ok: false, status: null, models: [], checkedAt: "", detail: "Preview only: no live Cockpit request" }),
  cockpitRollback: async () => { throw new Error("Preview only: no Cockpit profile backup"); },
  cockpitEvidence: async () => ({ path: null, records: [] }),
  cockpitKeyFile: async () => null,
  cockpitClientKeyCopy: async () => { throw new Error("Preview only: no client key exists"); },
  snapshot: async () => ({ profile: "production", profilePaths: {}, state, browser, connectorName: "PREVIEW ONLY", connectorNames: { automatic: "PREVIEW ONLY", manual: "PREVIEW ONLY" }, mcpCredentialsConfigured: false, logs: [], urls: { github: query.has("support") ? "https://github.com/preview-only/never-opened" : null, connectors: "", tunnels: "", keys: "" }, platform: "linux", packaged: false, version: "5.0.2-dev", smokePassed: false, operation: null, update: { status: "disabled" } }),
  setLanguage: async (language: string) => patch({ language }),
  setTheme: async (theme: string) => {
    if (theme !== "light" && theme !== "dark") throw new Error("Invalid preview theme");
    if (query.has("fail-theme")) throw new Error("Preview only: simulated theme save failure.");
    localStorage.setItem(themeKey, theme);
    return patch({ theme });
  },
  setMcpStep: async (step: number) => {
    if (!Number.isInteger(step) || step < 0 || step > 2) throw new Error("Invalid preview step");
    return patch({ mcpGuideStep: step });
  },
  setBrowserInteractionMode: async (mode: string) => {
    if (mode !== "manual" && mode !== "automatic") throw new Error("Invalid preview interaction mode");
    return { state: patch({ browserInteractionMode: mode }), credentialsRequired: false, targetMode: mode };
  },
  completeOnboarding: async (language: string, browserInteractionMode: string) => patch({ language, browserInteractionMode, onboardingComplete: true }),
  openExternal: async () => { throw new Error("Preview only: no external website was opened."); },
  onStateChanged: (listener: (value: unknown) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  setBrowserSurfaceActive: async () => browser,
  setSidebarState: async () => state,
  agentDockRead: async () => agentDockPreview,
  agentDockConfigure: async (input: { url: string; publicUrl?: string }) => {
    for (const value of [input.url, input.publicUrl].filter(Boolean)) {
      const url = new URL(value!);
      if (url.username || url.password || url.search || url.hash || !["http:","https:"].includes(url.protocol)) throw new Error("Invalid preview MCP address");
    }
    agentDockPreview = {url:input.url,publicUrl:input.publicUrl ?? "",state:"configured",authenticated:false,tools:[]};
    return agentDockPreview;
  },
  agentDockInspect: async () => ({...agentDockPreview,state:"preview-only",authenticated:false,tools:[]}),
  agentDockLogin: async () => { throw new Error("Preview only: OAuth authorization is disabled"); },
  openAgentDockWebSetup: async () => browser,
  createMoonLetter: async () => ({text: `${previewCopy[state.language as keyof typeof previewCopy].notice}\n\n月夜信 · 明月初次升起\n\nPREVIEW ONLY\nNo control server, bearer capability, credentials or installation are created in this preview.\nThe packaged native launcher generates the real local handoff.`,path:"",controlUrl:"",expiresAt:0,preview:true}),
  moonLetterStatus: async () => ({state:"preview-only"}),
  openMoonLetterControl: async () => { throw new Error("Preview only: no control server is running"); },
  stopMoonLetter: async () => true,
  uninstallIntegration: async () => {
    await showFarewellPreview(state.language);
    // Both preview choices leave all files and real installation state untouched.
    return { cancelled: true };
  },
};
Object.assign(window, { codexWebLauncher: new Proxy(fixtureApi, { get(target, key) {
  if (key in target) return target[key as keyof typeof target];
  if (String(key).startsWith("on")) return () => () => {};
  return async () => { throw new Error("Preview only: runtime actions are disabled."); };
} }) });
const { App } = await import("../src/App");
createRoot(document.getElementById("root")!).render(createElement(StrictMode, null, createElement(App, {
  journeyPreview: {
    copyFor: language => previewCopy[language],
    // In-memory navigation flag only; authentication and verification stay false.
    finish: () => { patch({ guidedSetupComplete: true }); },
  },
})));
