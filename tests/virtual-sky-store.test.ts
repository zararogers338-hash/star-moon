import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSkyPoolStore, saveSkyPoolStore, skyPoolStorePath, upsertSkyPool } from "../src/virtual-sky/store";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function pool(id = "gpt-pool") {
  return {
    poolId: id,
    label: "GPT browser pool",
    policy: { maxActiveLeasesPerIdentity: 1 },
    identities: [{
      id: "gpt-main",
      label: "Main GPT browser",
      provider: "chatgpt-web" as const,
      kind: "browser" as const,
      enabled: true,
      health: "ready" as const,
      priority: 0,
      capabilityEvidence: "verified" as const,
      browserProfileId: "GPT-main-01",
    }],
  };
}

describe("persisted 群星 pool metadata", () => {
  test("writes owner-only public metadata and never accepts secret fields", () => {
    const root = join(tmpdir(), `star-moon-sky-store-${process.pid}-${Date.now()}`);
    roots.push(root);
    const path = skyPoolStorePath(root);
    const saved = saveSkyPoolStore([pool()], path);
    expect(saved.pools[0]?.identities[0]?.browserProfileId).toBe("GPT-main-01");
    expect(statSync(path).mode & 0o077).toBe(0);
    expect(JSON.parse(readFileSync(path, "utf8"))).not.toHaveProperty("apiKey");
    expect(readSkyPoolStore(path).pools).toHaveLength(1);
    expect(() => saveSkyPoolStore([{ ...pool(), identities: [{ ...pool().identities[0], apiKey: "secret" }] } as never], path)).toThrow("secret fields");
  });

  test("upsert replaces one pool without changing other pools", () => {
    const root = join(tmpdir(), `star-moon-sky-upsert-${process.pid}-${Date.now()}`);
    roots.push(root);
    const path = join(root, "pools.json");
    mkdirSync(root, { recursive: true });
    saveSkyPoolStore([pool("pool-a"), pool("pool-b")], path);
    upsertSkyPool({ ...pool("pool-a"), label: "updated" }, path);
    expect(readSkyPoolStore(path).pools.map(item => item.label)).toEqual(["updated", "GPT browser pool"]);
  });
});
