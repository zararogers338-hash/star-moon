import type { AgentDockConnection, LauncherApi, LauncherSnapshot, LauncherState } from "./types";
import type { OnboardingStage } from "./onboarding-presentation";

export type JourneyStage = "account" | "prepare" | "smoke" | "install" | "catalog" | "tunnel" | "credentials" | "connector" | "verify" | "agentdock" | "endless-night" | "complete";
export const journeyOrder: JourneyStage[] = ["account", "prepare", "smoke", "install", "catalog", "tunnel", "credentials", "connector", "verify", "agentdock", "endless-night", "complete"];
const manualJourneyOrder: JourneyStage[] = ["tunnel", "credentials", "catalog", "connector", "verify", "agentdock", "endless-night", "complete"];
export function journeyChapters(mode: LauncherState["browserInteractionMode"]): readonly JourneyStage[] {
  return mode === "manual" ? manualJourneyOrder : journeyOrder;
}
export const journeyScenes: Record<JourneyStage, OnboardingStage> = {
  account: "welcome", prepare: "language", smoke: "interaction", install: "support", catalog: "welcome",
  tunnel: "language", credentials: "interaction", connector: "support", verify: "welcome", agentdock: "support", "endless-night": "interaction", complete: "language",
};
export const journeyGoalOrder = ["goalWebModel", "goalLocalConnection", "goalBeginJourney"] as const;
export type JourneyGoal = typeof journeyGoalOrder[number];
export const journeyStageGoals: Record<JourneyStage, JourneyGoal> = {
  account: "goalWebModel", prepare: "goalWebModel", smoke: "goalWebModel", install: "goalWebModel", catalog: "goalWebModel",
  tunnel: "goalLocalConnection", credentials: "goalLocalConnection", connector: "goalLocalConnection", verify: "goalLocalConnection", agentdock: "goalLocalConnection",
  "endless-night": "goalBeginJourney", complete: "goalBeginJourney",
};

// Back visits a useful editable page, not an automatic operation's status page.
// This is navigation only; it does not clear data or revoke native receipts.
export function journeyBackStage(stage: JourneyStage, mode: LauncherState["browserInteractionMode"]): JourneyStage | null {
  switch (stage) {
    case "account": return null;
    case "prepare": return "account";
    case "smoke": case "install": return "prepare";
    case "catalog": return mode === "manual" ? "credentials" : "prepare";
    case "tunnel": return mode === "manual" ? null : "prepare";
    case "credentials": return "tunnel";
    case "connector": return "credentials";
    case "verify": case "agentdock": return "connector";
    case "endless-night": return "agentdock";
    case "complete": return "endless-night";
  }
}

export function needsConfigurationJourney(state: LauncherState) {
  if (state.guidedSetupComplete === true) return false;
  // Existing installations keep their workspace. A new onboarding explicitly
  // writes false, so old success flags cannot skip the new first-run journey.
  if (state.guidedSetupComplete === undefined && state.coreSetupComplete === true
    && state.codexCatalogVerified === true
    && (state.browserInteractionMode === "automatic" || state.mcpSetupComplete === true)) return false;
  return true;
}

export function initialJourneyStage(snapshot: LauncherSnapshot): JourneyStage {
  const state = snapshot.state;
  if (state.browserInteractionMode === "automatic" && !snapshot.browser?.authenticated) return "account";
  if (state.coreSetupComplete) {
    if ((!state.codexCatalogVerified && !state.catalogCheckDeferred) || (state.codexRestartRequired && !state.catalogCheckDeferred)) return "catalog";
    return afterCatalogStage(snapshot);
  }
  return state.browserInteractionMode === "manual" ? "tunnel" : "prepare";
}

export function resumedJourneyStage(snapshot: LauncherSnapshot): JourneyStage {
  const state = snapshot.state;
  const resume = state.guidedSetupResumeStage as JourneyStage | undefined;
  // At startup authenticated=false also means that the persisted browser session
  // has not been probed yet. Only a confirmed sign-out should discard a saved
  // late chapter. Native verification still gates every setup action.
  if (state.browserInteractionMode === "automatic" && !snapshot.browser?.authenticated
    && (!resume || snapshot.browser?.status === "signed-out")) return "account";
  if (resume && journeyChapters(state.browserInteractionMode).includes(resume)) {
    // The saved page is a recovery cursor, not a completion receipt.  Keep it
    // for every chapter whose prerequisites are still present.  Previously we
    // accepted only the first four pages, so a failed Endless Night/catalog
    // operation remounted the journey and appeared to jump back to page one.
    const coreReady = state.coreSetupComplete === true || state.browserInteractionMode === "manual";
    const mcpReady = state.mcpRuntimeInstalled === true && snapshot.mcpCredentialsConfigured === true;
    if (resume === "account") return state.browserInteractionMode === "automatic" && !snapshot.browser?.authenticated
      ? resume : initialJourneyStage(snapshot);
    if (resume === "prepare") return !state.coreSetupComplete ? resume : initialJourneyStage(snapshot);
    if (resume === "smoke") return state.browserInteractionMode === "automatic"
      && snapshot.browser?.authenticated === true && snapshot.smokePassed !== true ? resume : initialJourneyStage(snapshot);
    if (resume === "install") return state.browserInteractionMode === "automatic"
      && snapshot.browser?.authenticated === true && !state.coreSetupComplete && snapshot.smokePassed === true
      ? resume : initialJourneyStage(snapshot);
    if (resume === "tunnel" || resume === "credentials") {
      // An explicitly paused setup is an editable recovery point.  Do not
      // infer that the page is obsolete merely because a previous receipt says
      // MCP is ready: the user may have paused to review or replace credentials.
      return state.guidedSetupPaused === true || !mcpReady ? resume : initialJourneyStage(snapshot);
    }
    if (["catalog", "connector", "verify", "agentdock", "endless-night", "complete"].includes(resume)
      && coreReady && mcpReady) return resume;
  }
  return initialJourneyStage(snapshot);
}

