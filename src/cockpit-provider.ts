import { chmodSync, lstatSync, readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import type { AppConfig } from "./config";
import { tryRecordCockpitEvidence, type CockpitEvidenceRecord } from "./cockpit-evidence";
import { readJsonRequestBody } from "./http-body";
import { createCockpitResponseInspector, type CockpitProtocolOutcome } from "./cockpit-response-evidence";

export const COCKPIT_MODEL_PREFIX = "cockpit/";

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "host", "cookie", "set-cookie", "x-api-key", "api-key",
]);

export type CockpitEndpoint = "responses" | "responses/compact" | "chat/completions" | "images/generations" | "images/edits";
export type CockpitFetch = (request: Request) => Promise<Response>;
export interface CockpitProbeResult {
  ok: boolean;
  status: number | null;
  models: string[];
  checkedAt: string;
  detail?: string;
}

export type CockpitProviderKind = "gpt" | "claude";
export type CockpitAccountHealth = "ready" | "degraded" | "offline" | "auth-required";

/** Public account-pool metadata. The key file contains the credential and is never serialized here. */
export interface CockpitAccount {
  id: string;
  label: string;
  provider: CockpitProviderKind;
  enabled: boolean;
  health: CockpitAccountHealth;
  priority: number;
  baseUrl: string;
  apiKeyFile: string;
  models: string[];
}

/** A strict model namespace routed through Cockpit's account pool. */
export interface CockpitRoute {
  id: string;
  namespace: string;
  provider: CockpitProviderKind;
  accountIds: string[];
  models: string[];
  strict: boolean;
}

export interface CockpitConfig {
  enabled: boolean;
  baseUrl: string;
  /** Inline key is retained only for backwards-compatible test/config migration. */
  apiKey?: string;
  /** Production configuration should point at a private owner-only key file. */
  apiKeyFile?: string;
  /** Key accepted by Star Moon for the explicit cockpit namespace. */
  clientApiKey?: string;
  clientApiKeyFile?: string;
  /** Owner-only JSONL route evidence. It never contains prompt text, cookies or keys. */
  evidencePath?: string;
  models: string[];
  /** Optional embedded Cockpit account pool and strict model namespaces. */
  accounts?: CockpitAccount[];
  routes?: CockpitRoute[];
  sessionAffinity?: boolean;
  capabilities?: Partial<Record<CockpitEndpoint | "models" | "images", boolean>>;
}

export function isCockpitModelSlug(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(COCKPIT_MODEL_PREFIX) && value.length > COCKPIT_MODEL_PREFIX.length;
}

export function cockpitUpstreamModel(value: string): string {
  if (!isCockpitModelSlug(value)) throw new Error(`Not a Cockpit model slug: ${value}`);
  const model = value.slice(COCKPIT_MODEL_PREFIX.length).trim();
  if (!model || model.length > 200 || /[\r\n]/.test(model)) throw new Error("Cockpit upstream model is invalid");
  return model;
}

function boundedModelList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 256) throw new Error(`${label} must be an array of at most 256 entries`);
  const models = value.map(model => {
    if (typeof model !== "string" || !model.trim() || model.length > 200 || /[\r\n]/.test(model)) {
      throw new Error(`${label} contains an invalid model name`);
    }
    return model.trim();
  });
  if (new Set(models).size !== models.length) throw new Error(`${label} must be unique`);
  return models;
}

function validateAccount(value: unknown): CockpitAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cockpit account is invalid");
  const input = value as Partial<CockpitAccount>;
  if (typeof input.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(input.id)) throw new Error("Cockpit account id is invalid");
  if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 120) throw new Error(`Cockpit account label is invalid: ${input.id}`);
  if (input.provider !== "gpt" && input.provider !== "claude") throw new Error(`Cockpit account provider is invalid: ${input.id}`);
  if (typeof input.enabled !== "boolean" || !["ready", "degraded", "offline", "auth-required"].includes(String(input.health))) throw new Error(`Cockpit account state is invalid: ${input.id}`);
  if (!Number.isSafeInteger(input.priority) || input.priority! < 0 || input.priority! > 10_000) throw new Error(`Cockpit account priority is invalid: ${input.id}`);
  if (typeof input.baseUrl !== "string" || !input.baseUrl.trim()) throw new Error(`Cockpit account baseUrl is required: ${input.id}`);
  const url = new URL(input.baseUrl);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase());
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || !/\/v1$/i.test(url.pathname.replace(/\/+$/, ""))) {
    throw new Error(`Cockpit account baseUrl is invalid: ${input.id}`);
  }
  if (typeof input.apiKeyFile !== "string" || !input.apiKeyFile.trim()) throw new Error(`Cockpit account apiKeyFile is required: ${input.id}`);
  return {
    id: input.id,
    label: input.label.trim(),
    provider: input.provider,
    enabled: input.enabled,
    health: input.health as CockpitAccountHealth,
    priority: input.priority!,
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    apiKeyFile: resolve(input.apiKeyFile.trim()),
    models: boundedModelList(input.models ?? [], `Cockpit account ${input.id} models`),
  };
}

