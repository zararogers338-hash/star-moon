const SETUP_STAGES = Object.freeze(["account", "prepare", "smoke", "install", "catalog", "tunnel", "credentials", "connector", "verify", "agentdock", "endless-night", "complete"]);

function pauseGuidedSetup(stateStore, stage, busy) {
  if (!SETUP_STAGES.includes(stage)) throw new Error("Invalid configuration page");
  if (busy) throw new Error("Wait for the active operation before pausing configuration");
  // Pausing is navigation only. It must not grant readiness or save form secrets.
  return stateStore.update({ guidedSetupPaused: true, guidedSetupResumeStage: stage });
}

module.exports = { SETUP_STAGES, pauseGuidedSetup };
