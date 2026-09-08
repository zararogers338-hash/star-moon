import { describe, expect, test } from "bun:test";
import { createSkyLease, releaseSkyLease, selectSkyIdentity, SkyPoolError } from "../src/virtual-sky/pool";
import type { SkyIdentity, SkyLease } from "../src/virtual-sky/types";

const identity = (id: string, patch: Partial<SkyIdentity> = {}): SkyIdentity => ({
  id, label: id, provider: "chatgpt-web", kind: "browser", enabled: true, health: "ready", priority: 0,
  capabilityEvidence: "verified", ...patch,
});

describe("群星 identity pool", () => {
  test("reuses the exact conversation lease before considering another identity", () => {
    const existing: SkyLease = {
      leaseId: "lease-gpt-01", poolId: "gpt-pool", identityId: "GPT-01", conversationKey: "thread-a",
      createdAt: 1, lastUsedAt: 10,
    };
    const selected = selectSkyIdentity({
      poolId: "gpt-pool", conversationKey: "thread-a", now: 20,
      identities: [identity("GPT-01"), identity("GPT-02", { priority: 1 })], leases: [existing],
    });
    expect(selected.identity.id).toBe("GPT-01");
    expect(selected.reusedLease?.leaseId).toBe("lease-gpt-01");
  });

  test("does not silently move a conversation away from an unavailable identity", () => {
    const existing: SkyLease = {
      leaseId: "lease-gpt-01", poolId: "gpt-pool", identityId: "GPT-01", conversationKey: "thread-a",
      createdAt: 1, lastUsedAt: 10,
    };
    expect(() => selectSkyIdentity({
      poolId: "gpt-pool", conversationKey: "thread-a", identities: [
        identity("GPT-01", { health: "auth-required" }), identity("GPT-02"),
      ], leases: [existing],
    })).toThrowError(new SkyPoolError("lease_conflict", "Conversation is bound to an unavailable identity: GPT-01"));
  });

  test("selects deterministically by priority, active capacity and id", () => {
    const selected = selectSkyIdentity({
      poolId: "pool", conversationKey: "new", now: 50,
      identities: [identity("GPT-02", { priority: 1 }), identity("GPT-01"), identity("GPT-03", { health: "offline" })],
      leases: [],
    });
    expect(selected.identity.id).toBe("GPT-01");
  });

  test("honors an explicit identity without falling back", () => {
    expect(selectSkyIdentity({
      poolId: "pool", conversationKey: "new", requestedIdentityId: "GPT-02",
      identities: [identity("GPT-01"), identity("GPT-02", { priority: 5 })], leases: [],
    }).identity.id).toBe("GPT-02");
    expect(() => selectSkyIdentity({
      poolId: "pool", conversationKey: "new", requestedIdentityId: "GPT-02",
      identities: [identity("GPT-01"), identity("GPT-02", { health: "degraded" })], leases: [],
    })).toThrow("Requested sky identity is unavailable");
  });

  test("requires verified capability evidence before selecting an identity", () => {
    expect(() => selectSkyIdentity({
      poolId: "pool", conversationKey: "new", identities: [identity("GPT-01", { capabilityEvidence: "observed" })], leases: [],
    })).toThrow("No ready sky identity");
    expect(() => selectSkyIdentity({
      poolId: "pool", conversationKey: "new", requestedIdentityId: "GPT-01",
      identities: [identity("GPT-01", { capabilityEvidence: "failed" })], leases: [],
    })).toThrow("Requested sky identity is unavailable");
  });

  test("does not expire an unreleased lease when the clock moves forward", () => {
    const lease = createSkyLease({ poolId: "pool", conversationKey: "old", identities: [identity("GPT-01")], leases: [], now: 1 }, { identity: identity("GPT-01") }, "lease-0000002");
    expect(() => selectSkyIdentity({
      poolId: "pool", conversationKey: "new", identities: [identity("GPT-01")], leases: [lease], now: Number.MAX_SAFE_INTEGER,
    })).toThrow("No ready sky identity");
  });

  test("refuses an explicit identity switch inside an existing conversation lease", () => {
    const lease: SkyLease = {
      leaseId: "lease-gpt-01", poolId: "pool", identityId: "GPT-01", conversationKey: "thread-a", createdAt: 1, lastUsedAt: 1,
    };
    expect(() => selectSkyIdentity({
      poolId: "pool", conversationKey: "thread-a", requestedIdentityId: "GPT-02",
      identities: [identity("GPT-01"), identity("GPT-02")], leases: [lease],
    })).toThrow("already bound");
  });

  test("enforces one active browser lease per identity by default", () => {
    const lease = createSkyLease({ poolId: "pool", conversationKey: "old", identities: [identity("GPT-01")], leases: [], now: 1 }, { identity: identity("GPT-01") }, "lease-0000001");
    expect(() => selectSkyIdentity({
      poolId: "pool", conversationKey: "new", identities: [identity("GPT-01")], leases: [lease], now: 2,
    })).toThrow("No ready sky identity");
    const released = releaseSkyLease(lease, 3);
    expect(selectSkyIdentity({
      poolId: "pool", conversationKey: "new", identities: [identity("GPT-01")], leases: [released], now: 4,
    }).identity.id).toBe("GPT-01");
  });
});
