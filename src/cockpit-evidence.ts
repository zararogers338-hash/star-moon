import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { CockpitConfig } from "./cockpit-provider";

/** A bounded, credential-free record proving what the external gateway did. */
export interface CockpitEvidenceRecord {
  kind: "probe" | "request";
  endpoint: "models" | "responses" | "responses/compact" | "chat/completions" | "images/generations" | "images/edits";
  observedAt?: string;
  model?: string;
  provider?: string;
  routeId?: string | null;
  accountId?: string | null;
  status: number | null;
  ok: boolean;
  outcome: "accepted" | "completed" | "failed" | "cancelled";
  /** Protocol-level proof. HTTP 200/EOF alone is never completion proof. */
  protocol?: "completed" | "failed" | "incomplete" | "unverified";
  durationMs: number;
  bytes?: number;
  detail?: string;
}

export interface CockpitEvidenceSummary {
  gate: "missing" | "observed" | "verified" | "failed";
  total: number;
  probes: number;
  requests: number;
  completedRequests: number;
  cancelledRequests: number;
  failedRequests: number;
  lastObservedAt: string | null;
  lastProvider?: string | null;
  lastRouteId?: string | null;
  lastModel?: string | null;
}

export const MAX_COCKPIT_EVIDENCE_BYTES = 1_048_576;
const MAX_EVIDENCE_DETAIL = 240;

function safeText(value: unknown, max = MAX_EVIDENCE_DETAIL): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function safeModel(value: unknown): string | undefined {
  const model = safeText(value, 200);
  return model && /^[A-Za-z0-9._:/-]+$/.test(model) ? model : undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  const text = safeText(value, 100);
  return text && /^[A-Za-z0-9][A-Za-z0-9_.-]{1,99}$/.test(text) ? text : undefined;
}

function normalize(record: CockpitEvidenceRecord): CockpitEvidenceRecord {
  const protocol = record.protocol === "completed" || record.protocol === "failed" || record.protocol === "incomplete" || record.protocol === "unverified"
    ? record.protocol
    : undefined;
  return {
    kind: record.kind,
    endpoint: record.endpoint,
    observedAt: record.observedAt ?? new Date().toISOString(),
    model: safeModel(record.model),
    ...(safeIdentifier(record.provider) ? { provider: safeIdentifier(record.provider) } : {}),
    ...(record.routeId === null ? { routeId: null } : safeIdentifier(record.routeId) ? { routeId: safeIdentifier(record.routeId) } : {}),
    ...(record.accountId === null ? { accountId: null } : safeIdentifier(record.accountId) ? { accountId: safeIdentifier(record.accountId) } : {}),
    status: Number.isInteger(record.status) && record.status! >= 100 && record.status! <= 599 ? record.status : null,
    ok: record.ok === true,
    outcome: record.outcome,
    ...(protocol ? { protocol } : {}),
    durationMs: Number.isFinite(record.durationMs) ? Math.max(0, Math.min(Math.round(record.durationMs), 86_400_000)) : 0,
    ...(record.bytes === undefined ? {} : { bytes: Number.isSafeInteger(record.bytes) && record.bytes >= 0 ? record.bytes : 0 }),
    ...(safeText(record.detail) ? { detail: safeText(record.detail) } : {}),
  };
}

function assertPrivateFile(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink() || (stat && !stat.isFile())) throw new Error("Cockpit evidence path must be a regular file");
  if (stat && process.platform !== "win32" && (stat.mode & 0o077)) chmodSync(path, 0o600);
}

/**
 * Append one bounded redacted record. Diagnostics must never be able to break a provider
 * request, so callers normally use this through `tryRecordCockpitEvidence`.
 */
export function recordCockpitEvidence(path: string | undefined, record: CockpitEvidenceRecord): void {
  if (!path) return;
  const target = resolve(path);
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch {}
  if (existsSync(target)) {
    assertPrivateFile(target);
    if (statSync(target).size >= MAX_COCKPIT_EVIDENCE_BYTES) {
      const rotated = `${target}.1`;
      try { renameSync(target, rotated); } catch { writeFileSync(target, "", { mode: 0o600 }); }
      try { chmodSync(rotated, 0o600); } catch {}
    }
  }
  appendFileSync(target, `${JSON.stringify(normalize(record))}\n`, { mode: 0o600 });
  try { chmodSync(target, 0o600); } catch {}
}

export function tryRecordCockpitEvidence(path: string | undefined, record: CockpitEvidenceRecord): void {
  try { recordCockpitEvidence(path, record); } catch { /* diagnostics are best effort and fail closed */ }
}

export function readCockpitEvidence(path: string | undefined, limit = 100): CockpitEvidenceRecord[] {
  if (!path || !existsSync(path)) return [];
  try {
    assertPrivateFile(resolve(path));
    const lines = readFileSync(resolve(path), "utf8").split("\n").filter(Boolean).slice(-Math.max(1, Math.min(limit, 500)));
    const records: CockpitEvidenceRecord[] = [];
    for (const line of lines) {
      try {
        const value = JSON.parse(line) as CockpitEvidenceRecord;
        records.push(normalize(value));
      } catch { /* ignore a torn final append */ }
    }
    return records;
  } catch {
    return [];
  }
}

/** Summarize evidence without exposing records, prompts, paths or credentials. */
export function summarizeCockpitEvidence(records: readonly CockpitEvidenceRecord[]): CockpitEvidenceSummary {
  const probes = records.filter(record => record.kind === "probe");
  const requests = records.filter(record => record.kind === "request");
  const completedRequests = requests.filter(record => record.outcome === "completed" && record.protocol === "completed" && record.ok && record.status !== null).length;
  const cancelledRequests = requests.filter(record => record.outcome === "cancelled").length;
  const failedRequests = requests.filter(record => record.outcome === "failed" || !record.ok).length;
  const lastObservedAt = records.map(record => record.observedAt ?? "").filter(Boolean).sort().at(-1) ?? null;
  const latest = [...records].sort((left, right) => (left.observedAt ?? "").localeCompare(right.observedAt ?? "")).at(-1);
  let gate: CockpitEvidenceSummary["gate"] = "missing";
  if (completedRequests > 0) gate = "verified";
  else if (probes.some(record => record.outcome === "completed" && record.ok)) gate = "observed";
  else if (failedRequests > 0 || cancelledRequests > 0) gate = "failed";
  return {
    gate,
    total: records.length,
    probes: probes.length,
    requests: requests.length,
    completedRequests,
    cancelledRequests,
    failedRequests,
    lastObservedAt,
    lastProvider: latest?.provider ?? null,
    lastRouteId: latest?.routeId ?? null,
    lastModel: latest?.model ?? null,
  };
}
