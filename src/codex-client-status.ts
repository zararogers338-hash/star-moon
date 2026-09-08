import { readFileSync } from "node:fs";
import type { AppConfig } from "./config";
import { getConfigDir, stripUtf8Bom } from "./config";
import { getCodexConfigPath, routeUrl } from "./codex-integration-shared";
import { inspectCodexIntegration } from "./codex-integration";
import { processRunning } from "./process";

export type ClientRoutingIssue = "custom-provider" | "static-catalog" | "provider-auth" | "route-mismatch" | "profile-selected" | "config-unreadable" | "integration-invalid";
export interface ClientRouting {
  scope: "user-config-on-disk";
  compatible: boolean;
  issues: ClientRoutingIssue[];
  provider: string;
}

// This never reads auth.json, invokes a credential helper, sends a model request
// or returns arbitrary TOML values. CLI/profile overrides are not an observed
// running desktop session and must not be advertised as one.
export function inspectClientRouting(text: string, expectedRoute: string): ClientRouting {
  let parsed: Record<string, any>;
  try { parsed = Bun.TOML.parse(stripUtf8Bom(text)) as Record<string, any>; }
  catch { return { scope: "user-config-on-disk", compatible: false, issues: ["config-unreadable"], provider: "unknown" }; }
  const selected = parsed.model_provider ?? "openai";
  const provider = typeof selected === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(selected) ? selected : "unknown";
  const issues: ClientRoutingIssue[] = [];
  const sameRoute = (value: unknown) => typeof value === "string" && value.replace(/\/+$/, "") === expectedRoute.replace(/\/+$/, "");
  if (provider === "openai") {
    if (!sameRoute(parsed.openai_base_url)) issues.push("route-mismatch");
  } else {
    const definition = parsed.model_providers?.[provider];
    if (!sameRoute(definition?.base_url)) issues.push("custom-provider");
    if (definition?.requires_openai_auth !== true) issues.push("provider-auth");
  }
  if (parsed.model_catalog_json !== undefined) issues.push("static-catalog");
  if (parsed.profile !== undefined) issues.push("profile-selected");
  return { scope: "user-config-on-disk", compatible: issues.length === 0, issues, provider };
}

export function readClientRouting(config: Pick<AppConfig, "host" | "port">): ClientRouting {
  try { return inspectClientRouting(readFileSync(getCodexConfigPath(), "utf8"), routeUrl(config as AppConfig)); }
  catch { return { scope: "user-config-on-disk", compatible: false, issues: ["config-unreadable"], provider: "unknown" }; }
}

export function catalogRuntimeOwned(marker: Record<string, unknown>, health: Record<string, unknown> | undefined, running = processRunning): boolean {
  return marker.version === 1 && marker.status === "ready"
    && Number.isSafeInteger(marker.ownerPid) && Number(marker.ownerPid) > 0
    && Number.isSafeInteger(marker.daemonPid) && Number(marker.daemonPid) > 0
    && marker.daemonPid === health?.pid
    && running(marker.ownerPid) && running(marker.daemonPid);
}

export async function readCatalogStatus(config: AppConfig) {
  const routing = readClientRouting(config);
  const integration = inspectCodexIntegration();
  if (!integration.installed || !integration.active || integration.errors.length) {
    routing.compatible = false;
    routing.issues.push("integration-invalid");
  }
  let health: Record<string, unknown> | undefined;
  try {
    const response = await fetch(`http://${config.host}:${config.port}/healthz`, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) health = await response.json() as Record<string, unknown>;
  } catch { /* an unavailable proxy is reported separately from client config */ }
  let owned = false;
  try {
    const marker = JSON.parse(readFileSync(`${getConfigDir()}/runtime/launcher-supervisor.json`, "utf8"));
    owned = catalogRuntimeOwned(marker, health);
  } catch { /* no current owned daemon evidence */ }
  const healthy = health?.status === "ok" && health.service === "codex-chatgpt-web"
    && health.version === config.releaseVersion && health.mode === config.mode && health.port === config.port
    && health.accepting_turns === true && owned;
  const requests = healthy && Number.isSafeInteger(health?.successful_model_catalog_requests)
    && Number(health?.successful_model_catalog_requests) >= 0 ? Number(health?.successful_model_catalog_requests) : 0;
  const lastStatus = healthy && Number.isInteger(health?.last_model_catalog_status) ? Number(health?.last_model_catalog_status) : null;
  const state = !healthy ? "proxy-unavailable" : !routing.compatible ? "blocked"
    : lastStatus === 401 || lastStatus === 403 ? "authentication-required"
    : lastStatus !== null && lastStatus >= 400 ? "request-failed" : requests > 0 ? "observed" : "waiting-client";
  return { version: 1, state, routing, healthy, requests, lastStatus, port: config.port, checkedAt: new Date().toISOString() };
}