function validateRoute(value: unknown, accountIds: Set<string>): CockpitRoute {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cockpit route is invalid");
  const input = value as Partial<CockpitRoute>;
  if (typeof input.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(input.id)) throw new Error("Cockpit route id is invalid");
  if (typeof input.namespace !== "string" || !/^[a-z][a-z0-9_-]{1,31}$/.test(input.namespace)) throw new Error(`Cockpit route namespace is invalid: ${input.id}`);
  if (input.provider !== "gpt" && input.provider !== "claude") throw new Error(`Cockpit route provider is invalid: ${input.id}`);
  if (!Array.isArray(input.accountIds) || input.accountIds.length < 1 || input.accountIds.length > 64 || input.accountIds.some(id => typeof id !== "string" || !accountIds.has(id))) throw new Error(`Cockpit route accounts are invalid: ${input.id}`);
  if (new Set(input.accountIds).size !== input.accountIds.length) throw new Error(`Cockpit route accounts must be unique: ${input.id}`);
  return {
    id: input.id,
    namespace: input.namespace,
    provider: input.provider,
    accountIds: [...input.accountIds] as string[],
    models: boundedModelList(input.models ?? [], `Cockpit route ${input.id} models`),
    strict: input.strict !== false,
  };
}

export function validateCockpitConfig(value: unknown): CockpitConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cockpit configuration must be an object");
  const input = value as Partial<CockpitConfig>;
  if (typeof input.enabled !== "boolean") throw new Error("Cockpit enabled must be a boolean");
  if (typeof input.baseUrl !== "string" || !input.baseUrl.trim()) throw new Error("Cockpit baseUrl is required");
  const url = new URL(input.baseUrl);
  if (url.username || url.password || url.search || url.hash) throw new Error("Cockpit baseUrl must not contain credentials or query data");
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Cockpit baseUrl must use HTTPS or a loopback HTTP address");
  }
  if (!/\/v1$/i.test(url.pathname.replace(/\/+$/, ""))) {
    throw new Error("Cockpit baseUrl must end with /v1");
  }
  if (input.apiKey !== undefined && (typeof input.apiKey !== "string" || input.apiKey.trim().length < 8 || /[\r\n]/.test(input.apiKey))) {
    throw new Error("Cockpit apiKey is invalid");
  }
  if (input.apiKeyFile !== undefined && (typeof input.apiKeyFile !== "string" || !input.apiKeyFile.trim())) {
    throw new Error("Cockpit apiKeyFile is invalid");
  }
  if (!input.apiKey && !input.apiKeyFile) {
    throw new Error("Cockpit requires apiKeyFile or apiKey");
  }
  if (input.clientApiKey !== undefined && (typeof input.clientApiKey !== "string" || input.clientApiKey.trim().length < 8 || /[\r\n]/.test(input.clientApiKey))) {
    throw new Error("Cockpit clientApiKey is invalid");
  }
  if (input.clientApiKeyFile !== undefined && (typeof input.clientApiKeyFile !== "string" || !input.clientApiKeyFile.trim())) {
    throw new Error("Cockpit clientApiKeyFile is invalid");
  }
  if (input.evidencePath !== undefined && (typeof input.evidencePath !== "string" || !input.evidencePath.trim())) {
    throw new Error("Cockpit evidencePath is invalid");
  }
  const models = boundedModelList(input.models, "Cockpit models");
  const accounts = input.accounts === undefined ? undefined : (() => {
    if (!Array.isArray(input.accounts) || input.accounts.length > 128) throw new Error("Cockpit accounts must be an array of at most 128 entries");
    const normalized = input.accounts.map(validateAccount);
    if (new Set(normalized.map(account => account.id)).size !== normalized.length) throw new Error("Cockpit account ids must be unique");
    return normalized;
  })();
  const routes = input.routes === undefined ? undefined : (() => {
    if (!accounts || accounts.length === 0) throw new Error("Cockpit routes require accounts");
    if (!Array.isArray(input.routes) || input.routes.length > 64) throw new Error("Cockpit routes must be an array of at most 64 entries");
    const normalized = input.routes.map(route => validateRoute(route, new Set(accounts.map(account => account.id))));
    if (new Set(normalized.map(route => route.id)).size !== normalized.length) throw new Error("Cockpit route ids must be unique");
    if (new Set(normalized.map(route => route.namespace)).size !== normalized.length) throw new Error("Cockpit route namespaces must be unique");
    for (const route of normalized) {
      for (const accountId of route.accountIds) {
        const account = accounts.find(item => item.id === accountId)!;
        if (account.provider !== route.provider) throw new Error(`Cockpit route ${route.id} mixes provider account ${accountId}`);
      }
    }
    return normalized;
  })();
  const capabilities = input.capabilities === undefined ? undefined : { ...input.capabilities };
  if (capabilities && Object.keys(capabilities).some(key => !["models", "responses", "responses/compact", "chat/completions", "images"].includes(key))) {
    throw new Error("Cockpit capabilities contain an unknown key");
  }
  return {
    enabled: input.enabled,
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    ...(input.apiKeyFile ? { apiKeyFile: resolve(input.apiKeyFile.trim()) } : {}),
    ...(input.clientApiKey ? { clientApiKey: input.clientApiKey } : {}),
    ...(input.clientApiKeyFile ? { clientApiKeyFile: resolve(input.clientApiKeyFile.trim()) } : {}),
    ...(input.evidencePath ? { evidencePath: resolve(input.evidencePath.trim()) } : {}),
    models,
    ...(accounts ? { accounts } : {}),
    ...(routes ? { routes } : {}),
    ...(input.sessionAffinity === undefined ? {} : { sessionAffinity: input.sessionAffinity === true }),
    ...(capabilities ? { capabilities } : {}),
  };
}

