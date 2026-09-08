import type { AgentDockConnection, DoctorReport } from "./types";

export type MoonConnectionState = "idle" | "sending" | "ready" | "timeout" | "error" | "local-ready";
export type MoonConnectionCause = "cloudflare" | "tunnel" | "auth" | "local" | "unknown";
export type MoonConnectionResult = { state: MoonConnectionState; cause?: MoonConnectionCause; detail?: string };

// Health checks cannot establish an authenticated MCP handshake. The existing
// doctor must never be promoted into the poetic handshake-success state.
export function connectionFromDoctor(report: DoctorReport): MoonConnectionResult {
  const errors = report.checks.filter(check => check.status === "error");
  if (report.ok && errors.length === 0) return { state: "local-ready" };
  const failure = errors[0];
  const detail = errors.map(check => `${check.id}: ${check.message}`).join("\n");
  const cause = /^(login|browser-host|connector)$/.test(failure?.id ?? "") ? "auth"
    : /^tunnel/.test(failure?.id ?? "") ? "tunnel"
    : /^(proxy|service|config|codex)$/.test(failure?.id ?? "") ? "local" : "unknown";
  return { state: /timed?\s*out|timeout|超时/i.test(detail) ? "timeout" : "error", cause, detail };
}

export function connectionFromAgentDock(connection: AgentDockConnection): MoonConnectionResult {
  if (connection.state === "connected") return { state: "ready" };
  if (["auth-required", "authorizing", "authorized"].includes(connection.state)) return { state:"error",cause:"auth",detail:`AgentDock: ${connection.state}` };
  return { state:connection.state === "timeout" ? "timeout" : "error",cause:"unknown",detail:`AgentDock: ${connection.state}` };
}
