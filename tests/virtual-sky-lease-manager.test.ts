import { describe, expect, test } from "bun:test";
import { SkyPoolError } from "../src/virtual-sky/pool";
import { SkyLeaseManager } from "../src/virtual-sky/lease-manager";

function definition() {
  return {
    poolId: "gpt-browser-pool",
    label: "GPT browsers",
    policy: { maxActiveLeasesPerIdentity: 1 },
    identities: [
      { id: "gpt-a", label: "A", provider: "chatgpt-web" as const, kind: "browser" as const, enabled: true, health: "ready" as const, priority: 0, capabilityEvidence: "verified" as const, browserProfileId: "profile-a" },
      { id: "gpt-b", label: "B", provider: "chatgpt-web" as const, kind: "browser" as const, enabled: true, health: "ready" as const, priority: 1, capabilityEvidence: "verified" as const, browserProfileId: "profile-b" },
    ],
  };
}

describe("群星 lease manager", () => {
  test("keeps a conversation on one identity and releases it explicitly", () => {
    const manager = new SkyLeaseManager(definition());
    const first = manager.acquire("thread-1", undefined, 100);
    const reused = manager.acquire("thread-1", undefined, 200);
    expect(reused.leaseId).toBe(first.leaseId);
    expect(reused.identityId).toBe(first.identityId);
    expect(manager.activeLeases(200)).toHaveLength(1);
    expect(manager.release(first.leaseId, 300)?.releasedAt).toBe(300);
    expect(manager.activeLeases(300)).toHaveLength(0);
  });

  test("does not disable or remove an identity with an active lease", () => {
    const manager = new SkyLeaseManager(definition());
    const lease = manager.acquire("thread-1", "gpt-a", 100);
    expect(() => manager.updateDefinition({ ...definition(), identities: [{ ...definition().identities[1] }] })).toThrow(SkyPoolError);
    expect(manager.heartbeat(lease.leaseId, 150).lastUsedAt).toBe(150);
  });

  test("does not allow an active conversation to change provider identity or evidence", () => {
    const manager = new SkyLeaseManager(definition());
    const lease = manager.acquire("thread-1", "gpt-a", 100);
    expect(() => manager.updateDefinition({
      ...definition(),
      identities: [{ ...definition().identities[0], browserProfileId: "profile-other" }, definition().identities[1]],
    })).toThrow("capability identity");
    expect(() => manager.updateDefinition({
      ...definition(),
      identities: [{ ...definition().identities[0], capabilityEvidence: "observed" }, definition().identities[1]],
    })).toThrow("capability identity");
    expect(() => manager.heartbeat(lease.leaseId, 99)).toThrow("heartbeat time");
    expect(() => manager.release(lease.leaseId, 99)).toThrow("release time");
  });

  test("does not persist leases when a new manager is created from the same definition", () => {
    const manager = new SkyLeaseManager(definition());
    manager.acquire("thread-1", undefined, 100);
    const fresh = new SkyLeaseManager(manager.pool);
    expect(fresh.activeLeases(100)).toEqual([]);
  });
});
