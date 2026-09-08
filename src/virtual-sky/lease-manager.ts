import { randomUUID } from "node:crypto";
import { createSkyLease, releaseSkyLease, selectSkyIdentity, validateSkyPoolDefinition, SkyPoolError } from "./pool";
import type { SkyIdentity, SkyLease, SkyPoolDefinition } from "./types";

export class SkyLeaseManager {
  private definition: SkyPoolDefinition;
  private leases = new Map<string, SkyLease>();

  constructor(definition: SkyPoolDefinition) {
    this.definition = validateSkyPoolDefinition(definition);
  }

  get pool(): SkyPoolDefinition {
    return { ...this.definition, identities: this.definition.identities.map(identity => ({ ...identity })), policy: { ...this.definition.policy } };
  }

  updateDefinition(definition: SkyPoolDefinition): void {
    const next = validateSkyPoolDefinition(definition);
    if (next.poolId !== this.definition.poolId) {
      throw new SkyPoolError("lease_conflict", "Cannot change a pool id while updating an active lease manager");
    }
    const activeIds = new Set(this.activeLeases().map(lease => lease.identityId));
    for (const identityId of activeIds) {
      const nextIdentity = next.identities.find(identity => identity.id === identityId);
      if (!nextIdentity || !nextIdentity.enabled || nextIdentity.health !== "ready") {
        throw new SkyPoolError("lease_conflict", `Cannot disable an identity with an active lease: ${identityId}`);
      }
      const currentIdentity = this.definition.identities.find(identity => identity.id === identityId)!;
      if (nextIdentity.provider !== currentIdentity.provider
        || nextIdentity.kind !== currentIdentity.kind
        || nextIdentity.browserProfileId !== currentIdentity.browserProfileId
        || nextIdentity.capabilityEvidence !== "verified") {
        throw new SkyPoolError("lease_conflict", `Cannot change the capability identity of an active lease: ${identityId}`);
      }
    }
    const activeCounts = new Map<string, number>();
    for (const lease of this.activeLeases()) activeCounts.set(lease.identityId, (activeCounts.get(lease.identityId) ?? 0) + 1);
    for (const [identityId, count] of activeCounts) {
      if (count > next.policy.maxActiveLeasesPerIdentity) {
        throw new SkyPoolError("lease_conflict", `New lease capacity is below active leases for identity: ${identityId}`);
      }
    }
    this.definition = next;
  }

  acquire(conversationKey: string, requestedIdentityId?: string, now = Date.now()): SkyLease {
    const selection = selectSkyIdentity({
      poolId: this.definition.poolId,
      identities: this.definition.identities,
      leases: this.activeLeases(),
      conversationKey,
      requestedIdentityId,
      now,
      policy: this.definition.policy,
    });
    const lease = createSkyLease({
      poolId: this.definition.poolId,
      identities: this.definition.identities,
      leases: this.activeLeases(),
      conversationKey,
      now,
      policy: this.definition.policy,
    }, selection, `lease-${randomUUID()}`);
    this.leases.set(lease.leaseId, lease);
    return { ...lease };
  }

  heartbeat(leaseId: string, now = Date.now()): SkyLease {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.releasedAt !== undefined) throw new SkyPoolError("lease_conflict", `Sky lease is not active: ${leaseId}`);
    if (!Number.isSafeInteger(now) || now < lease.lastUsedAt) throw new SkyPoolError("invalid_pool", "Sky lease heartbeat time is invalid");
    const updated = { ...lease, lastUsedAt: now };
    this.leases.set(leaseId, updated);
    return { ...updated };
  }

  release(leaseId: string, at = Date.now()): SkyLease | undefined {
    const lease = this.leases.get(leaseId);
    if (!lease) return undefined;
    if (!Number.isSafeInteger(at) || at < lease.lastUsedAt) throw new SkyPoolError("invalid_pool", "Sky lease release time is invalid");
    const released = releaseSkyLease(lease, at);
    this.leases.set(leaseId, released);
    return { ...released };
  }

  activeLeases(now = Date.now()): SkyLease[] {
    return [...this.leases.values()].filter(lease => lease.releasedAt === undefined && lease.lastUsedAt <= now).map(lease => ({ ...lease }));
  }

  allLeases(): SkyLease[] {
    return [...this.leases.values()].map(lease => ({ ...lease }));
  }

  identity(identityId: string): SkyIdentity | undefined {
    const identity = this.definition.identities.find(item => item.id === identityId);
    return identity ? { ...identity } : undefined;
  }
}
