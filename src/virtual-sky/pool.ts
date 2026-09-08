import type {
  SkyIdentity,
  SkyLease,
  SkyPoolPolicy,
  SkyPoolDefinition,
  SkySelection,
  SkySelectionInput,
} from "./types";

const DEFAULT_POLICY: SkyPoolPolicy = Object.freeze({ maxActiveLeasesPerIdentity: 1 });

export class SkyPoolError extends Error {
  readonly code: "invalid_pool" | "identity_unavailable" | "pool_unavailable" | "lease_conflict";

  constructor(code: SkyPoolError["code"], message: string) {
    super(message);
    this.name = "SkyPoolError";
    this.code = code;
  }
}

function activeLeases(leases: readonly SkyLease[], now: number): SkyLease[] {
  // A lease is active until it is explicitly released. Treating a future timestamp
  // as expired would allow two conversations to take the same identity after a
  // clock correction or a malformed persisted timestamp. `now` remains part of
  // the selection contract for callers and validation below, but never weakens
  // the ownership invariant.
  void now;
  return leases.filter(lease => lease.releasedAt === undefined);
}

export function validateSkyIdentity(identity: SkyIdentity): void {
  const allowedKeys = new Set(["id", "label", "provider", "kind", "enabled", "health", "priority", "capabilityEvidence", "browserProfileId"]);
  if (!identity || typeof identity !== "object" || Object.keys(identity).some(key => !allowedKeys.has(key))) {
    throw new SkyPoolError("invalid_pool", "Sky identity contains unsupported or secret fields");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(identity.id)) {
    throw new SkyPoolError("invalid_pool", `Sky identity id is invalid: ${identity.id}`);
  }
  if (typeof identity.label !== "string" || typeof identity.enabled !== "boolean") {
    throw new SkyPoolError("invalid_pool", `Sky identity metadata is invalid: ${identity.id}`);
  }
  if (!new Set(["chatgpt-web", "cockpit", "claude-api", "claude-web"]).has(identity.provider)) {
    throw new SkyPoolError("invalid_pool", `Sky identity provider is invalid: ${identity.id}`);
  }
  if (!new Set(["browser", "api"]).has(identity.kind)) {
    throw new SkyPoolError("invalid_pool", `Sky identity kind is invalid: ${identity.id}`);
  }
  if (!new Set(["unknown", "ready", "degraded", "offline", "auth-required"]).has(identity.health)) {
    throw new SkyPoolError("invalid_pool", `Sky identity health is invalid: ${identity.id}`);
  }
  if (!new Set(["missing", "observed", "verified", "failed"]).has(identity.capabilityEvidence)) {
    throw new SkyPoolError("invalid_pool", `Sky identity evidence is invalid: ${identity.id}`);
  }
  if (!identity.label.trim() || identity.label.length > 120) {
    throw new SkyPoolError("invalid_pool", `Sky identity label is invalid: ${identity.id}`);
  }
  if (!Number.isSafeInteger(identity.priority) || identity.priority < 0) {
    throw new SkyPoolError("invalid_pool", `Sky identity priority is invalid: ${identity.id}`);
  }
  if (!Object.prototype.hasOwnProperty.call(identity, "browserProfileId") && identity.browserProfileId !== undefined) {
    throw new SkyPoolError("invalid_pool", `Browser profile id is invalid: ${identity.id}`);
  }
  if (identity.browserProfileId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(identity.browserProfileId)) {
    throw new SkyPoolError("invalid_pool", `Browser profile id is invalid: ${identity.id}`);
  }
  if (identity.kind === "browser" && identity.provider !== "chatgpt-web" && identity.provider !== "claude-web") {
    throw new SkyPoolError("invalid_pool", `Browser identity provider is invalid: ${identity.id}`);
  }
  if (identity.kind === "api" && (identity.provider === "chatgpt-web" || identity.provider === "claude-web")) {
    throw new SkyPoolError("invalid_pool", `API identity provider is invalid: ${identity.id}`);
  }
}

function policyFor(input: SkySelectionInput): SkyPoolPolicy {
  const max = input.policy?.maxActiveLeasesPerIdentity ?? DEFAULT_POLICY.maxActiveLeasesPerIdentity;
  if (!Number.isSafeInteger(max) || max < 1 || max > 16) {
    throw new SkyPoolError("invalid_pool", "maxActiveLeasesPerIdentity must be an integer from 1 to 16");
  }
  return { maxActiveLeasesPerIdentity: max };
}

