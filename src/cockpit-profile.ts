import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, closeSync, renameSync, rmSync, writeFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { validateCockpitConfig, type CockpitConfig } from "./cockpit-provider";

export interface StoredCockpitProfile {
  version: 1;
  cockpit: CockpitConfig;
  updatedAt: string;
}

export function cockpitProfileBackupPath(path = cockpitProfilePath()): string {
  return `${resolve(path)}.bak`;
}

export function cockpitProfilePath(home = process.env.CODEX_CHATGPT_WEB_HOME?.trim() || join(homedir(), ".codex-chatgpt-web")): string {
  const expanded = home === "~" ? homedir() : home.startsWith("~/") ? join(homedir(), home.slice(2)) : home;
  return join(resolve(expanded), "cockpit", "profile.json");
}

export function readStoredCockpitProfile(path = cockpitProfilePath()): StoredCockpitProfile | undefined {
  const target = resolve(path);
  const stat = lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Stored Cockpit profile must be a regular file");
  if (stat.size > 256 * 1024) throw new Error("Stored Cockpit profile is too large");
  if (process.platform !== "win32" && (stat.mode & 0o077)) throw new Error("Stored Cockpit profile must be owner-only (0600)");
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<StoredCockpitProfile>;
  if (parsed.version !== 1 || !parsed.cockpit) throw new Error("Stored Cockpit profile is invalid");
  const cockpit = validateCockpitConfig(parsed.cockpit);
  return {
    version: 1,
    cockpit: cockpit.evidencePath ? cockpit : { ...cockpit, evidencePath: join(dirname(target), "evidence.jsonl") },
    updatedAt: String(parsed.updatedAt ?? ""),
  };
}

export function saveStoredCockpitProfile(cockpit: CockpitConfig, path = cockpitProfilePath()): StoredCockpitProfile {
  const target = resolve(path);
  let validated = validateCockpitConfig(cockpit);
  if (!validated.clientApiKey && !validated.clientApiKeyFile) {
    const clientPath = join(dirname(target), "client-api-key");
    mkdirSync(dirname(clientPath), { recursive: true, mode: 0o700 });
    writeFileSync(clientPath, `${randomBytes(32).toString("base64url")}\n`, { mode: 0o600 });
    try { chmodSync(clientPath, 0o600); } catch {}
    validated = { ...validated, clientApiKeyFile: clientPath };
  }
  if (!validated.evidencePath) validated = { ...validated, evidencePath: join(dirname(target), "evidence.jsonl") };
  const profile: StoredCockpitProfile = { version: 1, cockpit: validated, updatedAt: new Date().toISOString() };
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch {}
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const backup = cockpitProfileBackupPath(target);
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(profile, null, 2)}\n`);
    closeSync(fd);
    if (existsSync(target)) {
      rmSync(backup, { force: true });
      renameSync(target, backup);
    }
    renameSync(temporary, target);
  } catch (error) {
    try { closeSync(fd); } catch {}
    rmSync(temporary, { force: true });
    if (!existsSync(target) && existsSync(backup)) {
      try { renameSync(backup, target); } catch {}
    }
    throw error;
  }
  try { chmodSync(target, 0o600); } catch {}
  try { if (existsSync(backup)) chmodSync(backup, 0o600); } catch {}
  return profile;
}

/** Swap the current profile and its last known good profile, preserving both versions. */
export function rollbackStoredCockpitProfile(path = cockpitProfilePath()): StoredCockpitProfile {
  const target = resolve(path);
  const backup = cockpitProfileBackupPath(target);
  if (!existsSync(backup)) throw new Error("No previous Cockpit profile is available for rollback");
  const backupStat = lstatSync(backup, { throwIfNoEntry: false });
  if (!backupStat?.isFile() || backupStat.isSymbolicLink()) throw new Error("Cockpit profile backup must be a regular file");
  const temporary = `${target}.rollback-${process.pid}-${randomUUID()}`;
  if (existsSync(target)) renameSync(target, temporary);
  try {
    renameSync(backup, target);
    if (existsSync(temporary)) renameSync(temporary, backup);
  } catch (error) {
    if (!existsSync(target) && existsSync(temporary)) {
      try { renameSync(temporary, target); } catch {}
    }
    throw error;
  }
  try { chmodSync(target, 0o600); } catch {}
  try { if (existsSync(backup)) chmodSync(backup, 0o600); } catch {}
  const restored = readStoredCockpitProfile(target);
  if (!restored) throw new Error("Cockpit rollback did not produce a readable profile");
  return restored;
}

export function removeStoredCockpitProfile(path = cockpitProfilePath()): void {
  // Intentionally use the existing atomic/private config helper only for writes. Removing a
  // profile is an explicit CLI/UI operation and is handled by the caller's normal confirmation.
  rmSync(path, { force: true });
  rmSync(cockpitProfileBackupPath(path), { force: true });
  const generatedClientPath = join(dirname(resolve(path)), "client-api-key");
  rmSync(generatedClientPath, { force: true });
}