export function readCockpitApiKey(config: CockpitConfig): string {
  const validated = validateCockpitConfig(config);
  if (validated.apiKeyFile) {
    const path = resolve(validated.apiKeyFile);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error("Cockpit apiKeyFile must be a regular file");
    if (stat.size > 4096) throw new Error("Cockpit apiKeyFile is too large");
    if (process.platform !== "win32") {
      const mode = stat.mode & 0o777;
      if (mode & 0o077) throw new Error("Cockpit apiKeyFile must be owner-only (0600)");
      try { chmodSync(path, 0o600); } catch { /* read-only filesystem: preserve the failure boundary below */ }
    }
    const key = readFileSync(path, "utf8").trim();
    if (key.length < 8 || /[\r\n]/.test(key)) throw new Error("Cockpit apiKeyFile contains an invalid key");
    return key;
  }
  return validated.apiKey!;
}

function readOwnerOnlyKeyFile(pathValue: string, label: string): string {
  const path = resolve(pathValue);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  if (stat.size > 4096) throw new Error(`${label} is too large`);
  if (process.platform !== "win32") {
    if (stat.mode & 0o077) throw new Error(`${label} must be owner-only (0600)`);
    try { chmodSync(path, 0o600); } catch {}
  }
  const key = readFileSync(path, "utf8").trim();
  if (key.length < 8 || /[\r\n]/.test(key)) throw new Error(`${label} contains an invalid key`);
  return key;
}

export function readCockpitAccountApiKey(account: CockpitAccount): string {
  return readOwnerOnlyKeyFile(account.apiKeyFile, `Cockpit account ${account.id} apiKeyFile`);
}

export interface CockpitTarget {
  baseUrl: string;
  apiKey: string;
  upstreamModel: string;
  provider: CockpitProviderKind | "default";
  routeId: string | null;
  accountId: string | null;
  modelSlug: string;
}

function routeParts(modelSlug: string): { namespace: string; model: string } | undefined {
  if (!isCockpitModelSlug(modelSlug)) return undefined;
  const value = modelSlug.slice(COCKPIT_MODEL_PREFIX.length);
  const slash = value.indexOf("/");
  if (slash < 1) return undefined;
  return { namespace: value.slice(0, slash), model: value.slice(slash + 1) };
}