function assertPool(input: SkySelectionInput): void {
  if (!input.poolId.trim() || !input.conversationKey.trim()) {
    throw new SkyPoolError("invalid_pool", "Sky pool and conversation key are required");
  }
  const ids = new Set<string>();
  for (const identity of input.identities) {
    validateSkyIdentity(identity);
    if (ids.has(identity.id)) throw new SkyPoolError("invalid_pool", `Duplicate sky identity: ${identity.id}`);
    ids.add(identity.id);
  }
}

export function validateSkyPoolDefinition(value: unknown): SkyPoolDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SkyPoolError("invalid_pool", "Sky pool must be an object");
  const input = value as Partial<SkyPoolDefinition>;
  if (typeof input.poolId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(input.poolId)) {
    throw new SkyPoolError("invalid_pool", "Sky pool id is invalid");
  }
  if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 120) {
    throw new SkyPoolError("invalid_pool", "Sky pool label is invalid");
  }
  if (!Array.isArray(input.identities) || input.identities.length > 256) throw new SkyPoolError("invalid_pool", "Sky pool identities are invalid");
  assertPool({ poolId: input.poolId, conversationKey: "validation", identities: input.identities, leases: [] });
  if (!input.policy || typeof input.policy !== "object") throw new SkyPoolError("invalid_pool", "Sky pool policy is required");
  const max = input.policy.maxActiveLeasesPerIdentity;
  if (!Number.isSafeInteger(max) || max! < 1 || max! > 16) throw new SkyPoolError("invalid_pool", "Sky pool policy is invalid");
  return {
    poolId: input.poolId,
    label: input.label.trim(),
    identities: input.identities.map(identity => ({ ...identity })),
    policy: { maxActiveLeasesPerIdentity: max! },
  };
}

/** Select an identity without reading credentials or changing persisted state. */
export function selectSkyIdentity(input: SkySelectionInput): SkySelection {
  assertPool(input);
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(now)) throw new SkyPoolError("invalid_pool", "Sky selection time is invalid");
  const policy = policyFor(input);
  const active = activeLeases(input.leases, now);
  const byConversation = active.find(lease => lease.poolId === input.poolId && lease.conversationKey === input.conversationKey);
  if (byConversation) {
    if (input.requestedIdentityId && input.requestedIdentityId !== byConversation.identityId) {
      throw new SkyPoolError("lease_conflict", `Conversation is already bound to identity: ${byConversation.identityId}`);
    }
    const identity = input.identities.find(item => item.id === byConversation.identityId);
    if (!identity || !identity.enabled || identity.health !== "ready" || identity.capabilityEvidence !== "verified") {
      throw new SkyPoolError("lease_conflict", `Conversation is bound to an unavailable identity: ${byConversation.identityId}`);
    }
    return { identity, reusedLease: byConversation };
  }

  const activeCount = new Map<string, number>();
  for (const lease of active) activeCount.set(lease.identityId, (activeCount.get(lease.identityId) ?? 0) + 1);
  const requested = input.requestedIdentityId
    ? input.identities.find(item => item.id === input.requestedIdentityId)
    : undefined;
  if (input.requestedIdentityId && (!requested || !requested.enabled || requested.health !== "ready" || requested.capabilityEvidence !== "verified")) {
    throw new SkyPoolError("identity_unavailable", `Requested sky identity is unavailable: ${input.requestedIdentityId}`);
  }
  const candidates = (requested ? [requested] : input.identities.filter(item => item.enabled && item.health === "ready" && item.capabilityEvidence === "verified"))
    .filter(item => (activeCount.get(item.id) ?? 0) < policy.maxActiveLeasesPerIdentity)
    .toSorted((left, right) => left.priority - right.priority || (activeCount.get(left.id) ?? 0) - (activeCount.get(right.id) ?? 0) || left.id.localeCompare(right.id));
  const identity = candidates[0];
  if (!identity) throw new SkyPoolError("pool_unavailable", `No ready sky identity is available for pool ${input.poolId}`);
  return { identity };
}

export function createSkyLease(
  input: SkySelectionInput,
  selection: SkySelection,
  leaseId: string,
): SkyLease {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/.test(leaseId)) {
    throw new SkyPoolError("invalid_pool", "Sky lease id is invalid");
  }
  if (selection.reusedLease) return { ...selection.reusedLease, lastUsedAt: input.now ?? Date.now() };
  return {
    leaseId,
    poolId: input.poolId,
    identityId: selection.identity.id,
    conversationKey: input.conversationKey,
    createdAt: input.now ?? Date.now(),
    lastUsedAt: input.now ?? Date.now(),
  };
}

export function releaseSkyLease(lease: SkyLease, at = Date.now()): SkyLease {
  if (lease.releasedAt !== undefined) return lease;
  return { ...lease, releasedAt: at, lastUsedAt: at };
}
