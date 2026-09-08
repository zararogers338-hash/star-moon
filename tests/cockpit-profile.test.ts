import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cockpitProfileBackupPath, cockpitProfilePath, readStoredCockpitProfile, rollbackStoredCockpitProfile, saveStoredCockpitProfile } from "../src/cockpit-profile";
import { readCockpitClientApiKey } from "../src/cockpit-provider";

const roots: string[] = [];
const oldHome = process.env.CODEX_CHATGPT_WEB_HOME;
afterEach(() => {
  if (oldHome === undefined) delete process.env.CODEX_CHATGPT_WEB_HOME;
  else process.env.CODEX_CHATGPT_WEB_HOME = oldHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("stored Cockpit profile", () => {
  test("generates an owner-only Star Moon client key without returning its value in status", () => {
    const root = join(tmpdir(), `star-moon-cockpit-profile-${process.pid}-${Date.now()}`);
    roots.push(root);
    process.env.CODEX_CHATGPT_WEB_HOME = root;
    const upstreamKey = join(root, "secret", "upstream-key");
    mkdirSync(join(root, "secret"), { recursive: true, mode: 0o700 });
    writeFileSync(upstreamKey, "upstream-local-key\n", { mode: 0o600 });
    chmodSync(upstreamKey, 0o600);
    const profile = saveStoredCockpitProfile({
      enabled: true, baseUrl: "http://127.0.0.1:4317/v1", apiKeyFile: upstreamKey, models: [],
    });
    expect(profile.cockpit.clientApiKeyFile).toContain("client-api-key");
    expect(readCockpitClientApiKey(profile.cockpit)?.length).toBeGreaterThan(32);
    expect(statSync(profile.cockpit.clientApiKeyFile!).mode & 0o077).toBe(0);
    expect(JSON.stringify(readStoredCockpitProfile())).not.toContain(readFileSync(profile.cockpit.clientApiKeyFile!, "utf8").trim());
    expect(profile.cockpit.evidencePath).toBe(join(root, "cockpit", "evidence.jsonl"));
    expect(cockpitProfilePath()).toBe(join(root, "cockpit", "profile.json"));
  });

  test("keeps one private previous profile and can swap it back explicitly", () => {
    const root = join(tmpdir(), `star-moon-cockpit-rollback-${process.pid}-${Date.now()}`);
    roots.push(root);
    process.env.CODEX_CHATGPT_WEB_HOME = root;
    const upstreamKey = join(root, "secret", "upstream-key");
    mkdirSync(join(root, "secret"), { recursive: true, mode: 0o700 });
    writeFileSync(upstreamKey, "upstream-local-key\n", { mode: 0o600 });
    saveStoredCockpitProfile({ enabled: true, baseUrl: "http://127.0.0.1:4317/v1", apiKeyFile: upstreamKey, models: ["one"] });
    const second = saveStoredCockpitProfile({ enabled: false, baseUrl: "http://127.0.0.1:4318/v1", apiKeyFile: upstreamKey, models: ["two"] });
    expect(readStoredCockpitProfile()?.cockpit.models).toEqual(["two"]);
    expect(statSync(cockpitProfileBackupPath()).mode & 0o077).toBe(0);
    expect(rollbackStoredCockpitProfile().cockpit.models).toEqual(["one"]);
    expect(readStoredCockpitProfile()?.cockpit.enabled).toBe(true);
    expect(readStoredCockpitProfile()?.cockpit.evidencePath).toBe(second.cockpit.evidencePath);
  });
});