export function afterCatalogStage(snapshot: LauncherSnapshot): JourneyStage {
  if (!snapshot.state.mcpRuntimeInstalled || !snapshot.mcpCredentialsConfigured) return "tunnel";
  // A catalog recheck after changing Endless Night must not send an already
  // verified connection back through connector setup. AgentDock has its own
  // read-only gate and final native checks still run when entering the workspace.
  return snapshot.state.mcpSetupComplete === true ? "agentdock" : "connector";
}

export function savedMcpJourneyStage(snapshot: LauncherSnapshot, requireVerified = false): JourneyStage | null {
  if (snapshot.state.coreSetupComplete !== true || !snapshot.state.mcpRuntimeInstalled || !snapshot.mcpCredentialsConfigured
    || (requireVerified && snapshot.state.mcpSetupComplete !== true)) return null;
  return endlessNightNeedsCatalog(snapshot.state) ? "catalog" : afterCatalogStage(snapshot);
}

export function agentDockConnected(connection: Pick<AgentDockConnection, "state"> | null | undefined) {
  return connection?.state === "connected";
}

// Only read the saved native check here. The user explicitly runs the connection
// check in AgentDockSurface; authorization or page reachability cannot pass it.
export async function continueAgentDockJourney({ api, updateConnection, move }: {
  api: Pick<LauncherApi, "agentDockRead">;
  updateConnection: (connection: AgentDockConnection) => void;
  move: (stage: JourneyStage) => void;
}) {
  const connection = await api.agentDockRead();
  updateConnection(connection);
  move(agentDockConnected(connection) ? "endless-night" : "agentdock");
}

export function endlessNightNeedsCatalog(state: LauncherState) {
  return state.catalogCheckDeferred !== true && (state.codexCatalogVerified !== true || state.codexRestartRequired === true);
}

// Re-evaluate on the explicit Continue action, not from the chapter number or a
// timer. A restart request alone is not evidence that the new catalog was read.
export function afterEndlessNightStage(snapshot: LauncherSnapshot, agentDock?: Pick<AgentDockConnection, "state"> | null): JourneyStage {
  if (snapshot.state.browserInteractionMode === "automatic" && !snapshot.browser?.authenticated) {
    return snapshot.browser?.status === "signed-out" ? "account" : "verify";
  }
  if (snapshot.state.coreSetupComplete !== true || !snapshot.state.mcpRuntimeInstalled || !snapshot.mcpCredentialsConfigured) return initialJourneyStage(snapshot);
  if (endlessNightNeedsCatalog(snapshot.state)) return "endless-night";
  if (snapshot.state.mcpSetupComplete !== true) return "verify";
  if (!agentDockConnected(agentDock)) return "agentdock";
  return "complete";
}

// This changes only the requested preference. Receipts and restart state come
// from the native process; this runner never manufactures or clears either.
export async function applyEndlessNightChoice({ api, refresh, updateState, enabled, unavailable, interrupted }: {
  api: Pick<LauncherApi, "setBiggerContext">;
  refresh: () => Promise<LauncherSnapshot>;
  updateState: (state: LauncherState) => void;
  enabled: boolean;
  unavailable: string;
  interrupted: string;
}) {
  const before = await refresh();
  if (before.state.browserInteractionMode === "manual" || before.state.coreSetupComplete !== true) throw new Error(unavailable);
  if (before.state.experimentalBiggerContext === enabled) return;
  const saved = await api.setBiggerContext(enabled);
  updateState(saved);
  const after = await refresh();
  if (saved.experimentalBiggerContext !== enabled || after.state.experimentalBiggerContext !== enabled) throw new Error(interrupted);
}

// Run only after the explicit consent action. This runner cannot manufacture
// successful receipts, retry paid requests, or install after a failed smoke test.
export async function provisionAutomaticJourney({ api, refresh, move }: {
  api: Pick<LauncherApi, "smokeTest" | "setupCore">;
  refresh: () => Promise<LauncherSnapshot>;
  move: (stage: JourneyStage) => void;
}) {
  const before = await refresh();
  if (before.state.browserInteractionMode !== "automatic" || !before.browser?.authenticated) throw new Error("Sign in before starting automatic configuration");
  let checked = before;
  if (!before.smokePassed) {
    move("smoke");
    const result = await api.smokeTest();
    if (!result.ok) throw new Error("The browser response test did not pass");
    checked = await refresh();
    if (!checked.smokePassed) throw new Error("The browser test has no saved success receipt");
  }
  if (checked.state.coreSetupComplete === true) {
    move(endlessNightNeedsCatalog(checked.state) ? "catalog" : afterCatalogStage(checked));
    return;
  }
  move("install");
  const installed = await api.setupCore();
  if (!installed.ok) throw new Error("The local integration could not be installed");
  const next = await refresh();
  if (!next.state.coreSetupComplete) throw new Error("The local installation has no saved success receipt");
  move(endlessNightNeedsCatalog(next.state) ? "catalog" : afterCatalogStage(next));
}
