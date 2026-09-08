import { describe, expect, test } from "bun:test";
import { browserLoginObservationToSkyIdentity, browserTurnObservationToSkyIdentity } from "../src/virtual-sky/web-login";

describe("群星 browser login evidence", () => {
  test("records ChatGPT and Claude composer observations without claiming model verification", () => {
    const chatgpt = browserLoginObservationToSkyIdentity({ profileId: "chatgpt-01", provider: "chatgpt-web", origin: "https://chatgpt.com", path: "/", composerVisible: true, observedAt: new Date().toISOString() });
    const claude = browserLoginObservationToSkyIdentity({ profileId: "claude-01", provider: "claude-web", origin: "https://claude.ai", path: "/new", composerVisible: true, observedAt: new Date().toISOString() });
    expect(chatgpt.capabilityEvidence).toBe("observed");
    expect(chatgpt.health).toBe("unknown");
    expect(chatgpt.browserProfileId).toBe("chatgpt-01");
    expect(claude.provider).toBe("claude-web");
  });

  test("rejects wrong origins and a missing composer before pool selection", () => {
    expect(() => browserLoginObservationToSkyIdentity({ profileId: "chatgpt-01", provider: "chatgpt-web", origin: "https://claude.ai", path: "/", composerVisible: true, observedAt: "now" })).toThrow("origin/path");
    expect(() => browserLoginObservationToSkyIdentity({ profileId: "claude-01", provider: "claude-web", origin: "https://claude.ai", path: "/new", composerVisible: false, observedAt: "now" })).toThrow("composer");
  });

  test("upgrades only a completed exact-marker browser turn to a selectable identity", () => {
    const identity = browserTurnObservationToSkyIdentity({ profileId: "chatgpt-01", provider: "chatgpt-web", origin: "https://chatgpt.com", path: "/", composerVisible: true, observedAt: "now", transport: "browser-dom", completed: true, exactMarkerVerified: true });
    expect(identity.health).toBe("ready");
    expect(identity.capabilityEvidence).toBe("verified");
    expect(() => browserTurnObservationToSkyIdentity({ profileId: "claude-01", provider: "claude-web", origin: "https://claude.ai", path: "/new", composerVisible: true, observedAt: "now", transport: "browser-dom", completed: true, exactMarkerVerified: false })).toThrow("exact-marker");
  });
});
