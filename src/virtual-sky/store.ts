import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validateSkyPoolDefinition } from "./pool";
import type { SkyPoolDefinition } from "./types";

export interface StoredSkyPools {
  version: 1;
  pools: SkyPoolDefinition[];
  updatedAt: string;
}

export function skyPoolStorePath(home = process.env.CODEX_CHATGPT_WEB_HOME?.trim() || join(homedir(), ".codex-chatgpt-web")): string {
  const expanded = home === "~" ? homedir() : home.startsWith("~/") ? join(homedir(), home.slice(2)) : home;
  return join(resolve(expanded), "virtual-sky", "pools.json");
}

function validateStore(value: unknown): StoredSkyPools {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored sky pool store is invalid");
  const input = value as Partial<StoredSkyPools>;
  if (input.version !== 1 || !Array.isArray(input.pools) || input.pools.length > 128) throw new Error("Stored sky pool store is invalid");
  const pools = input.pools.map(validateSkyPoolDefinition);
  if (new Set(pools.map(pool => pool.poolId)).size !== pools.length) throw new Error("Stored sky pool ids must be unique");
  return { version: 1, pools, updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : "" };
}

export function readSkyPoolStore(path = skyPoolStorePath()): StoredSkyPools {
  if (!existsSync(path)) return { version: 1, pools: [], updatedAt: "" };
  return validateStore(JSON.parse(readFileSync(path, "utf8")));
}

export function saveSkyPoolStore(pools: readonly SkyPoolDefinition[], path = skyPoolStorePath()): StoredSkyPools {
  const normalized = pools.map(validateSkyPoolDefinition);
  if (new Set(normalized.map(pool => pool.poolId)).size !== normalized.length) throw new Error("Sky pool ids must be unique");
  const value: StoredSkyPools = { version: 1, pools: normalized, updatedAt: new Date().toISOString() };
  const target = resolve(path);
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch {}
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  try { chmodSync(target, 0o600); } catch {}
  return value;
}

export function upsertSkyPool(pool: SkyPoolDefinition, path = skyPoolStorePath()): StoredSkyPools {
  const normalized = validateSkyPoolDefinition(pool);
  const store = readSkyPoolStore(path);
  let replaced = false;
  const pools = store.pools.map(item => {
    if (item.poolId !== normalized.poolId) return item;
    replaced = true;
    return normalized;
  });
  if (!replaced) pools.push(normalized);
  return saveSkyPoolStore(pools, path);
}

export function removeSkyPool(poolId: string, path = skyPoolStorePath()): StoredSkyPools {
  const store = readSkyPoolStore(path);
  return saveSkyPoolStore(store.pools.filter(pool => pool.poolId !== poolId), path);
}
