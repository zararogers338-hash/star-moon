import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureSkyBrowserProfile, skyBrowserProfilePath } from "../src/virtual-sky/browser-profile";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const identity = {
  id: "gpt-browser",
  label: "GPT browser",
  provider: "chatgpt-web" as const,
  kind: "browser" as const,
  enabled: true,
  health: "ready" as const,
  priority: 0,
  capabilityEvidence: "verified" as const,
  browserProfileId: "GPT-profile-01",
};

describe("isolated 群星 browser profile mapping", () => {
  test("derives a private provider/profile directory and creates it owner-only", () => {
    const root = join(tmpdir(), `star-moon-browser-profile-${process.pid}-${Date.now()}`);
    roots.push(root);
    mkdirSync(root, { recursive: true });
    const path = ensureSkyBrowserProfile(root, identity);
    expect(path).toBe(join(root, "chatgpt-web", "GPT-profile-01"));
    expect(statSync(path).mode & 0o077).toBe(0);
  });

  test("rejects relative roots, missing opaque ids, and traversal-shaped ids", () => {
    expect(() => skyBrowserProfilePath("relative", identity)).toThrow("absolute");
    expect(() => skyBrowserProfilePath("/tmp", { ...identity, browserProfileId: "../shared" })).toThrow("invalid");
    expect(() => skyBrowserProfilePath("/tmp", { ...identity, browserProfileId: undefined })).toThrow("requires");
  });
});
