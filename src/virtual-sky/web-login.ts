import type { SkyEvidenceState, SkyIdentity, SkyProvider } from "./types";
import { SkyPoolError } from "./pool";

export interface BrowserLoginObservation {
  profileId: string;
  provider: Extract<SkyProvider, "chatgpt-web" | "claude-web">;
  origin: string;
  path: string;
  composerVisible: boolean;
  observedAt: string;
}

export interface BrowserTurnObservation extends BrowserLoginObservation {
  transport: "browser-dom";
  completed: boolean;
  exactMarkerVerified: boolean;
}

function expectedOrigin(provider: BrowserLoginObservation["provider"]): string {
  return provider === "chatgpt-web" ? "https://chatgpt.com" : "https://claude.ai";
}

function validPath(provider: BrowserLoginObservation["provider"], path: string): boolean {
  if (provider === "chatgpt-web") return path === "/" || /^\/c\/[^/]+\/?$/.test(path);
  return path === "/" || path === "/new" || /^\/chat\//.test(path);
}

/**
 * Convert a page-owned login observation into public pool metadata. A visible composer is only
 * an observed browser login gate; it never upgrades the identity to model-turn verified.
 */
export function browserLoginObservationToSkyIdentity(
  observation: BrowserLoginObservation,
  label = observation.profileId,
  priority = 0,
): SkyIdentity {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(observation.profileId)) {
    throw new SkyPoolError("invalid_pool", "Browser login profile id is invalid");
  }
  if (observation.origin !== expectedOrigin(observation.provider) || !validPath(observation.provider, observation.path)) {
    throw new SkyPoolError("invalid_pool", `Browser login origin/path is invalid for ${observation.provider}`);
  }
  if (observation.composerVisible !== true) throw new SkyPoolError("identity_unavailable", "Browser login observation has no visible composer");
  if (!Number.isSafeInteger(priority) || priority < 0) throw new SkyPoolError("invalid_pool", "Browser login priority is invalid");
  const capabilityEvidence: SkyEvidenceState = "observed";
  return {
    id: observation.profileId,
    label: label.trim().slice(0, 120) || observation.profileId,
    provider: observation.provider,
    kind: "browser",
    enabled: true,
    health: "unknown",
    priority,
    capabilityEvidence,
    browserProfileId: observation.profileId,
  };
}

/** Upgrade a browser identity only after a real page turn completed an exact harmless marker. */
export function browserTurnObservationToSkyIdentity(
  observation: BrowserTurnObservation,
  label = observation.profileId,
  priority = 0,
): SkyIdentity {
  const identity = browserLoginObservationToSkyIdentity(observation, label, priority);
  if (observation.transport !== "browser-dom" || observation.completed !== true || observation.exactMarkerVerified !== true) {
    throw new SkyPoolError("identity_unavailable", "Browser turn observation is not a completed exact-marker proof");
  }
  return { ...identity, health: "ready", capabilityEvidence: "verified" };
}