function selectionScore(conversationKey: string, accountId: string): string {
  return createHash("sha256").update(`${conversationKey}\0${accountId}`).digest("hex");
}

function requestConversationKey(request: Request, body: Record<string, unknown>): string {
  for (const name of ["x-codex-thread-id", "x-session-id", "x-client-request-id"]) {
    const value = request.headers.get(name)?.trim();
    if (value) return value.slice(0, 256);
  }
  for (const name of ["conversation_id", "previous_response_id", "session_id"]) {
    const value = body[name];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 256);
  }
  return "request-default";
}

/** Resolve a strict GPT/Claude route while keeping the actual account credential outside metadata. */
export function resolveCockpitTarget(config: CockpitConfig, modelSlug: string, conversationKey = "request-default"): CockpitTarget {
  const validated = validateCockpitConfig(config);
  const parts = routeParts(modelSlug);
  if (!parts || !validated.routes?.length) {
    return {
      baseUrl: validated.baseUrl,
      apiKey: readCockpitApiKey(validated),
      upstreamModel: cockpitUpstreamModel(modelSlug),
      provider: "default",
      routeId: null,
      accountId: null,
      modelSlug,
    };
  }
  const route = validated.routes.find(candidate => candidate.namespace === parts.namespace);
  if (!route) throw new Error(`Cockpit route namespace is not configured: ${parts.namespace}`);
  if (route.models.length > 0 && !route.models.includes(parts.model)) throw new Error(`Cockpit model is not admitted by route ${route.id}: ${parts.model}`);
  const accounts = (validated.accounts ?? [])
    .filter(account => route.accountIds.includes(account.id) && account.enabled && account.health === "ready" && (account.models.length === 0 || account.models.includes(parts.model)))
    .toSorted((left, right) => left.priority - right.priority || selectionScore(conversationKey, left.id).localeCompare(selectionScore(conversationKey, right.id)) || left.id.localeCompare(right.id));
  const account = accounts[0];
  if (!account) throw new Error(`No ready ${route.provider} Cockpit account is available for route ${route.id}`);
  return {
    baseUrl: account.baseUrl,
    apiKey: readCockpitAccountApiKey(account),
    upstreamModel: parts.model,
    provider: route.provider,
    routeId: route.id,
    accountId: account.id,
    modelSlug,
  };
}

export function readCockpitClientApiKey(config: CockpitConfig): string | undefined {
  const validated = validateCockpitConfig(config);
  if (validated.clientApiKeyFile) {
    const path = resolve(validated.clientApiKeyFile);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error("Cockpit clientApiKeyFile must be a regular file");
    if (stat.size > 4096) throw new Error("Cockpit clientApiKeyFile is too large");
    if (process.platform !== "win32" && (stat.mode & 0o077)) throw new Error("Cockpit clientApiKeyFile must be owner-only (0600)");
    const key = readFileSync(path, "utf8").trim();
    if (key.length < 8 || /[\r\n]/.test(key)) throw new Error("Cockpit clientApiKeyFile contains an invalid key");
    return key;
  }
  return validated.clientApiKey;
}

