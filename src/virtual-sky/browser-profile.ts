import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import type { SkyIdentity } from "./types";
import { validateSkyIdentity, SkyPoolError } from "./pool";

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(value)) throw new SkyPoolError("invalid_pool", `${label} is invalid`);
  return value;
}

/** Resolve an isolated profile directory without ever copying cookies or storage state. */
export function skyBrowserProfilePath(root: string, identity: SkyIdentity): string {
  validateSkyIdentity(identity);
  if (identity.kind !== "browser" || !identity.browserProfileId) throw new SkyPoolError("invalid_pool", "A browser identity requires an opaque browserProfileId");
  if (!isAbsolute(root)) throw new SkyPoolError("invalid_pool", "Browser profile root must be absolute");
  const base = resolve(root);
  const path = resolve(join(base, safeSegment(identity.provider, "provider"), safeSegment(identity.browserProfileId, "browser profile id")));
  const rel = relative(base, path);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new SkyPoolError("invalid_pool", "Browser profile escaped its root");
  return path;
}

export function ensureSkyBrowserProfile(root: string, identity: SkyIdentity): string {
  const path = skyBrowserProfilePath(root, identity);
  const rootStat = lstatSync(resolve(root), { throwIfNoEntry: false });
  if (rootStat?.isSymbolicLink()) throw new SkyPoolError("invalid_pool", "Browser profile root must not be a symlink");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try { chmodSync(path, 0o700); } catch {}
  return path;
}
