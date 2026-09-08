import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface CockpitSidecarSpec {
  command: readonly [string, ...string[]];
  isolatedHome: string;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

export interface CockpitSidecarStatus {
  state: "stopped" | "starting" | "ready" | "failed" | "stopping";
  pid: number | null;
  generation: number;
  commandFingerprint: string;
  isolatedHome: string;
  startedAt: string | null;
  exitedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  lastError: string | null;
}

export type CockpitSidecarReadiness = () => Promise<boolean>;

const DEFAULT_STARTUP_TIMEOUT_MS = 20_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

function boundedError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240);
}

function validateSpec(spec: CockpitSidecarSpec): CockpitSidecarSpec {
  if (!Array.isArray(spec.command) || spec.command.length < 1 || spec.command.length > 32) {
    throw new Error("Cockpit sidecar command is invalid");
  }
  if (!isAbsolute(spec.command[0]!) || spec.command.some(part => typeof part !== "string" || !part.trim() || part.length > 4096)) {
    throw new Error("Cockpit sidecar command must use an absolute executable and bounded arguments");
  }
  if (!isAbsolute(spec.isolatedHome)) throw new Error("Cockpit sidecar isolatedHome must be absolute");
  if (spec.startupTimeoutMs !== undefined && (!Number.isSafeInteger(spec.startupTimeoutMs) || spec.startupTimeoutMs < 100 || spec.startupTimeoutMs > 120_000)) {
    throw new Error("Cockpit sidecar startupTimeoutMs is invalid");
  }
  if (spec.shutdownTimeoutMs !== undefined && (!Number.isSafeInteger(spec.shutdownTimeoutMs) || spec.shutdownTimeoutMs < 100 || spec.shutdownTimeoutMs > 60_000)) {
    throw new Error("Cockpit sidecar shutdownTimeoutMs is invalid");
  }
  return {
    command: [...spec.command] as [string, ...string[]],
    isolatedHome: resolve(spec.isolatedHome),
    startupTimeoutMs: spec.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    shutdownTimeoutMs: spec.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
  };
}

function fingerprint(command: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex").slice(0, 24);
}

function ensurePrivateHome(home: string): void {
  const root = resolve(home);
  const existing = lstatSync(root, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw new Error("Cockpit sidecar isolatedHome must be a directory");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try { chmodSync(root, 0o700); } catch {}
  for (const child of [".config", ".cache", ".local", join(".local", "share")]) {
    const path = join(root, child);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    try { chmodSync(path, 0o700); } catch {}
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolveExit => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once("exit", finish);
  });
}

export class CockpitSidecarSupervisor {
  private readonly spec: CockpitSidecarSpec;
  private readonly readiness: CockpitSidecarReadiness;
  private child: ChildProcess | undefined;
  private generation = 0;
  private state: CockpitSidecarStatus["state"] = "stopped";
  private startedAt: string | null = null;
  private exitedAt: string | null = null;
  private exitCode: number | null = null;
  private signal: string | null = null;
  private lastError: string | null = null;
  private startPromise: Promise<CockpitSidecarStatus> | undefined;

  constructor(spec: CockpitSidecarSpec, readiness: CockpitSidecarReadiness) {
    this.spec = validateSpec(spec);
    this.readiness = readiness;
  }

  status(): CockpitSidecarStatus {
    return {
      state: this.state,
      pid: this.child?.pid ?? null,
      generation: this.generation,
      commandFingerprint: fingerprint(this.spec.command),
      isolatedHome: this.spec.isolatedHome,
      startedAt: this.startedAt,
      exitedAt: this.exitedAt,
      exitCode: this.exitCode,
      signal: this.signal,
      lastError: this.lastError,
    };
  }

  async start(): Promise<CockpitSidecarStatus> {
    if (this.state === "ready" || this.state === "starting") return this.startPromise ?? Promise.resolve(this.status());
    ensurePrivateHome(this.spec.isolatedHome);
    this.state = "starting";
    this.lastError = null;
    this.exitCode = null;
    this.signal = null;
    this.exitedAt = null;
    this.generation += 1;
    const generation = this.generation;
    this.startPromise = this.startOwned(generation);
    try { return await this.startPromise; } finally { this.startPromise = undefined; }
  }

  private async startOwned(generation: number): Promise<CockpitSidecarStatus> {
    const env = {
      ...process.env,
      HOME: this.spec.isolatedHome,
      XDG_CONFIG_HOME: join(this.spec.isolatedHome, ".config"),
      XDG_CACHE_HOME: join(this.spec.isolatedHome, ".cache"),
      XDG_DATA_HOME: join(this.spec.isolatedHome, ".local", "share"),
    };
    let child: ChildProcess;
    try {
      child = spawn(this.spec.command[0]!, this.spec.command.slice(1), {
        cwd: dirname(this.spec.command[0]!),
        env,
        stdio: "ignore",
        detached: false,
      });
    } catch (error) {
      this.state = "failed";
      this.lastError = boundedError(error);
      throw error;
    }
    this.child = child;
    this.startedAt = new Date().toISOString();
    child.once("exit", (code, signal) => {
      if (generation !== this.generation) return;
      this.exitCode = code;
      this.signal = signal;
      this.exitedAt = new Date().toISOString();
      this.child = undefined;
      if (this.state !== "stopping") this.state = "failed";
      if ((code !== 0 || signal) && !this.lastError) this.lastError = `Cockpit sidecar exited (${code ?? "signal"})`;
      if (this.state === "stopping") this.state = "stopped";
    });
    const deadline = Date.now() + this.spec.startupTimeoutMs!;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        this.state = "failed";
        throw new Error(this.lastError ?? "Cockpit sidecar exited before readiness");
      }
      try {
        if (await this.readiness()) {
          if (generation !== this.generation) throw new Error("Cockpit sidecar generation changed during startup");
          this.state = "ready";
          return this.status();
        }
      } catch (error) {
        this.lastError = boundedError(error);
      }
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    this.state = "failed";
    this.lastError = this.lastError ?? "Cockpit sidecar readiness timed out";
    child.kill("SIGTERM");
    await waitForExit(child, this.spec.shutdownTimeoutMs!);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    throw new Error(this.lastError);
  }

  async stop(): Promise<CockpitSidecarStatus> {
    const child = this.child;
    if (!child) {
      this.state = "stopped";
      return this.status();
    }
    this.state = "stopping";
    child.kill("SIGTERM");
    await waitForExit(child, this.spec.shutdownTimeoutMs!);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await waitForExit(child, this.spec.shutdownTimeoutMs!);
    if (this.child === child) {
      this.child = undefined;
      this.state = "stopped";
      this.exitedAt = this.exitedAt ?? new Date().toISOString();
    }
    return this.status();
  }
}

export function validateCockpitSidecarSpec(spec: CockpitSidecarSpec): CockpitSidecarSpec {
  return validateSpec(spec);
}