export function cockpitClientAuthorized(request: Request, config: AppConfig): boolean {
  let configured: string | undefined;
  try { configured = config.cockpit ? readCockpitClientApiKey(config.cockpit) : undefined; } catch { return false; }
  const header = request.headers.get("authorization") ?? "";
  if (!configured || !/^Bearer\s+\S+$/i.test(header)) return false;
  const actual = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(configured);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function headersForUpstream(source: Headers, apiKey: string, jsonBody = true): Headers {
  const headers = new Headers();
  const connectionTokens = new Set((source.get("connection") ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
  for (const [name, value] of source) {
    const lower = name.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && !connectionTokens.has(lower) && lower !== "authorization") headers.append(name, value);
  }
  headers.set("authorization", `Bearer ${apiKey}`);
  if (jsonBody) headers.set("content-type", "application/json");
  else headers.delete("content-type");
  headers.delete("content-length");
  return headers;
}

/** Only models returned by the configured/probed Cockpit catalog are callable. */
export function cockpitModelAllowed(config: CockpitConfig, model: string): boolean {
  const parts = routeParts(model);
  if (parts && config.routes?.length) {
    const route = config.routes.find(candidate => candidate.namespace === parts.namespace);
    return Boolean(route && (route.models.length === 0 || route.models.includes(parts.model)));
  }
  const upstream = cockpitUpstreamModel(model);
  return config.models.includes(upstream);
}

function endpointUrl(baseUrl: string, endpoint: CockpitEndpoint): string {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/${endpoint}`;
}

function capabilityDisabled(config: CockpitConfig, endpoint: CockpitEndpoint): boolean {
  const key = endpoint === "images/generations" || endpoint === "images/edits" ? "images" : endpoint;
  return config.capabilities?.[key] === false;
}

function transportDetail(error: unknown, cancelled: boolean): string {
  if (cancelled) return "Cockpit request was cancelled";
  if (error instanceof DOMException && error.name === "TimeoutError") return "Cockpit upstream request timed out";
  return "Cockpit upstream network request failed";
}

async function readBoundedText(response: Response, maxBytes = 8 * 1024 * 1024): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) throw new Error("Cockpit response exceeded its bounded probe size");
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

export async function probeCockpitModels(config: CockpitConfig, fetchUpstream: CockpitFetch = fetch): Promise<CockpitProbeResult> {
  const validated = validateCockpitConfig(config);
  const apiKey = readCockpitApiKey(validated);
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();
  const finish = (result: CockpitProbeResult): CockpitProbeResult => {
    tryRecordCockpitEvidence(validated.evidencePath, {
      kind: "probe",
      endpoint: "models",
      status: result.status,
      ok: result.ok,
      outcome: result.ok ? "completed" : "failed",
      durationMs: performance.now() - startedAt,
      detail: result.detail,
    });
    return result;
  };
  let response: Response;
  try {
    response = await fetchUpstream(new Request(`${validated.baseUrl}/models`, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    }));
  } catch (error) {
    return finish({ ok: false, status: null, models: [], checkedAt, detail: error instanceof Error ? error.message : String(error) });
  }
  if (response.status >= 300 && response.status < 400) {
    return finish({ ok: false, status: response.status, models: [], checkedAt, detail: "Cockpit models endpoint redirected; refusing to follow it" });
  }
  let text: string;
  try {
    text = await readBoundedText(response);
  } catch {
    return finish({ ok: false, status: response.status, models: [], checkedAt, detail: "Cockpit models response exceeded its bounded inspection limit" });
  }
  if (!response.ok) return finish({ ok: false, status: response.status, models: [], checkedAt, detail: `Cockpit models request failed with HTTP ${response.status}` });
  try {
    const body = JSON.parse(text) as { data?: unknown; models?: unknown };
    const items = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
    const models = items.flatMap(item => {
      const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
        ? (item as { id: string }).id.trim()
        : item && typeof item === "object" && typeof (item as { slug?: unknown }).slug === "string"
          ? (item as { slug: string }).slug.trim()
          : "";
      return id && id.length <= 200 && /^[A-Za-z0-9._:/-]+$/.test(id) ? [id] : [];
    });
    return finish({ ok: true, status: response.status, models: [...new Set(models)], checkedAt });
  } catch {
    return finish({ ok: false, status: response.status, models: [], checkedAt, detail: "Cockpit models response was not valid JSON" });
  }
}

function recordRequestEvidence(config: CockpitConfig, record: Omit<CockpitEvidenceRecord, "kind" | "observedAt">): void {
  tryRecordCockpitEvidence(config.evidencePath, { kind: "request", ...record });
}

function observedBody(
  body: ReadableStream<Uint8Array> | null,
  inspector: ReturnType<typeof createCockpitResponseInspector>,
  status: number,
  onSettled: (outcome: "completed" | "cancelled" | "failed", bytes: number, protocol: CockpitProtocolOutcome, detail?: string) => void,
): ReadableStream<Uint8Array> | null {
  if (!body) {
    const result = inspector.finish(status);
    onSettled(result.protocol === "completed" ? "completed" : "failed", 0, result.protocol, result.detail);
    return null;
  }
  const reader = body.getReader();
  let bytes = 0;
  let settled = false;
  const settle = (outcome: "completed" | "cancelled" | "failed", detail: string | undefined, protocol: CockpitProtocolOutcome) => {
    if (settled) return;
    settled = true;
    onSettled(outcome, bytes, protocol, detail);
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          const result = inspector.finish(status);
          settle(result.protocol === "completed" ? "completed" : "failed", result.detail, result.protocol);
          controller.close();
          return;
        }
        if (next.value) {
          bytes += next.value.byteLength;
          inspector.push(next.value);
          controller.enqueue(next.value);
        }
      } catch (error) {
        settle("cancelled", "Cockpit upstream stream was cancelled", "unverified");
        controller.error(error);
      }
    },
    async cancel(reason) {
      settle("cancelled", "Cockpit downstream stream was cancelled", "unverified");
      await reader.cancel(reason);
    },
  });
}

function cockpitResponseFromUpstream(
  upstream: Response,
  config: CockpitConfig,
  endpoint: CockpitEndpoint,
  upstreamModel: string,
  startedAt: number,
  route: Pick<CockpitTarget, "provider" | "routeId" | "accountId"> = { provider: "default", routeId: null, accountId: null },
): Response {
  const headers = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.append(name, value);
  }
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("set-cookie");
  const inspector = createCockpitResponseInspector(endpoint, upstream.headers);
  recordRequestEvidence(config, {
    endpoint,
    model: upstreamModel,
    provider: route.provider,
    routeId: route.routeId,
    accountId: route.accountId,
    status: upstream.status,
    ok: upstream.ok,
    outcome: upstream.ok ? "accepted" : "failed",
    durationMs: performance.now() - startedAt,
    detail: upstream.ok ? undefined : `Cockpit request failed with HTTP ${upstream.status}`,
  });
  const bodyObserved = observedBody(upstream.body, inspector, upstream.status, (outcome, bytes, protocol, detail) => {
    recordRequestEvidence(config, {
      endpoint,
      model: upstreamModel,
      provider: route.provider,
      routeId: route.routeId,
      accountId: route.accountId,
      status: upstream.status,
      ok: outcome === "completed" && protocol === "completed" && upstream.ok,
      outcome,
      protocol,
      durationMs: performance.now() - startedAt,
      bytes,
      detail,
    });
  });
  return new Response(bodyObserved, { status: upstream.status, statusText: upstream.statusText, headers });
}

export async function cockpitModelsRequest(
  request: Request,
  config: AppConfig,
  fetchUpstream: CockpitFetch = fetch,
): Promise<Response> {
  if (!cockpitClientAuthorized(request, config)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="Star Moon Cockpit"' } });
  }
  const configured = config.cockpit;
  if (!configured?.enabled) return new Response("Cockpit provider is disabled", { status: 503 });
  if (configured.capabilities?.models === false) return new Response("Cockpit model discovery is disabled", { status: 503 });
  const probe = await probeCockpitModels(configured, fetchUpstream);
  if (!probe.ok) {
    return Response.json(
      { error: { type: "upstream_error", message: probe.detail ?? "Cockpit models probe failed" } },
      { status: probe.status && probe.status >= 400 ? probe.status : 502 },
    );
  }
  const catalogConfig = { ...config, cockpit: { ...configured, models: probe.models } };
  const data = cockpitModelCatalogRows(catalogConfig);
  return Response.json({ object: "list", data, checked_at: probe.checkedAt });
}

/** Forward one explicit Cockpit route. This function never reads browser or OAuth credentials. */
export async function forwardCockpitRequest(
  request: Request,
  endpoint: CockpitEndpoint,
  config: AppConfig,
  decodedBody: Record<string, unknown>,
  fetchUpstream: CockpitFetch = fetch,
): Promise<Response> {
  const cockpit = config.cockpit;
  if (!cockpit?.enabled) throw new Error("Cockpit provider is disabled");
  const validated = validateCockpitConfig(cockpit);
  if (capabilityDisabled(validated, endpoint)) throw new Error(`Cockpit capability is disabled: ${endpoint}`);
  const startedAt = performance.now();
  const model = decodedBody.model;
  if (typeof model !== "string" || !isCockpitModelSlug(model)) throw new Error("Cockpit request requires a Cockpit model slug");
  if (!cockpitModelAllowed(validated, model)) throw new Error(`Cockpit model is not in the configured catalog: ${model}`);
  const target = resolveCockpitTarget(validated, model, requestConversationKey(request, decodedBody));
  const upstreamModel = target.upstreamModel;
  const body = JSON.stringify({ ...decodedBody, model: upstreamModel });
  let upstream: Response;
  try {
    upstream = await fetchUpstream(new Request(endpointUrl(target.baseUrl, endpoint), {
      method: "POST",
      headers: headersForUpstream(request.headers, target.apiKey),
      body,
      redirect: "manual",
      signal: request.signal,
    }));
  } catch (error) {
    recordRequestEvidence(validated, {
      endpoint,
      model: upstreamModel,
      provider: target.provider,
      routeId: target.routeId,
      accountId: target.accountId,
      status: null,
      ok: false,
      outcome: request.signal.aborted ? "cancelled" : "failed",
      durationMs: performance.now() - startedAt,
      detail: transportDetail(error, request.signal.aborted),
    });
    throw error;
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    recordRequestEvidence(validated, {
      endpoint,
      model: upstreamModel,
      provider: target.provider,
      routeId: target.routeId,
      accountId: target.accountId,
      status: upstream.status,
      ok: false,
      outcome: "failed",
      protocol: "failed",
      durationMs: performance.now() - startedAt,
      detail: "Cockpit upstream redirect was refused",
    });
    throw new Error("Cockpit upstream redirect was refused");
  }
  return cockpitResponseFromUpstream(upstream, validated, endpoint, upstreamModel, startedAt, target);
}

export async function cockpitImagesRequest(
  request: Request,
  config: AppConfig,
  fetchUpstream: CockpitFetch = fetch,
): Promise<Response> {
  if (!cockpitClientAuthorized(request, config)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="Star Moon Cockpit"' } });
  }
  const cockpit = config.cockpit;
  if (!cockpit?.enabled) return new Response("Cockpit provider is disabled", { status: 503 });
  if (cockpit.capabilities?.images === false) return new Response("Cockpit image capability is disabled", { status: 503 });
  let body: unknown;
  try { body = await readJsonRequestBody(request); } catch (error) {
    return Response.json({ error: { type: "invalid_request_error", message: error instanceof Error ? error.message : String(error) } }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: { type: "invalid_request_error", message: "Cockpit image request must be a JSON object" } }, { status: 400 });
  }
  const model = (body as { model?: unknown }).model;
  if (typeof model !== "string" || !isCockpitModelSlug(model)) {
    return Response.json({ error: { type: "invalid_request_error", message: "Cockpit image request requires a cockpit/<model> model" } }, { status: 400 });
  }
  try {
    return await forwardCockpitRequest(request, "images/generations", config, body as Record<string, unknown>, fetchUpstream);
  } catch (error) {
    return Response.json({ error: { type: "upstream_error", message: error instanceof Error ? error.message : String(error) } }, { status: 502 });
  }
}

export async function cockpitChatCompletionsRequest(
  request: Request,
  config: AppConfig,
  fetchUpstream: CockpitFetch = fetch,
): Promise<Response> {
  if (!cockpitClientAuthorized(request, config)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="Star Moon Cockpit"' } });
  }
  const cockpit = config.cockpit;
  if (!cockpit?.enabled) return new Response("Cockpit provider is disabled", { status: 503 });
  let body: unknown;
  try { body = await readJsonRequestBody(request); } catch (error) {
    return Response.json({ error: { type: "invalid_request_error", message: error instanceof Error ? error.message : String(error) } }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { model?: unknown }).model !== "string" || !isCockpitModelSlug((body as { model: string }).model)) {
    return Response.json({ error: { type: "invalid_request_error", message: "Cockpit chat request requires a cockpit/<model> model" } }, { status: 400 });
  }
  try {
    return await forwardCockpitRequest(request, "chat/completions", config, body as Record<string, unknown>, fetchUpstream);
  } catch (error) {
    return Response.json({ error: { type: "upstream_error", message: error instanceof Error ? error.message : String(error) } }, { status: 502 });
  }
}

async function forwardCockpitMultipartRequest(
  request: Request,
  endpoint: Extract<CockpitEndpoint, "images/edits">,
  config: AppConfig,
  form: FormData,
  modelSlug: string,
  fetchUpstream: CockpitFetch,
): Promise<Response> {
  const cockpit = config.cockpit;
  if (!cockpit?.enabled) throw new Error("Cockpit provider is disabled");
  const validated = validateCockpitConfig(cockpit);
  if (capabilityDisabled(validated, endpoint)) throw new Error(`Cockpit capability is disabled: ${endpoint}`);
  const startedAt = performance.now();
  if (!cockpitModelAllowed(validated, modelSlug)) throw new Error(`Cockpit model is not in the configured catalog: ${modelSlug}`);
  const target = resolveCockpitTarget(validated, modelSlug, requestConversationKey(request, { model: modelSlug }));
  const upstreamModel = target.upstreamModel;
  const body = new FormData();
  for (const [name, value] of form.entries()) body.append(name, name === "model" ? upstreamModel : value);
  let upstream: Response;
  try {
    upstream = await fetchUpstream(new Request(endpointUrl(target.baseUrl, endpoint), {
      method: "POST",
      headers: headersForUpstream(request.headers, target.apiKey, false),
      body,
      redirect: "manual",
      signal: request.signal,
    }));
  } catch (error) {
    recordRequestEvidence(validated, {
      endpoint,
      model: upstreamModel,
      provider: target.provider,
      routeId: target.routeId,
      accountId: target.accountId,
      status: null,
      ok: false,
      outcome: request.signal.aborted ? "cancelled" : "failed",
      durationMs: performance.now() - startedAt,
      detail: transportDetail(error, request.signal.aborted),
    });
    throw error;
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    recordRequestEvidence(validated, {
      endpoint,
      model: upstreamModel,
      provider: target.provider,
      routeId: target.routeId,
      accountId: target.accountId,
      status: upstream.status,
      ok: false,
      outcome: "failed",
      protocol: "failed",
      durationMs: performance.now() - startedAt,
      detail: "Cockpit upstream redirect was refused",
    });
    throw new Error("Cockpit upstream redirect was refused");
  }
  return cockpitResponseFromUpstream(upstream, validated, endpoint, upstreamModel, startedAt, target);
}

export async function cockpitImagesEditRequest(
  request: Request,
  config: AppConfig,
  fetchUpstream: CockpitFetch = fetch,
): Promise<Response> {
  if (!cockpitClientAuthorized(request, config)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="Star Moon Cockpit"' } });
  }
  const cockpit = config.cockpit;
  if (!cockpit?.enabled) return new Response("Cockpit provider is disabled", { status: 503 });
  let incoming: FormData;
  try { incoming = await request.formData(); } catch (error) {
    return Response.json({ error: { type: "invalid_request_error", message: error instanceof Error ? error.message : String(error) } }, { status: 400 });
  }
  const model = incoming.get("model");
  if (typeof model !== "string" || !isCockpitModelSlug(model)) {
    return Response.json({ error: { type: "invalid_request_error", message: "Cockpit image edit requires a cockpit/<model> model" } }, { status: 400 });
  }
  if (!cockpitModelAllowed(cockpit, model)) {
    return Response.json({ error: { type: "invalid_request_error", message: "Cockpit model is not in the configured catalog" } }, { status: 400 });
  }
  try {
    return await forwardCockpitMultipartRequest(request, "images/edits", config, incoming, model, fetchUpstream);
  } catch (error) {
    return Response.json({ error: { type: "upstream_error", message: error instanceof Error ? error.message : String(error) } }, { status: 502 });
  }
}

export function cockpitModelCatalogRows(config: AppConfig): Array<Record<string, unknown>> {
  const cockpit = config.cockpit;
  if (!cockpit?.enabled) return [];
  const validated = validateCockpitConfig(cockpit);
  const row = (model: string, namespace?: string, provider: string = "default"): Record<string, unknown> => {
    const slug = `${COCKPIT_MODEL_PREFIX}${namespace ? `${namespace}/${model}` : model}`;
    return {
      id: slug,
      object: "model",
      created: 0,
      owned_by: "cockpit",
      slug,
      display_name: `Cockpit / ${namespace ? `${namespace} / ` : ""}${model}`,
      description: namespace ? `Embedded Cockpit ${provider} account-pool route.` : "Explicit Cockpit reverse-proxy route.",
      visibility: namespace ? "configured" : "list",
      supported_in_api: true,
      input_modalities: cockpit.capabilities?.images === false ? ["text"] : ["text", "image"],
      supported_reasoning_levels: provider === "gpt" || provider === "claude" ? ["default"] : [],
      multi_agent_version: "disabled",
      tool_mode: null,
    };
  };
  return [
    ...validated.models.map(model => row(model)),
    ...(validated.routes ?? []).flatMap(route => route.models.map(model => row(model, route.namespace, route.provider))),
  ];
}
