export type SkyProvider = "chatgpt-web" | "cockpit" | "claude-api" | "claude-web";
export type SkyIdentityKind = "browser" | "api";
export type SkyHealth = "unknown" | "ready" | "degraded" | "offline" | "auth-required";
export type SkyEvidenceState = "missing" | "observed" | "verified" | "failed";

/** Public metadata only. Credentials and browser storage never belong in this object. */
export interface SkyIdentity {
  id: string;
  label: string;
  provider: SkyProvider;
  kind: SkyIdentityKind;
  enabled: boolean;
  health: SkyHealth;
  priority: number;
  capabilityEvidence: SkyEvidenceState;
  /** Opaque profile/partition identifier; never a filesystem path or cookie store. */
  browserProfileId?: string;
}

export interface SkyLease {
  leaseId: string;
  poolId: string;
  identityId: string;
  conversationKey: string;
  threadId?: string;
  turnId?: string;
  createdAt: number;
  lastUsedAt: number;
  releasedAt?: number;
}

export interface SkyPoolPolicy {
  maxActiveLeasesPerIdentity: number;
}

export interface SkySelectionInput {
  poolId: string;
  identities: readonly SkyIdentity[];
  leases: readonly SkyLease[];
  conversationKey: string;
  requestedIdentityId?: string;
  now?: number;
  policy?: Partial<SkyPoolPolicy>;
}

export interface SkySelection {
  identity: SkyIdentity;
  reusedLease?: SkyLease;
}

export interface SkyPoolDefinition {
  poolId: string;
  label: string;
  identities: SkyIdentity[];
  policy: SkyPoolPolicy;
}
