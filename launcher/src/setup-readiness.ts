// This is a readiness contract for the full wizard, not a browser-controlled
// authorization mechanism. The future main-process verifier must own receipts.
export const setupChecks = [
  "runtime", "workspace_policy", "account", "model_roundtrip",
  "control_auth", "control_transport", "tool_callback", "work_roundtrip",
] as const;
export type SetupCheck = typeof setupChecks[number];
export type SetupMode = "codex-web" | "work-local" | "bidirectional";
export type Receipt = {
  status: "passed" | "failed" | "unknown";
  evidence: "real" | "simulation";
  configurationId: string;
  checkedAt: number;
};
export function readiness(mode: SetupMode, configurationId: string, receipts: Partial<Record<SetupCheck, Receipt>>, now = Date.now()) {
  if (!["codex-web", "work-local", "bidirectional"].includes(mode) || !configurationId || !Number.isFinite(now)) throw new Error("Invalid readiness context");
  const required: SetupCheck[] = ["runtime", "workspace_policy", "account", "model_roundtrip"];
  if (mode !== "work-local") required.push("tool_callback");
  if (mode !== "codex-web") required.push("control_auth", "control_transport", "work_roundtrip");
  const pending = required.filter(check => {
    const receipt = receipts[check];
    return !receipt || receipt.status !== "passed" || receipt.evidence !== "real"
      || receipt.configurationId !== configurationId
      || !Number.isFinite(receipt.checkedAt) || receipt.checkedAt > now
      || now - receipt.checkedAt > 300_000;
  });
  return { ready: pending.length === 0, pending };
}
