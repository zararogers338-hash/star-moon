import { test, expect } from "bun:test";
import { catalogRuntimeOwned, inspectClientRouting } from "../src/codex-client-status";

const route = "http://127.0.0.1:17842/v1";
test("a live daemon with a dead launcher is not healthy ownership", () => {
  const marker = { version: 1, status: "ready", ownerPid: 100, daemonPid: 200 };
  expect(catalogRuntimeOwned(marker, { pid: 200 }, pid => pid === 200)).toBe(false);
  expect(catalogRuntimeOwned(marker, { pid: 200 }, pid => pid === 100 || pid === 200)).toBe(true);
  expect(catalogRuntimeOwned(marker, { pid: 300 }, () => true)).toBe(false);
  expect(catalogRuntimeOwned({ ...marker, ownerPid: 0 }, { pid: 200 }, () => true)).toBe(false);
});
test("current third-party provider and static catalog are incompatible without exposing credentials", () => {
  const text = `model_provider = "another_service"\nmodel_catalog_json = "private-catalog.json"\nopenai_base_url = "${route}"\n[model_providers.another_service]\nbase_url = "http://localhost:37323/v1"\nexperimental_bearer_token = "DO_NOT_EXPOSE"\n`;
  const result = inspectClientRouting(text, route);
  expect(result.compatible).toBe(false);
  expect(result.issues).toEqual(["custom-provider", "provider-auth", "static-catalog"]);
  expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPOSE");
  expect(JSON.stringify(result)).not.toContain("private-catalog");
});
test("native provider compatible config remains a disk observation, not a verified desktop request", () => {
  const result = inspectClientRouting(`openai_base_url = "${route}/"`, route);
  expect(result).toEqual({ scope: "user-config-on-disk", compatible: true, provider: "openai", issues: [] });
  expect(result).not.toHaveProperty("codexCatalogVerified");
});
test("custom provider requires exact Star Moon route and Codex authentication", () => {
  const text = `model_provider = "star_moon"\n[model_providers.star_moon]\nbase_url = "${route}"\nrequires_openai_auth = true`;
  expect(inspectClientRouting(text, route).compatible).toBe(true);
  expect(inspectClientRouting(text.replace("true", "false"), route).issues).toContain("provider-auth");
  expect(inspectClientRouting(text.replace(":17842", ":17841"), route).issues).toContain("custom-provider");
});
test("TOML comments, quoted keys and escaped strings do not fool detection", () => {
  expect(inspectClientRouting(`"model_catalog_json" = "file.json"\nopenai_base_url = '${route}'`, route).issues).toContain("static-catalog");
  expect(inspectClientRouting(`# model_catalog_json = "ignore"\nopenai_base_url = '${route}'`, route).compatible).toBe(true);
  expect(inspectClientRouting(`description = """\nmodel_provider = 'not-a-setting'\n"""\nopenai_base_url = '${route}'`, route).compatible).toBe(true);
});
test("malformed config and selected profiles fail closed without leaking the source text", () => {
  const invalid = inspectClientRouting('token = "PRIVATE"\n[broken', route);
  expect(invalid.issues).toEqual(["config-unreadable"]);
  expect(JSON.stringify(invalid)).not.toContain("PRIVATE");
  expect(inspectClientRouting(`profile = 'chosen'\nopenai_base_url = '${route}'`, route).issues).toContain("profile-selected");
});
