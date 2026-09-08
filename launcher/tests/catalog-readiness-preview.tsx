// Explicitly isolated UI test. No credentials, native IPC, network or model call.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FirstRunJourney } from "../src/FirstRunJourney";
import { AppearanceContext } from "../src/appearance";
import type { CatalogStatus, Language, LauncherApi, LauncherSnapshot, LauncherState } from "../src/types";
import "../src/tokens.css";
import "../src/styles.css";
import "../src/star-moon.css";

const query = new URLSearchParams(location.search);
const language = (query.get("lang") || "zh-CN") as Language;
const browser = { authenticated: true, status: "idle", tabs: [], visible: false } as LauncherSnapshot["browser"];
const initial = { version: 1, theme: "dark", language, onboardingComplete: true, guidedSetupComplete: false,
  browserInteractionMode: "automatic", coreSetupComplete: true, codexCatalogVerified: false, codexRestartRequired: true,
  autoStart: false, keepRunningOnClose: false, experimentalBiggerContext: false } as LauncherState;
let calls = 0;
let nativeState = initial;
const api = {
  deferCatalogCheck: async () => { nativeState = { ...nativeState, catalogCheckDeferred: true }; return nativeState; },
  catalogStatus: async () => {
    calls++; document.getElementById("fixture-calls")!.textContent = `READ CHECKS: ${calls}; MODEL CALLS: 0`;
    await new Promise(resolve => setTimeout(resolve, 500));
    if (query.has("fail")) throw new Error("Simulated diagnostic failure");
    return { version: 1, state: "blocked", healthy: true, requests: 0, lastStatus: 401, port: 17842,
      checkedAt: new Date().toISOString(), routing: { scope: "user-config-on-disk", compatible: false,
        provider: "example_provider", issues: ["custom-provider", "static-catalog", "provider-auth"] } } as CatalogStatus;
  },
  agentDockRead: async () => ({ state: "unconfigured", url: "", publicUrl: "" }),
  onAgentDockChanged: () => () => {},
  setBrowserSurfaceActive: async () => browser,
  doctor: async () => ({ ok: false, checks: [{ id: "fixture", status: "error", message: "SIMULATED ONLY" }] }),
  exportLogs: async () => { throw new Error("Export disabled in simulation"); },
  openDevTools: async () => { throw new Error("No native tools in simulation"); },
  uninstallIntegration: async () => ({ cancelled: true }),
} as unknown as LauncherApi;

function Fixture() {
  const [state, setState] = useState(initial);
  const snapshot = { profile: "production", state, browser, smokePassed: true,
    mcpCredentialsConfigured: false, connectorNames: { automatic: "SIMULATED", manual: "SIMULATED" },
    version: "5.0.2 — TEST ONLY", urls: {} } as LauncherSnapshot;
  return <AppearanceContext.Provider value={{ theme: "dark", busy: false, changeTheme: async () => {} }}>
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, textAlign: "center", background: "#5a2939", color: "white", fontSize: 12 }}>
      SIMULATED UI ONLY — NO ACCOUNTS / NO NATIVE OPERATIONS <span id="fixture-calls">READ CHECKS: 0; MODEL CALLS: 0</span>
    </div>
    <div className="app-root" data-theme="dark" data-language={language} data-platform="linux" style={{ paddingTop: 24 }}>
      <FirstRunJourney api={api} browser={browser} language={language} operation={null} refresh={async () => ({ ...snapshot, state: nativeState })} snapshot={snapshot} updateState={setState} />
    </div>
  </AppearanceContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
