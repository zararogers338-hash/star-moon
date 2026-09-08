import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CockpitSidecarSupervisor, validateCockpitSidecarSpec } from "../src/cockpit-sidecar";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("Cockpit sidecar supervisor", () => {
  test("owns an isolated HOME, waits for readiness, and stops its child", async () => {
    const home = join(tmpdir(), `star-moon-cockpit-sidecar-${process.pid}-${Date.now()}`);
    homes.push(home);
    const supervisor = new CockpitSidecarSupervisor({
      command: [process.execPath, "-e", "Bun.write(process.env.HOME + '/ready', 'ok'); setInterval(() => {}, 1000)"],
      isolatedHome: home,
      startupTimeoutMs: 2_000,
      shutdownTimeoutMs: 1_000,
    }, async () => existsSync(join(home, "ready")));
    const ready = await supervisor.start();
    expect(ready.state).toBe("ready");
    expect(ready.pid).toBeNumber();
    expect(ready.commandFingerprint).toHaveLength(24);
    expect(ready.isolatedHome).toBe(home);
    expect((await supervisor.stop()).state).toBe("stopped");
  });

  test("fails closed when readiness never arrives and validates absolute commands", async () => {
    const home = join(tmpdir(), `star-moon-cockpit-sidecar-timeout-${process.pid}-${Date.now()}`);
    homes.push(home);
    expect(() => validateCockpitSidecarSpec({ command: ["bun"], isolatedHome: home })).toThrow("absolute");
    const supervisor = new CockpitSidecarSupervisor({
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      isolatedHome: home,
      startupTimeoutMs: 150,
      shutdownTimeoutMs: 500,
    }, async () => false);
    await expect(supervisor.start()).rejects.toThrow("readiness");
    expect(supervisor.status().state).toBe("failed");
    await supervisor.stop();
  });
});
