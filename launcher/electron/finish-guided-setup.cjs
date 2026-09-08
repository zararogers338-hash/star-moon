function requireReady(state) {
  if (state.onboardingComplete !== true || state.coreSetupComplete !== true
    || state.codexCatalogVerified !== true || state.codexRestartRequired === true
    || state.mcpRuntimeInstalled !== true || state.mcpSetupComplete !== true) {
    throw new Error("Complete and verify the local connection before entering the workspace");
  }
}

// Completion is owned by the main process, never by a renderer's page number.
// This validates the existing bridge only, not the future Work sandbox gateway.
async function finishGuidedSetup({ stateStore, browserHost, runtimeHost, isDevProfile, smokePassed, verifyAgentDock, notify }) {
  const before = stateStore.read();
  requireReady(before);
  if (browserHost.activeTraceId || browserHost.currentOperation?.()) throw new Error("Wait for the active browser operation to finish");
  if (!runtimeHost.mcpCredentialsConfigured(before.browserInteractionMode)) throw new Error("The selected connection has no saved credentials");
  const configBefore = JSON.stringify(runtimeHost.runtimeConfigSnapshot().config);
  if (before.browserInteractionMode === "automatic") {
    if (!smokePassed(before)) throw new Error("The current version needs a successful browser response test");
    if (!(await browserHost.probeAuthentication()).authenticated) throw new Error("The ChatGPT session is no longer signed in");
  }
  const report = isDevProfile ? await runtimeHost.devDoctor() : await runtimeHost.doctor();
  if (!report.ok) throw new Error("The local runtime verification failed");
  if (before.browserInteractionMode === "automatic") await browserHost.verifyConnector(runtimeHost.mcpConnectorName());
  if (typeof verifyAgentDock !== "function" || !await verifyAgentDock()) throw new Error("AgentDock connection is not verified; configure and authorize it before entering the workspace");
  const current = stateStore.read();
  requireReady(current);
  if (current.browserInteractionMode !== before.browserInteractionMode
    || JSON.stringify(runtimeHost.runtimeConfigSnapshot().config) !== configBefore) {
    throw new Error("Connection settings changed during verification; verify again");
  }
  const next = stateStore.update({ guidedSetupComplete: true });
  notify(next);
  return next;
}

module.exports = { finishGuidedSetup };
